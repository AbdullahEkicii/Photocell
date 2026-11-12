import React from 'react';
import { enter } from '../../theme/motion';
import { Modal, View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Check, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { colors, alpha, radius, elevation } from '../../theme/colors';
import { LANGUAGES, resolveSupportedLanguage } from '../../i18n/languages';
import { setAppLanguage } from '../../services/languageService';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/** Full list of app languages, each in its own name. */
export const LanguagePickerModal: React.FC<Props> = ({ visible, onClose }) => {
  const { t, i18n } = useTranslation();
  const current = resolveSupportedLanguage(i18n.language);

  const choose = (code: string) => {
    Haptics.selectionAsync().catch(() => {});
    setAppLanguage(code).catch(() => {});
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View entering={enter(FadeIn.duration(180))} style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <Animated.View
          entering={enter(FadeInDown.duration(320).springify().damping(19).stiffness(190))}
          style={styles.sheet}
        >
          <View style={styles.header}>
            <Text style={styles.title}>{t('settings.language')}</Text>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeButton}>
              <X color={colors.textSecondary} size={18} strokeWidth={2.4} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
            {LANGUAGES.map((language) => {
              const active = language.code === current;
              return (
                <Pressable
                  key={language.code}
                  onPress={() => choose(language.code)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [
                    styles.row,
                    active && styles.rowActive,
                    pressed && styles.rowPressed,
                  ]}
                >
                  <Text style={[styles.rowName, active && styles.rowNameActive]}>
                    {language.name}
                  </Text>
                  {active && <Check color={colors.primary} size={18} strokeWidth={2.8} />}
                </Pressable>
              );
            })}
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  sheet: {
    maxHeight: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.sheet,
    borderWidth: 1,
    borderColor: colors.whiteBorder,
    overflow: 'hidden',
    ...elevation.raised,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: 12,
    paddingBottom: 14,
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: radius.control,
  },
  rowActive: {
    backgroundColor: alpha(colors.primary, 0.1),
  },
  rowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  rowName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  rowNameActive: {
    fontWeight: '800',
    color: colors.primaryDeep,
  },
});
