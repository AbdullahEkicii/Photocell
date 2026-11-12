import React, { useState } from 'react';

import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { MessageCircle, Download, CalendarClock } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { colors, alpha, radius } from '../../theme/colors';
import { CategoryId, loadCategory } from '../../services/categoryService';
import { PhotoAsset } from '../../services/mediaScanner';
import { AnalyticsService } from '../../services/analyticsService';

interface Props {
  onOpen: (assets: PhotoAsset[], title: string) => void;
}

interface CategoryDef {
  id: CategoryId;
  titleKey: string;
  descKey: string;
  icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  accent: string;
}

const CATEGORIES: CategoryDef[] = [
  {
    id: 'whatsapp',
    titleKey: 'categories.whatsapp',
    descKey: 'categories.whatsapp_desc',
    icon: MessageCircle,
    accent: colors.successMint,
  },
  {
    id: 'downloads',
    titleKey: 'categories.downloads',
    descKey: 'categories.downloads_desc',
    icon: Download,
    accent: colors.primary,
  },
  {
    id: 'old_photos',
    titleKey: 'categories.old_photos',
    descKey: 'categories.old_photos_desc',
    icon: CalendarClock,
    accent: colors.warningAmber,
  },
];

/**
 * One-tap review sets for the places where most unwanted photos live. They open the
 * same review screen as the scan results, so nothing is deleted without a swipe.
 */
export const CategoryShortcuts: React.FC<Props> = ({ onOpen }) => {
  const { t } = useTranslation();
  const [loadingId, setLoadingId] = useState<CategoryId | null>(null);

  const handlePress = async (id: CategoryId, title: string) => {
    if (loadingId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setLoadingId(id);
    try {
      const { assets } = await loadCategory(id);
      AnalyticsService.logEvent('category_opened', { category: id, count: assets.length });
      if (assets.length === 0) {
        Alert.alert(t('categories.empty_title'), t('categories.empty_body'));
        return;
      }
      onOpen(assets, title);
    } catch {
      Alert.alert(t('general.error'), t('categories.load_failed'));
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>{t('categories.heading')}</Text>
      {CATEGORIES.map((cat, index) => {
        const Icon = cat.icon;
        const busy = loadingId === cat.id;
        return (

            <TouchableOpacity key={cat.id}
              activeOpacity={0.8}
              disabled={loadingId !== null}
              onPress={() => handlePress(cat.id, t(cat.titleKey))}
              accessibilityRole="button"
              accessibilityLabel={t(cat.titleKey)}
              style={styles.row}
            >
              <View style={[styles.iconWrap, { backgroundColor: alpha(cat.accent, 0.12) }]}>
                <Icon color={cat.accent} size={20} strokeWidth={2.2} />
              </View>
              <View style={styles.text}>
                <Text style={styles.title}>{t(cat.titleKey)}</Text>
                <Text style={styles.desc}>{t(cat.descKey)}</Text>
              </View>
              {busy && <ActivityIndicator color={cat.accent} />}
            </TouchableOpacity>


        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    marginTop: 16,
    gap: 10,
  },
  heading: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    padding: 12,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  desc: {
    marginTop: 2,
    fontSize: 13,
    color: colors.textSecondary,
  },
});
