import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Animated from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Home, Images, Calendar, Layers, ShieldCheck, BarChart2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { GlassPanel } from '../glass/GlassPanel';
import { colors } from '../../theme/colors';

export type TabType = 'home' | 'photos' | 'timeline' | 'tools' | 'vault' | 'report';

interface BottomNavBarProps {
  activeTab?: TabType;
  onSelectTab?: (tab: TabType) => void;
}

const TABS: { id: TabType; labelKey: string; Icon: any; accentColor: string }[] = [
  { id: 'home', labelKey: 'nav.home', Icon: Home, accentColor: colors.neonCyan },
  { id: 'photos', labelKey: 'nav.photos', Icon: Images, accentColor: colors.neonCyan },
  { id: 'timeline', labelKey: 'nav.timeline', Icon: Calendar, accentColor: colors.electricPurple },
  { id: 'tools', labelKey: 'nav.tools', Icon: Layers, accentColor: colors.electricPurple },
  { id: 'vault', labelKey: 'nav.vault', Icon: ShieldCheck, accentColor: colors.successMint },
  { id: 'report', labelKey: 'nav.report', Icon: BarChart2, accentColor: colors.warningAmber },
];

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  activeTab: externalActiveTab,
  onSelectTab,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [internalActiveTab, setInternalActiveTab] = React.useState<TabType>('home');
  const currentTab = externalActiveTab || internalActiveTab;

  const handleSelect = (tab: TabType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setInternalActiveTab(tab);
    if (onSelectTab) onSelectTab(tab);
  };

  const dynamicBottom = Math.max(14, insets.bottom + 6);

  return (
    <View style={[styles.outerContainer, { bottom: dynamicBottom }]} pointerEvents="box-none">
      <GlassPanel 
        borderRadius={44} 
        intensity={40} 
        borderColor="rgba(226, 232, 240, 0.9)"
        fillColor="rgba(255, 255, 255, 0.92)"
        glowAccent={colors.neonCyan}
        style={styles.navBarPanel}
        contentStyle={styles.navBarContent}
      >
        {/* Top Edge Light Specular Glow */}
        <LinearGradient
          colors={['rgba(255, 255, 255, 0.95)', 'rgba(147, 51, 234, 0.2)', 'transparent']}
          style={styles.topBarSheen}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        />

        {TABS.map((tab) => {
          const isActive = tab.id === currentTab;
          const IconComponent = tab.Icon;
          const accentColor = tab.accentColor;

          return (
            <TouchableOpacity
              key={tab.id}
              activeOpacity={0.8}
              onPress={() => handleSelect(tab.id)}
              style={[
                styles.tabItem,
                isActive && [styles.activeTabItem, { borderColor: `${accentColor}40`, backgroundColor: `${accentColor}12` }],
              ]}
            >
              <View style={styles.iconLabelGroup}>
                <IconComponent
                  color={isActive ? accentColor : colors.textMuted}
                  size={isActive ? 19 : 20}
                  strokeWidth={isActive ? 2.6 : 2}
                />
                {isActive && (
                  <Animated.Text numberOfLines={1} style={[styles.tabLabel, { color: accentColor }]}>
                    {t(tab.labelKey)}
                  </Animated.Text>
                )}
              </View>

              {isActive && (
                <View
                  style={[
                    styles.activeDot,
                    { backgroundColor: accentColor },
                  ]}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </GlassPanel>
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  navBarPanel: {
    width: '95%',
    maxWidth: 440,
    height: 66,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 8,
  },
  navBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    height: '100%',
  },
  topBarSheen: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
    height: 1.5,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 24,
    position: 'relative',
    height: 48,
  },
  activeTabItem: {
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  iconLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  activeDot: {
    position: 'absolute',
    bottom: 2,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
