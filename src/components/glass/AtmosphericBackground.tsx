import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withRepeat, 
  withTiming, 
  Easing, 
  withSequence 
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../theme/colors';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const AtmosphericBackground: React.FC = () => {
  const orb1X = useSharedValue(0);
  const orb1Y = useSharedValue(0);

  const orb2X = useSharedValue(0);
  const orb2Y = useSharedValue(0);

  useEffect(() => {
    orb1X.value = withRepeat(
      withSequence(
        withTiming(25, { duration: 5500, easing: Easing.inOut(Easing.ease) }),
        withTiming(-15, { duration: 5500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    orb1Y.value = withRepeat(
      withSequence(
        withTiming(-30, { duration: 6500, easing: Easing.inOut(Easing.ease) }),
        withTiming(20, { duration: 6500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    orb2X.value = withRepeat(
      withSequence(
        withTiming(-30, { duration: 6000, easing: Easing.inOut(Easing.ease) }),
        withTiming(20, { duration: 6000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    orb2Y.value = withRepeat(
      withSequence(
        withTiming(25, { duration: 5000, easing: Easing.inOut(Easing.ease) }),
        withTiming(-15, { duration: 5000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const animatedOrb1Style = useAnimatedStyle(() => ({
    transform: [{ translateX: orb1X.value }, { translateY: orb1Y.value }],
  }));

  const animatedOrb2Style = useAnimatedStyle(() => ({
    transform: [{ translateX: orb2X.value }, { translateY: orb2Y.value }],
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Light Porcelain Base Background */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#F8FAFC' }]} />

      {/* Top Left Soft Amethyst Mesh Glow */}
      <Animated.View style={[styles.orbContainer, styles.orbViolet, animatedOrb1Style]}>
        <LinearGradient
          colors={['rgba(147, 51, 234, 0.12)', 'rgba(192, 132, 252, 0.04)', 'transparent']}
          style={styles.gradientCircle}
          start={{ x: 0.2, y: 0.2 }}
          end={{ x: 0.8, y: 0.8 }}
        />
      </Animated.View>

      {/* Bottom Right Soft Emerald Mesh Glow */}
      <Animated.View style={[styles.orbContainer, styles.orbEmerald, animatedOrb2Style]}>
        <LinearGradient
          colors={['rgba(16, 185, 129, 0.12)', 'rgba(52, 211, 153, 0.04)', 'transparent']}
          style={styles.gradientCircle}
          start={{ x: 0.8, y: 0.2 }}
          end={{ x: 0.2, y: 0.8 }}
        />
      </Animated.View>

      {/* Soft Light Overlay */}
      <LinearGradient
        colors={['rgba(255, 255, 255, 0.6)', 'transparent', 'rgba(241, 245, 249, 0.5)']}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  orbContainer: {
    position: 'absolute',
    borderRadius: 999,
    overflow: 'hidden',
  },
  gradientCircle: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
  orbViolet: {
    top: -SCREEN_WIDTH * 0.15,
    left: -SCREEN_WIDTH * 0.15,
    width: SCREEN_WIDTH * 1.1,
    height: SCREEN_WIDTH * 1.1,
    opacity: 0.9,
  },
  orbEmerald: {
    bottom: -SCREEN_WIDTH * 0.1,
    right: -SCREEN_WIDTH * 0.2,
    width: SCREEN_WIDTH * 1.1,
    height: SCREEN_WIDTH * 1.1,
    opacity: 0.9,
  },
});
