import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Animated, {
  FadeInDown,
  FadeInUp,
  FadeIn,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Globe,
  Settings,
  Calendar,
  Sparkles,
  ChevronRight,
  CheckCircle2,
  Images,
  Flame,
  RefreshCw,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { FlashList } from '@shopify/flash-list';

import { AtmosphericBackground } from '../components/glass/AtmosphericBackground';
import { GlassPanel } from '../components/glass/GlassPanel';
import { GlassButton } from '../components/glass/GlassButton';
import { SettingsModal } from '../components/settings/SettingsModal';
import { colors } from '../theme/colors';
import {
  fetchTimelineMonthGroups,
  MonthGroup,
} from '../services/timelineScanner';
import { PhotoAsset } from '../services/mediaScanner';
import { ScanCacheService } from '../services/scanCacheService';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  onStartMonthDetox: (assets: PhotoAsset[], monthTitle: string) => void;
}

export const TimelineScreen: React.FC<Props> = ({ onStartMonthDetox }) => {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const [months, setMonths] = useState<MonthGroup[]>(() => ScanCacheService.getTimeline() || []);
  const [loading, setLoading] = useState<boolean>(() => !ScanCacheService.getTimeline());
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [settingsVisible, setSettingsVisible] = useState<boolean>(false);

  const loadTimeline = useCallback(async (forceRefresh = false) => {
    try {
      if (forceRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      const groups = await fetchTimelineMonthGroups(i18n.language || 'tr', forceRefresh);
      setMonths(groups);
    } catch (err) {
      console.error('Failed loading timeline:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [i18n.language]);

  useEffect(() => {
    const cached = ScanCacheService.getTimeline();
    if (cached) {
      setMonths(cached);
      setLoading(false);
    } else {
      loadTimeline(false);
    }
  }, [loadTimeline]);

  const toggleLanguage = () => {
    const current = i18n.language || 'tr';
    const nextLang = current.startsWith('tr') ? 'en' : 'tr';
    i18n.changeLanguage(nextLang);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  const handleMonthPress = (group: MonthGroup) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onStartMonthDetox(group.assets, group.title);
  };

  const totalPhotosCount = useMemo(() => {
    return months.reduce((sum, m) => sum + m.count, 0);
  }, [months]);

  const renderMonthCard = useCallback(
    ({ item, index }: { item: MonthGroup; index: number }) => {
      const isComplete = item.percentReviewed === 100;
      const isCurrentMonth = index === 0;

      return (
        <View style={styles.monthCardWrapper}>
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={() => handleMonthPress(item)}
          >
            <GlassPanel
              borderRadius={28}
              borderColor={
                isComplete
                  ? 'rgba(16, 185, 129, 0.4)'
                  : isCurrentMonth
                  ? 'rgba(0, 242, 254, 0.4)'
                  : 'rgba(255, 255, 255, 0.1)'
              }
              style={styles.monthCard}
              contentStyle={styles.monthCardContent}
              intensity={30}
              glowAccent={
                isComplete
                  ? colors.successMint
                  : isCurrentMonth
                  ? colors.neonCyan
                  : undefined
              }
            >
              {/* Cover Image Thumbnail */}
              <View style={styles.coverThumbnailWrapper}>
                {item.coverAssetUri ? (
                  <Image
                    source={{ uri: item.coverAssetUri }}
                    style={styles.coverThumbnail}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.emptyCover}>
                    <Images color={colors.textMuted} size={28} />
                  </View>
                )}
                <LinearGradient
                  colors={['transparent', 'rgba(10, 15, 29, 0.85)']}
                  style={StyleSheet.absoluteFill}
                />
                {isComplete ? (
                  <View style={styles.completeCheckBadge}>
                    <CheckCircle2 color="#FFF" size={16} />
                  </View>
                ) : isCurrentMonth ? (
                  <View style={styles.currentMonthBadge}>
                    <Flame color="#FFF" size={14} />
                  </View>
                ) : null}
              </View>

              {/* Month Details Body */}
              <View style={styles.monthDetails}>
                <View style={styles.titleRow}>
                  <Text style={styles.monthTitle}>{item.title}</Text>
                  {isComplete && (
                    <View style={styles.reviewedPill}>
                      <Text style={styles.reviewedPillText}>
                        {t('timeline.reviewed_badge')}
                      </Text>
                    </View>
                  )}
                </View>

                <Text style={styles.monthSummary}>
                  {t('timeline.month_summary', {
                    count: item.count,
                    size: item.formattedSize,
                  })}
                </Text>

                {/* Progress Bar */}
                <View style={styles.progressContainer}>
                  <View style={styles.progressBarTrack}>
                    <View
                      style={[
                        styles.progressBarFill,
                        { width: `${Math.max(item.percentReviewed, 4)}%` },
                        isComplete && { backgroundColor: colors.successMint },
                      ]}
                    />
                  </View>
                  <Text style={styles.progressPercentText}>
                    {t('timeline.month_clean_progress', {
                      percent: item.percentReviewed,
                    })}
                  </Text>
                </View>
              </View>

              {/* Action Chevron */}
              <View style={styles.actionChevron}>
                <ChevronRight
                  color={
                    isComplete
                      ? colors.successMint
                      : isCurrentMonth
                      ? colors.neonCyan
                      : colors.textSecondary
                  }
                  size={20}
                  strokeWidth={2.5}
                />
              </View>
            </GlassPanel>
          </TouchableOpacity>
        </View>
      );
    },
    [t, handleMonthPress]
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

          <Text style={styles.appTitle}>{t('dashboard.app_title', 'FotoSil')}</Text>

          {/* Right Actions: Refresh & Settings */}
          <View style={styles.headerRightActions}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                loadTimeline(true);
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

        {/* Hero Section */}
        <Animated.View entering={FadeInDown.duration(600).delay(100)} style={styles.headerSection}>
          <View style={styles.heroBadgeRow}>
            <View style={styles.heroBadge}>
              <Calendar color={colors.electricPurple} size={14} style={{ marginRight: 6 }} />
              <Text style={styles.heroBadgeText}>{t('timeline.hero_badge')}</Text>
            </View>
            <View style={styles.photoCountBadge}>
              <Sparkles color={colors.neonCyan} size={13} style={{ marginRight: 5 }} />
              <Text style={styles.photoCountText}>
                {totalPhotosCount} {t('report.photos_saved')}
              </Text>
            </View>
          </View>

          <Text style={styles.pageTitle}>{t('timeline.title')}</Text>
          <Text style={styles.pageSubtitle}>{t('timeline.subtitle')}</Text>
        </Animated.View>

        {/* Month Cards FlashList */}
        {loading ? (
          <Animated.View entering={FadeIn} style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.electricPurple} style={{ marginBottom: 12 }} />
            <Text style={styles.loadingText}>
              {t('dashboard.status.scanning', 'Galeri İnceleniyor...')}
            </Text>
          </Animated.View>
        ) : months.length === 0 ? (
          <Animated.View entering={FadeIn} style={styles.emptyContainer}>
            <GlassPanel
              borderRadius={24}
              style={styles.emptyCard}
              contentStyle={styles.emptyCardContent}
            >
              <Calendar color={colors.textMuted} size={44} style={{ marginBottom: 12 }} />
              <Text style={styles.emptyText}>{t('timeline.empty_timeline')}</Text>
            </GlassPanel>
          </Animated.View>
        ) : (
          <View style={{ flex: 1 }}>
            <FlashList
              data={months}
              renderItem={renderMonthCard}
              keyExtractor={(item) => item.id}
              refreshing={refreshing}
              onRefresh={() => loadTimeline(true)}
              contentContainerStyle={[
                styles.flashListContent,
                { paddingBottom: Math.max(130, 100 + insets.bottom) },
              ]}
              showsVerticalScrollIndicator={false}
            />
          </View>
        )}
      </SafeAreaView>

      {/* Settings Modal */}
      <SettingsModal
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        onStatsReset={loadTimeline}
      />
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
    paddingBottom: 12,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(168, 85, 247, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.3)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  heroBadgeText: {
    color: colors.electricPurple,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  photoCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 242, 254, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0, 242, 254, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  photoCountText: {
    color: colors.neonCyan,
    fontSize: 11,
    fontWeight: '800',
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  pageSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  flashListContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 110,
  },
  monthCardWrapper: {
    marginBottom: 14,
  },
  monthCard: {
    borderRadius: 28,
  },
  monthCardContent: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  coverThumbnailWrapper: {
    width: 72,
    height: 72,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
    marginRight: 16,
  },
  coverThumbnail: {
    width: '100%',
    height: '100%',
  },
  emptyCover: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeCheckBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: colors.successMint,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentMonthBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: colors.neonCyan,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthDetails: {
    flex: 1,
    paddingRight: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  reviewedPill: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  reviewedPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.successMint,
  },
  monthSummary: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressBarTrack: {
    flex: 1,
    height: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.neonCyan,
    borderRadius: 3,
  },
  progressPercentText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  actionChevron: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    alignItems: 'center',
    justifyContent: 'center',
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
});
