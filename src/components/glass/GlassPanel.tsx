import React from 'react';
import { View, StyleSheet, ViewProps, ViewStyle, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, alpha, elevation, radius } from '../../theme/colors';

interface GlassPanelProps extends ViewProps {
  /** Kept for API compatibility. The panel no longer runs a live backdrop blur. */
  intensity?: number;
  borderRadius?: number;
  contentStyle?: StyleProp<ViewStyle>;
  borderColor?: string;
  fillColor?: string;
  glowAccent?: string;
}

/**
 * Translucent "glass" surface.
 *
 * This used to mount a Skia <Canvas> with a <BackdropFilter> in every panel.
 * A list of 50 cards meant 50 GPU canvases re-blurring the backdrop on every
 * frame — the single biggest FPS and memory cost in the app. The backdrop
 * behind panels is a near-uniform porcelain gradient, so the blur was not
 * visible anyway; a translucent fill plus a soft sheen looks identical and
 * costs two plain views.
 */
const CANVAS_RGB = [248, 250, 252]; // colors.canvas, the surface panels sit on

/**
 * Flattens a translucent fill onto the canvas colour.
 *
 * A translucent background on a view that also has an elevation shadow makes
 * Android draw the shadow through the fill, which left pale rectangles behind
 * text inside cards. Panels sit on a near-uniform light canvas, so the
 * flattened colour looks the same and the view can be drawn opaque - which is
 * also cheaper than blending.
 */
const flattenFill = (fill: string): string => {
  const match = fill.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/i);
  if (!match) return fill;
  const a = match[4] === undefined ? 1 : Math.max(0, Math.min(1, parseFloat(match[4])));
  const channel = (value: string, base: number) => Math.round(parseInt(value, 10) * a + base * (1 - a));
  return `rgb(${channel(match[1], CANVAS_RGB[0])}, ${channel(match[2], CANVAS_RGB[1])}, ${channel(match[3], CANVAS_RGB[2])})`;
};

export const GlassPanel: React.FC<GlassPanelProps> = React.memo(
  ({
    children,
    style,
    borderRadius = radius.panel,
    borderColor = colors.whiteBorder,
    fillColor = colors.surfaceCard,
    glowAccent,
    contentStyle,
    ...rest
  }) => {
    return (
      <View
        style={[styles.container, { borderRadius, borderColor, backgroundColor: flattenFill(fillColor) }, style]}
        {...rest}
      >
        {/* Soft surface sheen, with an optional accent wash blended in. */}
        <LinearGradient
          colors={
            glowAccent
              ? [alpha(glowAccent, 0.07), 'rgba(255, 255, 255, 0.18)', 'transparent']
              : ['rgba(255, 255, 255, 0.55)', 'rgba(255, 255, 255, 0.18)', 'transparent']
          }
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.8, y: 0.8 }}
          pointerEvents="none"
        />

        <View style={[styles.content, contentStyle]}>{children}</View>
      </View>
    );
  }
);

GlassPanel.displayName = 'GlassPanel';

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderWidth: 1,
    ...elevation.card,
  },
  content: {
    zIndex: 1,
  },
});
