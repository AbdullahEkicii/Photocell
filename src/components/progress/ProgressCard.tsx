import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Share } from 'react-native';
import { useTranslation } from 'react-i18next';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { Flame, Trophy, Share2, Lock, Sparkles } from 'lucide-react-native';

import { GlassPanel } from '../glass/GlassPanel';
import { colors, alpha, radius } from '../../theme/colors';
import { formatByteSize } from '../../services/cacheCleaner';
import { AnalyticsService } from '../../services/analyticsService';
import { getProgressSummary, ProgressSummary, Badge } from '../../services/progressService';

const BADGE_LABEL_KEY: Record<Badge['id'], string> = {
  first_clean: 'progress.badge_first_clean',
  gb_1: 'progress.badge_gb_1',
  gb_5: 'progress.badge_gb_5',
  gb_10: 'progress.badge_gb_10',
  streak_3: 'progress.badge_streak_3',
  streak_7: 'progress.badge_streak_7',
  streak_30: 'progress.badge_streak_30',
};

/**
 * Home card: what was freed this week, the cleaning streak, and badges.
 * Everything shown is computed from bytes that were actually freed.
 */
export const ProgressCard: React.FC = () => {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const shareRef = useRef<View>(null);

  useEffect(() => {
    getProgressSummary()
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  const handleShare = useCallback(async () => {
    if (!summary) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const size = formatByteSize(summary.totalBytes);
    const message = t('progress.share_message', { size });
    AnalyticsService.logEvent('progress_shared', { total_bytes: summary.totalBytes });
    try {
      // Share the rendered card as an image when the platform can; otherwise plain text.
      const canShareFile = await Sharing.isAvailableAsync();
      if (canShareFile && shareRef.current) {
        const uri = await captureRef(shareRef, { format: 'png', quality: 1, result: 'tmpfile' });
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: message });
        return;
      }
    } catch {
      // Fall through to text sharing.
    }
    Share.share({ message }).catch(() => {});
  }, [summary, t]);

  if (!summary) return null;

  const hasAnything = summary.totalBytes > 0;
  const streakText =
    summary.streak > 0
      ? t('progress.streak', { count: summary.streak })
      : t('progress.streak_zero');

  return (
    <GlassPanel
      borderRadius={radius.panel}
      borderColor={alpha(colors.primary, 0.18)}
      glowAccent={colors.primary}
      style={styles.card}
      contentStyle={styles.content}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerTitle}>
          <Trophy color={colors.primary} size={18} strokeWidth={2.2} />
          <Text style={styles.title}>{t('progress.title')}</Text>
        </View>
        {hasAnything && (
          <TouchableOpacity
            onPress={handleShare}
            accessibilityRole="button"
            accessibilityLabel={t('progress.share')}
            hitSlop={8}
            style={styles.shareButton}
          >
            <Share2 color={colors.primary} size={18} strokeWidth={2.2} />
          </TouchableOpacity>
        )}
      </View>

      {hasAnything ? (
        <>
          <Text style={styles.weekValue} accessibilityLabel={t('progress.week_saved', { size: formatByteSize(summary.weekBytes) })}>
            {formatByteSize(summary.weekBytes)}
          </Text>
          <Text style={styles.weekLabel}>{t('progress.week_label')}</Text>

          <View style={styles.streakRow}>
            <Flame
              color={summary.streak > 0 ? colors.warningAmber : colors.textMuted}
              size={16}
              strokeWidth={2.2}
            />
            <Text style={styles.streakText}>{streakText}</Text>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.badgeRow}
          >
            {summary.badges.map((badge) => (
              <View
                key={badge.id}
                style={[styles.badge, badge.unlocked ? styles.badgeOn : styles.badgeOff]}
                accessibilityLabel={`${t(BADGE_LABEL_KEY[badge.id])}: ${
                  badge.unlocked ? t('progress.unlocked') : t('progress.locked')
                }`}
              >
                {badge.unlocked ? (
                  <Sparkles color={colors.primary} size={13} strokeWidth={2.2} />
                ) : (
                  <Lock color={colors.textMuted} size={13} strokeWidth={2.2} />
                )}
                <Text style={[styles.badgeText, !badge.unlocked && styles.badgeTextOff]}>
                  {t(BADGE_LABEL_KEY[badge.id])}
                </Text>
              </View>
            ))}
          </ScrollView>
        </>
      ) : (
        <Text style={styles.empty}>{t('progress.empty')}</Text>
      )}

      {/* Off-screen share card, rendered only to be captured as an image. */}
      {hasAnything && (
        <View style={styles.offscreen} pointerEvents="none">
          <View ref={shareRef} collapsable={false} style={styles.shareCard}>
            <Text style={styles.shareBrand}>Photocell</Text>
            <Text style={styles.shareValue}>{formatByteSize(summary.totalBytes)}</Text>
            <Text style={styles.shareLabel}>{t('progress.share_label')}</Text>
            <Text style={styles.shareStreak}>{streakText}</Text>
          </View>
        </View>
      )}
    </GlassPanel>
  );
};

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
    // Same gap the home cards use between each other, so this card does not merge into the one below.
    marginBottom: 12,
    marginHorizontal: 20,
  },
  content: {
    padding: 18,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  shareButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: alpha(colors.primary, 0.1),
  },
  weekValue: {
    marginTop: 10,
    fontSize: 30,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: -0.8,
  },
  weekLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  streakText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  badgeRow: {
    gap: 8,
    paddingTop: 14,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  badgeOn: {
    backgroundColor: alpha(colors.primary, 0.1),
    borderColor: alpha(colors.primary, 0.3),
  },
  badgeOff: {
    backgroundColor: 'transparent',
    borderColor: colors.border,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  badgeTextOff: {
    color: colors.textMuted,
  },
  empty: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  offscreen: {
    position: 'absolute',
    left: -10000,
    top: 0,
  },
  shareCard: {
    width: 540,
    padding: 40,
    backgroundColor: colors.canvas,
    borderRadius: 32,
    alignItems: 'center',
  },
  shareBrand: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primary,
  },
  shareValue: {
    marginTop: 24,
    fontSize: 64,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  shareLabel: {
    fontSize: 18,
    color: colors.textSecondary,
  },
  shareStreak: {
    marginTop: 20,
    fontSize: 16,
    fontWeight: '700',
    color: colors.warningAmber,
  },
});

