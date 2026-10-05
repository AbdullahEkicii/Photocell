import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Image,
  TouchableOpacity,
  Platform,
  ScrollView,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { scheduleOnRN } from 'react-native-worklets';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  FadeInDown,
  FadeInUp,
  FadeIn,
  ZoomIn,
  interpolate,
  Extrapolation,
  cancelAnimation,
} from 'react-native-reanimated';
import {
  ArrowLeft,
  X,
  Heart,
  AlertCircle,
  Home,
  Sparkles,
  Image as ImageIcon,
  Trash2,
  Check,
  Star,
  ShieldCheck,
  ChevronRight,
  ChevronLeft,
  Maximize2,
  ImageOff,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { AtmosphericBackground } from '../components/glass/AtmosphericBackground';
import { GlassPanel } from '../components/glass/GlassPanel';
import { GlassButton } from '../components/glass/GlassButton';
import { colors, alpha, radius } from '../theme/colors';
import { deleteAssets, PhotoAsset } from '../services/mediaScanner';
import { recordCleanedPhotos, formatByteSize } from '../services/cacheCleaner';
import { AnalyticsService } from '../services/analyticsService';

const { width, height } = Dimensions.get('window');

interface Props {
  assets: PhotoAsset[];
  groupedAssets?: PhotoAsset[][];
  /** Receives every asset id the user acted on, so timeline progress persists. */
  onFinish: (reviewedIds: string[]) => void;
  categoryTitle?: string;
}

export const ReviewerScreen = ({
  assets,
  groupedAssets,
  onFinish,
  categoryTitle,
}: Props) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const isGroupedMode = Boolean(groupedAssets && groupedAssets.length > 0);

  // Grouped mode state
  const [groupIndex, setGroupIndex] = useState(0);
  const [toDeleteIds, setToDeleteIds] = useState<Set<string>>(new Set());

  // Single swipe mode state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessionFreedBytes, setSessionFreedBytes] = useState(0);

  // Fullscreen Photo Inspection Modal State
  const [fullscreenAsset, setFullscreenAsset] = useState<PhotoAsset | null>(null);

  // Every asset the user kept or deleted this session. Reported on the way out.
  const reviewedIdsRef = useRef<Set<string>>(new Set());

  // `isProcessing` state drives the UI (disabling buttons), but the pan
  // gesture is memoized on [currentIndex, currentAsset] and does NOT include
  // isProcessing in its deps — so its closure can capture a stale, pre-delete
  // snapshot of that state forever until currentIndex changes. A fast second
  // swipe on the same card could then call handleDeleteSingle again for the
  // same asset while the first deletion was still in flight, firing two
  // concurrent native delete calls — a likely cause of the app crashing
  // outright while deleting. A ref is immune to closure staleness: reading
  // `.current` always sees the live value, regardless of which render's
  // closure is doing the reading.
  const isProcessingRef = useRef(false);
  const setProcessing = useCallback((value: boolean) => {
    isProcessingRef.current = value;
    setIsProcessing(value);
  }, []);

  const finishReview = useCallback(() => {
    onFinish(Array.from(reviewedIdsRef.current));
  }, [onFinish]);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  // Helper to determine the "best" photo in a group (largest file size or sharpest)
  const getBestAssetId = (group: PhotoAsset[]) => {
    if (!group || group.length === 0) return '';
    let best = group[0];
    for (let i = 1; i < group.length; i++) {
      const candidate = group[i];
      if (
        (candidate.sharpnessScore ?? 0) > (best.sharpnessScore ?? 0) ||
        (candidate.fileSize ?? 0) > (best.fileSize ?? 0)
      ) {
        best = candidate;
      }
    }
    return best.id;
  };

  // Set initial default selections when entering a group
  useEffect(() => {
    if (isGroupedMode && groupedAssets && groupedAssets[groupIndex]) {
      const currentGroup = groupedAssets[groupIndex];
      const bestId = getBestAssetId(currentGroup);
      const initialToDelete = new Set<string>();
      currentGroup.forEach((asset) => {
        if (asset.id !== bestId) {
          initialToDelete.add(asset.id);
        }
      });
      setToDeleteIds(initialToDelete);
    }
  }, [groupIndex, isGroupedMode, groupedAssets]);

  const currentAsset = assets[currentIndex];
  const nextAsset = assets[currentIndex + 1];

  // The swipe worklets must not capture the per-render handlers below: they are
  // async closures that go stale, and handing them to the UI runtime is what
  // crashed the app natively on a fast swipe-to-delete. They call these two
  // stable wrappers instead, which always forward to the latest handler.
  const handlersRef = useRef({ del: () => {}, keep: () => {} });
  const runDelete = useCallback(() => handlersRef.current.del(), []);
  const runKeep = useCallback(() => handlersRef.current.keep(), []);
  // True from the moment a swipe commits until the next card is ready, so a
  // second gesture can't start on a card that is already flying off.
  const swipeLocked = useSharedValue(false);

  const panGesture = useMemo(() => {
    return Gesture.Pan()
      .onStart(() => {
        startX.value = translateX.value;
        startY.value = translateY.value;
      })
      .onUpdate((event) => {
        if (swipeLocked.value) return;
        translateX.value = startX.value + event.translationX;
        translateY.value = startY.value + event.translationY;
      })
      .onEnd((event) => {
        if (swipeLocked.value) return;
        const shouldDelete =
          translateX.value < -width * 0.3 || event.velocityX < -800;
        const shouldKeep =
          translateX.value > width * 0.3 || event.velocityX > 800;

        if (shouldDelete) {
          swipeLocked.value = true;
          translateX.value = withTiming(-width * 1.5, { duration: 250 }, (finished) => {
            if (finished) scheduleOnRN(runDelete);
          });
        } else if (shouldKeep) {
          swipeLocked.value = true;
          translateX.value = withTiming(width * 1.5, { duration: 250 }, (finished) => {
            if (finished) scheduleOnRN(runKeep);
          });
        } else {
          translateX.value = withSpring(0, { damping: 18, stiffness: 200 });
          translateY.value = withSpring(0, { damping: 18, stiffness: 200 });
        }
      });
  }, [runDelete, runKeep]);

  const nextPhoto = () => {
    setCurrentIndex((prev) => prev + 1);
    translateX.value = 0;
    translateY.value = 0;
    swipeLocked.value = false;
    setProcessing(false);
  };

  const handleDeleteSingle = async () => {
    if (!currentAsset || isProcessingRef.current) return;
    setProcessing(true);
    reviewedIdsRef.current.add(currentAsset.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {}
    );
    const freed = currentAsset.fileSize || 0;
    const success = await deleteAssets([currentAsset]);
    if (success) {
      setSessionFreedBytes((prev) => prev + freed);
      recordCleanedPhotos(freed).catch(() => {});
      AnalyticsService.trackPhotosDeleted(
        categoryTitle || 'single_review',
        1,
        freed
      ).catch(() => {});
      nextPhoto();
    } else {
      setProcessing(false);
      swipeLocked.value = false;
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
    }
  };

  const handleKeepSingle = () => {
    if (isProcessingRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (currentAsset) reviewedIdsRef.current.add(currentAsset.id);
    nextPhoto();
  };

  handlersRef.current = { del: handleDeleteSingle, keep: handleKeepSingle };

  const triggerSwipeLeft = () => {
    if (isProcessingRef.current || swipeLocked.value) return;
    swipeLocked.value = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    translateX.value = withTiming(-width * 1.5, { duration: 280 }, (finished) => {
      if (finished) scheduleOnRN(runDelete);
    });
  };

  const triggerSwipeRight = () => {
    if (isProcessingRef.current || swipeLocked.value) return;
    swipeLocked.value = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    translateX.value = withTiming(width * 1.5, { duration: 280 }, (finished) => {
      if (finished) scheduleOnRN(runKeep);
    });
  };

  const frontCardStyle = useAnimatedStyle(() => {
    const rotate = interpolate(
      translateX.value,
      [-width / 2, width / 2],
      [-12, 12],
      Extrapolation.CLAMP
    );
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${rotate}deg` },
      ],
    };
  });

  const backCardStyle = useAnimatedStyle(() => {
    const scale = interpolate(
      Math.abs(translateX.value),
      [0, width / 2],
      [0.92, 1],
      Extrapolation.CLAMP
    );
    const ty = interpolate(
      Math.abs(translateX.value),
      [0, width / 2],
      [14, 0],
      Extrapolation.CLAMP
    );
    return {
      transform: [{ scale }, { translateY: ty }],
      opacity: interpolate(
        Math.abs(translateX.value),
        [0, width / 2],
        [0.75, 1],
        Extrapolation.CLAMP
      ),
    };
  });

  const deleteOpacityStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, -60], [0, 1], Extrapolation.CLAMP),
  }));

  const keepOpacityStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, 60], [0, 1], Extrapolation.CLAMP),
  }));

  // --- GROUPED MODE HANDLERS ---
  const togglePhotoSelection = (assetId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setToDeleteIds((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  };

  const handleKeepBestAuto = () => {
    if (!groupedAssets || !groupedAssets[groupIndex]) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const currentGroup = groupedAssets[groupIndex];
    const bestId = getBestAssetId(currentGroup);
    const newToDelete = new Set<string>();
    currentGroup.forEach((a) => {
      if (a.id !== bestId) newToDelete.add(a.id);
    });
    setToDeleteIds(newToDelete);
  };

  const handleKeepAllInGroup = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setToDeleteIds(new Set());
  };

  const handleConfirmGroup = async () => {
    if (!groupedAssets || !groupedAssets[groupIndex] || isProcessingRef.current) return;
    setProcessing(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {}
    );

    const currentGroup = groupedAssets[groupIndex];
    currentGroup.forEach((asset) => reviewedIdsRef.current.add(asset.id));
    const itemsToDelete = currentGroup.filter((asset) =>
      toDeleteIds.has(asset.id)
    );

    if (itemsToDelete.length > 0) {
      const freed = itemsToDelete.reduce(
        (sum, a) => sum + (a.fileSize || 0),
        0
      );
      await deleteAssets(itemsToDelete);
      setSessionFreedBytes((prev) => prev + freed);
      recordCleanedPhotos(freed).catch(() => {});
      AnalyticsService.trackPhotosDeleted(
        categoryTitle || 'grouped_review',
        itemsToDelete.length,
        freed
      ).catch(() => {});
    }

    setGroupIndex((prev) => prev + 1);
    setProcessing(false);
  };

  // Done condition calculation
  const isDone = isGroupedMode
    ? Boolean(groupedAssets && groupIndex >= groupedAssets.length)
    : currentIndex >= assets.length;

  if (isDone) {
    return (
      <View style={styles.container}>
        <AtmosphericBackground />
        <Animated.View
          entering={ZoomIn.duration(600).springify()}
          style={styles.doneContainer}
        >
          {/* Glowing Ring */}
          <View style={styles.doneIconRing}>
            <LinearGradient
              colors={[colors.primary, colors.successMint]}
              style={styles.doneIconGradient}
            >
              <Check color={colors.textOnAccent} size={40} strokeWidth={3} />
            </LinearGradient>
          </View>

          <Text style={styles.doneTitle}>{t('reviewer.done_title')}</Text>
          <Text style={styles.doneDesc}>{t('reviewer.done_subtitle')}</Text>

          {/* Session Freed Highlight Badge */}
          {sessionFreedBytes > 0 && (
            <GlassPanel
              borderRadius={20}
              borderColor={alpha(colors.successMint, 0.35)}
              style={styles.freedBadge}
              contentStyle={styles.freedBadgeContent}
              intensity={30}
            >
              <Sparkles
                color={colors.successMint}
                size={18}
                style={{ marginRight: 8 }}
              />
              <Text style={styles.freedBadgeText}>
                {t('reviewer.done_freed', { size: formatByteSize(sessionFreedBytes) })}
              </Text>
            </GlassPanel>
          )}

          <GlassButton
            borderRadius={radius.control}
            borderColor={alpha(colors.primary, 0.4)}
            glowColor={colors.primary}
            style={styles.homeBtn}
            onPress={finishReview}
          >
            <View style={styles.homeBtnContent}>
              <Home
                color={colors.textPrimary}
                size={20}
                style={{ marginRight: 8 }}
              />
              <Text style={styles.homeBtnText}>{t('reviewer.done_btn_home')}</Text>
            </View>
          </GlassButton>
        </Animated.View>
      </View>
    );
  }

  // --- RENDER GROUPED MODE (SIMILAR PHOTOS & EXACT DUPLICATES) ---
  if (isGroupedMode && groupedAssets) {
    const currentGroup = groupedAssets[groupIndex] || [];
    const bestAssetId = getBestAssetId(currentGroup);
    const deleteCount = currentGroup.filter((a) => toDeleteIds.has(a.id)).length;
    const keepCount = currentGroup.length - deleteCount;
    const totalGroups = groupedAssets.length;
    const groupProgress = totalGroups > 0 ? (groupIndex + 1) / totalGroups : 0;
    const cardWidth =
      currentGroup.length === 2
        ? (width - 56) / 2
        : Math.min(width * 0.72, 280);

    return (
      <View style={styles.container}>
        <AtmosphericBackground />

        {/* Top Bar */}
        <SafeAreaView edges={['top']}>
          <Animated.View entering={FadeInDown.duration(400)} style={styles.topBar}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
                  () => {}
                );
                finishReview();
              }}
              style={styles.topBackButton}
            >
              <ArrowLeft
                color={colors.textPrimary}
                size={20}
                strokeWidth={2.4}
              />
            </TouchableOpacity>

            <View style={styles.headerTextContainer}>
              <Text style={styles.eyebrowText}>
                {categoryTitle || t('dashboard.bento.similar_shots')}
              </Text>
              <Text style={styles.counterText}>
                {t('reviewer.group_header', {
                  current: groupIndex + 1,
                  total: totalGroups,
                })}
              </Text>
            </View>

            <View style={{ width: 40 }} />
          </Animated.View>
        </SafeAreaView>

        {/* Progress Track Line */}
        <View style={styles.progressTrack}>
          <View
            style={[styles.progressFill, { width: `${groupProgress * 100}%` }]}
          />
        </View>

        {/* Group Info Badge */}
        <Animated.View
          entering={FadeInDown.delay(100)}
          style={styles.groupedHeaderBadge}
        >
          <View style={styles.groupedBadgeLeft}>
            <AlertCircle
              color={colors.warningAmber}
              size={18}
              style={{ marginRight: 8 }}
            />
            <Text style={styles.groupedBadgeTitle}>
              {t('reviewer.photos_in_group', { count: currentGroup.length })}
            </Text>
          </View>
          <Text style={styles.groupedBadgeSub}>
            {t('reviewer.group_done_summary', {
              deleted: deleteCount,
              kept: keepCount,
            })}
          </Text>
        </Animated.View>

        {/* Side-by-Side Photos Carousel / Grid */}
        <View style={styles.sideBySideContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.sideBySideScrollContent}
            decelerationRate="fast"
            snapToInterval={cardWidth + 16}
            snapToAlignment="center"
          >
            {currentGroup.map((asset, idx) => {
              const isDeleting = toDeleteIds.has(asset.id);
              const isBest = asset.id === bestAssetId;

              return (
                <TouchableOpacity
                  key={asset.id || idx}
                  activeOpacity={0.9}
                  onPress={() => togglePhotoSelection(asset.id)}
                  style={[
                    styles.groupCardWrapper,
                    { width: cardWidth },
                    isDeleting ? styles.groupCardDelete : styles.groupCardKeep,
                  ]}
                >
                  <View style={styles.groupCardInner}>
                    <Image
                      source={{ uri: asset.uri }}
                      style={styles.groupCardImage}
                      resizeMethod="resize"
                      resizeMode="cover"
                    />

                    {/* Best Tag */}
                    {isBest && (
                      <View style={styles.bestBadge}>
                        <Star
                          color="#F59E0B"
                          size={12}
                          fill="#F59E0B"
                          style={{ marginRight: 4 }}
                        />
                        <Text style={styles.bestBadgeText}>{t('reviewer.best_badge')}</Text>
                      </View>
                    )}

                    {/* Top Status Pill */}
                    <View
                      style={[
                        styles.statusPill,
                        isDeleting
                          ? styles.statusPillDelete
                          : styles.statusPillKeep,
                      ]}
                    >
                      {isDeleting ? (
                        <>
                          <Trash2
                            color={colors.dangerRose}
                            size={14}
                            style={{ marginRight: 4 }}
                          />
                          <Text style={styles.statusPillTextDelete}>
                            {t('reviewer.status_delete')}
                          </Text>
                        </>
                      ) : (
                        <>
                          <Heart
                            color={colors.successMint}
                            size={14}
                            fill={colors.successMint}
                            style={{ marginRight: 4 }}
                          />
                          <Text style={styles.statusPillTextKeep}>
                            {t('reviewer.status_keep')}
                          </Text>
                        </>
                      )}
                    </View>

                    {/* Fullscreen Expand Icon */}
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setFullscreenAsset(asset)}
                      style={styles.expandButton}
                    >
                      <Maximize2 color="#FFFFFF" size={14} strokeWidth={2.4} />
                    </TouchableOpacity>

                    {/* File Info Pill */}
                    {asset.fileSize && (
                      <View style={styles.cardInfoPill}>
                        <ImageIcon
                          color="rgba(255,255,255,0.7)"
                          size={12}
                          style={{ marginRight: 4 }}
                        />
                        <Text style={styles.cardInfoText}>
                          {formatByteSize(asset.fileSize)}
                        </Text>
                      </View>
                    )}

                    {/* Selection Check Icon Overlay */}
                    <View
                      style={[
                        styles.checkOverlayIcon,
                        isDeleting
                          ? styles.checkOverlayDelete
                          : styles.checkOverlayKeep,
                      ]}
                    >
                      {isDeleting ? (
                        <X color="#FFF" size={18} strokeWidth={3} />
                      ) : (
                        <Check color="#FFF" size={18} strokeWidth={3} />
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Action Controls for Grouped Mode */}
        <Animated.View
          entering={FadeInUp.delay(200).springify()}
          style={[
            styles.groupedActionsContainer,
            { paddingBottom: Math.max(16, insets.bottom + 8) },
          ]}
        >
          {/* Preset Buttons */}
          <View style={styles.presetButtonsRow}>
            <TouchableOpacity
              style={styles.presetButton}
              onPress={handleKeepBestAuto}
              activeOpacity={0.8}
            >
              <Sparkles
                color={colors.primary}
                size={16}
                style={{ marginRight: 6 }}
              />
              <Text style={styles.presetButtonText}>
                {t('reviewer.keep_best_auto')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.presetButtonSecondary}
              onPress={handleKeepAllInGroup}
              activeOpacity={0.8}
            >
              <ShieldCheck
                color={colors.textSecondary}
                size={16}
                style={{ marginRight: 6 }}
              />
              <Text style={styles.presetButtonSecondaryText}>
                {t('reviewer.keep_all_group')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Confirm & Advance Button */}
          <GlassButton
            borderRadius={28}
            borderColor={
              deleteCount > 0
                ? 'rgba(244, 63, 94, 0.5)'
                : 'rgba(16, 185, 129, 0.5)'
            }
            glowColor={
              deleteCount > 0 ? colors.dangerRose : colors.successMint
            }
            style={styles.confirmGroupButton}
            onPress={handleConfirmGroup}
            disabled={isProcessing}
          >
            <View style={styles.confirmButtonContent}>
              <Text style={styles.confirmButtonText}>
                {deleteCount > 0
                  ? t('reviewer.confirm_and_next', { count: deleteCount })
                  : t('reviewer.next_group')}
              </Text>
              <ChevronRight
                color={colors.textPrimary}
                size={20}
                strokeWidth={2.5}
                style={{ marginLeft: 6 }}
              />
            </View>
          </GlassButton>
        </Animated.View>

        {/* Fullscreen Photo Inspector Modal */}
        {renderFullscreenModal()}
      </View>
    );
  }

  // --- RENDER SINGLE PHOTO CARD SWIPE MODE (Default Fallback) ---
  const progress =
    assets.length > 0 ? Math.min(currentIndex / assets.length, 1) : 0;

  function renderFullscreenModal() {
    if (!fullscreenAsset) return null;
    return (
      <Modal
        visible={Boolean(fullscreenAsset)}
        transparent
        animationType="fade"
        onRequestClose={() => setFullscreenAsset(null)}
      >
        <View style={styles.fullscreenOverlay}>
          <SafeAreaView style={styles.fullscreenSafe} edges={['top', 'bottom']}>
            {/* Top Bar */}
            <View style={styles.fullscreenHeader}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setFullscreenAsset(null)}
                style={styles.fullscreenCloseBtn}
              >
                <X color="#FFFFFF" size={20} strokeWidth={2.5} />
                <Text style={styles.fullscreenCloseText}>
                  {t('reviewer.fullscreen_close')}
                </Text>
              </TouchableOpacity>

              {fullscreenAsset.fileSize && (
                <View style={styles.fullscreenSizePill}>
                  <Text style={styles.fullscreenSizeText}>
                    {formatByteSize(fullscreenAsset.fileSize)}
                  </Text>
                </View>
              )}
            </View>

            {/* Immersive Image Viewer */}
            <View style={styles.fullscreenImageContainer}>
              <Image
                source={{ uri: fullscreenAsset.uri }}
                style={styles.fullscreenImage}
                resizeMethod="resize"
                resizeMode="contain"
              />
            </View>

            {/* In-Modal Quick Actions */}
            <View style={styles.fullscreenActionsRow}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  setFullscreenAsset(null);
                  triggerSwipeLeft();
                }}
                style={[styles.bigActionPill, styles.bigDeletePill]}
              >
                <View style={styles.actionIconRingDelete}>
                  <Trash2
                    color={colors.dangerRose}
                    size={22}
                    strokeWidth={2.6}
                  />
                </View>
                <Text style={styles.actionPillTextDelete}>
                  {t('reviewer.action_delete')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  setFullscreenAsset(null);
                  triggerSwipeRight();
                }}
                style={[styles.bigActionPill, styles.bigKeepPill]}
              >
                <View style={styles.actionIconRingKeep}>
                  <Heart
                    color={colors.successMint}
                    fill={colors.successMint}
                    size={22}
                    strokeWidth={2.4}
                  />
                </View>
                <Text style={styles.actionPillTextKeep}>
                  {t('reviewer.action_keep')}
                </Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    );
  }

  return (
    <View style={styles.container}>
      <AtmosphericBackground />

      {/* Top Header Bar */}
      <SafeAreaView edges={['top']}>
        <Animated.View entering={FadeInDown.duration(400)} style={styles.topBar}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
                () => {}
              );
              finishReview();
            }}
            style={styles.topBackButton}
          >
            <ArrowLeft
              color={colors.textPrimary}
              size={20}
              strokeWidth={2.4}
            />
          </TouchableOpacity>

          <View style={styles.headerTextContainer}>
            <Text style={styles.eyebrowText}>
              {categoryTitle || t('reviewer.title_default')}
            </Text>
            <Text style={styles.counterText}>
              {currentIndex + 1} / {assets.length}
            </Text>
          </View>

          <View style={{ width: 40 }} />
        </Animated.View>
      </SafeAreaView>

      {/* Progress Track Line */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      {/* Fullscreen Hint Pill */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => currentAsset && setFullscreenAsset(currentAsset)}
        style={styles.fullscreenHintRow}
      >
        <Maximize2 color={colors.primary} size={14} style={{ marginRight: 6 }} />
        <Text style={styles.fullscreenHintText}>
          {t('reviewer.fullscreen_hint')}
        </Text>
      </TouchableOpacity>

      {/* Main Review Card Stack Area */}
      <View style={styles.mainReviewArea}>
        <View style={styles.cardContainer}>
          {/* BACK CARD */}
          {nextAsset && (
            <Animated.View style={[styles.card, styles.backCard, backCardStyle]}>
              <Image
                source={{ uri: nextAsset.uri }}
                style={styles.image}
                resizeMethod="resize"
                resizeMode="cover"
              />
            </Animated.View>
          )}

          {/* FRONT CARD */}
          <GestureDetector gesture={panGesture}>
            <Animated.View style={[styles.card, frontCardStyle]}>
              {currentAsset ? (
                <TouchableOpacity
                  activeOpacity={0.95}
                  onPress={() => setFullscreenAsset(currentAsset)}
                  style={{ flex: 1 }}
                >
                  <Image
                    source={{ uri: currentAsset.uri }}
                    style={styles.image}
                    resizeMethod="resize"
                    resizeMode="cover"
                  />

                  {/* OVERLAYS */}
                  <Animated.View
                    style={[
                      styles.overlayBadge,
                      styles.keepOverlay,
                      keepOpacityStyle,
                    ]}
                  >
                    <Text style={styles.overlayTextKeep}>
                      {t('reviewer.action_keep')}
                    </Text>
                  </Animated.View>

                  <Animated.View
                    style={[
                      styles.overlayBadge,
                      styles.deleteOverlay,
                      deleteOpacityStyle,
                    ]}
                  >
                    <Text style={styles.overlayTextDelete}>
                      {t('reviewer.action_delete')}
                    </Text>
                  </Animated.View>

                  {/* METADATA PILL */}
                  {currentAsset.fileSize && (
                    <GlassPanel
                      borderRadius={24}
                      borderColor={colors.whiteBorderLight}
                      style={styles.metadataPill}
                      contentStyle={styles.metadataContent}
                      intensity={25}
                    >
                      <ImageIcon
                        color={colors.textMuted}
                        size={16}
                        style={{ marginRight: 8 }}
                      />
                      <Text style={styles.metadataText}>
                        {formatByteSize(currentAsset.fileSize)}
                      </Text>
                      {currentAsset.sharpnessScore !== undefined && (
                        <View style={styles.blurBadgeInCard}>
                          <ImageOff
                            color={colors.accent}
                            size={13}
                            style={{ marginRight: 4 }}
                          />
                          <Text style={styles.blurBadgeText}>
                            {t('dashboard.bento.blurry_photos', 'Bulanık')}
                          </Text>
                        </View>
                      )}
                    </GlassPanel>
                  )}

                  {/* Expand Overlay Icon Button */}
                  <View style={styles.cardExpandBadge}>
                    <Maximize2 color="#FFFFFF" size={16} strokeWidth={2.4} />
                  </View>
                </TouchableOpacity>
              ) : (
                <View style={styles.emptyCard}>
                  <AlertCircle color={colors.textMuted} size={48} />
                  <Text style={styles.cardText}>{t('reviewer.no_photos')}</Text>
                </View>
              )}
            </Animated.View>
          </GestureDetector>
        </View>
      </View>

      {/* Redesigned Bottom Action Pill Buttons (SİL / TUT) */}
      <Animated.View
        entering={FadeInUp.delay(350).springify()}
        style={[
          styles.actionsRow,
          { paddingBottom: Math.max(16, insets.bottom + 8) },
        ]}
      >
        {/* DELETE BUTTON PILL */}
        <TouchableOpacity
          style={[
            styles.bigActionPill,
            styles.bigDeletePill,
            isProcessing && styles.actionButtonDisabled,
          ]}
          onPress={triggerSwipeLeft}
          activeOpacity={0.82}
          disabled={isProcessing}
        >
          <View style={styles.actionIconRingDelete}>
            <Trash2
              color={colors.dangerRose}
              size={22}
              strokeWidth={2.6}
            />
          </View>
          <Text style={styles.actionPillTextDelete}>
            {t('reviewer.action_delete')}
          </Text>
        </TouchableOpacity>

        {/* KEEP BUTTON PILL */}
        <TouchableOpacity
          style={[
            styles.bigActionPill,
            styles.bigKeepPill,
            isProcessing && styles.actionButtonDisabled,
          ]}
          onPress={triggerSwipeRight}
          activeOpacity={0.82}
          disabled={isProcessing}
        >
          <View style={styles.actionIconRingKeep}>
            <Heart
              color={colors.successMint}
              fill={colors.successMint}
              size={22}
              strokeWidth={2.4}
            />
          </View>
          <Text style={styles.actionPillTextKeep}>
            {t('reviewer.action_keep')}
          </Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Fullscreen Photo Inspector Modal */}
      {renderFullscreenModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  topBackButton: {
    width: 40,
    height: 40,
    borderRadius: radius.chip,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextContainer: {
    alignItems: 'center',
  },
  eyebrowText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  counterText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 2,
  },
  progressTrack: {
    height: 3,
    backgroundColor: colors.surfaceSunken,
    width: '100%',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  fullscreenHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  fullscreenHintText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  mainReviewArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  cardContainer: {
    width: width - 44,
    height: Math.min(height * 0.58, 510),
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  card: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.panel,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.16,
    shadowRadius: 28,
    elevation: 12,
  },
  backCard: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: colors.border,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  cardExpandBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metadataPill: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    borderRadius: 24,
  },
  metadataContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  metadataText: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 13,
  },
  blurBadgeInCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    paddingLeft: 8,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  blurBadgeText: {
    color: colors.accent,
    fontWeight: '800',
    fontSize: 12,
  },
  emptyCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSunken,
  },
  cardText: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  overlayBadge: {
    position: 'absolute',
    top: 36,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 3,
    zIndex: 10,
  },
  keepOverlay: {
    left: 28,
    borderColor: colors.successMint,
    backgroundColor: 'rgba(16, 185, 129, 0.25)',
    transform: [{ rotate: '-15deg' }],
  },
  deleteOverlay: {
    right: 28,
    borderColor: colors.dangerRose,
    backgroundColor: 'rgba(244, 63, 94, 0.25)',
    transform: [{ rotate: '15deg' }],
  },
  overlayTextKeep: {
    color: colors.successMint,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 2,
  },
  overlayTextDelete: {
    color: colors.dangerRose,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 2,
  },

  // --- REDESIGNED BOTTOM ACTION BUTTONS ---
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 14,
    gap: 16,
  },
  bigActionPill: {
    flex: 1,
    maxWidth: 165,
    height: 58,
    borderRadius: 29,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 1.8,
    elevation: 6,
  },
  bigDeletePill: {
    backgroundColor: 'rgba(244, 63, 94, 0.12)',
    borderColor: 'rgba(244, 63, 94, 0.5)',
    shadowColor: colors.dangerRose,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  bigKeepPill: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.5)',
    shadowColor: colors.successMint,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  actionIconRingDelete: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(244, 63, 94, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  actionIconRingKeep: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  actionPillTextDelete: {
    color: colors.dangerRose,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  actionPillTextKeep: {
    color: colors.successMint,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  actionButtonDisabled: {
    opacity: 0.4,
  },

  // --- FULLSCREEN INSPECTION MODAL ---
  fullscreenOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.96)',
  },
  fullscreenSafe: {
    flex: 1,
  },
  fullscreenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  fullscreenCloseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  fullscreenCloseText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    marginLeft: 6,
  },
  fullscreenSizePill: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.24)',
  },
  fullscreenSizeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  fullscreenImageContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  fullscreenImage: {
    width: '100%',
    height: '100%',
  },
  fullscreenActionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },

  // --- GROUPED REVIEW MODE STYLES ---
  groupedHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 16,
  },
  groupedBadgeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupedBadgeTitle: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  groupedBadgeSub: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  sideBySideContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 12,
  },
  sideBySideScrollContent: {
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 16,
  },
  groupCardWrapper: {
    height: height * 0.48,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 2.5,
    elevation: 8,
  },
  groupCardDelete: {
    borderColor: colors.dangerRose,
    backgroundColor: 'rgba(244, 63, 94, 0.08)',
  },
  groupCardKeep: {
    borderColor: colors.successMint,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  groupCardInner: {
    flex: 1,
    position: 'relative',
  },
  groupCardImage: {
    width: '100%',
    height: '100%',
  },
  bestBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warningAmber,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  bestBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  statusPill: {
    position: 'absolute',
    top: 10,
    right: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusPillDelete: {
    backgroundColor: 'rgba(244, 63, 94, 0.9)',
  },
  statusPillKeep: {
    backgroundColor: 'rgba(16, 185, 129, 0.9)',
  },
  statusPillTextDelete: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
  },
  statusPillTextKeep: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
  },
  expandButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  cardInfoPill: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  cardInfoText: {
    color: 'rgba(255, 255, 255, 0.92)',
    fontSize: 11,
    fontWeight: '700',
  },
  checkOverlayIcon: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOverlayDelete: {
    backgroundColor: colors.dangerRose,
  },
  checkOverlayKeep: {
    backgroundColor: colors.successMint,
  },
  groupedActionsContainer: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  presetButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  presetButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: alpha(colors.primary, 0.09),
    borderWidth: 1,
    borderColor: alpha(colors.primary, 0.26),
    borderRadius: 16,
    paddingVertical: 10,
  },
  presetButtonText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  presetButtonSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingVertical: 10,
  },
  presetButtonSecondaryText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
  },
  confirmGroupButton: {
    width: '100%',
    height: 52,
  },
  confirmButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '900',
  },

  // --- DONE SCREEN STYLES ---
  doneContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  doneIconRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: colors.successMint,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 22,
    elevation: 8,
  },
  doneIconGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  doneDesc: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  freedBadge: {
    marginBottom: 28,
  },
  freedBadgeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  freedBadgeText: {
    color: colors.successMint,
    fontWeight: '800',
    fontSize: 14,
  },
  homeBtn: {
    width: '100%',
    maxWidth: 260,
    height: 52,
  },
  homeBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeBtnText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '800',
  },
});