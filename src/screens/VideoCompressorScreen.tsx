import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Modal,
  ActivityIndicator,
  Image,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Play,
  Film,
  Sparkles,
  PiggyBank,
  VideoOff,
  RefreshCw,
  Save,
  X,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useVideoPlayer, VideoView } from 'expo-video';
import { FlashList } from '@shopify/flash-list';

import { AtmosphericBackground } from '../components/glass/AtmosphericBackground';
import { GlassPanel } from '../components/glass/GlassPanel';
import { GlassButton } from '../components/glass/GlassButton';
import { CircularGauge } from '../components/glass/CircularGauge';
import { ScreenHeader } from '../components/layout/ScreenHeader';
import { FilterChips } from '../components/layout/FilterChips';
import { EmptyState, LoadingState } from '../components/layout/EmptyState';
import { SettingsModal } from '../components/settings/SettingsModal';
import { colors, alpha, radius } from '../theme/colors';
import {
  fetchDeviceVideos,
  compressVideo,
  replaceOriginalVideoWithCompressed,
  saveCompressedVideoToLibrary,
  cancelVideoCompression,
  discardCompressedVideo,
  VideoAsset,
  CompressionResult,
  formatByteSize,
} from '../services/videoCompressor';
import { ScanCacheService } from '../services/scanCacheService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnalyticsService } from '../services/analyticsService';
import { recordCleanedVideos } from '../services/cacheCleaner';

type SizeFilterType = 'all' | '500mb' | '100mb' | '50mb';

// The player lives in its own component so `useVideoPlayer` is only ever
// called when there is a uri. It used to sit behind an early `return null`
// in the same component, which changed the hook count between renders the
// moment a user tapped play — React throws on that, taking the app down.
const VideoPlayerContent: React.FC<{ uri: string; onClose: () => void }> = ({ uri, onClose }) => {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.play();
  });

  const handleClose = () => {
    try {
      player.pause();
    } catch {}
    onClose();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.videoPlayerModalOverlay}>
        <SafeAreaView style={styles.videoPlayerSafeArea}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleClose}
            style={styles.closeVideoButton}
          >
            <X color="#FFF" size={24} strokeWidth={2.5} />
          </TouchableOpacity>

          <View style={styles.videoViewContainer}>
            <VideoView
              style={styles.videoPlayerView}
              player={player}
              allowsPictureInPicture
              nativeControls
            />
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const VideoPreviewModal: React.FC<{ uri: string | null; onClose: () => void }> = ({
  uri,
  onClose,
}) => (uri ? <VideoPlayerContent key={uri} uri={uri} onClose={onClose} /> : null);

interface Props {
  onBack: () => void;
}

export const VideoCompressorScreen: React.FC<Props> = ({ onBack }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [videos, setVideos] = useState<VideoAsset[]>(() => ScanCacheService.getVideoList() || []);
  const [loading, setLoading] = useState<boolean>(() => !ScanCacheService.getVideoList());
  const [selectedVideo, setSelectedVideo] = useState<VideoAsset | null>(null);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [compressing, setCompressing] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [compressionResult, setCompressionResult] = useState<CompressionResult | null>(null);
  const [actionProcessing, setActionProcessing] = useState<boolean>(false);
  const [settingsVisible, setSettingsVisible] = useState<boolean>(false);
  const [sizeFilter, setSizeFilter] = useState<SizeFilterType>('all');

  // Video preview player
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  const loadVideos = useCallback(async (forceRefresh = false) => {
    try {
      setLoading(true);
      const data = await fetchDeviceVideos(forceRefresh);
      setVideos(data);
    } catch (err) {
      console.error('Failed to load videos', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cached = ScanCacheService.getVideoList();
    if (cached) {
      setVideos(cached);
      setLoading(false);
    } else {
      loadVideos(false);
    }
  }, [loadVideos]);

  // Identifies the compression currently allowed to update the screen. Closing
  // the dialog mid-compression used to leave it running in the background; when
  // it finished it overwrote the result of whichever video was open by then,
  // so "replace original" could delete one video and swap in another's output.
  const runIdRef = useRef(0);
  const cancellationIdRef = useRef<string | null>(null);

  const stopRunningCompression = () => {
    runIdRef.current += 1;
    if (cancellationIdRef.current) {
      cancelVideoCompression(cancellationIdRef.current);
      cancellationIdRef.current = null;
    }
  };

  const closeModal = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    stopRunningCompression();
    discardCompressedVideo(compressionResult?.outputPath);
    setModalVisible(false);
    setSelectedVideo(null);
    setCompressionResult(null);
    setCompressing(false);
    setIsSuccess(false);
    setActionProcessing(false);
  };

  // Leaving the screen must not leave a compression (and its temp file) behind.
  useEffect(() => () => stopRunningCompression(), []);

  const handleStartCompress = async (video: VideoAsset) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    stopRunningCompression();
    const runId = runIdRef.current;
    setSelectedVideo(video);
    setModalVisible(true);
    setCompressing(true);
    setIsSuccess(false);
    setCompressionResult(null);
    setProgressPercent(0);

    try {
      const result = await compressVideo(
        video,
        (percent) => {
          if (runId === runIdRef.current) setProgressPercent(percent);
        },
        (id) => {
          if (runId === runIdRef.current) cancellationIdRef.current = id;
        }
      );

      if (runId !== runIdRef.current) {
        // Cancelled or superseded while it ran: drop the output.
        discardCompressedVideo(result.outputPath);
        return;
      }

      cancellationIdRef.current = null;
      setCompressionResult(result);
      setIsSuccess(true);
      setCompressing(false);
      Haptics.notificationAsync(
        result.isSmaller
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning
      ).catch(() => {});

      if (result.isSmaller) {
        AnalyticsService.trackVideoCompressed(
          result.originalSizeBytes,
          result.compressedSizeBytes,
          result.savedBytes,
          video.qualityTag
        ).catch(() => {});
      }
    } catch (error) {
      // A cancelled run rejects too; that is not an error worth showing.
      if (runId !== runIdRef.current) return;
      cancellationIdRef.current = null;
      setCompressing(false);
      setModalVisible(false);
      setSelectedVideo(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert(t('general.error'), t('compressor.action_failed'));
    }
  };

  const finishAfterAction = () => {
    runIdRef.current += 1;
    setModalVisible(false);
    setSelectedVideo(null);
    setCompressionResult(null);
    setIsSuccess(false);
  };

  const handleReplaceOriginal = async () => {
    if (!selectedVideo || !compressionResult?.outputPath || !compressionResult.isSmaller) return;
    if (actionProcessing) return;
    setActionProcessing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    try {
      const outcome = await replaceOriginalVideoWithCompressed(
        selectedVideo.id,
        compressionResult.outputPath
      );

      if (outcome === 'failed') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        Alert.alert(t('general.error'), t('compressor.action_failed'));
        return;
      }

      if (outcome === 'replaced') {
        // Only a deleted original actually frees space.
        recordCleanedVideos(compressionResult.savedBytes).catch(() => {});
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Alert.alert(t('compressor.congratulations'), t('compressor.replaced_success'));
      } else {
        // The smaller copy was saved but the user declined deleting the original.
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        Alert.alert(t('general.success'), t('compressor.copy_only'));
      }
      finishAfterAction();
      loadVideos(true);
    } catch (err) {
      console.error('Error replacing video:', err);
      Alert.alert(t('general.error'), t('compressor.action_failed'));
    } finally {
      setActionProcessing(false);
    }
  };

  const handleSaveOnly = async () => {
    if (!compressionResult?.outputPath || !compressionResult.isSmaller || actionProcessing) return;
    setActionProcessing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    try {
      const success = await saveCompressedVideoToLibrary(compressionResult.outputPath);
      if (success) {
        // A copy next to the original frees nothing, so it is not counted as savings.
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Alert.alert(t('compressor.congratulations'), t('compressor.saved_success'));
        finishAfterAction();
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        Alert.alert(t('general.error'), t('compressor.action_failed'));
      }
    } catch (err) {
      console.error('Error saving video:', err);
      Alert.alert(t('general.error'), t('compressor.action_failed'));
    } finally {
      setActionProcessing(false);
    }
  };

  const playVideo = (uri: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setPreviewUri(uri);
  };

  // Filtered videos based on size
  const filteredVideos = useMemo(() => {
    if (sizeFilter === '500mb') {
      return videos.filter((v) => v.size >= 500 * 1024 * 1024);
    }
    if (sizeFilter === '100mb') {
      return videos.filter((v) => v.size >= 100 * 1024 * 1024);
    }
    if (sizeFilter === '50mb') {
      return videos.filter((v) => v.size >= 50 * 1024 * 1024);
    }
    return videos;
  }, [videos, sizeFilter]);

  // Calculate total savings potential across filtered device videos
  const totalSavingBytes = useMemo(() => {
    return filteredVideos.reduce((sum, v) => sum + v.potentialSavingBytes, 0);
  }, [filteredVideos]);

  const formattedTotalSaving = formatByteSize(totalSavingBytes);

  const renderVideoItem = useCallback(
    ({ item, index }: { item: VideoAsset; index: number }) => {
      const isPurpleAccent = index % 2 === 1;
      const accentColor = isPurpleAccent ? colors.accent : colors.primary;

      return (
        <View style={styles.cardWrapper}>
          <GlassPanel
            borderRadius={30}
            borderColor={alpha(accentColor, 0.24)}
            style={styles.videoCard}
            contentStyle={styles.videoCardContent}
            intensity={30}
          >
            {/* Thumbnail Box with Play Action */}
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => playVideo(item.uri)}
              style={styles.thumbnailBox}
            >
              <Image source={{ uri: item.uri }} style={styles.videoThumbnail} resizeMethod="resize" resizeMode="cover" />
              <LinearGradient
                colors={['rgba(15, 23, 42, 0.2)', 'rgba(3, 7, 18, 0.85)']}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.playButtonWrapper}>
                <GlassPanel
                  borderRadius={28}
                  style={styles.playButton}
                  contentStyle={styles.playButtonContent}
                >
                  <Play color="#FFFFFF" size={22} fill="#FFFFFF" />
                </GlassPanel>
              </View>
            </TouchableOpacity>

            {/* Card Content Body */}
            <View style={styles.cardBody}>
              <View style={styles.titleRow}>
                <Text style={styles.videoName} numberOfLines={1}>
                  {item.filename}
                </Text>
              </View>

              <View style={styles.tagRow}>
                <View style={styles.tagPill}>
                  <Text style={styles.tagText}>{item.qualityTag}</Text>
                </View>
                <View style={styles.tagPill}>
                  <Text style={styles.tagText}>{item.formattedDuration}</Text>
                </View>
                <View style={styles.tagPill}>
                  <Text style={styles.tagText}>{item.formattedSize}</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.cardFooter}>
                <View style={styles.savingGroup}>
                  <Text style={styles.savingLabel}>{t('compressor.potential_saving')}</Text>
                  <View style={styles.savingValueRow}>
                    <Film color={accentColor} size={14} style={{ marginRight: 4 }} />
                    <Text style={[styles.savingValueText, { color: accentColor }]}>
                      {item.formattedPotentialSaving}
                    </Text>
                  </View>
                </View>

                <GlassButton
                  compact
                  borderRadius={20}
                  borderColor={alpha(accentColor, 0.45)}
                  intensity={20}
                  style={styles.compressButton}
                  contentStyle={styles.compressButtonContent}
                  onPress={() => handleStartCompress(item)}
                >
                  <Text style={[styles.compressButtonText, { color: accentColor }]}>
                    {t('compressor.compress')}
                  </Text>
                </GlassButton>
              </View>
            </View>
          </GlassPanel>
        </View>
      );
    },
    [t]
  );

  return (
    <View style={styles.container}>
      <AtmosphericBackground />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader
          title={t('compressor.title')}
          onBack={onBack}
          onRefresh={() => loadVideos(true)}
          onOpenSettings={() => setSettingsVisible(true)}
        />

        <Animated.View entering={FadeInDown.duration(500).delay(60)} style={styles.headerSection}>
          <View style={styles.savingsPill}>
            <PiggyBank color={colors.successMint} size={15} />
            <Text style={styles.savingsPillText}>
              {t('compressor.savings_badge', { size: formattedTotalSaving })}
            </Text>
          </View>

          <FilterChips
            scrollable
            value={sizeFilter}
            onChange={setSizeFilter}
            options={[
              { value: 'all', label: t('compressor.filter_all') },
              { value: '500mb', label: t('compressor.filter_500mb') },
              { value: '100mb', label: t('compressor.filter_100mb') },
              { value: '50mb', label: t('compressor.filter_50mb') },
            ]}
          />
        </Animated.View>

        {/* Virtualized FlashList for High Performance & Zero Memory Leaks */}
        {loading ? (
          <LoadingState label={t('dashboard.status.scanning')} />
        ) : filteredVideos.length === 0 ? (
          <EmptyState
            icon={VideoOff}
            title={
              videos.length === 0
                ? t('compressor.no_videos')
                : t('compressor.no_videos_match')
            }
            description={
              videos.length === 0 ? t('compressor.no_videos_desc') : undefined
            }
            accent={colors.accent}
          />
        ) : (
          <View style={{ flex: 1 }}>
            <FlashList
              data={filteredVideos}
              renderItem={renderVideoItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={[
                styles.flashListContent,
                { paddingBottom: Math.max(40, insets.bottom + 20) },
              ]}
              showsVerticalScrollIndicator={false}
            />
          </View>
        )}
      </SafeAreaView>

      {/* Compression Modal Overlay */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <GlassPanel
            borderRadius={32}
            borderColor={colors.border}
            fillColor={colors.surface}
            style={styles.modalCard}
            contentStyle={styles.modalContent}
            intensity={45}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScrollInner}
              style={{ width: '100%' }}
            >
              {!isSuccess ? (
                /* Progress State */
                <View style={styles.progressState}>
                  <View style={styles.gaugeWrapper}>
                    <CircularGauge
                      value={`${progressPercent}`}
                      unit="%"
                      size={112}
                      strokeWidth={9}
                      progress={progressPercent / 100}
                    />
                  </View>

                  <Text style={styles.modalTitle}>{t('compressor.compressing')}</Text>
                  <Text style={styles.modalSubtext} numberOfLines={1}>
                    {t('compressor.optimizing', { name: selectedVideo?.filename || '' })}
                  </Text>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={closeModal}
                    style={styles.dismissButton}
                    accessibilityRole="button"
                  >
                    <Text style={styles.dismissText}>{t('compressor.cancel')}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                /* Success State with Interactive Preview & One-Tap Actions */
                <View style={styles.successState}>
                  <View style={styles.successBadge}>
                    <Sparkles color={colors.primary} size={28} />
                  </View>

                  <Text style={styles.successTitle}>
                    {compressionResult?.isSmaller
                      ? t('compressor.congratulations')
                      : t('compressor.no_gain_title')}
                  </Text>
                  <Text style={styles.successSubtext}>
                    {compressionResult?.isSmaller
                      ? t('compressor.ready')
                      : t('compressor.no_gain_video')}
                  </Text>

                  {/* Video Preview Card */}
                  {selectedVideo && (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() =>
                        playVideo(compressionResult?.outputPath || selectedVideo.uri)
                      }
                      style={styles.previewCard}
                    >
                      <Image
                        source={{ uri: selectedVideo.uri }}
                        style={styles.previewThumbnail}
                        resizeMethod="resize"
                        resizeMode="cover"
                      />
                      <LinearGradient
                        colors={['rgba(3, 7, 18, 0.2)', 'rgba(3, 7, 18, 0.85)']}
                        style={StyleSheet.absoluteFill}
                      />
                      <View style={styles.previewPlayCenter}>
                        <View style={styles.previewPlayCircle}>
                          <Play color={colors.primary} size={20} fill={colors.primary} />
                        </View>
                        <Text style={styles.previewTitleText}>
                          {t('compressor.preview_title')}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}

                  {/* Space Saved Pill */}
                  <View style={styles.spaceSavedBox}>
                    <Text style={styles.spaceSavedLabel}>{t('compressor.total_saved')}</Text>
                    <Text style={styles.spaceSavedValue}>
                      {compressionResult?.formattedSaved ?? formatByteSize(0)}
                    </Text>
                    {compressionResult && compressionResult.originalSizeBytes > 0 && (
                      <View style={styles.comparisonRow}>
                        <Text style={styles.comparisonText}>
                          {t('compressor.original_size')}:{' '}
                          <Text style={styles.comparisonVal}>
                            {formatByteSize(compressionResult.originalSizeBytes)}
                          </Text>
                        </Text>
                        <Text style={styles.comparisonArrow}>→</Text>
                        <Text style={styles.comparisonText}>
                          {t('compressor.new_size')}:{' '}
                          <Text style={[styles.comparisonVal, { color: colors.primary }]}>
                            {formatByteSize(compressionResult.compressedSizeBytes)}
                          </Text>
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* One-Tap Action Buttons */}
                  <View style={styles.modalActionGroup}>
                    {/* Primary Action: Save & Replace Original */}
                    {compressionResult?.isSmaller && (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      disabled={actionProcessing}
                      onPress={handleReplaceOriginal}
                      style={styles.replaceButtonWrapper}
                    >
                      <LinearGradient
                        colors={colors.primaryGradient}
                        style={styles.replaceButtonGradient}
                      >
                        {actionProcessing ? (
                          <ActivityIndicator
                            color="#FFFFFF"
                            size="small"
                            style={{ marginRight: 8 }}
                          />
                        ) : (
                          <RefreshCw color="#FFFFFF" size={18} style={{ marginRight: 8 }} />
                        )}
                        <Text style={styles.replaceButtonText}>
                          {t('compressor.replace_action')}
                        </Text>
                      </LinearGradient>
                    </TouchableOpacity>
                    )}

                    {/* Secondary Action: Save Compressed Only */}
                    {compressionResult?.isSmaller && (
                    <GlassButton
                      borderRadius={24}
                      borderColor={colors.border}
                      style={styles.saveOnlyButton}
                      onPress={handleSaveOnly}
                      disabled={actionProcessing}
                    >
                      <View style={styles.saveOnlyInner}>
                        {actionProcessing ? (
                          <ActivityIndicator
                            color={colors.textSecondary}
                            size="small"
                            style={{ marginRight: 6 }}
                          />
                        ) : (
                          <Save color={colors.textSecondary} size={16} style={{ marginRight: 6 }} />
                        )}
                        <Text style={styles.saveOnlyButtonText}>
                          {t('compressor.save_only_action')}
                        </Text>
                      </View>
                    </GlassButton>
                    )}

                    {/* Dismiss */}
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={closeModal}
                      style={styles.dismissButton}
                    >
                      <Text style={styles.dismissText}>{t('compressor.dismiss')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </ScrollView>
          </GlassPanel>
        </View>
      </Modal>

      {/* Video Player Modal */}
      <VideoPreviewModal uri={previewUri} onClose={() => setPreviewUri(null)} />

      {/* Settings Modal */}
      <SettingsModal visible={settingsVisible} onClose={() => setSettingsVisible(false)} />
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
  headerSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  savingsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: alpha(colors.successMint, 0.1),
    borderWidth: 1,
    borderColor: alpha(colors.successMint, 0.26),
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    alignSelf: 'flex-start',
    marginBottom: 14,
  },
  savingsPillText: {
    color: colors.successMint,
    fontSize: 12,
    fontWeight: '700',
  },
  flashListContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 110,
  },
  cardWrapper: {
    marginBottom: 16,
  },
  videoCard: {
    borderRadius: 30,
  },
  videoCardContent: {
    overflow: 'hidden',
    borderRadius: 30,
  },
  thumbnailBox: {
    width: '100%',
    height: 170,
    position: 'relative',
  },
  videoThumbnail: {
    width: '100%',
    height: '100%',
  },
  playButtonWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    borderRadius: 28,
  },
  playButtonContent: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
  },
  cardBody: {
    padding: 16,
  },
  titleRow: {
    marginBottom: 8,
  },
  videoName: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  tagPill: {
    backgroundColor: colors.surfaceSunken,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.whiteBorderLight,
  },
  tagText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  savingGroup: {
    flex: 1,
    flexShrink: 1,
  },
  savingLabel: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
  },
  savingValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  savingValueText: {
    fontSize: 14,
    fontWeight: '900',
  },
  compressButton: {
    // GlassButton defaults to width: '100%', which in this row pushed the
    // saving text out of view and let the button balloon. Size it to its
    // content with a fixed height instead.
    width: 'auto',
    height: 40,
    borderRadius: 20,
    flexShrink: 0,
    minWidth: 112,
  },
  compressButtonContent: {
    paddingHorizontal: 16,
  },
  compressButtonText: {
    fontSize: 13,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '88%',
    borderRadius: 32,
    overflow: 'hidden',
  },
  modalContent: {
    padding: 0,
    width: '100%',
  },
  modalScrollInner: {
    padding: 24,
    alignItems: 'center',
    width: '100%',
  },
  progressState: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  gaugeWrapper: {
    width: 96,
    height: 96,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  skiaCanvas: {
    width: 96,
    height: 96,
    position: 'absolute',
  },
  percentCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  percentText: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  modalSubtext: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  successState: {
    alignItems: 'center',
    width: '100%',
  },
  successBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: alpha(colors.primary, 0.1),
    borderWidth: 1,
    borderColor: alpha(colors.primary, 0.28),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  successSubtext: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  previewCard: {
    width: '100%',
    height: 140,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: alpha(colors.primary, 0.3),
    position: 'relative',
  },
  previewThumbnail: {
    width: '100%',
    height: '100%',
  },
  previewPlayCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  previewPlayCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewTitleText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  spaceSavedBox: {
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    alignItems: 'center',
    width: '100%',
    marginBottom: 20,
  },
  spaceSavedLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
  },
  spaceSavedValue: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.successMint,
  },
  comparisonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    width: '100%',
  },
  comparisonText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  comparisonVal: {
    fontWeight: '800',
    color: colors.textPrimary,
  },
  comparisonArrow: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '900',
  },
  modalActionGroup: {
    width: '100%',
    gap: 10,
  },
  replaceButtonWrapper: {
    width: '100%',
    borderRadius: radius.control,
    overflow: 'hidden',
  },
  replaceButtonGradient: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  replaceButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  saveOnlyButton: {
    width: '100%',
  },
  saveOnlyInner: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  saveOnlyButtonText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  dismissButton: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  dismissText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  /* Video Player Modal Styles */
  videoPlayerModalOverlay: {
    flex: 1,
    backgroundColor: '#000',
  },
  videoPlayerSafeArea: {
    flex: 1,
  },
  closeVideoButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 20,
    right: 20,
    zIndex: 50,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoViewContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlayerView: {
    width: '100%',
    height: '100%',
  },
});
