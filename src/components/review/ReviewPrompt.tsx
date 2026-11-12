import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { Star } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { colors, radius, alpha } from '../../theme/colors';
import { LiquidGlass } from '../glass/LiquidGlass';
import { declineReview, postponeReview } from '../../services/usageService';
import { AnalyticsService } from '../../services/analyticsService';

const PACKAGE = 'com.abdllhekc.photocell';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/**
 * Asks for a rating after real use. "Rate" opens this app's Play Store page, where the
 * rating and an optional review are written. Nothing is sent from inside the app.
 */
export const ReviewPrompt: React.FC<Props> = ({ visible, onClose }) => {
  const { t } = useTranslation();

  const rate = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    AnalyticsService.logEvent('review_prompt_rate', {});
    const market = `market://details?id=${PACKAGE}`;
    const web = `https://play.google.com/store/apps/details?id=${PACKAGE}`;
    Linking.openURL(market)
      .catch(() => Linking.openURL(web))
      .catch(() => {});
    onClose();
  };

  const later = () => {
    AnalyticsService.logEvent('review_prompt_later', {});
    postponeReview().catch(() => {});
    onClose();
  };

  const never = () => {
    AnalyticsService.logEvent('review_prompt_declined', {});
    declineReview().catch(() => {});
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={later}>
      <Animated.View entering={FadeIn.duration(180)} style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={later} accessibilityLabel={t('review.later')} />
        <Animated.View entering={SlideInDown.springify().damping(20).stiffness(190)}>
          <LiquidGlass blur="frosted" borderRadius={radius.sheet} style={styles.sheet} contentStyle={styles.content}>
            <View style={styles.grabber} />
            <View style={styles.iconWrap}>
              <Star color={colors.warningAmber} size={26} fill={colors.warningAmber} strokeWidth={2} />
            </View>
            <Text style={styles.title}>{t('review.title')}</Text>
            <Text style={styles.body}>{t('review.body')}</Text>

            <Pressable
              onPress={rate}
              accessibilityRole="button"
              style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
            >
              <Text style={styles.primaryText}>{t('review.rate')}</Text>
            </Pressable>

            <Pressable
              onPress={later}
              accessibilityRole="button"
              style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
            >
              <Text style={styles.secondaryText}>{t('review.later')}</Text>
            </Pressable>

            <Pressable onPress={never} accessibilityRole="button" style={styles.link}>
              <Text style={styles.linkText}>{t('review.never')}</Text>
            </Pressable>
          </LiquidGlass>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.scrim,
    paddingHorizontal: 12,
  },
  sheet: {
    alignSelf: 'stretch',
  },
  content: {
    padding: 20,
    paddingTop: 10,
    alignItems: 'stretch',
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 5,
    borderRadius: 3,
    backgroundColor: alpha(colors.textMuted, 0.4),
    marginBottom: 14,
  },
  iconWrap: {
    alignSelf: 'center',
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: alpha(colors.warningAmber, 0.14),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  body: {
    marginTop: 8,
    marginBottom: 18,
    fontSize: 15,
    lineHeight: 21,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  primary: {
    minHeight: 52,
    borderRadius: radius.control,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textOnAccent,
  },
  secondary: {
    marginTop: 10,
    minHeight: 48,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  link: {
    alignSelf: 'center',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginTop: 4,
  },
  linkText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
  },
  pressed: {
    opacity: 0.7,
  },
});

