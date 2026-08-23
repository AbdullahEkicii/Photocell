import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Canvas, SweepGradient, Circle, Blur, BackdropFilter, Fill, vec } from '@shopify/react-native-skia';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, withSequence } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../theme/colors';

interface CircularGaugeProps {
  value: string;
  unit: string;
  size?: number;
  strokeWidth?: number;
}

export const CircularGauge: React.FC<CircularGaugeProps> = ({
  value,
  unit,
  size = 220,
  strokeWidth = 14,
}) => {
  const center = size / 2;
  const radius = center - strokeWidth / 2 - 8;

  const pulseScale = useSharedValue(1);

  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.03, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.97, { duration: 2500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const animatedHubStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2 }]}>
      {/* Background Skia Light Glass Circle */}
      <Canvas style={StyleSheet.absoluteFill}>
        <BackdropFilter filter={<Blur blur={25} />} clip={{ x: 0, y: 0, width: size, height: size }}>
          <Fill color={colors.surfaceCard} />
        </BackdropFilter>

        {/* Track Ring */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          style="stroke"
          strokeWidth={strokeWidth}
          color="rgba(226, 232, 240, 0.8)"
        />

        {/* Glowing Gradient Sweep Arc Ring */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          style="stroke"
          strokeWidth={strokeWidth}
        >
          <SweepGradient
            c={vec(center, center)}
            colors={[colors.neonCyan, colors.electricPurple, colors.successMint, colors.neonCyan]}
            start={0}
            end={360}
          />
        </Circle>
      </Canvas>

      {/* Top Specular Sheen Line */}
      <LinearGradient
        colors={['rgba(255, 255, 255, 0.9)', 'transparent']}
        style={styles.topSheen}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />

      {/* Inner Numerical Display with Breathing Hub */}
      <Animated.View style={[styles.innerContent, animatedHubStyle]}>
        <Text style={styles.valueText}>{value}</Text>
        <Text style={styles.unitText}>{unit}</Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1.2,
    borderColor: colors.whiteBorder,
    backgroundColor: colors.surfaceCard,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
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
  },
  valueText: {
    fontSize: 44,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: -1.5,
  },
  unitText: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.neonCyan,
    marginTop: 2,
    letterSpacing: 2.5,
  },
});
