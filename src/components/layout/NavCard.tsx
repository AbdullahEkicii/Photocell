import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { ChevronRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { GlassPanel } from '../glass/GlassPanel';
import { colors, alpha, radius } from '../../theme/colors';

interface NavCardProps {
  icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  title: string;
  description: string;
  accent: string;
  onPress: () => void;
  delay?: number;
}

/**
 * The row card used for every "go to this feature" entry on Home and Tools.
 * Both screens previously hand-rolled five near-identical copies each.
 */
export const NavCard: React.FC<NavCardProps> = ({
  icon: Icon,
  title,
  description,
  accent,
  onPress,
  delay = 0,
}) => {
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  };

  return (
    <Animated.View entering={FadeInUp.duration(450).delay(delay).springify()}>
      <TouchableOpacity activeOpacity={0.85} onPress={handlePress} accessibilityRole="button">
        <GlassPanel
          borderRadius={radius.card}
          borderColor={alpha(accent, 0.22)}
          contentStyle={styles.content}
          glowAccent={accent}
          intensity={28}
        >
          <View
            style={[
              styles.iconBadge,
              { backgroundColor: alpha(accent, 0.1), borderColor: alpha(accent, 0.24) },
            ]}
          >
            <Icon color={accent} size={22} strokeWidth={2.2} />
          </View>

          <View style={styles.textGroup}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.description} numberOfLines={2}>
              {description}
            </Text>
          </View>

          <ChevronRight color={colors.textMuted} size={18} strokeWidth={2.4} />
        </GlassPanel>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  content: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBadge: {
    width: 46,
    height: 46,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  textGroup: {
    flex: 1,
    paddingRight: 10,
  },
  title: {
    fontSize: 15.5,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.2,
    marginBottom: 3,
  },
  description: {
    fontSize: 12.5,
    color: colors.textSecondary,
    lineHeight: 17,
  },
});
