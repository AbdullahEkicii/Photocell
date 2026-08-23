import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView, Platform, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInDown, FadeInUp, FadeIn, useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, withSequence, cancelAnimation } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Globe, Settings, Waves, ImageOff, Zap, Sparkles, ChevronRight, Clock, Copy, RefreshCw, AlertTriangle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { AtmosphericBackground } from '../components/glass/AtmosphericBackground';
import { GlassPanel } from '../components/glass/GlassPanel';
import { GlassButton } from '../components/glass/GlassButton';
import { CircularGauge } from '../components/glass/CircularGauge';
import { BottomNavBar, TabType } from '../components/navigation/BottomNavBar';
import { colors } from '../theme/colors';
import { scanPhotos, checkMediaPermissionsStatus, ScanResult, PhotoAsset, ScanProgressInfo } from '../services/mediaScanner';
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

interface Props {
  onSmartClean: (assets: PhotoAsset[], title?: string, groupedAssets?: PhotoAsset[][]) => void;
  onNavigate?: (tab: TabType) => void;
  onFullscreenToggle?: (enabled: boolean) => void;
}

interface BentoCardProps {
  icon: React.ReactNode;
  title: string;
  countText: string;
  accentColor: string;
  glowColor: string;
  onPress: () => void;
  delay?: number;
  highlightBadge?: React.ReactNode;
}

const BentoCard: React.FC<BentoCardProps> = ({
  icon,
  title,
  countText,
  accentColor,
  glowColor,
  onPress,
  delay = 0,
  highlightBadge,
}) => {
  return (
    <Animated.View entering={FadeInUp.duration(600).delay(delay).springify()} style={styles.bentoWrapper}>
      <TouchableOpacity activeOpacity={0.88} onPress={onPress} style={{ width: '100%' }}>
        <GlassPanel 
          borderRadius={24} 
          style={styles.bentoItem} 
          contentStyle={styles.bentoContentColumn}
          intensity={30}
          borderColor="rgba(255, 255, 255, 0.12)"
          glowAccent={accentColor}
        >
          {/* Subtle Ambient Radial Glow on Card Top Left */}
          <LinearGradient
            colors={[glowColor, 'transparent']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.8, y: 0.8 }}
          />

          <View style={styles.bentoColumnHeader}>
            <View style={[styles.iconBadge, { backgroundColor: `${accentColor}1A`, borderColor: `${accentColor}4D` }]}>
              {icon}
            </View>
            <ChevronRight color="rgba(255, 255, 255, 0.3)" size={16} />
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

export const DashboardScreen: React.FC<Props> = ({ onSmartClean, onNavigate, onFullscreenToggle }) => {
  const { t, i18n } = useTranslation();
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
    stepKey: 'status.scan_step_init',
    stepDefault: 'Galeri ve Medya Dizini Başlatılıyor...',
  });

  const orbTranslateY = useSharedValue(0);

  useEffect(() => {
    orbTranslateY.value = withRepeat(
      withSequence(
        withTiming(15, { duration: 3200, easing: Easing.inOut(Easing.ease) }),
        withTiming(-10, { duration: 3200, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    return () => {
      cancelAnimation(orbTranslateY);
    };
  }, [orbTranslateY]);

  const animatedOrbStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: orbTranslateY.value }],
  }));

  const loadMedia = async (forceRefresh = false) => {
    // 1. Check in-memory cache for 0ms instant tab transition
    if (!forceRefresh) {
      const cached = ScanCacheService.getPhotoScan();
      if (cached) {
        setScanResult(cached);
        setLoading(false);
        setRefreshing(false);
        return;
      }
    }

    const startTime = Date.now();
    try {
      if (forceRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      AnalyticsService.trackScanStarted(4000).catch(() => {});
      
      const permStatus = await checkMediaPermissionsStatus();
      setIsLimitedAccess(permStatus.isLimited);
      if (permStatus.isLimited) {
        setShowPermissionModal(true);
      }

      const result = await scanPhotos((info) => {
        setScanProgress(info);
      }, forceRefresh);
      setScanResult(result);

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
    } catch (e: any) {
      setError(e.message || 'Error scanning photos');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const cached = ScanCacheService.getPhotoScan();
    if (cached) {
      setScanResult(cached);
      setLoading(false);
    } else {
      loadMedia(false);
    }
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

  const toggleLanguage = () => {
    const current = i18n.language || 'tr';
    const nextLang = current.startsWith('tr') ? 'en' : 'tr';
    i18n.changeLanguage(nextLang);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

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
        {/* Top Header Bar */}
        <Animated.View entering={FadeInDown.duration(500)} style={styles.headerBar}>
          {/* Language Switcher Button */}
          <TouchableOpacity 
            activeOpacity={0.8}
            onPress={toggleLanguage}
            style={styles.langButton}
          >
            <Globe color={colors.neonCyan} size={18} strokeWidth={2.4} />
            <Text style={styles.langText}>
              {(i18n.language || 'tr').startsWith('tr') ? 'TR' : 'EN'}
            </Text>
          </TouchableOpacity>

          {/* App Title */}
          <Text style={styles.appTitle}>
            {t('dashboard.app_title', 'FotoSil')}
          </Text>

          {/* Right Action Icons: Refresh & Settings */}
          <View style={styles.headerRightActions}>
            <TouchableOpacity 
              activeOpacity={0.8}
              onPress={handleManualRefresh}
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


        {loading ? (
          <Animated.View entering={FadeIn.duration(400)} style={styles.scannerCenterContainer}>
            <GlassPanel 
              borderRadius={36} 
              style={styles.scannerCard} 
              contentStyle={styles.scannerCardContent}
              intensity={45}
              borderColor="rgba(0, 242, 254, 0.35)"
              glowAccent={colors.neonCyan}
            >
              <LinearGradient
                colors={['rgba(0, 242, 254, 0.12)', 'transparent', 'rgba(168, 85, 247, 0.12)']}
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

              {/* Dynamic Progress Track Line */}
              <View style={styles.scannerProgressTrack}>
                <View style={[styles.scannerProgressFill, { width: `${Math.max(5, scanProgress.progress)}%` }]} />
              </View>

              {/* Status & Counter Badges */}
              <View style={styles.scannerBadgesRow}>
                <View style={styles.scannerBadgePill}>
                  <Sparkles color={colors.neonCyan} size={14} style={{ marginRight: 6 }} />
                  <Text style={styles.scannerBadgeText}>
                    {scanProgress.scannedCount && scanProgress.totalCount
                      ? t('dashboard.status.scan_items_count', { scanned: scanProgress.scannedCount, total: scanProgress.totalCount })
                      : t('dashboard.status.scanning')}
                  </Text>
                </View>

                <View style={styles.scannerBadgePillSecondary}>
                  <Clock color={colors.textSecondary} size={14} style={{ marginRight: 6 }} />
                  <Text style={styles.scannerBadgeSecondaryText}>
                    {t('dashboard.status.scan_estimated_time', { 
                      seconds: Math.max(1, Math.ceil((100 - scanProgress.progress) / 25)) 
                    })}
                  </Text>
                </View>
              </View>
            </GlassPanel>
          </Animated.View>
        ) : error ? (
          <Animated.View entering={FadeIn} style={styles.centerContent}>
            <Text style={styles.errorText}>{error}</Text>
          </Animated.View>
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
                tintColor={colors.neonCyan}
                colors={[colors.neonCyan, colors.electricPurple]}
              />
            }
          >
            {/* Hero Gauge Section */}
            <Animated.View entering={FadeInUp.duration(600).delay(100).springify()}>
              <GlassPanel 
                style={styles.heroSection} 
                contentStyle={styles.heroContent}
                intensity={40}
                borderColor="rgba(255, 255, 255, 0.15)"
                glowAccent={colors.neonCyan}
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
                  borderColor={totalRecoverableCount === 0 ? colors.whiteBorderLight : 'rgba(147, 51, 234, 0.4)'}
                  glowColor={colors.neonCyan}
                  onPress={handleSmartClean} 
                  disabled={totalRecoverableCount === 0}
                >
                  <LinearGradient
                    colors={
                      totalRecoverableCount === 0 
                        ? ['rgba(241, 245, 249, 0.5)', 'rgba(241, 245, 249, 0.3)'] 
                        : ['rgba(147, 51, 234, 0.15)', 'rgba(217, 70, 239, 0.15)']
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={styles.buttonInner}>
                    <Sparkles color={totalRecoverableCount === 0 ? colors.textMuted : colors.neonCyan} size={18} style={styles.buttonIcon} />
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
                    borderColor="rgba(245, 158, 11, 0.45)"
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
                  icon={<Copy color={colors.deepPurple} size={22} strokeWidth={2.4} />}
                  title={t('dashboard.bento.exact_duplicates')}
                  countText={t('dashboard.status.items_found', { count: exactDuplicatesFlat.length })}
                  accentColor={colors.deepPurple}
                  glowColor="rgba(126, 34, 206, 0.15)"
                  onPress={() => scanResult && onSmartClean(exactDuplicatesFlat, t('dashboard.bento.exact_duplicates'), scanResult.exactDuplicates)}
                  delay={150}
                />
                <BentoCard
                  icon={<Waves color={colors.neonCyan} size={22} strokeWidth={2.4} />}
                  title={t('dashboard.bento.similar_shots')}
                  countText={t('dashboard.status.items_found', { count: similarPhotosFlat.length })}
                  accentColor={colors.neonCyan}
                  glowColor="rgba(147, 51, 234, 0.15)"
                  onPress={() => onSmartClean(similarPhotosFlat, t('dashboard.bento.similar_shots'), scanResult?.similarPhotos)}
                  delay={250}
                />
              </View>

              <View style={styles.bentoRow}>
                <BentoCard
                  icon={<ImageOff color={colors.electricPurple} size={22} strokeWidth={2.4} />}
                  title={t('dashboard.bento.blurry_photos')}
                  countText={t('dashboard.status.items_found', { count: scanResult?.blurryPhotos.length || 0 })}
                  accentColor={colors.electricPurple}
                  glowColor="rgba(217, 70, 239, 0.15)"
                  onPress={() => scanResult && onSmartClean(scanResult.blurryPhotos, t('dashboard.bento.blurry_photos'))}
                  delay={350}
                />
                <BentoCard
                  icon={<Zap color={colors.successMint} size={22} strokeWidth={2.4} />}
                  title={t('dashboard.bento.screenshots')}
                  countText={t('dashboard.status.items_found', { count: scanResult?.screenshots.length || 0 })}
                  accentColor={colors.successMint}
                  glowColor="rgba(16, 185, 129, 0.15)"
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
    backgroundColor: colors.oledBlack,
  },
  safeArea: {
    flex: 1,
  },
  bgOrb1: {
    position: 'absolute',
    top: -60,
    right: -60,
    width: 340,
    height: 340,
    borderRadius: 170,
    opacity: 0.55,
  },
  bgOrb2: {
    position: 'absolute',
    top: 240,
    left: -80,
    width: 300,
    height: 300,
    borderRadius: 150,
    opacity: 0.35,
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
    letterSpacing: -1,
    textShadowColor: 'rgba(0, 242, 254, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 15,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
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
  loadingOrb: {
    width: 84,
    height: 84,
    marginBottom: 20,
  },
  loadingOrbContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    color: colors.dangerRose,
    fontSize: 16,
    fontWeight: '600',
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
    shadowColor: colors.neonCyan,
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
  bentoFullWidth: {
    width: '100%',
  },
  bentoItem: {
    borderRadius: 24,
  },
  bentoContentRow: {
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
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
  bentoTextGroup: {
    flex: 1,
  },
  bentoTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 3,
  },
  bentoCount: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  chevronWrapper: {
    paddingLeft: 8,
  },
  floatingActionWrapper: {
    position: 'absolute',
    bottom: 96,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 40,
    paddingHorizontal: 24,
  },
  cleanButton: {
    height: 56,
    width: 220,
    borderRadius: 28,
    shadowColor: colors.neonCyan,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
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
    fontSize: 16,
    color: colors.neonCyan,
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
  scannerProgressTrack: {
    width: '100%',
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 20,
  },
  scannerProgressFill: {
    height: '100%',
    backgroundColor: colors.neonCyan,
    borderRadius: 3,
    shadowColor: colors.neonCyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
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
    backgroundColor: 'rgba(0, 242, 254, 0.12)',
    borderColor: 'rgba(0, 242, 254, 0.3)',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    flex: 1,
    justifyContent: 'center',
  },
  scannerBadgeText: {
    color: colors.neonCyan,
    fontSize: 11,
    fontWeight: '700',
  },
  scannerBadgePillSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: colors.whiteBorderLight,
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
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
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