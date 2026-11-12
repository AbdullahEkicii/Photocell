import React, { useState } from 'react';
import { enter } from '../../theme/motion';
import { View, Text, StyleSheet, Pressable, StyleProp, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Globe, Settings, RefreshCw, Sparkles } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { colors, glass } from '../../theme/colors';
import { resolveSupportedLanguage } from '../../i18n/languages';
import { LanguagePickerModal } from '../settings/LanguagePickerModal';
import { LiquidGlass } from '../glass/LiquidGlass';

const BUTTON_SIZE = 44; // HIG: 44 x 44 pt default control size

/**
 * Height of the header bar below the status bar. Scrolling screens extend under it:
 * give the list `style={underHeader}` and add HEADER_BAR_HEIGHT to its top padding,
 * so content scrolls beneath the bar and fades out at its edge.
 */
export const HEADER_BAR_HEIGHT = 68;
export const underHeader = { marginTop: -HEADER_BAR_HEIGHT } as const;

/**
 * Round floating control used in every header: a glass circle (the functional layer),
 * with a spring on press. Symbols stay monochrome; colour is kept for the one primary
 * action per screen.
 */
export const HeaderIconButton: React.FC<{
  onPress?: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}> = ({ onPress, children, style, accessibilityLabel }) => {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.();
      }}
      onPressIn={() => {
        scale.value = withSpring(0.9, { damping: 14, stiffness: 420 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 12, stiffness: 320 });
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
    >
      <Animated.View style={animatedStyle}>
        <LiquidGlass
          blur="frosted"
          borderRadius={BUTTON_SIZE / 2}
          style={[styles.glassButtonShell, style]}
          contentStyle={styles.glassButtonContent}
        >
          {children}
        </LiquidGlass>
      </Animated.View>
    </Pressable>
  );
};

interface ScreenHeaderProps {
  /** Left-aligned title. Tab screens pass the app/section name, sub-screens their own title. */
  title: string;
  /** Renders a back button before the title (sub-screens). */
  onBack?: () => void;
  /** Adds a refresh action on the right. */
  onRefresh?: () => void;
  /** Adds a settings action on the right. */
  onOpenSettings?: () => void;
  /** Extra right-hand actions, rendered before refresh/settings. */
  rightSlot?: React.ReactNode;
  /** Shows the TR/EN toggle on the right and the brand mark (tab screens). Ignored when onBack is set. */
  showLanguageToggle?: boolean;
  /** Shows the brand mark without the language toggle. */
  brand?: boolean;
}

/**
 * The single header used by every screen.
 *
 * A frosted bar that sits ABOVE the content: the page runs straight up behind the
 * status bar and fades out under the bar's lower edge (Apple's "scroll edge effect",
 * used instead of a solid bar). Only the controls on it are glass.
 */
export const ScreenHeader: React.FC<ScreenHeaderProps> = ({
  title,
  onBack,
  onRefresh,
  onOpenSettings,
  rightSlot,
  showLanguageToggle = false,
  brand = false,
}) => {
  const { i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const [pickerVisible, setPickerVisible] = useState(false);
  const languageCode = resolveSupportedLanguage(i18n.language).toUpperCase();
  const showBrand = !onBack && (brand || showLanguageToggle);

  return (
    // Reserves the bar's height in the layout; the bar itself is drawn over the content.
    <View style={styles.slot} pointerEvents="box-none">
      <Animated.View
        entering={enter(FadeInDown.duration(420).springify().damping(18))}
        pointerEvents="box-none"
        style={[
          styles.bar,
          { top: -insets.top, height: HEADER_BAR_HEIGHT + insets.top + EDGE_FADE, paddingTop: insets.top },
        ]}
      >
        {/* Scroll edge effect: solid at the top, fading to nothing below the bar. */}
        <LinearGradient
          pointerEvents="none"
          colors={[glass.edgeSolid, glass.edgeSolid, glass.edgeClear]}
          locations={[0, 0.78, 1]}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.row} pointerEvents="box-none">
          <View style={styles.titleGroup}>
            {onBack ? (
              <HeaderIconButton onPress={onBack} accessibilityLabel="Back">
                <ArrowLeft color={colors.textPrimary} size={20} strokeWidth={2.4} />
              </HeaderIconButton>
            ) : showBrand ? (
              <LinearGradient
                colors={[colors.primary, colors.accent]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.brandMark}
              >
                <Sparkles color={colors.textOnAccent} size={19} strokeWidth={2.4} />
              </LinearGradient>
            ) : null}

            <Text
              style={styles.title}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
            >
              {title}
            </Text>
          </View>

          <View style={styles.actions}>
            {rightSlot}
            {onRefresh && (
              <HeaderIconButton onPress={onRefresh} accessibilityLabel="Refresh">
                <RefreshCw color={colors.textSecondary} size={18} strokeWidth={2.3} />
              </HeaderIconButton>
            )}
            {showLanguageToggle && !onBack && (
              <HeaderIconButton
                onPress={() => setPickerVisible(true)}
                accessibilityLabel="Language"
              >
                <View style={styles.langInner}>
                  <Globe color={colors.primary} size={15} strokeWidth={2.4} />
                  <Text style={styles.langText}>{languageCode}</Text>
                </View>
              </HeaderIconButton>
            )}
            {onOpenSettings && (
              <HeaderIconButton onPress={onOpenSettings} accessibilityLabel="Settings">
                <Settings color={colors.textSecondary} size={19} strokeWidth={2.3} />
              </HeaderIconButton>
            )}
          </View>
        </View>
      </Animated.View>

      <LanguagePickerModal visible={pickerVisible} onClose={() => setPickerVisible(false)} />
    </View>
  );
};

/** Extra band below the bar over which content fades out. */
const EDGE_FADE = 14;

const styles = StyleSheet.create({
  slot: {
    height: HEADER_BAR_HEIGHT,
    zIndex: 30,
  },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    justifyContent: 'flex-start',
  },
  row: {
    height: HEADER_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 6,
    gap: 10,
  },
  titleGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  brandMark: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flexShrink: 1,
    fontSize: 21,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  glassButtonShell: {
    minWidth: BUTTON_SIZE,
    height: BUTTON_SIZE,
  },
  glassButtonContent: {
    minWidth: BUTTON_SIZE,
    height: BUTTON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  langInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  langText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginLeft: 5,
  },
});
