import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Image, Dimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withRepeat,
  Easing,
  runOnJS,
  FadeOut
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Sparkles } from 'lucide-react-native';

import { AtmosphericBackground } from '../glass/AtmosphericBackground';
import { GlassPanel } from '../glass/GlassPanel';
import { colors, alpha } from '../../theme/colors';

const { width } = Dimensions.get('window');

interface Props {
  onFinish: () => void;
}

export const CustomSplashScreen: React.FC<Props> = ({ onFinish }) => {
  const { t } = useTranslation();

  const iconScale = useSharedValue(0.4);
  const iconOpacity = useSharedValue(0);
  const progressWidth = useSharedValue(0);

  useEffect(() => {
    // 1. App Icon spring bounce entrance
    iconOpacity.value = withTiming(1, { duration: 400 });
    iconScale.value = withSpring(1, { damping: 12, stiffness: 220 });

    // 2. Linear loading progress bar (0% -> 100% over 1.6 seconds)
    progressWidth.value = withTiming(
      1,
      { duration: 1600, easing: Easing.inOut(Easing.ease) },
      (finished) => {
        if (finished) {
          runOnJS(onFinish)();
        }
      }
    );
  }, []);

  const animatedIconStyle = useAnimatedStyle(() => ({
    opacity: iconOpacity.value,
    transform: [{ scale: iconScale.value }],
  }));

  const animatedProgressStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value * 100}%`,
  }));

  return (
    <Animated.View exiting={FadeOut.duration(450)} style={styles.container}>
      {/* Light Porcelain Atmospheric Mesh Background */}
      <AtmosphericBackground />

      <View style={styles.centerContainer}>
        {/* Glowing Specular Glass App Icon Hub */}
        <Animated.View style={[styles.iconWrapper, animatedIconStyle]}>
          <GlassPanel
            borderRadius={40}
            borderColor={alpha(colors.primary, 0.28)}
            fillColor="rgba(255, 255, 255, 0.9)"
            glowAccent={colors.primary}
            style={styles.iconGlassCard}
            contentStyle={styles.iconGlassContent}
          >
            <Image
              source={require('../../../assets/photocell512px.png')}
              style={styles.appIconImage}
              resizeMode="contain"
            />
          </GlassPanel>
        </Animated.View>

        {/* Dynamic Localized App Name (FotoSil / PhotoCell) */}
        <Text style={styles.appTitle}>
          {t('dashboard.app_title', 'PhotoCell')}
        </Text>

        {/* Subtitle Eyebrow Badge */}
        <View style={styles.badgePill}>
          <Sparkles color={colors.primary} size={13} style={{ marginRight: 6 }} />
          <Text style={styles.badgeText}>
            {t('general.subtitle', 'Depolama Analizi & Optimizasyonu')}
          </Text>
        </View>
      </View>

      {/* Bottom Sleek Loading Progress Indicator */}
      <View style={styles.bottomProgressContainer}>
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, animatedProgressStyle]}>
            <LinearGradient
              colors={[colors.primary, colors.accent]}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            />
          </Animated.View>
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  iconWrapper: {
    width: 140,
    height: 140,
    marginBottom: 24,
  },
  iconGlassCard: {
    width: 140,
    height: 140,
    borderRadius: 40,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 10,
  },
  iconGlassContent: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  appIconImage: {
    width: 90,
    height: 90,
    borderRadius: 22,
  },
  appTitle: {
    fontSize: 34,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: -1.2,
    marginBottom: 10,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: alpha(colors.primary, 0.08),
    borderWidth: 1,
    borderColor: alpha(colors.primary, 0.22),
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 0.5,
  },
  bottomProgressContainer: {
    position: 'absolute',
    bottom: 60,
    left: 40,
    right: 40,
    alignItems: 'center',
  },
  progressTrack: {
    width: '100%',
    maxWidth: 240,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceSunken,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
});
