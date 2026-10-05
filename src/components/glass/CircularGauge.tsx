import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  Canvas,
  SweepGradient,
  Circle,
  Path,
  Group,
  Skia,
  vec,
} from '@shopify/react-native-skia';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../theme/colors';

interface CircularGaugeProps {
  value: string;
  unit: string;
  size?: number;
  strokeWidth?: number;
  /**
   * How much of the ring to fill, 0-1. Defaults to a full ring for gauges that
   * display a value rather than progress. Before this existed the ring was
   * always complete, so the scan screen looked frozen at 100%.
   */
  progress?: number;
}

export const CircularGauge: React.FC<CircularGaugeProps> = ({
  value,
  unit,
  size = 220,
  strokeWidth = 14,
  progress = 1,
}) => {
  const center = size / 2;
  const radius = center - strokeWidth / 2 - 8;
  const clampedProgress = Math.max(0, Math.min(1, progress));

  const ringPath = useMemo(() => Skia.Path.Circle(center, center, radius), [center, radius]);

  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: center }]}>
      <Canvas style={StyleSheet.absoluteFill}>
        {/* Track */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          style="stroke"
          strokeWidth={strokeWidth}
          color={colors.surfaceSunken}
        />

        {/* Filled arc, rotated so it starts at twelve o'clock */}
        <Group transform={[{ rotate: -Math.PI / 2 }]} origin={vec(center, center)}>
          <Path
            path={ringPath}
            style="stroke"
            strokeWidth={strokeWidth}
            strokeCap="round"
            start={0}
            end={clampedProgress}
          >
            <SweepGradient
              c={vec(center, center)}
              colors={[colors.primary, colors.accent, colors.primarySoft, colors.primary]}
              start={0}
              end={360}
            />
          </Path>
        </Group>
      </Canvas>

      <LinearGradient
        colors={['rgba(255, 255, 255, 0.9)', 'transparent']}
        style={styles.topSheen}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        pointerEvents="none"
      />

      <View style={styles.innerContent}>
        <Text style={[styles.valueText, { fontSize: size * 0.2 }]} numberOfLines={1}>
          {value}
        </Text>
        <Text style={styles.unitText}>{unit}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceCard,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 20,
    elevation: 6,
  },
  topSheen: {
    position: 'absolute',
    top: 0,
    width: '60%',
    height: 1.5,
    zIndex: 5,
  },
  innerContent: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    paddingHorizontal: 12,
  },
  valueText: {
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: -1.5,
  },
  unitText: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.primary,
    marginTop: 2,
    letterSpacing: 2.2,
  },
});
