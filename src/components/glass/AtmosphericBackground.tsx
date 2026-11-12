import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';

/**
 * Flat canvas behind every screen.
 *
 * Per Apple's HIG the content layer stays plain so the glass controls above it have
 * something calm to float over. This used to paint two gradient colour washes; the
 * canvas is now a single solid colour (and costs nothing to draw).
 */
const AtmosphericBackgroundBase: React.FC = () => (
  <View
    style={[StyleSheet.absoluteFill, { backgroundColor: colors.canvas }]}
    pointerEvents="none"
  />
);

export const AtmosphericBackground = React.memo(AtmosphericBackgroundBase);
