import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Globe,
  Settings,
  Sparkles,
  Zap,
  ShieldCheck,
  Film,
  Images,
  BarChart2,
  ArrowRight,
  RefreshCw,
  Layers,
  HelpCircle,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { AtmosphericBackground } from '../components/glass/AtmosphericBackground';
import { GlassPanel } from '../components/glass/GlassPanel';
import { GlassButton } from '../components/glass/GlassButton';
import { SettingsModal } from '../components/settings/SettingsModal';
import { StorageHealthWidget } from '../components/dashboard/StorageHealthWidget';
import { OnboardingGuideModal } from '../components/guide/OnboardingGuideModal';
import { PermissionGuidanceModal } from '../components/PermissionGuidanceModal';
import { colors } from '../theme/colors';
import { TabType } from '../components/navigation/BottomNavBar';
import { getStoredStats, formatByteSize } from '../services/cacheCleaner';
import { checkMediaPermissionsStatus } from '../services/mediaScanner';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  onNavigate: (tab: TabType) => void;
  onFullscreenToggle?: (enabled: boolean) => void;
}

export const HomeScreen: React.FC<Props> = ({ onNavigate, onFullscreenToggle }) => {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const [lifetimeSaved, setLifetimeSaved] = useState<string>('3.2 GB');
  const [settingsVisible, setSettingsVisible] = useState<boolean>(false);
  const [guideVisible, setGuideVisible] = useState<boolean>(false);
  const [permissionModalVisible, setPermissionModalVisible] = useState<boolean>(false);
  const [isLimitedAccess, setIsLimitedAccess] = useState<boolean>(false);

  const loadStats = useCallback(() => {
    getStoredStats()
      .then((stats) => {
        if (stats?.lifetimeSavedBytes) {
          setLifetimeSaved(formatByteSize(stats.lifetimeSavedBytes));
        } else {
          setLifetimeSaved('0 MB');
        }
      })
      .catch(() => {});

    checkMediaPermissionsStatus()
      .then((status) => {
        setIsLimitedAccess(status.isLimited);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const toggleLanguage = () => {
    const current = i18n.language || 'tr';
    const nextLang = current.startsWith('tr') ? 'en' : 'tr';
    i18n.changeLanguage(nextLang);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  const handleCardPress = (tab: TabType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onNavigate(tab);
  };

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

          <View style={styles.headerRightActions}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setGuideVisible(true);
              }}
              style={styles.settingsButton}
            >
              <HelpCircle color={colors.electricPurple} size={20} strokeWidth={2.4} />
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

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(140, 110 + insets.bottom) },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero Banner Section */}
          <Animated.View entering={FadeInDown.duration(600).delay(100)} style={styles.heroSection}>
            <GlassPanel
              borderRadius={32}
              style={styles.heroPanel}
              contentStyle={styles.heroContent}
              intensity={35}
              glowAccent={colors.neonCyan}
            >
              <View style={styles.heroBadgeRow}>
                <View style={styles.heroBadge}>
                  <Zap color={colors.neonCyan} size={14} style={{ marginRight: 6 }} />
                  <Text style={styles.heroBadgeText}>{t('home.hero_badge')}</Text>
                </View>
                {lifetimeSaved ? (
                  <View style={styles.heroStatsBadge}>
                    <Sparkles color={colors.successMint} size={13} style={{ marginRight: 5 }} />
                    <Text style={styles.heroStatsBadgeText}>{lifetimeSaved}</Text>
                  </View>
                ) : null}
              </View>

              <Text style={styles.heroTitle}>{t('home.hero_title')}</Text>
              <Text style={styles.heroDesc}>{t('home.hero_desc')}</Text>

              <GlassButton
                borderRadius={28}
                borderColor={colors.neonCyan}
                style={styles.heroCtaButton}
                contentStyle={styles.heroCtaContent}
                onPress={() => handleCardPress('photos')}
              >
                <Sparkles color={colors.neonCyan} size={20} style={{ marginRight: 8 }} />
                <Text style={styles.heroCtaText}>{t('home.cta_quick')}</Text>
              </GlassButton>
            </GlassPanel>
          </Animated.View>

          {/* Android 14/15 Limited Gallery Access Warning Banner */}
          {isLimitedAccess && (
            <Animated.View entering={FadeInDown.duration(500)} style={styles.limitedBannerContainer}>
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                  setPermissionModalVisible(true);
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

          {/* Live Storage Health & RAM Turbo Boost Widget */}
          <StorageHealthWidget />

          {/* Navigation Bento Feature Cards */}
          <View style={styles.cardsContainer}>
            {/* Card 1: Resim Temizleme */}
            <Animated.View entering={FadeInUp.duration(600).delay(200).springify()}>
              <TouchableOpacity activeOpacity={0.88} onPress={() => handleCardPress('photos')}>
                <GlassPanel
                  borderRadius={28}
                  borderColor="rgba(0, 242, 254, 0.35)"
                  style={styles.featureCard}
                  contentStyle={styles.featureCardContent}
                  glowAccent={colors.neonCyan}
                  intensity={30}
                >
                  <View style={[styles.iconBadge, { backgroundColor: 'rgba(0, 242, 254, 0.12)', borderColor: 'rgba(0, 242, 254, 0.35)' }]}>
                    <Images color={colors.neonCyan} size={26} strokeWidth={2.4} />
                  </View>

                  <View style={styles.cardTextGroup}>
                    <Text style={styles.cardTitle}>{t('home.card_photos_title')}</Text>
                    <Text style={styles.cardDesc}>{t('home.card_photos_desc')}</Text>
                  </View>

                  <View style={styles.arrowCircle}>
                    <ArrowRight color={colors.neonCyan} size={18} strokeWidth={2.5} />
                  </View>
                </GlassPanel>
              </TouchableOpacity>
            </Animated.View>

            {/* Card 2: Zaman Tüneli Detoksu */}
            <Animated.View entering={FadeInUp.duration(600).delay(280).springify()}>
              <TouchableOpacity activeOpacity={0.88} onPress={() => handleCardPress('timeline')}>
                <GlassPanel
                  borderRadius={28}
                  borderColor="rgba(168, 85, 247, 0.35)"
                  style={styles.featureCard}
                  contentStyle={styles.featureCardContent}
                  glowAccent={colors.electricPurple}
                  intensity={30}
                >
                  <View style={[styles.iconBadge, { backgroundColor: 'rgba(168, 85, 247, 0.12)', borderColor: 'rgba(168, 85, 247, 0.35)' }]}>
                    <Images color={colors.electricPurple} size={26} strokeWidth={2.4} />
                  </View>

                  <View style={styles.cardTextGroup}>
                    <Text style={styles.cardTitle}>{t('home.card_timeline_title')}</Text>
                    <Text style={styles.cardDesc}>{t('home.card_timeline_desc')}</Text>
                  </View>

                  <View style={[styles.arrowCircle, { borderColor: 'rgba(168, 85, 247, 0.4)' }]}>
                    <ArrowRight color={colors.electricPurple} size={18} strokeWidth={2.5} />
                  </View>
                </GlassPanel>
              </TouchableOpacity>
            </Animated.View>

            {/* Card 3: Medya Araç Seti */}
            <Animated.View entering={FadeInUp.duration(600).delay(360).springify()}>
              <TouchableOpacity activeOpacity={0.88} onPress={() => handleCardPress('tools')}>
                <GlassPanel
                  borderRadius={28}
                  borderColor="rgba(126, 34, 206, 0.35)"
                  style={styles.featureCard}
                  contentStyle={styles.featureCardContent}
                  glowAccent={colors.deepPurple}
                  intensity={30}
                >
                  <View style={[styles.iconBadge, { backgroundColor: 'rgba(126, 34, 206, 0.12)', borderColor: 'rgba(126, 34, 206, 0.35)' }]}>
                    <Layers color={colors.deepPurple} size={26} strokeWidth={2.4} />
                  </View>

                  <View style={styles.cardTextGroup}>
                    <Text style={styles.cardTitle}>{t('home.card_tools_title')}</Text>
                    <Text style={styles.cardDesc}>{t('home.card_tools_desc')}</Text>
                  </View>

                  <View style={[styles.arrowCircle, { borderColor: 'rgba(126, 34, 206, 0.4)' }]}>
                    <ArrowRight color={colors.deepPurple} size={18} strokeWidth={2.5} />
                  </View>
                </GlassPanel>
              </TouchableOpacity>
            </Animated.View>

            {/* Card 4: Güvenli Gizli Kasa */}
            <Animated.View entering={FadeInUp.duration(600).delay(440).springify()}>
              <TouchableOpacity activeOpacity={0.88} onPress={() => handleCardPress('vault')}>
                <GlassPanel
                  borderRadius={28}
                  borderColor="rgba(16, 185, 129, 0.35)"
                  style={styles.featureCard}
                  contentStyle={styles.featureCardContent}
                  glowAccent={colors.successMint}
                  intensity={30}
                >
                  <View style={[styles.iconBadge, { backgroundColor: 'rgba(16, 185, 129, 0.12)', borderColor: 'rgba(16, 185, 129, 0.35)' }]}>
                    <Sparkles color={colors.successMint} size={26} strokeWidth={2.4} />
                  </View>

                  <View style={styles.cardTextGroup}>
                    <Text style={styles.cardTitle}>{t('home.card_vault_title')}</Text>
                    <Text style={styles.cardDesc}>{t('home.card_vault_desc')}</Text>
                  </View>

                  <View style={[styles.arrowCircle, { borderColor: 'rgba(16, 185, 129, 0.4)' }]}>
                    <ArrowRight color={colors.successMint} size={18} strokeWidth={2.5} />
                  </View>
                </GlassPanel>
              </TouchableOpacity>
            </Animated.View>

            {/* Card 5: Temizlik Raporu */}
            <Animated.View entering={FadeInUp.duration(600).delay(520).springify()}>
              <TouchableOpacity activeOpacity={0.88} onPress={() => handleCardPress('report')}>
                <GlassPanel
                  borderRadius={28}
                  borderColor="rgba(245, 158, 11, 0.35)"
                  style={styles.featureCard}
                  contentStyle={styles.featureCardContent}
                  glowAccent={colors.warningAmber}
                  intensity={30}
                >
                  <View style={[styles.iconBadge, { backgroundColor: 'rgba(245, 158, 11, 0.12)', borderColor: 'rgba(245, 158, 11, 0.35)' }]}>
                    <BarChart2 color={colors.warningAmber} size={26} strokeWidth={2.4} />
                  </View>

                  <View style={styles.cardTextGroup}>
                    <Text style={styles.cardTitle}>{t('home.card_report_title')}</Text>
                    <Text style={styles.cardDesc}>{t('home.card_report_desc')}</Text>
                  </View>

                  <View style={[styles.arrowCircle, { borderColor: 'rgba(245, 158, 11, 0.4)' }]}>
                    <ArrowRight color={colors.warningAmber} size={18} strokeWidth={2.5} />
                  </View>
                </GlassPanel>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* Settings Modal */}
      <SettingsModal
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        onStatsReset={loadStats}
        onOpenGuide={() => setGuideVisible(true)}
        onFullscreenChange={onFullscreenToggle}
      />

      {/* Interactive Onboarding & User Guide Modal */}
      <OnboardingGuideModal
        visible={guideVisible}
        onClose={() => setGuideVisible(false)}
      />

      {/* Android 14/15 Permission Guidance Modal */}
      <PermissionGuidanceModal
        visible={permissionModalVisible}
        onClose={() => {
          setPermissionModalVisible(false);
          loadStats();
        }}
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
    borderBottomColor: colors.whiteBorderLight,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  langButton: {
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: colors.whiteBorderLight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  langText: {
    color: colors.neonCyan,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  appTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: 1,
  },
  settingsButton: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: colors.whiteBorderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  heroSection: {
    marginBottom: 16,
  },
  heroPanel: {
    borderRadius: 32,
  },
  heroContent: {
    padding: 24,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 242, 254, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0, 242, 254, 0.3)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  heroBadgeText: {
    color: colors.neonCyan,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  heroStatsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  heroStatsBadgeText: {
    color: colors.successMint,
    fontSize: 11,
    fontWeight: '800',
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.textPrimary,
    lineHeight: 30,
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  heroDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
    marginBottom: 20,
  },
  heroCtaButton: {
    borderRadius: 28,
  },
  heroCtaContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  heroCtaText: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.neonCyan,
    letterSpacing: 0.5,
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
  cardsContainer: {
    gap: 16,
  },
  featureCard: {
    borderRadius: 28,
  },
  featureCardContent: {
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBadge: {
    width: 52,
    height: 52,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  cardTextGroup: {
    flex: 1,
    paddingRight: 8,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  arrowCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(0, 242, 254, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
