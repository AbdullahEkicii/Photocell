import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, alpha } from '../../theme/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * Porcelain backdrop with two soft colour washes.
 *
 * The washes used to drift forever via four infinite Reanimated loops on
 * oversized gradient layers, re-running on every screen the user opened. The
 * motion was barely perceptible but kept the UI thread and compositor busy
 * for the whole session. Static layers look the same and cost nothing.
 */
const AtmosphericBackgroundBase: React.FC = () => (
  <View style={StyleSheet.absoluteFill} pointerEvents="none">
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.canvas }]} />

    <LinearGradient
      colors={[alpha(colors.primary, 0.12), alpha(colors.primarySoft, 0.04), 'transparent']}
      style={[styles.orb, styles.orbTop]}
      start={{ x: 0.2, y: 0.2 }}
      end={{ x: 0.8, y: 0.8 }}
    />

    <LinearGradient
      colors={[alpha(colors.successMint, 0.11), alpha(colors.successLight, 0.04), 'transparent']}
      style={[styles.orb, styles.orbBottom]}
      start={{ x: 0.8, y: 0.2 }}
      end={{ x: 0.2, y: 0.8 }}
    />
  </View>
);

export const AtmosphericBackground = React.memo(AtmosphericBackgroundBase);

const styles = StyleSheet.create({
  orb: {
    position: 'absolute',
    width: SCREEN_WIDTH * 1.1,
    height: SCREEN_WIDTH * 1.1,
    borderRadius: 999,
  },
  orbTop: {
    top: -SCREEN_WIDTH * 0.15,
    left: -SCREEN_WIDTH * 0.15,
  },
  orbBottom: {
    bottom: -SCREEN_WIDTH * 0.1,
    right: -SCREEN_WIDTH * 0.2,
  },
});
