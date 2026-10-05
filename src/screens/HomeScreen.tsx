import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  Sparkles,
  ShieldCheck,
  Images,
  BarChart2,
  Calendar,
  Layers,
  HelpCircle,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { AtmosphericBackground } from '../components/glass/AtmosphericBackground';
import { GlassPanel } from '../components/glass/GlassPanel';
import { GlassButton } from '../components/glass/GlassButton';
import { ScreenHeader, HeaderIconButton } from '../components/layout/ScreenHeader';
import { NavCard } from '../components/layout/NavCard';
import { SettingsModal } from '../components/settings/SettingsModal';
import { StorageHealthWidget } from '../components/dashboard/StorageHealthWidget';
import { OnboardingGuideModal } from '../components/guide/OnboardingGuideModal';
import { PermissionGuidanceModal } from '../components/PermissionGuidanceModal';
import { colors, alpha, radius } from '../theme/colors';
import { TabType } from '../components/navigation/BottomNavBar';
import { getStoredStats, formatByteSize } from '../services/cacheCleaner';
import { checkMediaPermissionsStatus } from '../services/mediaScanner';

interface Props {
  onNavigate: (tab: TabType) => void;
  onFullscreenToggle?: (enabled: boolean) => void;
}

export const HomeScreen: React.FC<Props> = ({ onNavigate, onFullscreenToggle }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [lifetimeSavedBytes, setLifetimeSavedBytes] = useState<number>(0);
  const [settingsVisible, setSettingsVisible] = useState<boolean>(false);
  const [guideVisible, setGuideVisible] = useState<boolean>(false);
  const [permissionModalVisible, setPermissionModalVisible] = useState<boolean>(false);
  const [isLimitedAccess, setIsLimitedAccess] = useState<boolean>(false);

  const loadStats = useCallback(() => {
    getStoredStats()
      .then((stats) => setLifetimeSavedBytes(stats.lifetimeSavedBytes || 0))
      .catch(() => {});

    checkMediaPermissionsStatus()
      .then((status) => setIsLimitedAccess(status.isLimited))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const goTo = (tab: TabType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onNavigate(tab);
  };

  const cards: {
    key: TabType;
    icon: React.ComponentType<any>;
    titleKey: string;
    descKey: string;
    accent: string;
  }[] = [
    {
      key: 'photos',
      icon: Images,
      titleKey: 'home.card_photos_title',
      descKey: 'home.card_photos_desc',
      accent: colors.primary,
    },
    {
      key: 'timeline',
      icon: Calendar,
      titleKey: 'home.card_timeline_title',
      descKey: 'home.card_timeline_desc',
      accent: colors.accent,
    },
    {
      key: 'tools',
      icon: Layers,
      titleKey: 'home.card_tools_title',
      descKey: 'home.card_tools_desc',
      accent: colors.primaryDeep,
    },
    {
      key: 'vault',
      icon: ShieldCheck,
      titleKey: 'home.card_vault_title',
      descKey: 'home.card_vault_desc',
      accent: colors.successMint,
    },
    {
      key: 'report',
      icon: BarChart2,
      titleKey: 'home.card_report_title',
      descKey: 'home.card_report_desc',
      accent: colors.warningAmber,
    },
  ];

  return (
    <View style={styles.container}>
      <AtmosphericBackground />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader
          title={t('dashboard.app_title')}
          showLanguageToggle
          onOpenSettings={() => setSettingsVisible(true)}
          rightSlot={
            <HeaderIconButton onPress={() => setGuideVisible(true)} accessibilityLabel="Help">
              <HelpCircle color={colors.textSecondary} size={19} strokeWidth={2.3} />
            </HeaderIconButton>
          }
        />

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(140, 110 + insets.bottom) },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <Animated.View entering={FadeInDown.duration(500).delay(60)} style={styles.heroSection}>
            <GlassPanel
              borderRadius={radius.sheet}
              contentStyle={styles.heroContent}
              intensity={32}
              glowAccent={colors.primary}
            >
              <View style={styles.heroBadgeRow}>
                <View style={styles.heroBadge}>
                  <Text style={styles.heroBadgeText}>{t('home.hero_badge')}</Text>
                </View>
                {lifetimeSavedBytes > 0 && (
                  <View style={styles.heroStatsBadge}>
                    <Sparkles color={colors.successMint} size={12} />
                    <Text style={styles.heroStatsBadgeText}>
                      {formatByteSize(lifetimeSavedBytes)}
                    </Text>
                  </View>
                )}
              </View>

              <Text style={styles.heroTitle}>{t('home.hero_title')}</Text>
              <Text style={styles.heroDesc}>{t('home.hero_desc')}</Text>

              <GlassButton
                borderRadius={radius.control}
                borderColor={alpha(colors.primary, 0.35)}
                style={styles.heroCta}
                onPress={() => goTo('photos')}
              >
                <Sparkles color={colors.primary} size={18} />
                <Text style={styles.heroCtaText}>{t('home.cta_quick')}</Text>
              </GlassButton>
            </GlassPanel>
          </Animated.View>

          {/* Limited gallery access warning (Android 14/15) */}
          {isLimitedAccess && (
            <Animated.View entering={FadeInDown.duration(400)} style={styles.limitedBanner}>
              <TouchableOpacity
                activeOpacity={0.85}
                accessibilityRole="button"
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                  setPermissionModalVisible(true);
                }}
              >
                <GlassPanel
                  borderRadius={radius.card}
                  borderColor={alpha(colors.warningAmber, 0.4)}
                  contentStyle={styles.limitedBannerContent}
                  intensity={30}
                  glowAccent={colors.warningAmber}
                >
                  <View style={styles.limitedBannerIcon}>
                    <AlertTriangle color={colors.warningAmber} size={18} />
                  </View>
                  <View style={styles.limitedBannerText}>
                    <Text style={styles.limitedBannerTitle}>
                      {t('permission.limited_banner_title')}
                    </Text>
                    <Text style={styles.limitedBannerDesc} numberOfLines={2}>
                      {t('permission.limited_banner_desc')}
                    </Text>
                  </View>
                  <ChevronRight color={colors.warningAmber} size={18} />
                </GlassPanel>
              </TouchableOpacity>
            </Animated.View>
          )}

          <StorageHealthWidget />

          <View style={styles.cardsContainer}>
            {cards.map((card, index) => (
              <NavCard
                key={card.key}
                icon={card.icon}
                title={t(card.titleKey)}
                description={t(card.descKey)}
                accent={card.accent}
                delay={120 + index * 60}
                onPress={() => goTo(card.key)}
              />
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>

      <SettingsModal
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        onStatsReset={loadStats}
        onOpenGuide={() => setGuideVisible(true)}
        onFullscreenChange={onFullscreenToggle}
      />

      <OnboardingGuideModal visible={guideVisible} onClose={() => setGuideVisible(false)} />

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
    backgroundColor: colors.canvas,
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 16,
  },
  heroSection: {
    marginHorizontal: 20,
    marginBottom: 16,
  },
  heroContent: {
    padding: 22,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  heroBadge: {
    backgroundColor: alpha(colors.primary, 0.09),
    borderWidth: 1,
    borderColor: alpha(colors.primary, 0.22),
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  heroBadgeText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  heroStatsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: alpha(colors.successMint, 0.09),
    borderWidth: 1,
    borderColor: alpha(colors.successMint, 0.24),
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  heroStatsBadgeText: {
    color: colors.successMint,
    fontSize: 11,
    fontWeight: '800',
  },
  heroTitle: {
    fontSize: 23,
    fontWeight: '900',
    color: colors.textPrimary,
    lineHeight: 29,
    marginBottom: 8,
    letterSpacing: -0.6,
  },
  heroDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
    marginBottom: 20,
  },
  heroCta: {
    borderRadius: radius.control,
  },
  heroCtaText: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.primary,
    marginLeft: 8,
  },
  limitedBanner: {
    marginHorizontal: 20,
    marginBottom: 16,
  },
  limitedBannerContent: {
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  limitedBannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 13,
    backgroundColor: alpha(colors.warningAmber, 0.12),
    borderWidth: 1,
    borderColor: alpha(colors.warningAmber, 0.3),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  limitedBannerText: {
    flex: 1,
    marginRight: 8,
  },
  limitedBannerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.warningAmber,
    marginBottom: 2,
  },
  limitedBannerDesc: {
    fontSize: 11.5,
    color: colors.textSecondary,
    lineHeight: 15,
  },
  cardsContainer: {
    paddingHorizontal: 20,
    gap: 12,
  },
});
