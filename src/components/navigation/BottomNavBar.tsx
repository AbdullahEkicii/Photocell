import React, { useEffect, useRef, useState } from 'react';
import { enter } from '../../theme/motion';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated';
import { Home, Images, Calendar, Layers, ShieldCheck } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { LiquidGlass } from '../glass/LiquidGlass';
import { colors, alpha } from '../../theme/colors';

export type TabType = 'home' | 'photos' | 'timeline' | 'tools' | 'vault';

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
];

const BAR_PADDING = 6;
const PILL_GAP = 3;
const ICON = 22;
const INACTIVE_WIDTH = 50;
const LABEL_CHAR = 8.4; // rough width of one 14 pt bold glyph
const SPRING = { damping: 17, stiffness: 230, mass: 0.8 } as const;

/**
 * Width of a tab. The active tab is as wide as its label needs (expanding label),
 * the others are icon-only and share the rest.
 */
const activeWidthFor = (label: string) =>
  Math.min(150, Math.max(96, ICON + 10 + label.length * LABEL_CHAR + 26));

interface TabButtonProps {
  tab: TabDef;
  isActive: boolean;
  label: string;
  width: number;
  onPress: () => void;
}

/**
 * One tab. Inactive: icon only. Active: the label expands out of the icon with a
 * spring, so the selected tab reads at a glance without a label on every tab.
 */
const TabButton: React.FC<TabButtonProps> = ({ tab, isActive, label, width, onPress }) => {
  const progress = useSharedValue(isActive ? 1 : 0);
  const press = useSharedValue(1);

  useEffect(() => {
    progress.value = withSpring(isActive ? 1 : 0, { damping: 15, stiffness: 240 });
  }, [isActive, progress]);

  const iconWrapStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [0, -1]) },
      { scale: press.value },
    ],
  }));
  const mutedIconStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));
  const activeIconStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const labelStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    maxWidth: interpolate(progress.value, [0, 1], [0, Math.max(0, width - ICON - 24)]),
    marginLeft: interpolate(progress.value, [0, 1], [0, 8]),
  }));

  const Icon = tab.Icon;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        press.value = withTiming(0.88, { duration: 90 });
      }}
      onPressOut={() => {
        press.value = withSpring(1, { damping: 12, stiffness: 320 });
      }}
      style={[styles.tabItem, { width }]}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={label}
      hitSlop={4}
    >
      <Animated.View style={[styles.iconWrap, iconWrapStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.iconLayer, mutedIconStyle]}>
          <Icon color={colors.textMuted} size={ICON} strokeWidth={2} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, styles.iconLayer, activeIconStyle]}>
          <Icon color={colors.primary} size={ICON} strokeWidth={2.4} />
        </Animated.View>
      </Animated.View>

      <Animated.View style={[styles.labelClip, labelStyle]}>
        <Text numberOfLines={1} style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
          {label}
        </Text>
      </Animated.View>
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

  const [panelWidth, setPanelWidth] = useState(0);
  const labels = TABS.map((tab) => t(tab.labelKey));

  // Widths: inactive tabs are fixed, the active one fits its label. If the total would
  // overflow a narrow phone, every tab is scaled down together so the bar never clips.
  const rawWidths = TABS.map((_, i) => (i === activeIndex ? activeWidthFor(labels[i]) : INACTIVE_WIDTH));
  const innerWidth = Math.max(0, panelWidth - BAR_PADDING * 2);
  const rawTotal = rawWidths.reduce((a, b) => a + b, 0);
  const scale = innerWidth > 0 && rawTotal > innerWidth ? innerWidth / rawTotal : 1;
  const widths = rawWidths.map((w) => w * scale);
  const xs = widths.map((_, i) => widths.slice(0, i).reduce((a, b) => a + b, 0));

  const pillTargetX = (xs[activeIndex] ?? 0) + PILL_GAP;
  const pillTargetW = Math.max(0, (widths[activeIndex] ?? 0) - PILL_GAP * 2);

  const pillX = useSharedValue(0);
  const pillW = useSharedValue(0);
  const hasPositionedRef = useRef(false);

  useEffect(() => {
    if (innerWidth === 0) return;
    if (!hasPositionedRef.current) {
      // First paint: snap, so the bar does not slide in from the corner.
      pillX.value = pillTargetX;
      pillW.value = pillTargetW;
      hasPositionedRef.current = true;
      return;
    }
    pillX.value = withSpring(pillTargetX, SPRING);
    pillW.value = withSpring(pillTargetW, SPRING);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pillTargetX, pillTargetW, innerWidth]);

  const pillStyle = useAnimatedStyle(() => ({
    width: pillW.value,
    transform: [{ translateX: pillX.value }],
  }));

  const handleSelect = (tab: TabType) => {
    if (tab !== currentTab) Haptics.selectionAsync().catch(() => {});
    setInternalActiveTab(tab);
    onSelectTab?.(tab);
  };

  const bottomOffset = Math.max(14, insets.bottom + 8);

  return (
    <Animated.View
      entering={enter(SlideInDown.springify().damping(18).stiffness(160))}
      exiting={SlideOutDown.duration(180)}
      style={[styles.outerContainer, { bottom: bottomOffset }]}
      pointerEvents="box-none"
    >
      <LiquidGlass
        variant="regular"
        blur="live"
        borderRadius={32}
        style={styles.navBarPanel}
        contentStyle={styles.navBarContent}
        onLayout={(e) => setPanelWidth(e.nativeEvent.layout.width)}
      >
        {innerWidth > 0 && (
          <Animated.View pointerEvents="none" style={[styles.pill, pillStyle]}>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: alpha(colors.primary, 0.16) }]} />
          </Animated.View>
        )}

        {TABS.map((tab, i) => (
          <TabButton
            key={tab.id}
            tab={tab}
            isActive={i === activeIndex}
            label={labels[i]}
            width={widths[i]}
            onPress={() => handleSelect(tab.id)}
          />
        ))}
      </LiquidGlass>
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
  navBarPanel: {
    width: '94%',
    maxWidth: 460,
  },
  navBarContent: {
    flexDirection: 'row',
    alignItems: 'stretch',
    height: 64,
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
    borderColor: alpha(colors.primary, 0.22),
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    width: ICON,
    height: ICON,
  },
  iconLayer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelClip: {
    overflow: 'hidden',
  },
  tabLabel: {
    // HIG: 11 pt is the smallest text size
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  tabLabelActive: {
    fontWeight: '800',
  },
});
