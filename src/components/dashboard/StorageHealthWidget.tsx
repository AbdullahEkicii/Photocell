import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInDown, useSharedValue, useAnimatedStyle, withTiming, withSequence } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Zap, Cpu, Sparkles, HardDrive } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';

import { GlassPanel } from '../glass/GlassPanel';
import { colors } from '../../theme/colors';

export const StorageHealthWidget: React.FC = () => {
  const { t } = useTranslation();
  const [boosting, setBoosting] = useState<boolean>(false);
  const [boosted, setBoosted] = useState<boolean>(false);

  const scale = useSharedValue(1);
  const animatedButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handleTurboBoost = async () => {
    if (boosting) return;
    setBoosting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});

    scale.value = withSequence(withTiming(0.95, { duration: 150 }), withTiming(1.02, { duration: 200 }), withTiming(1, { duration: 150 }));

    try {
      // 1. Clean app cache directory
      const cacheDir = FileSystem.cacheDirectory;
      if (cacheDir) {
        const files = await FileSystem.readDirectoryAsync(cacheDir).catch(() => []);
        for (const file of files) {
          if (file.endsWith('.jpg') || file.endsWith('.png') || file.endsWith('.tmp')) {
            await FileSystem.deleteAsync(`${cacheDir}${file}`, { idempotent: true }).catch(() => {});
          }
        }
      }

      // GC Breathing pause
      await new Promise((resolve) => setTimeout(resolve, 600));

      setBoosting(false);
      setBoosted(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert(t('general.success'), t('storage_widget.turbo_success'));
    } catch (err) {
      setBoosting(false);
    }
  };

  return (
    <Animated.View entering={FadeInDown.duration(600).delay(150)} style={styles.container}>
      <GlassPanel
        borderRadius={28}
        borderColor="rgba(0, 242, 254, 0.3)"
        style={styles.panel}
        contentStyle={styles.content}
        intensity={30}
        glowAccent={colors.neonCyan}
      >
        {/* Top Title & Health Status */}
        <View style={styles.topRow}>
          <View style={styles.titleGroup}>
            <HardDrive color={colors.neonCyan} size={16} style={{ marginRight: 6 }} />
            <Text style={styles.titleText} numberOfLines={1} ellipsizeMode="tail">
              {t('storage_widget.title')}
            </Text>
          </View>
          <View style={styles.healthScorePill}>
            <Sparkles color={colors.successMint} size={11} style={{ marginRight: 4 }} />
            <Text style={styles.healthScoreText} numberOfLines={1}>
              {t('storage_widget.health_score', '%98 SAĞLIKLI')}
            </Text>
          </View>
        </View>

        {/* Storage Multi-segment Progress Bar */}
        <View style={styles.barTrack}>
          <View style={[styles.barSegment, { width: '42%', backgroundColor: colors.neonCyan }]} />
          <View style={[styles.barSegment, { width: '28%', backgroundColor: colors.electricPurple }]} />
          <View style={[styles.barSegment, { width: '12%', backgroundColor: colors.warningAmber }]} />
          <View style={[styles.barSegment, { width: '18%', backgroundColor: 'rgba(255, 255, 255, 0.15)' }]} />
        </View>

        {/* Legend Dots */}
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.neonCyan }]} />
            <Text style={styles.legendText}>{t('storage_widget.photos_label')}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.electricPurple }]} />
            <Text style={styles.legendText}>{t('storage_widget.videos_label')}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.warningAmber }]} />
            <Text style={styles.legendText}>{t('storage_widget.system_label')}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: 'rgba(255, 255, 255, 0.3)' }]} />
            <Text style={styles.legendText}>{t('storage_widget.free_label')}</Text>
          </View>
        </View>

        {/* 1-Tap Turbo Boost Button */}
        <Animated.View style={animatedButtonStyle}>
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={handleTurboBoost}
            disabled={boosting}
            style={styles.boostButton}
          >
            <LinearGradient
              colors={boosted ? ['#059669', '#10B981'] : ['rgba(0, 242, 254, 0.25)', 'rgba(168, 85, 247, 0.25)']}
              style={styles.boostGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {boosting ? (
                <ActivityIndicator color="#FFF" size="small" style={{ marginRight: 8 }} />
              ) : (
                <Zap color={boosted ? '#FFF' : colors.neonCyan} size={16} style={{ marginRight: 8 }} />
              )}
              <Text style={[styles.boostText, boosted && { color: '#FFF' }]}>
                {t('storage_widget.turbo_clean')}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </GlassPanel>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 20,
    marginBottom: 16,
  },
  panel: {
    borderRadius: 28,
  },
  content: {
    padding: 16,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 12,
  },
  titleGroup: {
    flex: 1,
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 4,
  },
  titleText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textPrimary,
    flexShrink: 1,
  },
  healthScorePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    flexShrink: 0,
  },
  healthScoreText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.successMint,
    letterSpacing: 0.5,
  },
  barTrack: {
    height: 8,
    borderRadius: 4,
    flexDirection: 'row',
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: 12,
  },
  barSegment: {
    height: '100%',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  legendText: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: '700',
  },
  boostButton: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0, 242, 254, 0.35)',
  },
  boostGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  boostText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.neonCyan,
  },
});
