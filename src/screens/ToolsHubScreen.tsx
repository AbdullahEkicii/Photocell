import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Globe,
  Settings,
  Images,
  Film,
  ShieldCheck,
  Flame,
  ArrowRight,
  Sparkles,
  Layers,
  Users,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { AtmosphericBackground } from '../components/glass/AtmosphericBackground';
import { GlassPanel } from '../components/glass/GlassPanel';
import { SettingsModal } from '../components/settings/SettingsModal';
import { colors } from '../theme/colors';

export type ToolScreenType =
  | 'photo_compressor'
  | 'videos'
  | 'exif_cleaner'
  | 'heavy_media'
  | 'contacts_cleaner';

interface Props {
  onSelectTool: (tool: ToolScreenType) => void;
}

export const ToolsHubScreen: React.FC<Props> = ({ onSelectTool }) => {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const [settingsVisible, setSettingsVisible] = useState<boolean>(false);

  const toggleLanguage = () => {
    const current = i18n.language || 'tr';
    const nextLang = current.startsWith('tr') ? 'en' : 'tr';
    i18n.changeLanguage(nextLang);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  const handleToolPress = (tool: ToolScreenType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onSelectTool(tool);
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
          {/* Header Section */}
          <Animated.View entering={FadeInDown.duration(600).delay(100)} style={styles.headerSection}>
            <View style={styles.badgeRow}>
              <Layers color={colors.neonCyan} size={14} style={{ marginRight: 6 }} />
              <Text style={styles.badgeText}>ALL-IN-ONE SUITE</Text>
            </View>
            <Text style={styles.pageTitle}>{t('tools.title')}</Text>
            <Text style={styles.pageSubtitle}>{t('tools.subtitle')}</Text>
          </Animated.View>

          {/* Tools Cards */}
          <View style={styles.toolsContainer}>
            {/* Tool 1: Fotoğraf Sıkıştırıcı */}
            <Animated.View entering={FadeInUp.duration(600).delay(200).springify()}>
              <TouchableOpacity activeOpacity={0.88} onPress={() => handleToolPress('photo_compressor')}>
                <GlassPanel
                  borderRadius={28}
                  borderColor="rgba(0, 242, 254, 0.35)"
                  style={styles.toolCard}
                  contentStyle={styles.toolCardContent}
                  glowAccent={colors.neonCyan}
                  intensity={30}
                >
                  <View style={[styles.iconBadge, { backgroundColor: 'rgba(0, 242, 254, 0.12)', borderColor: 'rgba(0, 242, 254, 0.35)' }]}>
                    <Images color={colors.neonCyan} size={26} strokeWidth={2.4} />
                  </View>

                  <View style={styles.cardTextGroup}>
                    <Text style={styles.cardTitle}>{t('tools.photo_comp_title')}</Text>
                    <Text style={styles.cardDesc}>{t('tools.photo_comp_desc')}</Text>
                  </View>

                  <View style={styles.arrowCircle}>
                    <ArrowRight color={colors.neonCyan} size={18} strokeWidth={2.5} />
                  </View>
                </GlassPanel>
              </TouchableOpacity>
            </Animated.View>

            {/* Tool 2: Video Sıkıştırıcı */}
            <Animated.View entering={FadeInUp.duration(600).delay(280).springify()}>
              <TouchableOpacity activeOpacity={0.88} onPress={() => handleToolPress('videos')}>
                <GlassPanel
                  borderRadius={28}
                  borderColor="rgba(168, 85, 247, 0.35)"
                  style={styles.toolCard}
                  contentStyle={styles.toolCardContent}
                  glowAccent={colors.electricPurple}
                  intensity={30}
                >
                  <View style={[styles.iconBadge, { backgroundColor: 'rgba(168, 85, 247, 0.12)', borderColor: 'rgba(168, 85, 247, 0.35)' }]}>
                    <Film color={colors.electricPurple} size={26} strokeWidth={2.4} />
                  </View>

                  <View style={styles.cardTextGroup}>
                    <Text style={styles.cardTitle}>{t('tools.video_comp_title')}</Text>
                    <Text style={styles.cardDesc}>{t('tools.video_comp_desc')}</Text>
                  </View>

                  <View style={[styles.arrowCircle, { borderColor: 'rgba(168, 85, 247, 0.4)' }]}>
                    <ArrowRight color={colors.electricPurple} size={18} strokeWidth={2.5} />
                  </View>
                </GlassPanel>
              </TouchableOpacity>
            </Animated.View>

            {/* Tool 3: EXIF & GPS Gizlilik Temizleyici */}
            <Animated.View entering={FadeInUp.duration(600).delay(360).springify()}>
              <TouchableOpacity activeOpacity={0.88} onPress={() => handleToolPress('exif_cleaner')}>
                <GlassPanel
                  borderRadius={28}
                  borderColor="rgba(16, 185, 129, 0.35)"
                  style={styles.toolCard}
                  contentStyle={styles.toolCardContent}
                  glowAccent={colors.successMint}
                  intensity={30}
                >
                  <View style={[styles.iconBadge, { backgroundColor: 'rgba(16, 185, 129, 0.12)', borderColor: 'rgba(16, 185, 129, 0.35)' }]}>
                    <ShieldCheck color={colors.successMint} size={26} strokeWidth={2.4} />
                  </View>

                  <View style={styles.cardTextGroup}>
                    <Text style={styles.cardTitle}>{t('tools.exif_title')}</Text>
                    <Text style={styles.cardDesc}>{t('tools.exif_desc')}</Text>
                  </View>

                  <View style={[styles.arrowCircle, { borderColor: 'rgba(16, 185, 129, 0.4)' }]}>
                    <ArrowRight color={colors.successMint} size={18} strokeWidth={2.5} />
                  </View>
                </GlassPanel>
              </TouchableOpacity>
            </Animated.View>

            {/* Tool 4: Ağır Medya Radarı */}
            <Animated.View entering={FadeInUp.duration(600).delay(440).springify()}>
              <TouchableOpacity activeOpacity={0.88} onPress={() => handleToolPress('heavy_media')}>
                <GlassPanel
                  borderRadius={28}
                  borderColor="rgba(244, 63, 94, 0.35)"
                  style={styles.toolCard}
                  contentStyle={styles.toolCardContent}
                  glowAccent={colors.dangerRose}
                  intensity={30}
                >
                  <View style={[styles.iconBadge, { backgroundColor: 'rgba(244, 63, 94, 0.12)', borderColor: 'rgba(244, 63, 94, 0.35)' }]}>
                    <Flame color={colors.dangerRose} size={26} strokeWidth={2.4} />
                  </View>

                  <View style={styles.cardTextGroup}>
                    <Text style={styles.cardTitle}>{t('tools.heavy_title')}</Text>
                    <Text style={styles.cardDesc}>{t('tools.heavy_desc')}</Text>
                  </View>

                  <View style={[styles.arrowCircle, { borderColor: 'rgba(244, 63, 94, 0.4)' }]}>
                    <ArrowRight color={colors.dangerRose} size={18} strokeWidth={2.5} />
                  </View>
                </GlassPanel>
              </TouchableOpacity>
            </Animated.View>

            {/* Tool 5: Kişi & Rehber Temizleyici */}
            <Animated.View entering={FadeInUp.duration(600).delay(520).springify()}>
              <TouchableOpacity activeOpacity={0.88} onPress={() => handleToolPress('contacts_cleaner')}>
                <GlassPanel
                  borderRadius={28}
                  borderColor="rgba(0, 242, 254, 0.35)"
                  style={styles.toolCard}
                  contentStyle={styles.toolCardContent}
                  glowAccent={colors.neonCyan}
                  intensity={30}
                >
                  <View style={[styles.iconBadge, { backgroundColor: 'rgba(0, 242, 254, 0.12)', borderColor: 'rgba(0, 242, 254, 0.35)' }]}>
                    <Users color={colors.neonCyan} size={26} strokeWidth={2.4} />
                  </View>

                  <View style={styles.cardTextGroup}>
                    <Text style={styles.cardTitle}>{t('tools.contacts_title')}</Text>
                    <Text style={styles.cardDesc}>{t('tools.contacts_desc')}</Text>
                  </View>

                  <View style={[styles.arrowCircle, { borderColor: 'rgba(0, 242, 254, 0.4)' }]}>
                    <ArrowRight color={colors.neonCyan} size={18} strokeWidth={2.5} />
                  </View>
                </GlassPanel>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* Settings Modal */}
      <SettingsModal visible={settingsVisible} onClose={() => setSettingsVisible(false)} />
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 110,
  },
  headerSection: {
    marginBottom: 20,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 242, 254, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0, 242, 254, 0.3)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  badgeText: {
    color: colors.neonCyan,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
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
  toolsContainer: {
    gap: 14,
  },
  toolCard: {
    borderRadius: 28,
  },
  toolCardContent: {
    padding: 18,
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
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
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
