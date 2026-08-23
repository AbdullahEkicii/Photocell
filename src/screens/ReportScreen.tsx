import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInDown, FadeInUp, FadeIn, useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, withSequence, cancelAnimation } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Globe, Settings, Cpu, Layers, Compass, Sparkles, Check, Trash2, Zap, Image as ImageIcon, Film } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { AtmosphericBackground } from '../components/glass/AtmosphericBackground';
import { GlassPanel } from '../components/glass/GlassPanel';
import { GlassButton } from '../components/glass/GlassButton';
import { colors } from '../theme/colors';
import { SettingsModal } from '../components/settings/SettingsModal';
import { scanDeviceCache, clearSelectedCache, formatByteSize, CacheScanResult, CacheCategory } from '../services/cacheCleaner';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const ReportScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const [scanResult, setScanResult] = useState<CacheScanResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedIds, setSelectedIds] = useState<string[]>(['system', 'app', 'browser']);
  const [cleaning, setCleaning] = useState<boolean>(false);
  const [settingsVisible, setSettingsVisible] = useState<boolean>(false);

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

  const loadCacheInfo = async () => {
    try {
      setLoading(true);
      const res = await scanDeviceCache();
      setScanResult(res);
    } catch (e) {
      console.error('Failed scanning cache:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCacheInfo();
  }, []);

  const toggleLanguage = () => {
    const current = i18n.language || 'tr';
    const nextLang = current.startsWith('tr') ? 'en' : 'tr';
    i18n.changeLanguage(nextLang);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  const toggleSelectCategory = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const [cleanFeedback, setCleanFeedback] = useState<string | null>(null);

  const handleCleanCache = async () => {
    if (selectedIds.length === 0 || cleaning || !scanResult) return;
    setCleaning(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    const clearedBytes = await clearSelectedCache(selectedIds, scanResult.files);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    const formattedAmount = formatByteSize(clearedBytes);
    setCleanFeedback(t('report.cleared_success_amount', { amount: formattedAmount }));
    setTimeout(() => setCleanFeedback(null), 4000);

    await loadCacheInfo();
    setCleaning(false);
  };

  const selectedTotalBytes = scanResult
    ? scanResult.categories
        .filter((c) => selectedIds.includes(c.id))
        .reduce((sum, c) => sum + c.sizeBytes, 0)
    : 0;

  const formattedSelectedTotal =
    selectedTotalBytes > 1024 * 1024 * 1024
      ? `${(selectedTotalBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
      : `${(selectedTotalBytes / (1024 * 1024)).toFixed(1)} MB`;

  return (
    <View style={styles.container}>
      {/* Dynamic Animated Mesh Shader Background */}
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
        </Animated.View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(140, 100 + insets.bottom) },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Internal Title */}
          <Animated.View entering={FadeInDown.duration(600).delay(100)} style={styles.headerSection}>
            <Text style={styles.pageEyebrow}>{t('report.cache_cleaner_title')}</Text>
          </Animated.View>

          {/* Lifetime Savings Hero Panel */}
          <Animated.View entering={FadeInUp.duration(600).delay(200).springify()} style={styles.heroCard}>
            <GlassPanel borderRadius={32} style={styles.heroPanel} contentStyle={styles.heroContent} intensity={35}>
              <LinearGradient
                colors={['transparent', 'rgba(0, 242, 254, 0.25)', 'transparent']}
                style={styles.heroTopGradientLine}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              />

              <Text style={styles.heroLabel}>{t('report.total_saved_label')}</Text>
              <Text style={styles.heroValueText}>
                {scanResult?.totalLifetimeSavedFormatted || '42.5 GB'}
              </Text>

              {/* Photos & Videos Stat Boxes */}
              <View style={styles.heroStatsRow}>
                <View style={styles.statBox}>
                  <ImageIcon color={colors.neonCyan} size={20} style={{ marginBottom: 4 }} />
                  <Text style={styles.statBoxLabel}>{t('report.photos_saved')}</Text>
                  <Text style={styles.statBoxValue}>{scanResult?.photosSavedFormatted || '12.8 GB'}</Text>
                </View>

                <View style={styles.statBox}>
                  <Film color={colors.electricPurple} size={20} style={{ marginBottom: 4 }} />
                  <Text style={styles.statBoxLabel}>{t('report.videos_saved')}</Text>
                  <Text style={styles.statBoxValue}>{scanResult?.videosSavedFormatted || '29.7 GB'}</Text>
                </View>
              </View>
            </GlassPanel>
          </Animated.View>

          {/* Current Cache List (Bento Layout) */}
          <Animated.View entering={FadeInUp.duration(600).delay(300).springify()} style={styles.cacheSection}>
            <View style={styles.cacheSectionHeader}>
              <Text style={styles.cacheSectionTitle}>{t('report.ready_to_clean')}</Text>
              <View style={styles.totalBadge}>
                <Text style={styles.totalBadgeText}>
                  {formattedSelectedTotal} TOTAL
                </Text>
              </View>
            </View>

            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="small" color={colors.neonCyan} style={{ marginRight: 10 }} />
                <Text style={styles.loadingText}>{t('dashboard.status.scanning')}</Text>
              </View>
            ) : (
              <View style={styles.categoryList}>
                {scanResult?.categories.map((cat) => {
                  const isChecked = selectedIds.includes(cat.id);
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      activeOpacity={0.85}
                      onPress={() => toggleSelectCategory(cat.id)}
                    >
                      <GlassPanel
                        borderRadius={24}
                        borderColor={isChecked ? `${cat.accentColor}50` : colors.whiteBorderLight}
                        style={styles.categoryCard}
                        contentStyle={styles.categoryContent}
                        intensity={30}
                      >
                        <View style={styles.categoryLeft}>
                          <View
                            style={[
                              styles.categoryIconBadge,
                              {
                                backgroundColor: `${cat.accentColor}1A`,
                                borderColor: `${cat.accentColor}40`,
                              },
                            ]}
                          >
                            {cat.iconName === 'system' ? (
                              <Cpu color={cat.accentColor} size={22} />
                            ) : cat.iconName === 'app' ? (
                              <Layers color={cat.accentColor} size={22} />
                            ) : (
                              <Compass color={cat.accentColor} size={22} />
                            )}
                          </View>

                          <View style={styles.categoryTextGroup}>
                            <Text style={styles.categoryTitle}>
                              {t(cat.titleKey, cat.defaultTitle)}
                            </Text>
                            <Text style={styles.categorySize}>{cat.formattedSize}</Text>
                          </View>
                        </View>

                        {/* Custom Neon Checkbox */}
                        <View
                          style={[
                            styles.checkbox,
                            isChecked && {
                              backgroundColor: colors.neonCyan,
                              borderColor: colors.neonCyan,
                            },
                          ]}
                        >
                          {isChecked && <Check color={colors.oledBlack} size={14} strokeWidth={3.5} />}
                        </View>
                      </GlassPanel>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </Animated.View>
        </ScrollView>

        {/* Floating Action Button: Clean Cache */}
        <Animated.View entering={FadeInUp.delay(400).springify()} style={styles.floatingActionWrapper}>
          <TouchableOpacity
            activeOpacity={0.85}
            disabled={selectedIds.length === 0 || cleaning}
            onPress={handleCleanCache}
            style={[styles.floatingCleanButton, selectedIds.length === 0 && { opacity: 0.5 }]}
          >
            <LinearGradient
              colors={['rgba(0, 242, 254, 0.25)', 'rgba(168, 85, 247, 0.25)']}
              style={styles.floatingCleanGradient}
            >
              {cleaning ? (
                <ActivityIndicator size="small" color={colors.neonCyan} style={{ marginRight: 8 }} />
              ) : (
                <Zap color={colors.neonCyan} size={22} style={{ marginRight: 8 }} />
              )}
              <Text style={styles.floatingCleanText}>{t('report.clean_cache_btn')}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
        {/* Settings Modal */}
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
    paddingBottom: 170,
  },
  headerSection: {
    marginBottom: 16,
    alignItems: 'center',
  },
  pageEyebrow: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  heroCard: {
    marginBottom: 24,
  },
  heroPanel: {
    borderRadius: 32,
  },
  heroContent: {
    padding: 24,
    alignItems: 'center',
  },
  heroTopGradientLine: {
    position: 'absolute',
    top: 0,
    left: 40,
    right: 40,
    height: 1,
  },
  heroLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 2.5,
    marginBottom: 8,
  },
  heroValueText: {
    fontSize: 44,
    fontWeight: '900',
    color: colors.neonCyan,
    textShadowColor: 'rgba(0, 242, 254, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
    marginBottom: 20,
  },
  heroStatsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  statBox: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: colors.whiteBorderLight,
    borderRadius: 20,
    padding: 14,
    alignItems: 'center',
  },
  statBoxLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  statBoxValue: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  cacheSection: {
    marginBottom: 20,
  },
  cacheSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  cacheSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  totalBadge: {
    backgroundColor: 'rgba(0, 242, 254, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0, 242, 254, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
  },
  totalBadgeText: {
    color: colors.neonCyan,
    fontSize: 11,
    fontWeight: '800',
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  categoryList: {
    gap: 12,
  },
  categoryCard: {
    borderRadius: 24,
  },
  categoryContent: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  categoryTextGroup: {
    flex: 1,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  categorySize: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.8,
    borderColor: 'rgba(0, 242, 254, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
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
  floatingCleanButton: {
    height: 56,
    width: '100%',
    maxWidth: 320,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: colors.neonCyan,
    overflow: 'hidden',
    shadowColor: colors.neonCyan,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 10,
  },
  floatingCleanGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingCleanText: {
    fontSize: 16,
    color: colors.textPrimary,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});

