import React, { useCallback } from 'react';
import { Pressable, PressableProps, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring 
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
}

export const GlassButton: React.FC<GlassButtonProps> = ({ 
  children, 
  onPress, 
  borderRadius = 32,
  borderColor = colors.whiteBorder,
  intensity = 30,
  glowColor = colors.neonCyan,
  contentStyle,
  style,
  disabled,
  ...rest 
}) => {
  const scale = useSharedValue(1);

  const handlePressIn = useCallback((e: any) => {
    if (disabled) return;
    scale.value = withSpring(0.95, { damping: 15, stiffness: 400 });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (rest.onPressIn) rest.onPressIn(e);
  }, [scale, disabled, rest]);

  const handlePressOut = useCallback((e: any) => {
    if (disabled) return;
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
    if (rest.onPressOut) rest.onPressOut(e);
  }, [scale, disabled, rest]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: disabled ? 0.5 : 1,
  }));

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={[
        styles.button, 
        { shadowColor: glowColor }, 
        style as any, 
        animatedStyle
      ]}
    >
      <GlassPanel 
        style={styles.panel} 
        contentStyle={[styles.panelContent, contentStyle]} 
        borderRadius={borderRadius}
        borderColor={borderColor}
        intensity={intensity}
      >
        <LinearGradient
          colors={['rgba(255, 255, 255, 0.15)', 'transparent']}
          style={styles.buttonTopGlow}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
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
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 8,
  },
  panel: {
    width: '100%',
  },
  buttonTopGlow: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
    height: 1,
  },
  panelContent: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  }
});
