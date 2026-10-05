import React from 'react';
import { Text, StyleSheet, TouchableOpacity, View, ScrollView } from 'react-native';
import * as Haptics from 'expo-haptics';

import { colors, alpha, radius } from '../../theme/colors';

export interface FilterChipOption<T extends string> {
  value: T;
  label: string;
}

interface FilterChipsProps<T extends string> {
  options: FilterChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accent?: string;
  /** Scrolls horizontally instead of splitting the row evenly. */
  scrollable?: boolean;
}

/**
 * Segmented filter row shared by the compressor, heavy-media and contacts
 * screens so the selected state looks the same everywhere.
 */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  accent = colors.primary,
  scrollable = false,
}: FilterChipsProps<T>) {
  const chips = options.map((option) => {
    const active = option.value === value;
    return (
      <TouchableOpacity
        key={option.value}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          onChange(option.value);
        }}
        style={[
          styles.chip,
          scrollable ? styles.chipAuto : styles.chipFlex,
          active && { backgroundColor: alpha(accent, 0.1), borderColor: accent },
        ]}
      >
        <Text
          numberOfLines={1}
          style={[styles.label, active && { color: accent, fontWeight: '800' }]}
        >
          {option.label}
        </Text>
      </TouchableOpacity>
    );
  });

  if (scrollable) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {chips}
      </ScrollView>
    );
  }

  return <View style={styles.row}>{chips}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  scrollContent: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 20,
  },
  chip: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: radius.chip,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipFlex: {
    flex: 1,
    paddingHorizontal: 6,
  },
  chipAuto: {
    flexGrow: 0,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
