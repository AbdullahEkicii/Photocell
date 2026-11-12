import React, { useCallback } from 'react';
import { Pressable, PressableProps, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { GlassPanel } from './GlassPanel';
import { colors } from '../../theme/colors';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface GlassButtonProps extends PressableProps {
  children: React.ReactNode;
  borderRadius?: number;
  borderColor?: string;
  intensity?: number;
  glowColor?: string;
  contentStyle?: StyleProp<ViewStyle>;
  /** Tighter padding for inline/list buttons that set an explicit height. */
  compact?: boolean;
}

export const GlassButton: React.FC<GlassButtonProps> = ({
  children,
  onPress,
  borderRadius = 24,
  borderColor = colors.border,
  intensity = 30,
  glowColor = colors.primary,
  contentStyle,
  compact = false,
  style,
  disabled,
  ...rest
}) => {
  const scale = useSharedValue(1);

  const handlePressIn = useCallback((e: any) => {
    if (disabled) return;
    scale.value = withSpring(0.96, { damping: 15, stiffness: 400 });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (rest.onPressIn) rest.onPressIn(e);
  }, [scale, disabled, rest]);

  const handlePressOut = useCallback((e: any) => {
    if (disabled) return;
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
    if (rest.onPressOut) rest.onPressOut(e);
  }, [scale, disabled, rest]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: disabled ? 0.45 : 1,
  }));

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={[styles.button, { shadowColor: glowColor }, style as any, animatedStyle]}
    >
      <GlassPanel
        style={styles.panel}
        contentStyle={[
          styles.panelContent,
          compact ? styles.panelContentCompact : null,
          contentStyle,
        ]}
        borderRadius={borderRadius}
        borderColor={borderColor}
        intensity={intensity}
      >
        <LinearGradient
          colors={['rgba(255, 255, 255, 0.55)', 'transparent']}
          style={styles.buttonTopGlow}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          pointerEvents="none"
        />
        {children}
      </GlassPanel>
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  button: {
    width: '100%',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 6,
  },
  panel: {
    width: '100%',
    // Fill the pressable so callers that set an explicit height get a panel of
    // that height rather than one sized purely by its padding.
    flexGrow: 1,
  },
  buttonTopGlow: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
    height: 1,
  },
  panelContent: {
    flexGrow: 1,
    // Row by default: nearly every button is an icon followed by a label, and
    // a column here silently stacks them.
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelContentCompact: {
    paddingVertical: 0,
    paddingHorizontal: 12,
  },
});
