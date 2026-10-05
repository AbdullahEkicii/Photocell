import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInDown, FadeInUp, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Waves, ImageOff, Zap, Sparkles, ChevronRight, Clock, Copy, RefreshCw, AlertTriangle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { AtmosphericBackground } from '../components/glass/AtmosphericBackground';
import { GlassPanel } from '../components/glass/GlassPanel';
import { GlassButton } from '../components/glass/GlassButton';
import { CircularGauge } from '../components/glass/CircularGauge';
import { colors, alpha, radius } from '../theme/colors';
import { ScreenHeader } from '../components/layout/ScreenHeader';
import { EmptyState } from '../components/layout/EmptyState';
import {
  scanPhotos,
  checkMediaPermissionsStatus,
  isPhotoScanInProgress,
  getLatestScanBatchMeta,
  ScanResult,
  PhotoAsset,
  ScanProgressInfo,
  ScanBatchMeta,
} from '../services/mediaScanner';
import { PermissionGuidanceModal } from '../components/PermissionGuidanceModal';
import { SettingsModal } from '../components/settings/SettingsModal';
import { AnalyticsService } from '../services/analyticsService';
import { ScanCacheService } from '../services/scanCacheService';

const formatSizeParts = (bytes: number) => {
  if (bytes === 0) return { value: '0', unit: 'MB' };
  if (bytes < 1024 * 1024) return { value: (bytes / 1024).toFixed(1), unit: 'KB' };
  if (bytes < 1024 * 1024 * 1024) return { value: (bytes / (1024 * 1024)).toFixed(1), unit: 'MB' };
  return { value: (bytes / (1024 * 1024 * 1024)).toFixed(1), unit: 'GB' };
};

/**
 * Extrapolates a "time remaining" estimate from how long this scan has
 * actually taken so far, rather than assuming a fixed made-up rate.
 * Returns null below 15% progress, where the elapsed/progress ratio is too
 * noisy to mean anything — a wrong-looking estimate is worse than none.
 */
const estimateRemainingSeconds = (startTime: number, progress: number): number | null => {
  if (progress < 15 || progress >= 100) return null;
  const elapsedMs = Date.now() - startTime;
  const estimatedTotalMs = elapsedMs / (progress / 100);
  return Math.max(1, Math.round((estimatedTotalMs - elapsedMs) / 1000));
};

interface Props {
  onSmartClean: (assets: PhotoAsset[], title?: string, groupedAssets?: PhotoAsset[][]) => void;
  onFullscreenToggle?: (enabled: boolean) => void;
}

interface BentoCardProps {
  icon: React.ReactNode;
  title: string;
  countText: string;
  accentColor: string;
  onPress: () => void;
  delay?: number;
  highlightBadge?: React.ReactNode;
}

const BentoCard: React.FC<BentoCardProps> = ({
  icon,
  title,
  countText,
  accentColor,
  onPress,
  delay = 0,
  highlightBadge,
}) => {
  return (
    <Animated.View entering={FadeInUp.duration(600).delay(delay).springify()} style={styles.bentoWrapper}>
      <TouchableOpacity activeOpacity={0.88} onPress={onPress} style={{ width: '100%' }}>
        <GlassPanel
          borderRadius={radius.card}
          style={styles.bentoItem}
          contentStyle={styles.bentoContentColumn}
          intensity={28}
          borderColor={alpha(accentColor, 0.22)}
          glowAccent={accentColor}
        >
          <View style={styles.bentoColumnHeader}>
            <View
              style={[
                styles.iconBadge,
                { backgroundColor: alpha(accentColor, 0.1), borderColor: alpha(accentColor, 0.26) },
              ]}
            >
              {icon}
            </View>
            <ChevronRight color={colors.textMuted} size={16} />
          </View>

          <View style={styles.bentoColumnBody}>
            <Text style={styles.bentoTitleColumn} numberOfLines={1}>
              {title}
            </Text>
            <Text style={[styles.bentoCountColumn, { color: accentColor }]}>
              {countText}
            </Text>
            {highlightBadge && (
              <View style={{ marginTop: 6 }}>
                {highlightBadge}
              </View>
            )}
          </View>
        </GlassPanel>
      </TouchableOpacity>
    </Animated.View>
  );
};

export const DashboardScreen: React.FC<Props> = ({ onSmartClean, onFullscreenToggle }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [scanResult, setScanResult] = useState<ScanResult | null>(() => ScanCacheService.getPhotoScan());
  const [loading, setLoading] = useState<boolean>(() => !ScanCacheService.getPhotoScan());
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showPermissionModal, setShowPermissionModal] = useState<boolean>(false);
  const [isLimitedAccess, setIsLimitedAccess] = useState<boolean>(false);
  const [settingsVisible, setSettingsVisible] = useState<boolean>(false);
  const [scanProgress, setScanProgress] = useState<ScanProgressInfo>({
    progress: 8,
    stepKey: 'dashboard.status.scan_step_init',
    stepDefault: 'Galeri ve Medya Dizini Başlatılıyor...',
  });
  // How long *this* scan has actually taken so far, used to extrapolate a
  // real remaining-time estimate — the previous "seconds left" text assumed a
  // fixed, made-up rate (25% per second) and was almost always wrong.
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const scanStartTimeRef = useRef<number>(0);
  // Set once the first batch (the most recent ~500 photos) is in, so the
  // full-screen scanning gauge can get out of the way immediately instead of
  // blocking on the whole gallery. Non-null while later batches keep
  // streaming in quietly behind the dashboard the user is already looking at.
  const [backgroundBatch, setBackgroundBatch] = useState<{ scanned: number; total: number } | null>(
    null
  );
  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadMedia = async (forceRefresh = false) => {
    const cached = forceRefresh ? null : ScanCacheService.getPhotoScan();
    const scanRunning = isPhotoScanInProgress();

    // Anything already scanned is shown straight away. Coming back to this
    // screen used to put the full-screen "scanning" gauge up again whenever a
    // background scan was still extending the cache, even though results were
    // sitting right there. Now a cached (possibly partial) result is always
    // displayed immediately, and if a scan is still running we only subscribe
    // to the batches still to come.
    if (cached) {
      setScanResult(cached);
      setLoading(false);
      setRefreshing(false);
      if (!scanRunning) return;
      const meta = getLatestScanBatchMeta();
      setBackgroundBatch(meta ? { scanned: meta.scannedAssets, total: meta.totalAssets } : null);
    }

    const startTime = Date.now();
    scanStartTimeRef.current = startTime;
    setEtaSeconds(null);
    if (!cached) setBackgroundBatch(null);
    try {
      if (forceRefresh) {
        setRefreshing(true);
      } else if (!cached) {
        setLoading(true);
      }
      setError(null);
      if (!cached) AnalyticsService.trackScanStarted(4000).catch(() => {});

      const permStatus = await checkMediaPermissionsStatus();
      setIsLimitedAccess(permStatus.isLimited);
      if (permStatus.isLimited) {
        setShowPermissionModal(true);
      }

      const result = await scanPhotos(
        (info) => {
          if (!isMountedRef.current) return;
          setScanProgress(info);
          setEtaSeconds(estimateRemainingSeconds(scanStartTimeRef.current, info.progress));
        },
        forceRefresh,
        (partial, meta: ScanBatchMeta) => {
          if (!isMountedRef.current) return;
          // As soon as the first ~500 photos are scanned, show them and drop
          // out of the blocking "scanning" screen — the rest keeps coming in
          // quietly via this same callback while the user is already looking
          // at real results.
          setScanResult(partial);
          setLoading(false);
          setRefreshing(false);
          setBackgroundBatch(meta.isFinal ? null : { scanned: meta.scannedAssets, total: meta.totalAssets });
        }
      );

      if (isMountedRef.current) setScanResult(result);

      // A screen that merely joined a scan someone else started would
      // otherwise report the same scan a second time.
      if (!cached) {
        const exactCount = result.exactDuplicates.flat().length;
        const similarCount = result.similarPhotos.flat().length;
        AnalyticsService.trackScanCompleted({
          exactDuplicates: exactCount,
          similarPhotos: similarCount,
          blurryPhotos: result.blurryPhotos.length,
          screenshots: result.screenshots.length,
          totalRecoverableBytes: result.totalSize,
          durationMs: Date.now() - startTime,
        }).catch(() => {});
      }
    } catch (e: any) {
      if (isMountedRef.current) setError(e.message || 'Error scanning photos');
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
        setBackgroundBatch(null);
      }
    }
  };

  useEffect(() => {
    loadMedia(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleManualRefresh = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    loadMedia(true);
  };

  const exactDuplicatesFlat = useMemo(
    () => scanResult?.exactDuplicates?.flat() ?? [],
    [scanResult]
  );

  const similarPhotosFlat = useMemo(
    () => scanResult?.similarPhotos?.flat() ?? [],
    [scanResult]
  );

  const totalRecoverableCount =
    exactDuplicatesFlat.length +
    similarPhotosFlat.length +
    (scanResult?.screenshots.length ?? 0) +
    (scanResult?.blurryPhotos.length ?? 0);

  const sizeParts = formatSizeParts(scanResult?.totalSize || 0);

  const handleSmartClean = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (!scanResult) return;
    const allGrouped = [
      ...(scanResult.exactDuplicates || []),
      ...(scanResult.similarPhotos || []),
    ];
    const allAssets: PhotoAsset[] = [
      ...exactDuplicatesFlat,
      ...similarPhotosFlat,
      ...scanResult.screenshots,
      ...scanResult.blurryPhotos,
    ];
    onSmartClean(
      allAssets,
      t('dashboard.action.smart_clean'),
      allGrouped.length > 0 ? allGrouped : undefined
    );
  };

  return (
    <View style={styles.container}>
      {/* Dynamic Animated Mesh Shader Background */}
      <AtmosphericBackground />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader
          title={t('dashboard.app_title')}
          showLanguageToggle
          onRefresh={handleManualRefresh}
          onOpenSettings={() => setSettingsVisible(true)}
        />

        {/* The rest of the gallery keeps scanning quietly after the first
            batch is shown — this is the only sign of that happening. */}
        {!loading && backgroundBatch && (
          <Animated.View entering={FadeInDown.duration(300)} style={styles.backgroundScanBanner}>
            <RefreshCw color={colors.primary} size={13} />
            <Text style={styles.backgroundScanText}>
              {t('dashboard.status.background_scanning', {
                scanned: backgroundBatch.scanned,
                total: backgroundBatch.total,
              })}
            </Text>
          </Animated.View>
        )}

        {loading ? (
          <Animated.View entering={FadeIn.duration(400)} style={styles.scannerCenterContainer}>
            <GlassPanel
              borderRadius={36}
              style={styles.scannerCard}
              contentStyle={styles.scannerCardContent}
              intensity={45}
              borderColor={alpha(colors.primary, 0.25)}
              glowAccent={colors.primary}
            >
              <LinearGradient
                colors={[alpha(colors.primary, 0.08), 'transparent', alpha(colors.accent, 0.08)]}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              />

              {/* Gauge Progress Center */}
              <View style={styles.scannerGaugeWrapper}>
                <CircularGauge
                  value={`${scanProgress.progress}`}
                  unit="%"
                  size={180}
                  strokeWidth={10}
                  progress={scanProgress.progress / 100}
                />
              </View>

              {/* Active Step Text */}
              <Text style={styles.scannerStepTitle}>
                {t(scanProgress.stepKey, {
                  current: scanProgress.scannedCount || 0,
                  total: scanProgress.totalCount || 300,
                  defaultValue: scanProgress.stepDefault
                })}
              </Text>

              {/* Status & Counter Badges */}
              <View style={styles.scannerBadgesRow}>
                <View style={styles.scannerBadgePill}>
                  <Sparkles color={colors.primary} size={14} style={{ marginRight: 6 }} />
                  <Text style={styles.scannerBadgeText}>
                    {scanProgress.scannedCount && scanProgress.totalCount
                      ? t('dashboard.status.scan_items_count', { scanned: scanProgress.scannedCount, total: scanProgress.totalCount })
                      : t('dashboard.status.scanning')}
                  </Text>
                </View>

                {etaSeconds !== null && (
                  <View style={styles.scannerBadgePillSecondary}>
                    <Clock color={colors.textSecondary} size={14} style={{ marginRight: 6 }} />
                    <Text style={styles.scannerBadgeSecondaryText}>
                      {t('dashboard.status.scan_estimated_time', { seconds: etaSeconds })}
                    </Text>
                  </View>
                )}
              </View>
            </GlassPanel>
          </Animated.View>
        ) : error ? (
          <EmptyState
            icon={AlertTriangle}
            title={t('dashboard.status.scan_failed')}
            description={error}
            accent={colors.dangerRose}
            action={
              <GlassButton
                borderRadius={radius.control}
                borderColor={alpha(colors.primary, 0.4)}
                style={styles.retryButton}
                onPress={() => loadMedia(true)}
              >
                <RefreshCw color={colors.primary} size={16} />
                <Text style={styles.retryText}>{t('dashboard.status.retry')}</Text>
              </GlassButton>
            }
          />
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: Math.max(130, 100 + insets.bottom) },
            ]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => loadMedia(true)}
                tintColor={colors.primary}
                colors={[colors.primary, colors.accent]}
              />
            }
          >
            {/* Hero Gauge Section */}
            <Animated.View entering={FadeInUp.duration(600).delay(100).springify()}>
              <GlassPanel
                style={styles.heroSection}
                contentStyle={styles.heroContent}
                intensity={36}
                borderColor={colors.border}
                glowAccent={colors.primary}
              >
                <Text style={styles.heroEyebrow}>
                  {t('dashboard.gauge.recoverable')}
                </Text>

                {/* Circular Glass Ring Gauge */}
                <View style={styles.gaugeContainer}>
                  <CircularGauge value={sizeParts.value} unit={sizeParts.unit} size={210} strokeWidth={12} />
                </View>

                <Text style={styles.heroDescription}>
                  {t('dashboard.hero_desc')}
                </Text>

                {/* Integrated Smart Clean Button inside Recoverable Storage Card */}
                <GlassButton
                  style={styles.heroCleanButton}
                  borderRadius={28}
                  borderColor={
                    totalRecoverableCount === 0 ? colors.border : alpha(colors.primary, 0.4)
                  }
                  glowColor={colors.primary}
                  onPress={handleSmartClean}
                  disabled={totalRecoverableCount === 0}
                >
                  <LinearGradient
                    colors={
                      totalRecoverableCount === 0
                        ? ['rgba(241, 245, 249, 0.5)', 'rgba(241, 245, 249, 0.3)']
                        : [alpha(colors.primary, 0.12), alpha(colors.accent, 0.12)]
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={styles.buttonInner}>
                    <Sparkles
                      color={totalRecoverableCount === 0 ? colors.textMuted : colors.primary}
                      size={18}
                      style={styles.buttonIcon}
                    />
                    <Text style={[styles.cleanButtonText, totalRecoverableCount === 0 && { color: colors.textMuted }]}>
                      {t('dashboard.action.smart_clean')} ({totalRecoverableCount})
                    </Text>
                  </View>
                </GlassButton>
              </GlassPanel>
            </Animated.View>

            {/* Android 14/15 Limited Gallery Access Warning Banner */}
            {isLimitedAccess && (
              <Animated.View entering={FadeInDown.duration(400)} style={styles.limitedBannerContainer}>
                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                    setShowPermissionModal(true);
                  }}
                >
                  <GlassPanel
                    borderRadius={22}
                    borderColor={alpha(colors.warningAmber, 0.4)}
                    style={styles.limitedBannerPanel}
                    contentStyle={styles.limitedBannerContent}
                    intensity={35}
                    glowAccent={colors.warningAmber}
                  >
                    <View style={styles.limitedBannerLeft}>
                      <View style={styles.limitedBannerIconBox}>
                        <AlertTriangle color={colors.warningAmber} size={20} />
                      </View>
                      <View style={styles.limitedBannerTextCol}>
                        <Text style={styles.limitedBannerTitle}>
                          {t('permission.limited_banner_title', 'Sınırlı Galeri Erişimi Aktif')}
                        </Text>
                        <Text style={styles.limitedBannerDesc} numberOfLines={2}>
                          {t('permission.limited_banner_desc', 'Android 14/15 sınırlı moddasınız. Tüm galeriyi taramak için dokunun.')}
                        </Text>
                      </View>
                    </View>
                    <ChevronRight color={colors.warningAmber} size={18} />
                  </GlassPanel>
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* Bento Grid */}
            <View style={styles.bentoGridSection}>
              <View style={styles.bentoRow}>
                <BentoCard
                  icon={<Copy color={colors.primaryDeep} size={21} strokeWidth={2.2} />}
                  title={t('dashboard.bento.exact_duplicates')}
                  countText={t('dashboard.status.items_found', { count: exactDuplicatesFlat.length })}
                  accentColor={colors.primaryDeep}
                  onPress={() => scanResult && onSmartClean(exactDuplicatesFlat, t('dashboard.bento.exact_duplicates'), scanResult.exactDuplicates)}
                  delay={150}
                />
                <BentoCard
                  icon={<Waves color={colors.primary} size={21} strokeWidth={2.2} />}
                  title={t('dashboard.bento.similar_shots')}
                  countText={t('dashboard.status.items_found', { count: similarPhotosFlat.length })}
                  accentColor={colors.primary}
                  onPress={() => onSmartClean(similarPhotosFlat, t('dashboard.bento.similar_shots'), scanResult?.similarPhotos)}
                  delay={250}
                />
              </View>

              <View style={styles.bentoRow}>
                <BentoCard
                  icon={<ImageOff color={colors.accent} size={21} strokeWidth={2.2} />}
                  title={t('dashboard.bento.blurry_photos')}
                  countText={t('dashboard.status.items_found', { count: scanResult?.blurryPhotos.length || 0 })}
                  accentColor={colors.accent}
                  onPress={() => scanResult && onSmartClean(scanResult.blurryPhotos, t('dashboard.bento.blurry_photos'))}
                  delay={350}
                />
                <BentoCard
                  icon={<Zap color={colors.successMint} size={21} strokeWidth={2.2} />}
                  title={t('dashboard.bento.screenshots')}
                  countText={t('dashboard.status.items_found', { count: scanResult?.screenshots.length || 0 })}
                  accentColor={colors.successMint}
                  onPress={() => scanResult && onSmartClean(scanResult.screenshots, t('dashboard.bento.screenshots'))}
                  delay={450}
                />
              </View>
            </View>
          </ScrollView>
        )}

        {/* Android 14/15 Limited Photo Permission Guidance Modal */}
        <PermissionGuidanceModal
          visible={showPermissionModal}
          onClose={() => setShowPermissionModal(false)}
        />

        {/* Settings Modal */}
        <SettingsModal
          visible={settingsVisible}
          onClose={() => setSettingsVisible(false)}
          onStatsReset={loadMedia}
          onFullscreenChange={onFullscreenToggle}
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
  backgroundScanBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  backgroundScanText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 130,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButton: {
    width: 'auto',
  },
  retryText: {
    color: colors.primary,
    fontSize: 13.5,
    fontWeight: '800',
    marginLeft: 7,
  },
  heroSection: {
    borderRadius: 32,
    marginBottom: 20,
  },
  heroContent: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  heroEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 2.5,
    marginBottom: 20,
  },
  gaugeContainer: {
    marginBottom: 20,
  },
  heroDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 20,
    maxWidth: 260,
    marginBottom: 16,
  },
  heroCleanButton: {
    height: 52,
    width: '100%',
    maxWidth: 260,
    borderRadius: 26,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 6,
  },
  bentoGridSection: {
    gap: 16,
  },
  bentoRow: {
    flexDirection: 'row',
    gap: 14,
  },
  bentoWrapper: {
    flex: 1,
  },
  bentoItem: {
    borderRadius: 24,
  },
  bentoContentColumn: {
    padding: 16,
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    minHeight: 130,
  },
  bentoColumnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 12,
  },
  bentoColumnBody: {
    width: '100%',
  },
  bentoTitleColumn: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 4,
    lineHeight: 18,
  },
  bentoCountColumn: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  buttonIcon: {
    marginRight: 8,
  },
  cleanButtonText: {
    fontSize: 15.5,
    color: colors.primary,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  /* Scanner Progress Card Styles */
  scannerCenterContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  scannerCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 36,
  },
  scannerCardContent: {
    padding: 24,
    alignItems: 'center',
  },
  scannerGaugeWrapper: {
    marginBottom: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerStepTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 22,
  },
  scannerBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 8,
  },
  scannerBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: alpha(colors.primary, 0.1),
    borderColor: alpha(colors.primary, 0.25),
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    flex: 1,
    justifyContent: 'center',
  },
  scannerBadgeText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  scannerBadgePillSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSunken,
    borderColor: colors.border,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    justifyContent: 'center',
  },
  scannerBadgeSecondaryText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  limitedBannerContainer: {
    marginBottom: 16,
  },
  limitedBannerPanel: {
    borderRadius: 22,
  },
  limitedBannerContent: {
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  limitedBannerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
  },
  limitedBannerIconBox: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: alpha(colors.warningAmber, 0.12),
    borderWidth: 1,
    borderColor: alpha(colors.warningAmber, 0.3),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  limitedBannerTextCol: {
    flex: 1,
  },
  limitedBannerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.warningAmber,
    marginBottom: 2,
  },
  limitedBannerDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 15,
  },
});