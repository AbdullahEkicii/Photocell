import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AdBanner } from '../components/ads/AdBanner';
import { enter } from '../theme/motion';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Calendar, Sparkles, ChevronRight, CheckCircle2, Images, Flame } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { FlashList } from '@shopify/flash-list';

import { AtmosphericBackground } from '../components/glass/AtmosphericBackground';
import { GlassPanel } from '../components/glass/GlassPanel';
import { ScreenHeader } from '../components/layout/ScreenHeader';
import { EmptyState, LoadingState } from '../components/layout/EmptyState';
import { SettingsModal } from '../components/settings/SettingsModal';
import { colors, alpha, radius } from '../theme/colors';
import { fetchTimelineMonthGroups, MonthGroup } from '../services/timelineScanner';
import { PhotoAsset } from '../services/mediaScanner';
import { ScanCacheService } from '../services/scanCacheService';

interface Props {
  onStartMonthDetox: (assets: PhotoAsset[], monthTitle: string, monthId: string) => void;
}

type TimelineRow =
  | { kind: 'month'; key: string; group: MonthGroup; index: number }
  | { kind: 'ad'; key: string };

export const TimelineScreen: React.FC<Props> = ({ onStartMonthDetox }) => {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const [months, setMonths] = useState<MonthGroup[]>(() => ScanCacheService.getTimeline() || []);
  const [loading, setLoading] = useState<boolean>(() => !ScanCacheService.getTimeline());
  const [refreshing, setRefreshing] = useState<boolean>(false);
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
  const [settingsVisible, setSettingsVisible] = useState<boolean>(false);

  const loadTimeline = useCallback(
    async (forceRefresh = false) => {
      try {
        if (forceRefresh) setRefreshing(true);
        else setLoading(true);
        const groups = await fetchTimelineMonthGroups(i18n.language || 'tr', forceRefresh);
        setMonths(groups);
      } catch (err) {
        console.error('Failed loading timeline:', err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [i18n.language]
  );

  useEffect(() => {
    const cached = ScanCacheService.getTimeline();
    if (cached) {
      setMonths(cached);
      setLoading(false);
    } else {
      loadTimeline(false);
    }
  }, [loadTimeline]);

  const totals = useMemo(
    () => ({
      photos: months.reduce((sum, m) => sum + m.count, 0),
      reviewed: months.reduce((sum, m) => sum + m.reviewedCount, 0),
    }),
    [months]
  );

  const handleMonthPress = useCallback(
    (group: MonthGroup) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      onStartMonthDetox(group.assets, group.title, group.id);
    },
    [onStartMonthDetox]
  );

  // Rows for the list: month cards, with a quiet banner after every six months.
  const timelineRows = useMemo<TimelineRow[]>(() => {
    const rows: TimelineRow[] = [];
    months.forEach((group, index) => {
      if (index === 3 || (index > 3 && (index - 3) % 4 === 0)) {
        rows.push({ kind: 'ad', key: `ad-${index}` });
      }
      rows.push({ kind: 'month', key: group.id, group, index });
    });
    return rows;
  }, [months]);

  const renderMonthCard = useCallback(
    ({ item, index }: { item: MonthGroup; index: number }) => {
      const isComplete = item.percentReviewed >= 100;
      const isCurrentMonth = index === 0;
      const accent = isComplete
        ? colors.successMint
        : isCurrentMonth
        ? colors.primary
        : colors.textMuted;

      return (
        <View style={styles.monthCardWrapper}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => handleMonthPress(item)}
            accessibilityRole="button"
          >
            <GlassPanel
              borderRadius={radius.card}
              borderColor={
                isComplete || isCurrentMonth ? alpha(accent, 0.3) : colors.border
              }
              contentStyle={styles.monthCardContent}
              intensity={28}
              glowAccent={isComplete || isCurrentMonth ? accent : undefined}
            >
              <View style={styles.coverWrapper}>
                {item.coverAssetUri ? (
                  <Image
                    source={{ uri: item.coverAssetUri }}
                    style={styles.cover}
                    resizeMethod="resize"
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.emptyCover}>
                    <Images color={colors.textMuted} size={24} />
                  </View>
                )}
                {(isComplete || isCurrentMonth) && (
                  <View style={[styles.coverBadge, { backgroundColor: accent }]}>
                    {isComplete ? (
                      <CheckCircle2 color={colors.textOnAccent} size={13} />
                    ) : (
                      <Flame color={colors.textOnAccent} size={12} />
                    )}
                  </View>
                )}
              </View>

              <View style={styles.monthDetails}>
                <View style={styles.titleRow}>
                  <Text style={styles.monthTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  {isComplete && (
                    <View style={styles.reviewedPill}>
                      <Text style={styles.reviewedPillText}>{t('timeline.reviewed_badge')}</Text>
                    </View>
                  )}
                </View>

                <Text style={styles.monthSummary}>
                  {t('timeline.month_summary', {
                    count: item.count,
                    size: item.formattedSize,
                  })}
                </Text>

                <View style={styles.progressRow}>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${Math.max(item.percentReviewed, item.percentReviewed > 0 ? 4 : 0)}%`,
                          backgroundColor: isComplete ? colors.successMint : colors.primary,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.progressText}>
                    {t('timeline.month_clean_progress', { percent: item.percentReviewed })}
                  </Text>
                </View>
              </View>

              <ChevronRight color={accent} size={18} strokeWidth={2.4} />
            </GlassPanel>
          </TouchableOpacity>
        </View>
      );
    },
    [t, handleMonthPress]
  );

  const renderTimelineRow = useCallback(
    ({ item }: { item: TimelineRow }) => {
      if (item.kind === 'ad') {
        return <AdBanner placement="timeline" active={visibleKeys.has(item.key)} />;
      }
      return renderMonthCard({ item: item.group, index: item.index });
    },
    [renderMonthCard, visibleKeys]
  );

  return (
    <View style={styles.container}>
      <AtmosphericBackground />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader
          title={t('dashboard.app_title')}
          showLanguageToggle
          onRefresh={() => loadTimeline(true)}
          onOpenSettings={() => setSettingsVisible(true)}
        />

        <Animated.View entering={enter(FadeInDown.duration(500).delay(60))} style={styles.headerSection}>
          <View style={styles.badgeRow}>
            <View style={styles.heroBadge}>
              <Calendar color={colors.accent} size={12} />
              <Text style={styles.heroBadgeText}>{t('timeline.hero_badge')}</Text>
            </View>
            {totals.photos > 0 && (
              <View style={styles.countBadge}>
                <Sparkles color={colors.primary} size={12} />
                <Text style={styles.countBadgeText}>
                  {t('timeline.reviewed_of_total', {
                    reviewed: totals.reviewed,
                    total: totals.photos,
                  })}
                </Text>
              </View>
            )}
          </View>

          <Text style={styles.pageTitle}>{t('timeline.title')}</Text>
          <Text style={styles.pageSubtitle}>{t('timeline.subtitle')}</Text>
        </Animated.View>

        {loading ? (
          <LoadingState label={t('dashboard.status.scanning')} accent={colors.accent} />
        ) : months.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title={t('timeline.empty_timeline')}
            description={t('timeline.empty_timeline_desc')}
            accent={colors.accent}
          />
        ) : (
          <FlashList
            data={timelineRows}
            renderItem={renderTimelineRow}
            keyExtractor={(row) => row.key}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            refreshing={refreshing}
            onRefresh={() => loadTimeline(true)}
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingTop: 8,
              paddingBottom: Math.max(130, 100 + insets.bottom),
            }}
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>

      <SettingsModal
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        onStatsReset={() => loadTimeline(true)}
      />
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
    paddingBottom: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: alpha(colors.accent, 0.09),
    borderWidth: 1,
    borderColor: alpha(colors.accent, 0.22),
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  heroBadgeText: {
    color: colors.accent,
    fontSize: 13.5,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  countBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: alpha(colors.primary, 0.08),
    borderWidth: 1,
    borderColor: alpha(colors.primary, 0.2),
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  countBadgeText: {
    color: colors.primary,
    fontSize: 13.5,
    fontWeight: '800',
  },
  pageTitle: {
    fontSize: 25,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: -0.6,
    marginBottom: 4,
  },
  pageSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  monthCardWrapper: {
    marginBottom: 12,
  },
  monthCardContent: {
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  coverWrapper: {
    width: 64,
    height: 64,
    borderRadius: 18,
    overflow: 'hidden',
    marginRight: 14,
    backgroundColor: colors.surfaceSunken,
  },
  cover: {
    width: '100%',
    height: '100%',
  },
  emptyCover: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 21,
    height: 21,
    borderRadius: 10.5,
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
    marginBottom: 3,
  },
  monthTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    color: colors.textPrimary,
    flexShrink: 1,
  },
  reviewedPill: {
    backgroundColor: alpha(colors.successMint, 0.12),
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  reviewedPillText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.successMint,
  },
  monthSummary: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressTrack: {
    flex: 1,
    height: 5,
    backgroundColor: colors.surfaceSunken,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
  },
});
