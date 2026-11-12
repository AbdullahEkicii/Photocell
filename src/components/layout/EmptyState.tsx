import React from 'react';
import { enter } from '../../theme/motion';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { GlassPanel } from '../glass/GlassPanel';
import { colors, alpha, radius } from '../../theme/colors';

interface EmptyStateProps {
  icon: React.ComponentType<{ color?: string; size?: number }>;
  title: string;
  description?: string;
  accent?: string;
  /** Optional call-to-action rendered under the text. */
  action?: React.ReactNode;
}

/** Shared "nothing here" card so every list has one instead of a blank screen. */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  accent = colors.textMuted,
  action,
}) => (
  <Animated.View entering={enter(FadeIn.duration(300))} style={styles.wrapper}>
    <GlassPanel borderRadius={radius.panel} contentStyle={styles.content}>
      <View style={[styles.iconRing, { backgroundColor: alpha(accent, 0.1) }]}>
        <Icon color={accent} size={30} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {action ? <View style={styles.actionSlot}>{action}</View> : null}
    </GlassPanel>
  </Animated.View>
);

interface LoadingStateProps {
  label: string;
  accent?: string;
}

/** Shared inline spinner block used while a screen's list is loading. */
export const LoadingState: React.FC<LoadingStateProps> = ({
  label,
  accent = colors.primary,
}) => (
  <Animated.View entering={enter(FadeIn.duration(200))} style={styles.loading}>
    <ActivityIndicator size="large" color={accent} />
    <Text style={styles.loadingLabel}>{label}</Text>
  </Animated.View>
);

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 20,
    paddingVertical: 32,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 26,
  },
  iconRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 16.5,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  description: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 6,
  },
  actionSlot: {
    marginTop: 18,
    width: '100%',
    alignItems: 'center',
  },
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 56,
    gap: 12,
  },
  loadingLabel: {
    color: colors.textSecondary,
    fontSize: 13.5,
    fontWeight: '600',
  },
});
