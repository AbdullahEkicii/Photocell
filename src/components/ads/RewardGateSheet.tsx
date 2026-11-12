import React from 'react';
import { enter } from '../../theme/motion';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { PlayCircle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { colors, radius, alpha } from '../../theme/colors';
import { FREE_VIDEO_COMPRESSIONS_PER_DAY } from '../../services/ads/adsConfig';
import { LiquidGlass } from '../glass/LiquidGlass';

interface Props {
  visible: boolean;
  title?: string;
  body?: string;
  watchButtonText?: string;
  onWatch: () => void;
  onDismiss: () => void;
}

/**
 * Bottom sheet shown when today's free video compressions are used up. A sheet is a
 * functional-layer surface, so it is glass; the single prominent action (watch the
 * ad) takes the accent colour as its background, and there is always a plain way out.
 */
export const RewardGateSheet: React.FC<Props> = ({
  visible,
  title,
  body,
  watchButtonText,
  onWatch,
  onDismiss,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss}>
      <Animated.View entering={enter(FadeIn.duration(180))} style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityLabel={t('ads.reward_not_now')} />
        <Animated.View entering={enter(SlideInDown.springify().damping(20).stiffness(190))}>
          <LiquidGlass
            blur="frosted"
            borderRadius={radius.sheet}
            style={[styles.sheet, { marginBottom: Math.max(12, insets.bottom + 8) }]}
            contentStyle={styles.content}
          >
            <View style={styles.grabber} />
            <View style={styles.iconWrap}>
              <PlayCircle color={colors.primary} size={26} strokeWidth={2.2} />
            </View>
            <Text style={styles.title}>{title || t('ads.reward_title')}</Text>
            <Text style={styles.body}>
              {body || t('ads.reward_body', { count: FREE_VIDEO_COMPRESSIONS_PER_DAY })}
            </Text>

            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                onWatch();
              }}
              accessibilityRole="button"
              style={({ pressed }) => [pressed && styles.pressed]}
            >
              <LiquidGlass blur="frosted" tint={colors.primary} borderRadius={radius.control} contentStyle={styles.primaryContent}>
                <Text style={styles.primaryText}>{watchButtonText || t('ads.reward_watch')}</Text>
              </LiquidGlass>
            </Pressable>

            <Pressable
              onPress={onDismiss}
              accessibilityRole="button"
              hitSlop={8}
              style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
            >
              <Text style={styles.secondaryText}>{t('ads.reward_not_now')}</Text>
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
    backgroundColor: alpha(colors.primary, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  body: {
    marginTop: 8,
    marginBottom: 18,
    fontSize: 15,
    lineHeight: 21,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  primaryContent: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  primaryText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textOnAccent,
  },
  secondary: {
    alignSelf: 'center',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginTop: 4,
  },
  secondaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  pressed: {
    opacity: 0.7,
  },
});
