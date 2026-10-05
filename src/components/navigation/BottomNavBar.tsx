import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  interpolate,
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Home, Images, Calendar, Layers, ShieldCheck, BarChart2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { GlassPanel } from '../glass/GlassPanel';
import { colors, alpha } from '../../theme/colors';

export type TabType = 'home' | 'photos' | 'timeline' | 'tools' | 'vault' | 'report';

interface BottomNavBarProps {
  activeTab?: TabType;
  onSelectTab?: (tab: TabType) => void;
}

interface TabDef {
  id: TabType;
  labelKey: string;
  Icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
}

const TABS: TabDef[] = [
  { id: 'home', labelKey: 'nav.home', Icon: Home },
  { id: 'photos', labelKey: 'nav.photos', Icon: Images },
  { id: 'timeline', labelKey: 'nav.timeline', Icon: Calendar },
  { id: 'tools', labelKey: 'nav.tools', Icon: Layers },
  { id: 'vault', labelKey: 'nav.vault', Icon: ShieldCheck },
  { id: 'report', labelKey: 'nav.report', Icon: BarChart2 },
];

const BAR_PADDING = 6; // must match navBarContent padding
const PILL_GAP = 3; // breathing room between the pill and neighbouring cells
const SPRING = { damping: 17, stiffness: 230, mass: 0.8 } as const;

/**
 * One tab: icon + label.
 *
 * The active state is driven by a single 0..1 `progress` value so the icon
 * colour, lift, scale and label emphasis all move together instead of
 * snapping. The muted and the accent icon are stacked and cross-faded, which
 * is how the colour change becomes smooth - SVG stroke colours cannot be
 * animated directly.
 */
const TabButton: React.FC<{
  tab: TabDef;
  isActive: boolean;
  label: string;
  onPress: () => void;
}> = ({ tab, isActive, label, onPress }) => {
  const progress = useSharedValue(isActive ? 1 : 0);
  const press = useSharedValue(1);

  useEffect(() => {
    progress.value = withSpring(isActive ? 1 : 0, { damping: 15, stiffness: 240 });
  }, [isActive, progress]);

  const iconWrapStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [0, -2.5]) },
      { scale: interpolate(progress.value, [0, 1], [1, 1.14]) * press.value },
    ],
  }));
  const mutedIconStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));
  const activeIconStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0.7, 1]),
    transform: [{ translateY: interpolate(progress.value, [0, 1], [0, -1.5]) }],
  }));

  const Icon = tab.Icon;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        press.value = withTiming(0.86, { duration: 90 });
      }}
      onPressOut={() => {
        press.value = withSpring(1, { damping: 12, stiffness: 320 });
      }}
      style={styles.tabItem}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={label}
      hitSlop={4}
    >
      <Animated.View style={[styles.iconWrap, iconWrapStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.iconLayer, mutedIconStyle]}>
          <Icon color={colors.textMuted} size={20} strokeWidth={2} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, styles.iconLayer, activeIconStyle]}>
          <Icon color={colors.primary} size={20} strokeWidth={2.4} />
        </Animated.View>
      </Animated.View>

      <Animated.Text
        numberOfLines={1}
        style={[styles.tabLabel, isActive && styles.tabLabelActive, labelStyle]}
      >
        {label}
      </Animated.Text>
    </Pressable>
  );
};

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  activeTab: externalActiveTab,
  onSelectTab,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [internalActiveTab, setInternalActiveTab] = useState<TabType>('home');
  const currentTab = externalActiveTab || internalActiveTab;
  const activeIndex = Math.max(0, TABS.findIndex((tab) => tab.id === currentTab));

  // Measured from the panel itself so the pill lines up on any phone width.
  const [panelWidth, setPanelWidth] = useState(0);
  const tabWidth = panelWidth > 0 ? (panelWidth - BAR_PADDING * 2) / TABS.length : 0;
  const pillWidth = Math.max(0, tabWidth - PILL_GAP * 2);
  const pillTargetX = activeIndex * tabWidth + PILL_GAP;

  const pillX = useSharedValue(0);
  const stretch = useSharedValue(1);
  const hasPositionedRef = useRef(false);

  useEffect(() => {
    if (tabWidth === 0) return;
    if (!hasPositionedRef.current) {
      // First paint: snap to the active tab. Sliding in from the corner would
      // read as a glitch, not an entrance.
      pillX.value = pillTargetX;
      hasPositionedRef.current = true;
      return;
    }
    pillX.value = withSpring(pillTargetX, SPRING);
    // Squash-and-stretch as it travels, so the move has weight.
    stretch.value = withSequence(
      withTiming(1.2, { duration: 110 }),
      withSpring(1, { damping: 9, stiffness: 190 })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pillTargetX, tabWidth]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.value }, { scaleX: stretch.value }],
  }));

  const handleSelect = (tab: TabType) => {
    if (tab !== currentTab) Haptics.selectionAsync().catch(() => {});
    setInternalActiveTab(tab);
    onSelectTab?.(tab);
  };

  const bottomOffset = Math.max(14, insets.bottom + 8);

  return (
    <Animated.View
      entering={SlideInDown.springify().damping(18).stiffness(160)}
      exiting={SlideOutDown.duration(180)}
      style={[styles.outerContainer, { bottom: bottomOffset }]}
      pointerEvents="box-none"
    >
      {/* Fades the page out behind the bar. With the system navigation bar
          hidden there is a thin strip under the floating bar, and content
          scrolling through it looked cut off. */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(248, 250, 252, 0)', 'rgba(248, 250, 252, 0.94)', colors.canvas]}
        locations={[0, 0.55, 1]}
        style={[styles.scrim, { bottom: -bottomOffset, height: 66 + bottomOffset + 44 }]}
      />
      <GlassPanel
        borderRadius={32}
        borderColor={alpha(colors.primary, 0.12)}
        fillColor="rgba(255, 255, 255, 0.97)"
        style={styles.navBarPanel}
        contentStyle={styles.navBarContent}
        onLayout={(e) => setPanelWidth(e.nativeEvent.layout.width)}
      >
        {tabWidth > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[styles.pill, { width: pillWidth }, pillStyle]}
          >
            <LinearGradient
              colors={[alpha(colors.primary, 0.17), alpha(colors.accent, 0.11)]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        )}

        {TABS.map((tab) => (
          <TabButton
            key={tab.id}
            tab={tab}
            isActive={tab.id === currentTab}
            label={t(tab.labelKey)}
            onPress={() => handleSelect(tab.id)}
          />
        ))}
      </GlassPanel>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 50,
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  navBarPanel: {
    width: '94%',
    maxWidth: 460,
    shadowColor: colors.primaryDeep,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 12,
  },
  navBarContent: {
    flexDirection: 'row',
    alignItems: 'stretch',
    height: 66,
    padding: BAR_PADDING,
  },
  pill: {
    position: 'absolute',
    top: BAR_PADDING,
    bottom: BAR_PADDING,
    left: BAR_PADDING,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: alpha(colors.primary, 0.2),
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  iconWrap: {
    width: 22,
    height: 22,
  },
  iconLayer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.1,
  },
  tabLabelActive: {
    color: colors.primary,
    fontWeight: '800',
  },
});
