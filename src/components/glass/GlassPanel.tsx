import React from 'react';
import { View, StyleSheet, ViewProps, ViewStyle, StyleProp } from 'react-native';
import { Canvas, BackdropFilter, Fill, Blur } from '@shopify/react-native-skia';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../theme/colors';

interface GlassPanelProps extends ViewProps {
  intensity?: number;
  borderRadius?: number;
  contentStyle?: StyleProp<ViewStyle>;
  borderColor?: string;
  fillColor?: string;
  glowAccent?: string;
}

export const GlassPanel: React.FC<GlassPanelProps> = ({ 
  children, 
  style, 
  intensity = 25,
  borderRadius = 28,
  borderColor = colors.whiteBorder,
  fillColor = colors.surfaceCard,
  glowAccent,
  contentStyle,
  ...rest 
}) => {
  return (
    <View style={[styles.container, { borderRadius, borderColor }, style]} {...rest}>
      {/* Skia Backdrop Blur */}
      <Canvas style={StyleSheet.absoluteFill}>
        <BackdropFilter filter={<Blur blur={intensity} />} clip={{ x: 0, y: 0, width: 10000, height: 10000 }}>
          <Fill color={fillColor} />
        </BackdropFilter>
      </Canvas>

      {/* Top Edge Light Specular Line */}
      <LinearGradient
        colors={['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.3)', 'transparent']}
        style={styles.topSheenLine}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        pointerEvents="none"
      />

      {/* Subtle Dynamic Accent Tint */}
      {glowAccent && (
        <LinearGradient
          colors={[`${glowAccent}12`, 'transparent']}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.7, y: 0.7 }}
          pointerEvents="none"
        />
      )}

      {/* Light Specular Surface Gradient */}
      <LinearGradient
        colors={['rgba(255, 255, 255, 0.65)', 'rgba(255, 255, 255, 0.25)', 'transparent']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.8, y: 0.8 }}
        pointerEvents="none"
      />

      <View style={[styles.content, contentStyle]}>
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderWidth: 1,
    backgroundColor: colors.surfaceCard,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 4,
  },
  topSheenLine: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    height: 1.2,
    zIndex: 2,
  },
  content: {
    zIndex: 1,
  },
});
