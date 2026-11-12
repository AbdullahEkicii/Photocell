import React, { useState, useEffect, useCallback } from 'react';
import { enter } from '../theme/motion';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInDown, FadeInUp, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Cpu,
  Layers,
  Compass,
  Check,
  Zap,
  Sparkles,
  Image as ImageIcon,
  Film,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { AtmosphericBackground } from '../components/glass/AtmosphericBackground';
import { GlassPanel } from '../components/glass/GlassPanel';
import { ScreenHeader, HEADER_BAR_HEIGHT, underHeader } from '../components/layout/ScreenHeader';
import { AdBanner } from '../components/ads/AdBanner';
import { EmptyState } from '../components/layout/EmptyState';
import { SettingsModal } from '../components/settings/SettingsModal';
import { colors, alpha, radius } from '../theme/colors';
import {
  scanDeviceCache,
  clearSelectedCache,
  formatByteSize,
  CacheScanResult,
} from '../services/cacheCleaner';

const CATEGORY_ICONS = {
  system: Cpu,
  app: Layers,
  browser: Compass,
} as const;

export const ReportScreen: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [scanResult, setScanResult] = useState<CacheScanResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedIds, setSelectedIds] = useState<string[]>(['system', 'app', 'browser']);
  const [cleaning, setCleaning] = useState<boolean>(false);
  const [cleanFeedback, setCleanFeedback] = useState<string | null>(null);
  const [settingsVisible, setSettingsVisible] = useState<boolean>(false);

  const loadCacheInfo = useCallback(async () => {
    try {
      setLoading(true);
      const res = await scanDeviceCache();
      setScanResult(res);
      // Keep only categories that still hold something, so the action button
      // never claims it will clean an empty bucket.
      setSelectedIds((prev) =>
        prev.filter((id) => res.categories.some((c) => c.id === id && c.sizeBytes > 0))
      );
    } catch (e) {
      console.error('Failed scanning cache:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCacheInfo();
  }, [loadCacheInfo]);

  const toggleSelectCategory = (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectedTotalBytes = scanResult
    ? scanResult.categories
        .filter((c) => selectedIds.includes(c.id))
        .reduce((sum, c) => sum + c.sizeBytes, 0)
    : 0;

  const canClean = selectedTotalBytes > 0 && !cleaning;

  const handleCleanCache = async () => {
    if (!canClean || !scanResult) return;
    setCleaning(true);
    setCleanFeedback(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    const clearedBytes = await clearSelectedCache(selectedIds, scanResult.files);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    setCleanFeedback(
      clearedBytes > 0
        ? t('report.cleared_success_amount', { amount: formatByteSize(clearedBytes) })
        : t('report.nothing_to_clean')
    );

    await loadCacheInfo();
    setCleaning(false);
  };

  const hasAnyCache = (scanResult?.totalCacheBytes ?? 0) > 0;

  return (
    <View style={styles.container}>
      <AtmosphericBackground />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader
          title={t('report.title')}
          onBack={onBack}
          onRefresh={loadCacheInfo}
          onOpenSettings={() => setSettingsVisible(true)}
        />

        <ScrollView
          style={[styles.scrollView, underHeader]}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: HEADER_BAR_HEIGHT + 8 },
            { paddingBottom: Math.max(180, 150 + insets.bottom) },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Lifetime savings */}
          <Animated.View entering={enter(FadeInUp.duration(500).delay(80))} style={styles.heroCard}>
            <GlassPanel
              borderRadius={radius.sheet}
              contentStyle={styles.heroContent}
              intensity={32}
              glowAccent={colors.primary}
            >
              <Text style={styles.heroLabel}>{t('report.total_saved_label')}</Text>
              <Text style={styles.heroValue}>
                {scanResult?.totalLifetimeSavedFormatted ?? formatByteSize(0)}
              </Text>

              <View style={styles.heroStatsRow}>
                <View style={styles.statBox}>
                  <ImageIcon color={colors.primary} size={18} />
                  <Text style={styles.statLabel}>{t('report.photos_saved')}</Text>
                  <Text style={styles.statValue}>
                    {scanResult?.photosSavedFormatted ?? formatByteSize(0)}
                  </Text>
                </View>

                <View style={styles.statBox}>
                  <Film color={colors.accent} size={18} />
                  <Text style={styles.statLabel}>{t('report.videos_saved')}</Text>
                  <Text style={styles.statValue}>
                    {scanResult?.videosSavedFormatted ?? formatByteSize(0)}
                  </Text>
                </View>
              </View>
            </GlassPanel>
          </Animated.View>

          {/* Result banner — previously computed but never rendered. */}
          {cleanFeedback && (
            <Animated.View entering={enter(FadeIn.duration(250))} style={styles.feedbackBanner}>
              <Sparkles color={colors.successMint} size={16} />
              <Text style={styles.feedbackText}>{cleanFeedback}</Text>
            </Animated.View>
          )}

          {/* Cache categories */}
          <Animated.View entering={enter(FadeInDown.duration(500).delay(140))} style={styles.cacheSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('report.ready_to_clean')}</Text>
              {hasAnyCache && (
                <View style={styles.totalBadge}>
                  <Text style={styles.totalBadgeText}>
                    {t('report.selected_total', {
                      size: formatByteSize(selectedTotalBytes),
                    })}
                  </Text>
                </View>
              )}
            </View>

            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.loadingText}>{t('dashboard.status.scanning')}</Text>
              </View>
            ) : !hasAnyCache ? (
              <EmptyState
                icon={Sparkles}
                title={t('report.cache_already_clean')}
                description={t('report.cache_already_clean_desc')}
                accent={colors.successMint}
              />
            ) : (
              <View style={styles.categoryList}>
                {scanResult?.categories
                  .filter((cat) => cat.sizeBytes > 0)
                  .map((cat) => {
                    const isChecked = selectedIds.includes(cat.id);
                    const Icon = CATEGORY_ICONS[cat.iconName];
                    return (
                      <TouchableOpacity
                        key={cat.id}
                        activeOpacity={0.85}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: isChecked }}
                        onPress={() => toggleSelectCategory(cat.id)}
                      >
                        <GlassPanel
                          borderRadius={radius.card}
                          borderColor={
                            isChecked ? alpha(cat.accentColor, 0.4) : colors.border
                          }
                          contentStyle={styles.categoryContent}
                          intensity={28}
                        >
                          <View
                            style={[
                              styles.categoryIcon,
                              {
                                backgroundColor: alpha(cat.accentColor, 0.1),
                                borderColor: alpha(cat.accentColor, 0.25),
                              },
                            ]}
                          >
                            <Icon color={cat.accentColor} size={20} />
                          </View>

                          <View style={styles.categoryText}>
                            <Text style={styles.categoryTitle}>
                              {t(cat.titleKey, cat.defaultTitle)}
                            </Text>
                            <Text style={styles.categorySize}>
                              {t('report.category_meta', {
                                size: cat.formattedSize,
                                count: cat.fileCount,
                              })}
                            </Text>
                          </View>

                          <View
                            style={[
                              styles.checkbox,
                              isChecked && {
                                backgroundColor: colors.primary,
                                borderColor: colors.primary,
                              },
                            ]}
                          >
                            {isChecked && (
                              <Check color={colors.textOnAccent} size={14} strokeWidth={3.2} />
                            )}
                          </View>
                        </GlassPanel>
                      </TouchableOpacity>
                    );
                  })}
              </View>
            )}
          </Animated.View>
        <AdBanner placement="report" />
        </ScrollView>

        {/* Clean action */}
        {hasAnyCache && (
          <View
            style={[
              styles.floatingWrapper,
              { bottom: Math.max(96, insets.bottom + 86) },
            ]}
            pointerEvents="box-none"
          >
            <TouchableOpacity
              activeOpacity={0.85}
              disabled={!canClean}
              onPress={handleCleanCache}
              style={[styles.cleanButton, !canClean && styles.cleanButtonDisabled]}
              accessibilityRole="button"
            >
              <LinearGradient
                colors={colors.primaryGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.cleanGradient}
              >
                {cleaning ? (
                  <ActivityIndicator size="small" color={colors.textOnAccent} />
                ) : (
                  <Zap color={colors.textOnAccent} size={19} strokeWidth={2.4} />
                )}
                <Text style={styles.cleanButtonText}>
                  {selectedTotalBytes > 0
                    ? t('report.clean_cache_btn_amount', {
                        size: formatByteSize(selectedTotalBytes),
                      })
                    : t('report.clean_cache_btn')}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        <SettingsModal
          visible={settingsVisible}
          onClose={() => setSettingsVisible(false)}
          onStatsReset={loadCacheInfo}
        />
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  heroCard: {
    marginBottom: 18,
  },
  heroContent: {
    padding: 22,
    alignItems: 'center',
  },
  heroLabel: {
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.8,
    marginBottom: 6,
  },
  heroValue: {
    fontSize: 42,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: -1.6,
    marginBottom: 20,
  },
  heroStatsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 4,
  },
  statLabel: {
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statValue: {
    fontSize: 15.5,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: alpha(colors.successMint, 0.1),
    borderWidth: 1,
    borderColor: alpha(colors.successMint, 0.3),
    borderRadius: radius.control,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 18,
  },
  feedbackText: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.successMint,
    lineHeight: 17,
  },
  cacheSection: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  totalBadge: {
    backgroundColor: alpha(colors.primary, 0.08),
    borderWidth: 1,
    borderColor: alpha(colors.primary, 0.2),
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  totalBadgeText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 30,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 13.5,
    fontWeight: '600',
  },
  categoryList: {
    gap: 10,
  },
  categoryContent: {
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },
  categoryText: {
    flex: 1,
  },
  categoryTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  categorySize: {
    fontSize: 13.5,
    fontWeight: '600',
    color: colors.textMuted,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1.8,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingWrapper: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 40,
  },
  cleanButton: {
    height: 54,
    borderRadius: 27,
    overflow: 'hidden',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 18,
    elevation: 10,
  },
  cleanButtonDisabled: {
    opacity: 0.45,
  },
  cleanGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  cleanButtonText: {
    fontSize: 14.5,
    color: colors.textOnAccent,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
});
