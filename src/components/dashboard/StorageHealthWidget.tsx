import React, { useState, useEffect, useCallback } from 'react';
import { enter } from '../../theme/motion';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Zap, HardDrive, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';

import { GlassPanel } from '../glass/GlassPanel';
import { colors, alpha, radius } from '../../theme/colors';
import { formatByteSize } from '../../services/cacheCleaner';
import { getStorageBreakdown, StorageBreakdown } from '../../services/deviceStorage';

/** Segments narrower than this are widened so they stay visible in the bar. */
const MIN_SEGMENT_PERCENT = 1.5;

export const StorageHealthWidget: React.FC = () => {
  const { t } = useTranslation();
  const [storage, setStorage] = useState<StorageBreakdown | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [boosting, setBoosting] = useState<boolean>(false);
  const [freedBytes, setFreedBytes] = useState<number | null>(null);

  const scale = useSharedValue(1);
  const animatedButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const loadStorage = useCallback(async () => {
    const breakdown = await getStorageBreakdown();
    setStorage(breakdown);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadStorage();
  }, [loadStorage]);

  const handleTurboBoost = async () => {
    if (boosting) return;
    setBoosting(true);
    setFreedBytes(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    scale.value = withSequence(
      withTiming(0.97, { duration: 140 }),
      withTiming(1.01, { duration: 180 }),
      withTiming(1, { duration: 140 })
    );

    let reclaimed = 0;
    try {
      const cacheDir = FileSystem.cacheDirectory;
      if (cacheDir) {
        const files = await FileSystem.readDirectoryAsync(cacheDir).catch(() => []);
        for (const file of files) {
          if (!/\.(jpg|jpeg|png|webp|tmp)$/i.test(file)) continue;
          const uri = `${cacheDir}${file}`;
          const info = await FileSystem.getInfoAsync(uri).catch(() => null);
          const size =
            info?.exists && 'size' in info && typeof info.size === 'number' ? info.size : 0;
          const deleted = await FileSystem.deleteAsync(uri, { idempotent: true })
            .then(() => true)
            .catch(() => false);
          if (deleted) reclaimed += size;
        }
      }
    } catch (err) {
      console.warn('Turbo boost failed:', err);
    }

    setBoosting(false);
    setFreedBytes(reclaimed);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Alert.alert(
      t('general.success'),
      reclaimed > 0
        ? t('storage_widget.turbo_success', { size: formatByteSize(reclaimed) })
        : t('storage_widget.turbo_already_clean')
    );
    loadStorage();
  };

  // No readable capacity (web, or a platform that refuses the query) — showing
  // an invented bar would be worse than showing nothing.
  if (!loading && (!storage || storage.totalBytes === 0)) return null;

  const segments = storage
    ? [
        { key: 'photos', bytes: storage.photoBytes, color: colors.primary },
        { key: 'videos', bytes: storage.videoBytes, color: colors.accent },
        { key: 'system', bytes: storage.otherBytes, color: colors.warningAmber },
        { key: 'free', bytes: storage.freeBytes, color: colors.borderStrong },
      ].map((segment) => ({
        ...segment,
        percent:
          storage.totalBytes > 0
            ? Math.max(
                segment.bytes > 0 ? MIN_SEGMENT_PERCENT : 0,
                (segment.bytes / storage.totalBytes) * 100
              )
            : 0,
      }))
    : [];

  const freePercent = storage?.freePercent ?? 0;
  const healthColor =
    freePercent >= 25
      ? colors.successMint
      : freePercent >= 10
      ? colors.warningAmber
      : colors.dangerRose;

  return (
    <Animated.View entering={enter(FadeInDown.duration(500).delay(120))} style={styles.container}>
      <GlassPanel
        borderRadius={radius.panel}
        borderColor={colors.border}
        contentStyle={styles.content}
        intensity={28}
        glowAccent={colors.primary}
      >
        <View style={styles.topRow}>
          <View style={styles.titleGroup}>
            <HardDrive color={colors.primary} size={16} strokeWidth={2.2} />
            <Text style={styles.titleText} numberOfLines={1}>
              {t('storage_widget.title')}
            </Text>
          </View>

          {!loading && storage && (
            <View
              style={[
                styles.healthPill,
                { backgroundColor: alpha(healthColor, 0.1), borderColor: alpha(healthColor, 0.3) },
              ]}
            >
              <Text style={[styles.healthText, { color: healthColor }]} numberOfLines={1}>
                {t('storage_widget.free_percent', { percent: freePercent })}
              </Text>
            </View>
          )}
        </View>

        {loading || !storage ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingText}>{t('storage_widget.measuring')}</Text>
          </View>
        ) : (
          <>
            <Text style={styles.capacityLine}>
              {t('storage_widget.capacity_line', {
                used: storage.formattedUsed,
                total: storage.formattedTotal,
              })}
            </Text>

            <View style={styles.barTrack}>
              {segments.map((segment) =>
                segment.percent > 0 ? (
                  <View
                    key={segment.key}
                    style={{
                      width: `${segment.percent}%`,
                      height: '100%',
                      backgroundColor: segment.color,
                    }}
                  />
                ) : null
              )}
            </View>

            <View style={styles.legendRow}>
              <LegendItem
                color={colors.primary}
                label={t('storage_widget.photos_label')}
                value={storage.formattedPhotos}
              />
              <LegendItem
                color={colors.accent}
                label={t('storage_widget.videos_label')}
                value={storage.formattedVideos}
              />
              <LegendItem
                color={colors.warningAmber}
                label={t('storage_widget.system_label')}
                value={formatByteSize(storage.otherBytes)}
              />
              <LegendItem
                color={colors.borderStrong}
                label={t('storage_widget.free_label')}
                value={storage.formattedFree}
              />
            </View>

            {storage.mediaIsEstimated && (
              <Text style={styles.estimateNote}>{t('storage_widget.estimate_note')}</Text>
            )}
          </>
        )}

        <Animated.View style={animatedButtonStyle}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleTurboBoost}
            disabled={boosting}
            style={styles.boostButton}
            accessibilityRole="button"
          >
            <LinearGradient
              colors={[alpha(colors.primary, 0.14), alpha(colors.accent, 0.14)]}
              style={styles.boostGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {boosting ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : freedBytes !== null ? (
                <Check color={colors.successMint} size={16} strokeWidth={2.6} />
              ) : (
                <Zap color={colors.primary} size={16} strokeWidth={2.4} />
              )}
              <Text
                style={[
                  styles.boostText,
                  freedBytes !== null && !boosting && { color: colors.successMint },
                ]}
              >
                {freedBytes !== null && !boosting
                  ? t('storage_widget.turbo_freed', { size: formatByteSize(freedBytes) })
                  : t('storage_widget.turbo_clean')}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </GlassPanel>
    </Animated.View>
  );
};

const LegendItem: React.FC<{ color: string; label: string; value: string }> = ({
  color,
  label,
  value,
}) => (
  <View style={styles.legendItem}>
    <View style={styles.legendLabelRow}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
    <Text style={styles.legendValue} numberOfLines={1}>
      {value}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 20,
    marginBottom: 16,
  },
  content: {
    padding: 16,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 10,
  },
  titleGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  titleText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textPrimary,
    flexShrink: 1,
  },
  healthPill: {
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  healthText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 18,
  },
  loadingText: {
    fontSize: 13.5,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  capacityLine: {
    fontSize: 13.5,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: 10,
  },
  barTrack: {
    height: 10,
    borderRadius: 5,
    flexDirection: 'row',
    overflow: 'hidden',
    backgroundColor: colors.surfaceSunken,
    marginBottom: 12,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  legendItem: {
    width: '50%',
    paddingRight: 8,
    marginBottom: 6,
  },
  legendLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  legendLabel: {
    fontSize: 13.5,
    color: colors.textMuted,
    fontWeight: '700',
    flexShrink: 1,
  },
  legendValue: {
    fontSize: 13.5,
    color: colors.textPrimary,
    fontWeight: '800',
    marginLeft: 12,
  },
  estimateNote: {
    fontSize: 13.5,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  boostButton: {
    borderRadius: radius.chip,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: alpha(colors.primary, 0.25),
  },
  boostGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
  },
  boostText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.primary,
  },
});
