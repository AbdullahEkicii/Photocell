import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import Animated, {
  FadeInDown,
  FadeInUp,
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  cancelAnimation,
  withRepeat,
  withTiming,
  Easing,
  withSequence,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Globe,
  Settings,
  Play,
  Film,
  Sparkles,
  PiggyBank,
  VideoOff,
  RefreshCw,
  Save,
  X,
  SlidersHorizontal,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Canvas, SweepGradient, Circle, vec } from '@shopify/react-native-skia';
import { useVideoPlayer, VideoView } from 'expo-video';
import { FlashList } from '@shopify/flash-list';

import { AtmosphericBackground } from '../components/glass/AtmosphericBackground';
import { GlassPanel } from '../components/glass/GlassPanel';
import { GlassButton } from '../components/glass/GlassButton';
import { SettingsModal } from '../components/settings/SettingsModal';
import { colors } from '../theme/colors';
import {
  fetchDeviceVideos,
  compressVideo,
  replaceOriginalVideoWithCompressed,
  saveCompressedVideoToLibrary,
  VideoAsset,
  CompressionResult,
  formatByteSize,
} from '../services/videoCompressor';
import { ScanCacheService } from '../services/scanCacheService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnalyticsService } from '../services/analyticsService';
import { recordCleanedVideos } from '../services/cacheCleaner';

type SizeFilterType = 'all' | '500mb' | '100mb' | '50mb';

// Separate Video Player Component using expo-video
const VideoPreviewModal: React.FC<{ uri: string | null; onClose: () => void }> = ({
  uri,
  onClose,
}) => {
  if (!uri) return null;

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
    <Modal visible={Boolean(uri)} transparent animationType="fade" onRequestClose={handleClose}>
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

export const VideoCompressorScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
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
  const [filter, setFilter] = useState<SizeFilterType>('all');
  const [sizeFilter, setSizeFilter] = useState<SizeFilterType>('all');

  // Video preview player states
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewModalVisible, setPreviewModalVisible] = useState<boolean>(false);

  // Background pulsing glow animation
  const pulseAnim = useSharedValue(1);

  useEffect(() => {
    pulseAnim.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 2500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    return () => {
      cancelAnimation(pulseAnim);
    };
  }, [pulseAnim]);

  const animatedGlowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
  }));

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

  const toggleLanguage = () => {
    const current = i18n.language || 'tr';
    const nextLang = current.startsWith('tr') ? 'en' : 'tr';
    i18n.changeLanguage(nextLang);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  const handleStartCompress = async (video: VideoAsset) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setSelectedVideo(video);
    setModalVisible(true);
    setCompressing(true);
    setIsSuccess(false);
    setProgressPercent(0);

    try {
      const result = await compressVideo(video, (percent) => {
        setProgressPercent(percent);
      });

      setCompressionResult(result);
      setIsSuccess(true);
      setCompressing(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

      AnalyticsService.trackVideoCompressed(
        result.originalSizeBytes,
        result.compressedSizeBytes,
        result.savedBytes,
        video.qualityTag
      ).catch(() => {});
    } catch (error) {
      setCompressing(false);
      setModalVisible(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert(
        'Hata',
        t('compressor.action_failed', 'İşlem gerçekleştirilemedi. Lütfen galeri izinlerini kontrol edin.')
      );
    }
  };

  const handleReplaceOriginal = async () => {
    if (!selectedVideo || !compressionResult?.outputPath || actionProcessing) return;
    setActionProcessing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    try {
      const success = await replaceOriginalVideoWithCompressed(
        selectedVideo.id,
        compressionResult.outputPath
      );
      if (success) {
        if (compressionResult.savedBytes > 0) {
          recordCleanedVideos(compressionResult.savedBytes).catch(() => {});
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Alert.alert(
          t('compressor.congratulations', 'Tebrikler!'),
          t('compressor.replaced_success', 'Eski video silindi, yeni hal galerine eklendi!')
        );
        closeModal();
        loadVideos();
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        Alert.alert(
          'Hata',
          t('compressor.action_failed', 'İşlem gerçekleştirilemedi. Lütfen galeri izinlerini kontrol edin.')
        );
      }
    } catch (err) {
      console.error('Error replacing video:', err);
    } finally {
      setActionProcessing(false);
    }
  };

  const handleSaveOnly = async () => {
    if (!compressionResult?.outputPath || actionProcessing) return;
    setActionProcessing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    try {
      const success = await saveCompressedVideoToLibrary(compressionResult.outputPath);
      if (success) {
        if (compressionResult.savedBytes > 0) {
          recordCleanedVideos(compressionResult.savedBytes).catch(() => {});
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Alert.alert(
          t('compressor.congratulations', 'Tebrikler!'),
          t('compressor.saved_success', 'Yeni video galeriye kaydedildi!')
        );
        closeModal();
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        Alert.alert(
          'Hata',
          t('compressor.action_failed', 'İşlem gerçekleştirilemedi. Lütfen galeri izinlerini kontrol edin.')
        );
      }
    } catch (err) {
      console.error('Error saving video:', err);
    } finally {
      setActionProcessing(false);
    }
  };

  const closeModal = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setModalVisible(false);
    setSelectedVideo(null);
    setCompressionResult(null);
    setActionProcessing(false);
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
      const accentColor = isPurpleAccent ? colors.electricPurple : colors.neonCyan;

      return (
        <View style={styles.cardWrapper}>
          <GlassPanel
            borderRadius={30}
            borderColor={isPurpleAccent ? 'rgba(168,85,247,0.3)' : 'rgba(0,242,254,0.3)'}
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
              <Image source={{ uri: item.uri }} style={styles.videoThumbnail} resizeMode="cover" />
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
                  <Play color={colors.textPrimary} size={22} fill={colors.textPrimary} />
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
                  borderRadius={24}
                  borderColor={accentColor}
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
        {/* Top Header Bar */}
        <Animated.View entering={FadeInDown.duration(500)} style={styles.headerBar}>
          <TouchableOpacity activeOpacity={0.8} onPress={toggleLanguage} style={styles.langButton}>
            <Globe color={colors.neonCyan} size={18} strokeWidth={2.4} />
            <Text style={styles.langText}>
              {(i18n.language || 'tr').startsWith('tr') ? 'TR' : 'EN'}
            </Text>
          </TouchableOpacity>

          {/* Right Action Icons: Refresh & Settings */}
          <View style={styles.headerRightActions}>
            <TouchableOpacity 
              activeOpacity={0.8} 
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                loadVideos(true);
              }} 
              style={styles.settingsButton}
            >
              <RefreshCw color={colors.neonCyan} size={18} strokeWidth={2.4} />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setSettingsVisible(true);
              }}
              style={styles.settingsButton}
            >
              <Settings color={colors.neonCyan} size={20} strokeWidth={2.4} />
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Header Hero Section */}
        <Animated.View entering={FadeInDown.duration(600).delay(100)} style={styles.headerSection}>
          <Text style={styles.pageTitle}>{t('compressor.title')}</Text>

          <View style={styles.savingsPill}>
            <PiggyBank color={colors.successMint} size={16} style={{ marginRight: 6 }} />
            <Text style={styles.savingsPillText}>
              {t('compressor.savings_badge', { size: formattedTotalSaving })}
            </Text>
          </View>

          {/* Size Filter Pills */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScrollContent}
            style={styles.filterScrollView}
          >
            {(['all', '500mb', '100mb', '50mb'] as SizeFilterType[]).map((filterKey) => {
              const isSelected = sizeFilter === filterKey;
              return (
                <TouchableOpacity
                  key={filterKey}
                  activeOpacity={0.8}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setSizeFilter(filterKey);
                  }}
                  style={[styles.filterPill, isSelected && styles.filterPillActive]}
                >
                  <Text style={[styles.filterPillText, isSelected && styles.filterPillTextActive]}>
                    {filterKey === 'all'
                      ? t('compressor.filter_all', 'Tümü')
                      : filterKey === '500mb'
                      ? t('compressor.filter_500mb', '> 500 MB')
                      : filterKey === '100mb'
                      ? t('compressor.filter_100mb', '> 100 MB')
                      : t('compressor.filter_50mb', '> 50 MB')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Animated.View>

        {/* Virtualized FlashList for High Performance & Zero Memory Leaks */}
        {loading ? (
          <Animated.View entering={FadeIn} style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.neonCyan} style={{ marginBottom: 12 }} />
            <Text style={styles.loadingText}>
              {t('dashboard.status.scanning', 'Galeri Taranıyor...')}
            </Text>
          </Animated.View>
        ) : filteredVideos.length === 0 ? (
          <Animated.View entering={FadeIn} style={styles.emptyContainer}>
            <GlassPanel
              borderRadius={24}
              style={styles.emptyCard}
              contentStyle={styles.emptyCardContent}
            >
              <VideoOff color={colors.textMuted} size={44} style={{ marginBottom: 12 }} />
              <Text style={styles.emptyText}>
                {videos.length === 0
                  ? t('reviewer.no_photos', 'Video Bulunamadı')
                  : t('compressor.no_videos_match', 'Bu filtreye uygun video bulunamadı.')}
              </Text>
            </GlassPanel>
          </Animated.View>
        ) : (
          <View style={{ flex: 1 }}>
            <FlashList
              data={filteredVideos}
              renderItem={renderVideoItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={[
                styles.flashListContent,
                { paddingBottom: Math.max(140, 100 + insets.bottom) },
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
            borderColor="rgba(255, 255, 255, 0.15)"
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
                    <Canvas style={styles.skiaCanvas}>
                      <Circle
                        cx={48}
                        cy={48}
                        r={40}
                        style="stroke"
                        strokeWidth={8}
                        color="rgba(255,255,255,0.1)"
                      />
                      <Circle cx={48} cy={48} r={40} style="stroke" strokeWidth={8}>
                        <SweepGradient
                          c={vec(48, 48)}
                          colors={[colors.neonCyan, colors.electricPurple, colors.neonCyan]}
                        />
                      </Circle>
                    </Canvas>
                    <View style={styles.percentCenter}>
                      <Text style={styles.percentText}>{progressPercent}%</Text>
                    </View>
                  </View>

                  <Text style={styles.modalTitle}>{t('compressor.compressing')}</Text>
                  <Text style={styles.modalSubtext} numberOfLines={1}>
                    {t('compressor.optimizing', { name: selectedVideo?.filename || '' })}
                  </Text>
                </View>
              ) : (
                /* Success State with Interactive Preview & One-Tap Actions */
                <View style={styles.successState}>
                  <View style={styles.successBadge}>
                    <Sparkles color={colors.neonCyan} size={32} />
                  </View>

                  <Text style={styles.successTitle}>{t('compressor.congratulations')}</Text>
                  <Text style={styles.successSubtext}>{t('compressor.ready')}</Text>

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
                        resizeMode="cover"
                      />
                      <LinearGradient
                        colors={['rgba(3, 7, 18, 0.2)', 'rgba(3, 7, 18, 0.85)']}
                        style={StyleSheet.absoluteFill}
                      />
                      <View style={styles.previewPlayCenter}>
                        <View style={styles.previewPlayCircle}>
                          <Play color={colors.neonCyan} size={20} fill={colors.neonCyan} />
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
                      {compressionResult?.formattedSaved ||
                        selectedVideo?.formattedPotentialSaving ||
                        '0 MB'}
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
                          <Text style={[styles.comparisonVal, { color: colors.neonCyan }]}>
                            {formatByteSize(compressionResult.compressedSizeBytes)}
                          </Text>
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* One-Tap Action Buttons */}
                  <View style={styles.modalActionGroup}>
                    {/* Primary Action: Save & Replace Original */}
                    <TouchableOpacity
                      activeOpacity={0.85}
                      disabled={actionProcessing}
                      onPress={handleReplaceOriginal}
                      style={styles.replaceButtonWrapper}
                    >
                      <LinearGradient
                        colors={['rgba(0, 242, 254, 0.2)', 'rgba(16, 185, 129, 0.2)']}
                        style={styles.replaceButtonGradient}
                      >
                        {actionProcessing ? (
                          <ActivityIndicator
                            color={colors.neonCyan}
                            size="small"
                            style={{ marginRight: 8 }}
                          />
                        ) : (
                          <RefreshCw color={colors.neonCyan} size={18} style={{ marginRight: 8 }} />
                        )}
                        <Text style={styles.replaceButtonText}>
                          {t('compressor.replace_action')}
                        </Text>
                      </LinearGradient>
                    </TouchableOpacity>

                    {/* Secondary Action: Save Compressed Only */}
                    <GlassButton
                      borderRadius={24}
                      borderColor="rgba(255, 255, 255, 0.15)"
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
    backgroundColor: colors.oledBlack,
  },
  safeArea: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  langButton: {
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(0, 242, 254, 0.25)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  langText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.neonCyan,
    letterSpacing: 1,
  },
  appTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.neonCyan,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingsButton: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(0, 242, 254, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
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
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: 'flex-start',
    marginBottom: 14,
  },
  savingsPillText: {
    color: colors.successMint,
    fontSize: 12,
    fontWeight: '700',
  },
  filterScrollView: {
    maxHeight: 48,
    marginBottom: 8,
  },
  filterScrollContent: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 2,
    alignItems: 'center',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  filterPillActive: {
    backgroundColor: 'rgba(0, 242, 254, 0.16)',
    borderColor: colors.neonCyan,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  filterPillTextActive: {
    color: colors.neonCyan,
    fontWeight: '800',
  },
  flashListContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 110,
  },
  cardWrapper: {
    marginBottom: 16,
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
    textAlign: 'center',
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
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
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
    borderRadius: 24,
    flexShrink: 0,
    minWidth: 105,
  },
  compressButtonContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  compressButtonText: {
    fontSize: 13,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(3, 7, 18, 0.85)',
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
    backgroundColor: 'rgba(0, 242, 254, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(0, 242, 254, 0.4)',
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
    borderColor: 'rgba(0, 242, 254, 0.4)',
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
    borderColor: colors.neonCyan,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewTitleText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  spaceSavedBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: colors.whiteBorderLight,
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
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
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
    color: colors.neonCyan,
    fontWeight: '900',
  },
  modalActionGroup: {
    width: '100%',
    gap: 10,
  },
  replaceButtonWrapper: {
    width: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0, 242, 254, 0.5)',
  },
  replaceButtonGradient: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  replaceButtonText: {
    color: colors.neonCyan,
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
