import React from 'react';
import { View, StyleSheet, ViewProps, ViewStyle, StyleProp } from 'react-native';
import { colors, elevation, radius } from '../../theme/colors';

interface GlassPanelProps extends ViewProps {
  /** Kept for API compatibility. The panel no longer runs a live backdrop blur. */
  intensity?: number;
  borderRadius?: number;
  contentStyle?: StyleProp<ViewStyle>;
  borderColor?: string;
  fillColor?: string;
  /** Kept for API compatibility; cards no longer carry an accent wash. */
  glowAccent?: string;
}

// The canvas the panels sit on, in the active theme (light or dark).
const CANVAS_RGB = [
  parseInt(colors.canvas.slice(1, 3), 16),
  parseInt(colors.canvas.slice(3, 5), 16),
  parseInt(colors.canvas.slice(5, 7), 16),
];

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
  let r: number;
  let g: number;
  let b: number;
  let a = 1;

  const hex = fill.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  const rgba = fill.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/i);

  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
    if (h.length === 8) a = parseInt(h.slice(6, 8), 16) / 255;
  } else if (rgba) {
    r = parseInt(rgba[1], 10);
    g = parseInt(rgba[2], 10);
    b = parseInt(rgba[3], 10);
    if (rgba[4] !== undefined) a = Math.max(0, Math.min(1, parseFloat(rgba[4])));
  } else {
    return fill;
  }

  const mix = (value: number, base: number) => Math.round(value * a + base * (1 - a));
  return `rgb(${mix(r, CANVAS_RGB[0])}, ${mix(g, CANVAS_RGB[1])}, ${mix(b, CANVAS_RGB[2])})`;
};

/**
 * Standard-material card for the content layer.
 *
 * The name is historical: this used to fake glass. Per Apple's HIG (Materials) the
 * content layer - cards, rows, backgrounds - uses plain standard surfaces, and
 * Liquid Glass is reserved for the functional layer (see LiquidGlass). So this is an
 * opaque, softly bordered surface with a light shadow, and no sheen.
 */
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
