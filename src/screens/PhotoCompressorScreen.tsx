import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInDown, FadeInUp, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Images,
  Sparkles,
  Zap,
  RefreshCw,
  Save,
  CheckCircle,
  X,
  Layers,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { FlashList } from '@shopify/flash-list';

import { AtmosphericBackground } from '../components/glass/AtmosphericBackground';
import { GlassPanel } from '../components/glass/GlassPanel';
import { GlassButton } from '../components/glass/GlassButton';
import { colors } from '../theme/colors';
import {
  fetchHeavyPhotos,
  compressSinglePhoto,
  replaceOriginalPhoto,
  saveCompressedPhotoToLibrary,
  CompressiblePhoto,
  PhotoCompressionResult,
  PhotoQualityPreset,
} from '../services/photoCompressor';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnalyticsService } from '../services/analyticsService';
import { recordCleanedPhotos } from '../services/cacheCleaner';

interface Props {
  onBack: () => void;
}

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

  const loadPhotos = useCallback(async () => {
    try {
      setLoading(true);
      const items = await fetchHeavyPhotos(50);
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

  const handleStartCompress = async (photo: CompressiblePhoto) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setSelectedPhoto(photo);
    setModalVisible(true);
    setCompressing(true);
    setCompressionResult(null);

    try {
      const result = await compressSinglePhoto(photo.uri, quality);
      setCompressionResult(result);
      setCompressing(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      AnalyticsService.trackPhotoCompressed(
        result.originalSizeBytes,
        result.compressedSizeBytes,
        result.savedBytes,
        quality
      ).catch(() => {});
    } catch (err) {
      setCompressing(false);
      setModalVisible(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert(t('general.error'), t('compressor.action_failed'));
    }
  };

  const handleReplace = async () => {
    if (!selectedPhoto || !compressionResult || actionProcessing) return;
    setActionProcessing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    const success = await replaceOriginalPhoto(selectedPhoto.id, compressionResult.outputPath);
    setActionProcessing(false);
    if (success) {
      if (compressionResult.savedBytes > 0) {
        recordCleanedPhotos(compressionResult.savedBytes).catch(() => {});
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert(t('general.success'), t('photo_compressor.success_replaced'));
      setModalVisible(false);
      await loadPhotos();
    }
  };

  const handleSaveCopy = async () => {
    if (!compressionResult || actionProcessing) return;
    setActionProcessing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    const success = await saveCompressedPhotoToLibrary(compressionResult.outputPath);
    setActionProcessing(false);
    if (success) {
      if (compressionResult.savedBytes > 0) {
        recordCleanedPhotos(compressionResult.savedBytes).catch(() => {});
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert(t('general.success'), t('photo_compressor.success_saved'));
      setModalVisible(false);
    }
  };

  return (
    <View style={styles.container}>
      <AtmosphericBackground />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Top Bar */}
        <Animated.View entering={FadeInDown.duration(400)} style={styles.topBar}>
          <TouchableOpacity activeOpacity={0.8} onPress={onBack} style={styles.backButton}>
            <ArrowLeft color={colors.textPrimary} size={20} strokeWidth={2.4} />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>{t('photo_compressor.title')}</Text>
          <View style={{ width: 40 }} />
        </Animated.View>

        {/* Quality Preset Toggle */}
        <Animated.View entering={FadeInDown.delay(100)} style={styles.qualitySection}>
          <Text style={styles.qualityLabel}>{t('photo_compressor.subtitle')}</Text>
          <View style={styles.qualityPillRow}>
            {([0.5, 0.75, 0.9] as PhotoQualityPreset[]).map((q) => {
              const active = quality === q;
              return (
                <TouchableOpacity
                  key={q}
                  activeOpacity={0.8}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setQuality(q);
                  }}
                  style={[styles.qualityPill, active && styles.qualityPillActive]}
                >
                  <Text style={[styles.qualityPillText, active && styles.qualityPillTextActive]}>
                    {q === 0.5
                      ? t('photo_compressor.quality_50')
                      : q === 0.75
                      ? t('photo_compressor.quality_75')
                      : t('photo_compressor.quality_90')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>

        {/* Photo List */}
        {loading ? (
          <Animated.View entering={FadeIn} style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.neonCyan} style={{ marginBottom: 12 }} />
            <Text style={styles.loadingText}>{t('dashboard.status.scanning')}</Text>
          </Animated.View>
        ) : photos.length === 0 ? (
          <Animated.View entering={FadeIn} style={styles.emptyContainer}>
            <GlassPanel borderRadius={24} style={styles.emptyCard} contentStyle={styles.emptyCardContent}>
              <Images color={colors.textMuted} size={44} style={{ marginBottom: 12 }} />
              <Text style={styles.emptyText}>{t('photo_compressor.no_photos')}</Text>
            </GlassPanel>
          </Animated.View>
        ) : (
          <FlashList
            data={photos}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: Math.max(60, insets.bottom + 20) },
            ]}
            renderItem={({ item }) => (
              <View style={styles.cardWrapper}>
                <GlassPanel borderRadius={24} style={styles.photoCard} contentStyle={styles.photoCardContent} intensity={25}>
                  <Image source={{ uri: item.uri }} style={styles.thumbnail} resizeMode="cover" />
                  <View style={styles.cardDetails}>
                    <Text style={styles.photoName} numberOfLines={1}>{item.filename}</Text>
                    <Text style={styles.photoSize}>{item.formattedSize}</Text>
                  </View>
                  <GlassButton
                    borderRadius={20}
                    borderColor={colors.neonCyan}
                    style={styles.compressBtn}
                    onPress={() => handleStartCompress(item)}
                  >
                    <Zap color={colors.neonCyan} size={14} style={{ marginRight: 4 }} />
                    <Text style={styles.compressBtnText}>{t('compressor.compress')}</Text>
                  </GlassButton>
                </GlassPanel>
              </View>
            )}
          />
        )}

        {/* Compression Modal */}
        <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <GlassPanel borderRadius={32} style={styles.modalCard} contentStyle={styles.modalContent} intensity={45}>
              {compressing ? (
                <View style={styles.compressingBox}>
                  <ActivityIndicator size="large" color={colors.neonCyan} style={{ marginBottom: 16 }} />
                  <Text style={styles.compressingTitle}>{t('compressor.compressing')}</Text>
                </View>
              ) : compressionResult ? (
                <View style={styles.resultBox}>
                  <View style={styles.sparkleBadge}>
                    <Sparkles color={colors.neonCyan} size={30} />
                  </View>
                  <Text style={styles.resultTitle}>{t('compressor.congratulations')}</Text>
                  
                  {/* Space Saved Pill */}
                  <View style={styles.savedPill}>
                    <Text style={styles.savedLabel}>{t('photo_compressor.potential_saved')}</Text>
                    <Text style={styles.savedAmount}>{compressionResult.formattedSaved}</Text>
                    <Text style={styles.sizeComparisonText}>
                      {compressionResult.originalSizeBytes > 0 &&
                        `${(compressionResult.originalSizeBytes / (1024 * 1024)).toFixed(1)} MB → ${(compressionResult.compressedSizeBytes / (1024 * 1024)).toFixed(1)} MB`}
                    </Text>
                  </View>

                  {/* Actions */}
                  <View style={styles.actionColumn}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      disabled={actionProcessing}
                      onPress={handleReplace}
                      style={styles.replaceBtn}
                    >
                      <RefreshCw color={colors.neonCyan} size={16} style={{ marginRight: 8 }} />
                      <Text style={styles.replaceBtnText}>{t('photo_compressor.replace_original')}</Text>
                    </TouchableOpacity>

                    <GlassButton
                      borderRadius={20}
                      borderColor={colors.whiteBorderLight}
                      style={styles.saveCopyBtn}
                      onPress={handleSaveCopy}
                      disabled={actionProcessing}
                    >
                      <Save color={colors.textSecondary} size={16} style={{ marginRight: 8 }} />
                      <Text style={styles.saveCopyBtnText}>{t('photo_compressor.save_copy')}</Text>
                    </GlassButton>
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
    backgroundColor: colors.oledBlack,
  },
  safeArea: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  qualitySection: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 10,
  },
  qualityLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 10,
  },
  qualityPillRow: {
    flexDirection: 'row',
    gap: 8,
  },
  qualityPill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
  },
  qualityPillActive: {
    backgroundColor: 'rgba(0, 242, 254, 0.14)',
    borderColor: colors.neonCyan,
  },
  qualityPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  qualityPillTextActive: {
    color: colors.neonCyan,
    fontWeight: '800',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
  },
  cardWrapper: {
    marginBottom: 12,
  },
  photoCard: {
    borderRadius: 24,
  },
  photoCardContent: {
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 16,
    marginRight: 14,
  },
  cardDetails: {
    flex: 1,
    paddingRight: 8,
  },
  photoName: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  photoSize: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  compressBtn: {
    paddingHorizontal: 14,
    height: 38,
  },
  compressBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.neonCyan,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  emptyCard: {
    borderRadius: 24,
  },
  emptyCardContent: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 32,
  },
  modalContent: {
    padding: 24,
    alignItems: 'center',
  },
  compressingBox: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  compressingTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  resultBox: {
    width: '100%',
    alignItems: 'center',
  },
  sparkleBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(0, 242, 254, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0, 242, 254, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  resultTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.textPrimary,
    marginBottom: 14,
  },
  savedPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: colors.whiteBorderLight,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    width: '100%',
    marginBottom: 20,
  },
  savedLabel: {
    fontSize: 11,
    fontWeight: '700',
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
  sizeComparisonText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  actionColumn: {
    width: '100%',
    gap: 10,
  },
  replaceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 242, 254, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(0, 242, 254, 0.4)',
    paddingVertical: 13,
    borderRadius: 20,
  },
  replaceBtnText: {
    color: colors.neonCyan,
    fontSize: 13,
    fontWeight: '800',
  },
  saveCopyBtn: {
    width: '100%',
    height: 46,
  },
  saveCopyBtnText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
});
