import React from 'react';
import { Platform, StyleSheet, View, StyleProp, ViewStyle, ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, glass, radius as radii, alpha } from '../../theme/colors';
import { useGlassEnabled } from './glassSettings';
import { useGlassTarget } from './GlassTarget';

interface LiquidGlassProps extends ViewProps {
  /**
   * regular: legible over anything (default).
   * clear: highly translucent, ONLY for controls floating over photos or video.
   */
  variant?: 'regular' | 'clear';
  /** Apple's 35% dark dimming layer behind clear glass over bright media. */
  dim?: boolean;
  /**
   * Accent for a single prominent action: the glass takes this colour as its
   * background (HIG: "color the background rather than the symbol or label").
   */
  tint?: string;
  /**
   * 'live' blurs what is behind the surface (the surface must sit outside the blur
   * target on Android). 'frosted' skips blur and relies on a more opaque fill; use it
   * for surfaces that live inside the target or in a separate window (modals).
   */
  blur?: 'live' | 'frosted';
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

/**
 * Liquid-glass surface for the functional layer: bars, floating controls, sheets.
 * Never put it behind cards or list rows (HIG > Materials > Liquid Glass).
 *
 * With glass disabled (Settings switch, or iOS Reduce Transparency) it becomes an
 * opaque, bordered surface with the same shape.
 */
export const LiquidGlass: React.FC<LiquidGlassProps> = ({
  variant = 'regular',
  dim = false,
  tint,
  blur = 'live',
  borderRadius = radii.panel,
  style,
  contentStyle,
  children,
  ...rest
}) => {
  const enabled = useGlassEnabled();
  const target = useGlassTarget();
  const isClear = variant === 'clear';

  // Android needs a registered target; iOS blurs the backdrop on its own.
  const liveBlur =
    enabled && blur === 'live' && (Platform.OS === 'ios' || (Platform.OS === 'android' && !!target));

  const fill = !enabled
    ? glass.fallbackFill
    : isClear
      ? glass.clearFill
      : liveBlur
        ? glass.regularFill
        : glass.frostedFill;

  return (
    <View
      {...rest}
      style={[
        styles.shell,
        Platform.OS === 'ios' && enabled && styles.iosShadow,
        { borderRadius },
        style,
      ]}
    >
      <View style={[styles.clip, { borderRadius }]}>
        {liveBlur && (
          <BlurView
            tint="light"
            intensity={isClear ? glass.clearBlur : glass.regularBlur}
            blurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
            blurTarget={target ?? undefined}
            style={StyleSheet.absoluteFill}
          />
        )}

        <View style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} />
        {enabled && dim && <View style={[StyleSheet.absoluteFill, { backgroundColor: glass.dim }]} />}
        {tint && <View style={[StyleSheet.absoluteFill, { backgroundColor: alpha(tint, enabled ? 0.9 : 1) }]} />}

        {enabled && (
          <LinearGradient
            pointerEvents="none"
            colors={[glass.highlightTop, 'transparent']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={[styles.highlight, { borderTopLeftRadius: borderRadius, borderTopRightRadius: borderRadius }]}
          />
        )}

        <View style={[styles.content, contentStyle]}>{children}</View>

        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            styles.rim,
            {
              borderRadius,
              borderColor: enabled ? (isClear ? glass.rimClear : glass.rim) : colors.border,
            },
          ]}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  shell: {
    backgroundColor: 'transparent',
  },
  // A soft shadow under the glass; Android draws a shadow through translucent fills as
  // pale artifacts, so it only gets the rim there.
  iosShadow: {
    shadowColor: colors.primaryDeep,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
  },
  clip: {
    overflow: 'hidden',
    flexShrink: 1,
  },
  content: {
    flexShrink: 1,
  },
  highlight: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '55%',
    opacity: 0.55,
  },
  rim: {
    borderWidth: 1,
  },
});
