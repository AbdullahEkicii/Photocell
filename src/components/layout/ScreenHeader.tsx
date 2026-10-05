import React from 'react';
import { View, Text, StyleSheet, Pressable, StyleProp, ViewStyle } from 'react-native';
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

import { colors, alpha, elevation } from '../../theme/colors';

const BUTTON_SIZE = 42;

/**
 * Round floating action used in every header. Springs down on press so the
 * header feels alive without a heavy animation budget.
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
        scale.value = withSpring(0.88, { damping: 14, stiffness: 420 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 12, stiffness: 320 });
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
    >
      <Animated.View style={[styles.glassButton, animatedStyle, style]}>{children}</Animated.View>
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
 * Tab screens lead with the gradient brand mark and a large left-aligned
 * title; sub-screens lead with a back button. Controls on the right are
 * floating glass buttons, and there is no divider line - the page background
 * runs straight up behind the status bar.
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
  const isTurkish = (i18n.language || 'tr').startsWith('tr');
  const showBrand = !onBack && (brand || showLanguageToggle);

  const toggleLanguage = () => {
    i18n.changeLanguage(isTurkish ? 'en' : 'tr');
  };

  return (
    <Animated.View entering={FadeInDown.duration(420).springify().damping(18)} style={styles.bar}>
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
          <HeaderIconButton onPress={toggleLanguage} style={styles.langButton}>
            <Globe color={colors.primary} size={15} strokeWidth={2.4} />
            <Text style={styles.langText}>{isTurkish ? 'TR' : 'EN'}</Text>
          </HeaderIconButton>
        )}
        {onOpenSettings && (
          <HeaderIconButton onPress={onOpenSettings} accessibilityLabel="Settings">
            <Settings color={colors.textSecondary} size={19} strokeWidth={2.3} />
          </HeaderIconButton>
        )}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 10,
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
    borderWidth: 1,
    borderColor: alpha(colors.surface, 0.5),
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 6,
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
  glassButton: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.whiteBorder,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.card,
  },
  langButton: {
    width: 'auto',
    paddingHorizontal: 12,
    flexDirection: 'row',
    gap: 5,
  },
  langText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
});
