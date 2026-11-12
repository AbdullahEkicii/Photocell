import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AdBanner } from '../components/ads/AdBanner';
import { RewardGateSheet } from '../components/ads/RewardGateSheet';
import {
  getFreePhotoCompressionsLeft,
  recordPhotoCompression,
  addPhotoCompressions,
  showRewardedAd,
} from '../services/ads/adsService';
import { enter } from '../theme/motion';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image, Modal, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Images, Sparkles, Zap, RefreshCw, Save } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { FlashList } from '@shopify/flash-list';

import { AtmosphericBackground } from '../components/glass/AtmosphericBackground';
import { onActionCompleted } from '../services/ads/adsService';
import { GlassPanel } from '../components/glass/GlassPanel';
import { GlassButton } from '../components/glass/GlassButton';
import { ScreenHeader } from '../components/layout/ScreenHeader';
import { FilterChips } from '../components/layout/FilterChips';
import { EmptyState, LoadingState } from '../components/layout/EmptyState';
import { colors, alpha, radius } from '../theme/colors';
import {
  fetchHeavyPhotos,
  compressSinglePhoto,
  replaceOriginalPhoto,
  saveCompressedPhotoToLibrary,
  discardCompressedPhoto,
  CompressiblePhoto,
  PhotoCompressionResult,
  PhotoQualityPreset,
} from '../services/photoCompressor';
import { AnalyticsService } from '../services/analyticsService';
import { recordCleanedPhotos } from '../services/cacheCleaner';

interface Props {
  onBack: () => void;
}

type PhotoRow =
  | { kind: 'photo'; key: string; photo: CompressiblePhoto }
  | { kind: 'ad'; key: string };

const QUALITY_PRESETS: PhotoQualityPreset[] = [0.5, 0.75, 0.9];

export const PhotoCompressorScreen: React.FC<Props> = ({ onBack }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [photos, setPhotos] = useState<CompressiblePhoto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [quality, setQuality] = useState<PhotoQualityPreset>(0.75);
  const [selectedPhoto, setSelectedPhoto] = useState<CompressiblePhoto | null>(null);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [compressionResult, setCompressionResult] = useState<PhotoCompressionResult | null>(null);
  const [compressing, setCompressing] = useState<boolean>(false);
  const [actionProcessing, setActionProcessing] = useState<boolean>(false);
  const [gateVisible, setGateVisible] = useState<boolean>(false);
  const [pendingPhoto, setPendingPhoto] = useState<CompressiblePhoto | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(() => new Set());
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: any[] }) => {
    setVisibleKeys((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const item of viewableItems) {
        const key = item.item?.key;
        if (key && !next.has(key)) {
          next.add(key);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }).current;
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 1,
    waitForInteraction: false,
  }).current;

  const loadPhotos = useCallback(async () => {
    try {
      setLoading(true);
      const items = await fetchHeavyPhotos(60);
      setPhotos(items);
    } catch (e) {
      console.warn('Failed loading heavy photos:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  const photoRows = useMemo<PhotoRow[]>(() => {
    const rows: PhotoRow[] = [];
    photos.forEach((photo, index) => {
      if (index > 0 && index % 4 === 0) {
        rows.push({ kind: 'ad', key: `ad-${index}` });
      }
      rows.push({ kind: 'photo', key: photo.id, photo });
    });
    return rows;
  }, [photos]);

  // Identifies the compression currently allowed to update the screen. Closing
  // the dialog while one is still running used to leave it running; when it
  // finished it overwrote the result of whatever photo was open by then, so
  // "replace original" could delete one photo and swap in another's output.
  const runIdRef = useRef(0);

  const closeModal = () => {
    runIdRef.current += 1;
    discardCompressedPhoto(compressionResult?.outputPath);
    setModalVisible(false);
    setSelectedPhoto(null);
    setCompressionResult(null);
    setCompressing(false);
    setActionProcessing(false);
  };

  const requestCompress = async (photo: CompressiblePhoto) => {
    const freeLeft = await getFreePhotoCompressionsLeft();
    if (freeLeft > 0) {
      handleStartCompress(photo);
      return;
    }
    setPendingPhoto(photo);
    setGateVisible(true);
  };

  const handleWatchAdToCompress = async () => {
    const photo = pendingPhoto;
    setGateVisible(false);
    if (!photo) return;
    const result = await showRewardedAd('photo_compress');
    if (result === 'dismissed') return;
    if (result === 'unavailable') {
      Alert.alert(t('ads.unavailable_title'), t('ads.unavailable_body'));
    }
    await addPhotoCompressions(3);
    handleStartCompress(photo);
  };

  const handleStartCompress = async (photo: CompressiblePhoto) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const runId = ++runIdRef.current;
    setSelectedPhoto(photo);
    setModalVisible(true);
    setCompressing(true);
    setCompressionResult(null);

    try {
      const result = await compressSinglePhoto(photo, quality);

      if (runId !== runIdRef.current) {
        // Dismissed while compressing: throw the output away.
        discardCompressedPhoto(result.outputPath);
        return;
      }

      setCompressionResult(result);
      setCompressing(false);
      Haptics.notificationAsync(
        result.isSmaller
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning
      ).catch(() => {});
      if (result.isSmaller) {
        recordPhotoCompression().catch(() => {});
        AnalyticsService.trackPhotoCompressed(
          result.originalSizeBytes,
          result.compressedSizeBytes,
          result.savedBytes,
          quality
        ).catch(() => {});
      }
    } catch (err) {
      if (runId !== runIdRef.current) return;
      closeModal();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert(t('general.error'), t('compressor.action_failed'));
    }
  };

  const handleReplace = async () => {
    if (!selectedPhoto || !compressionResult?.isSmaller || actionProcessing) return;
    setActionProcessing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    const outcome = await replaceOriginalPhoto(selectedPhoto.id, compressionResult.outputPath);
    setActionProcessing(false);

    if (outcome === 'failed') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert(t('general.error'), t('compressor.action_failed'));
      return;
    }

    if (outcome === 'replaced') {
      // Only a deleted original actually frees space.
      recordCleanedPhotos(compressionResult.savedBytes).catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert(t('general.success'), t('photo_compressor.success_replaced'));
    } else {
      // The copy was saved but the user declined deleting the original.
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      Alert.alert(t('general.success'), t('compressor.copy_only'));
    }

    // The output file is already gone (saved to the gallery); just close.
    runIdRef.current += 1;
    setModalVisible(false);
    setSelectedPhoto(null);
    setCompressionResult(null);
    await loadPhotos();
    onActionCompleted('photo_compress').catch(() => {});
  };

  const handleSaveCopy = async () => {
    if (!compressionResult?.isSmaller || actionProcessing) return;
    setActionProcessing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    const success = await saveCompressedPhotoToLibrary(compressionResult.outputPath);
    setActionProcessing(false);

    if (success) {
      // A copy next to the original frees nothing, so it is not counted as savings.
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert(t('general.success'), t('photo_compressor.success_saved'));
      runIdRef.current += 1;
      setModalVisible(false);
      setSelectedPhoto(null);
      setCompressionResult(null);
      onActionCompleted('photo_compress').catch(() => {});
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert(t('general.error'), t('compressor.action_failed'));
    }
  };

  const renderPhotoRow = useCallback(
    ({ item }: { item: PhotoRow }) => {
      if (item.kind === 'ad') {
        return (
          <AdBanner
            placement="photo_compressor"
            active={visibleKeys.has(item.key)}
            style={styles.listAdBanner}
          />
        );
      }
      const photo = item.photo;
      return (
        <View style={styles.cardWrapper}>
          <GlassPanel
            borderRadius={radius.card}
            contentStyle={styles.cardContent}
            intensity={26}
          >
            <Image source={{ uri: photo.uri }} style={styles.thumbnail} resizeMethod="resize" resizeMode="cover" />
            <View style={styles.cardDetails}>
              <Text style={styles.photoName} numberOfLines={1}>
                {photo.filename}
              </Text>
              <Text style={styles.photoSize}>{photo.formattedSize}</Text>
            </View>
            <GlassButton
              compact
              borderRadius={radius.chip}
              borderColor={alpha(colors.primary, 0.45)}
              style={styles.compressBtn}
              onPress={() => requestCompress(photo)}
            >
              <Zap color={colors.primary} size={13} />
              <Text style={styles.compressBtnText}>{t('compressor.compress')}</Text>
            </GlassButton>
          </GlassPanel>
        </View>
      );
    },
    [visibleKeys, t]
  );

  const qualityLabel = (preset: PhotoQualityPreset) =>
    preset === 0.5
      ? t('photo_compressor.quality_50')
      : preset === 0.75
      ? t('photo_compressor.quality_75')
      : t('photo_compressor.quality_90');

  return (
    <View style={styles.container}>
      <AtmosphericBackground />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader title={t('photo_compressor.title')} onBack={onBack} onRefresh={loadPhotos} />

        <Animated.View entering={enter(FadeInDown.duration(400).delay(60))} style={styles.qualitySection}>
          <Text style={styles.qualityLabel}>{t('photo_compressor.subtitle')}</Text>
          <FilterChips
            options={QUALITY_PRESETS.map((preset) => ({
              value: String(preset),
              label: qualityLabel(preset),
            }))}
            value={String(quality)}
            onChange={(next) => setQuality(Number(next) as PhotoQualityPreset)}
          />
        </Animated.View>

        {loading ? (
          <LoadingState label={t('dashboard.status.scanning')} />
        ) : photos.length === 0 ? (
          <EmptyState
            icon={Images}
            title={t('photo_compressor.no_photos')}
            description={t('photo_compressor.no_photos_desc')}
            accent={colors.primary}
          />
        ) : (
          <FlashList
            data={photoRows}
            renderItem={renderPhotoRow}
            keyExtractor={(item) => item.key}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingTop: 8,
              paddingBottom: Math.max(60, insets.bottom + 20),
            }}
          />
        )}

        <RewardGateSheet
          visible={gateVisible}
          title={t('ads.photo_reward_title')}
          body={t('ads.photo_reward_body')}
          watchButtonText={t('ads.photo_reward_watch')}
          onWatch={handleWatchAdToCompress}
          onDismiss={() => setGateVisible(false)}
        />

        <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={closeModal}>
          <View style={styles.modalOverlay}>
            <GlassPanel
              borderRadius={radius.sheet}
              fillColor={colors.surface}
              style={styles.modalCard}
              contentStyle={styles.modalContent}
              intensity={40}
            >
              {compressing ? (
                <View style={styles.compressingBox}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={styles.compressingTitle}>{t('compressor.compressing')}</Text>
                  <Text style={styles.compressingSub} numberOfLines={1}>
                    {selectedPhoto?.filename}
                  </Text>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={closeModal}
                    style={styles.dismissBtn}
                    accessibilityRole="button"
                  >
                    <Text style={styles.dismissText}>{t('compressor.cancel')}</Text>
                  </TouchableOpacity>
                </View>
              ) : compressionResult ? (
                <View style={styles.resultBox}>
                  <View style={styles.sparkleBadge}>
                    <Sparkles color={colors.primary} size={26} />
                  </View>
                  <Text style={styles.resultTitle}>
                    {compressionResult.isSmaller
                      ? t('compressor.congratulations')
                      : t('compressor.no_gain_title')}
                  </Text>
                  {!compressionResult.isSmaller && (
                    <Text style={styles.noGainText}>{t('compressor.no_gain_photo')}</Text>
                  )}

                  <View style={styles.savedPill}>
                    <Text style={styles.savedLabel}>{t('photo_compressor.potential_saved')}</Text>
                    <Text style={styles.savedAmount}>{compressionResult.formattedSaved}</Text>
                    {compressionResult.originalSizeBytes > 0 && (
                      <Text style={styles.sizeComparison}>
                        {`${(compressionResult.originalSizeBytes / (1024 * 1024)).toFixed(1)} MB → ${(
                          compressionResult.compressedSizeBytes /
                          (1024 * 1024)
                        ).toFixed(1)} MB`}
                      </Text>
                    )}
                  </View>

                  <View style={styles.actionColumn}>
                    {compressionResult.isSmaller && (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      disabled={actionProcessing}
                      onPress={handleReplace}
                      style={[styles.replaceBtn, actionProcessing && styles.disabled]}
                      accessibilityRole="button"
                    >
                      {actionProcessing ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <RefreshCw color={colors.primary} size={16} />
                      )}
                      <Text style={styles.replaceBtnText}>
                        {t('photo_compressor.replace_original')}
                      </Text>
                    </TouchableOpacity>
                    )}

                    {compressionResult.isSmaller && (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      disabled={actionProcessing}
                      onPress={handleSaveCopy}
                      style={[styles.saveCopyBtn, actionProcessing && styles.disabled]}
                      accessibilityRole="button"
                    >
                      <Save color={colors.textSecondary} size={15} />
                      <Text style={styles.saveCopyBtnText}>{t('photo_compressor.save_copy')}</Text>
                    </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={closeModal}
                      style={styles.dismissBtn}
                      accessibilityRole="button"
                    >
                      <Text style={styles.dismissText}>{t('compressor.dismiss')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}
            </GlassPanel>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  safeArea: {
    flex: 1,
  },
  qualitySection: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  qualityLabel: {
    fontSize: 13.5,
    color: colors.textSecondary,
    lineHeight: 17,
    marginBottom: 10,
  },
  listAdBanner: {
    marginVertical: 6,
  },
  cardWrapper: {
    marginBottom: 10,
  },
  cardContent: {
    padding: 11,
    flexDirection: 'row',
    alignItems: 'center',
  },
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: 15,
    marginRight: 12,
    backgroundColor: colors.surfaceSunken,
  },
  cardDetails: {
    flex: 1,
    paddingRight: 8,
  },
  photoName: {
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 3,
  },
  photoSize: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  compressBtn: {
    width: 'auto',
    height: 38,
  },
  compressBtnText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.primary,
    marginLeft: 5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
  },
  modalContent: {
    padding: 22,
    alignItems: 'center',
  },
  compressingBox: {
    alignItems: 'center',
    paddingVertical: 22,
    gap: 12,
  },
  compressingTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  compressingSub: {
    fontSize: 13.5,
    color: colors.textMuted,
    maxWidth: 240,
  },
  resultBox: {
    width: '100%',
    alignItems: 'center',
  },
  sparkleBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: alpha(colors.primary, 0.1),
    borderWidth: 1,
    borderColor: alpha(colors.primary, 0.25),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 13,
  },
  resultTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: colors.textPrimary,
    marginBottom: 14,
  },
  savedPill: {
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    paddingHorizontal: 16,
    paddingVertical: 13,
    alignItems: 'center',
    width: '100%',
    marginBottom: 18,
  },
  savedLabel: {
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  savedAmount: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.successMint,
    marginBottom: 4,
  },
  sizeComparison: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  actionColumn: {
    width: '100%',
    gap: 9,
  },
  replaceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: alpha(colors.primary, 0.1),
    borderWidth: 1,
    borderColor: alpha(colors.primary, 0.35),
    paddingVertical: 13,
    borderRadius: radius.control,
  },
  replaceBtnText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  saveCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 13,
    borderRadius: radius.control,
  },
  saveCopyBtnText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  dismissBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  dismissText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.5,
  },
  noGainText: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 14,
    marginTop: -6,
  },
});
