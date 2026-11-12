import React, { useState } from 'react';
import { enter } from '../theme/motion';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Images, Film, ShieldCheck, Flame, Users } from 'lucide-react-native';

import { AtmosphericBackground } from '../components/glass/AtmosphericBackground';
import { ScreenHeader, HEADER_BAR_HEIGHT, underHeader } from '../components/layout/ScreenHeader';
import { AdBanner } from '../components/ads/AdBanner';
import { NavCard } from '../components/layout/NavCard';
import { SettingsModal } from '../components/settings/SettingsModal';
import { colors, alpha } from '../theme/colors';

export type ToolScreenType =
  | 'photo_compressor'
  | 'videos'
  | 'exif_cleaner'
  | 'heavy_media'
  | 'contacts_cleaner';

interface Props {
  onSelectTool: (tool: ToolScreenType) => void;
}

const TOOLS: {
  id: ToolScreenType;
  icon: React.ComponentType<any>;
  titleKey: string;
  descKey: string;
  accent: string;
}[] = [
  {
    id: 'photo_compressor',
    icon: Images,
    titleKey: 'tools.photo_comp_title',
    descKey: 'tools.photo_comp_desc',
    accent: colors.primary,
  },
  {
    id: 'videos',
    icon: Film,
    titleKey: 'tools.video_comp_title',
    descKey: 'tools.video_comp_desc',
    accent: colors.accent,
  },
  {
    id: 'exif_cleaner',
    icon: ShieldCheck,
    titleKey: 'tools.exif_title',
    descKey: 'tools.exif_desc',
    accent: colors.successMint,
  },
  {
    id: 'heavy_media',
    icon: Flame,
    titleKey: 'tools.heavy_title',
    descKey: 'tools.heavy_desc',
    accent: colors.dangerRose,
  },
  {
    id: 'contacts_cleaner',
    icon: Users,
    titleKey: 'tools.contacts_title',
    descKey: 'tools.contacts_desc',
    accent: colors.primaryDeep,
  },
];

export const ToolsHubScreen: React.FC<Props> = ({ onSelectTool }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [settingsVisible, setSettingsVisible] = useState<boolean>(false);

  return (
    <View style={styles.container}>
      <AtmosphericBackground />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader
          title={t('dashboard.app_title')}
          showLanguageToggle
          onOpenSettings={() => setSettingsVisible(true)}
        />

        <ScrollView
          style={[styles.scrollView, underHeader]}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: HEADER_BAR_HEIGHT + 8 },
            { paddingBottom: Math.max(140, 100 + insets.bottom) },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={enter(FadeInDown.duration(500).delay(60))} style={styles.headerSection}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{t('tools.badge')}</Text>
            </View>
            <Text style={styles.pageTitle}>{t('tools.title')}</Text>
            <Text style={styles.pageSubtitle}>{t('tools.subtitle')}</Text>
          </Animated.View>

          <View style={styles.toolsContainer}>
            {TOOLS.map((tool, index) => (
              <React.Fragment key={tool.id}>
                <NavCard
                  icon={tool.icon}
                  title={t(tool.titleKey)}
                  description={t(tool.descKey)}
                  accent={tool.accent}
                  delay={100 + index * 60}
                  onPress={() => onSelectTool(tool.id)}
                />
                {index === 2 && (
                  <AdBanner placement="tools" style={styles.toolAdBanner} />
                )}
              </React.Fragment>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>

      <SettingsModal visible={settingsVisible} onClose={() => setSettingsVisible(false)} />
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
  headerSection: {
    marginBottom: 18,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: alpha(colors.primary, 0.09),
    borderWidth: 1,
    borderColor: alpha(colors.primary, 0.22),
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    marginBottom: 10,
  },
  badgeText: {
    color: colors.primary,
    fontSize: 13.5,
    fontWeight: '800',
    letterSpacing: 0.9,
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
    lineHeight: 18,
  },
  toolAdBanner: {
    marginVertical: 0,
  },
  toolsContainer: {
    gap: 12,
  },
});
