import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInDown, FadeIn, FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Flame,
  Check,
  Trash2,
  Film,
  Images,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as FileSystem from 'expo-file-system/legacy';
import { FlashList } from '@shopify/flash-list';

import { AtmosphericBackground } from '../components/glass/AtmosphericBackground';
import { GlassPanel } from '../components/glass/GlassPanel';
import { colors } from '../theme/colors';
import { formatByteSize, recordCleanedPhotos, recordCleanedVideos } from '../services/cacheCleaner';

interface HeavyMediaItem {
  id: string;
  filename: string;
  uri: string;
  type: 'photo' | 'video';
  sizeBytes: number;
  formattedSize: string;
  duration?: number;
}

import { useSafeAreaInsets } from 'react-native-safe-area-context';

type HeavyFilter = 'all' | '100mb' | '50mb' | '25mb';

interface Props {
  onBack: () => void;
}

export const HeavyMediaScreen: React.FC<Props> = ({ onBack }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<HeavyMediaItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filter, setFilter] = useState<HeavyFilter>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<boolean>(false);

  const loadHeavyMedia = useCallback(async () => {
    try {
      setLoading(true);
      const { status } = await MediaLibrary.requestPermissionsAsync(false, ['photo', 'video']);
      if (status !== 'granted') return;

      const page = await MediaLibrary.getAssetsAsync({
        first: 60,
        mediaType: ['photo', 'video'],
        sortBy: [['creationTime', false]],
      });

      const list: HeavyMediaItem[] = [];

      for (const asset of page.assets) {
        let size = 0;
        try {
          let uri = asset.uri;
          if (uri.startsWith('ph://') || uri.startsWith('content://')) {
            const info = await MediaLibrary.getAssetInfoAsync(asset).catch(() => null);
            if (info?.localUri) uri = info.localUri;
          }
          const fileInfo = await FileSystem.getInfoAsync(uri).catch(() => null);
          if (fileInfo && fileInfo.exists && 'size' in fileInfo && typeof fileInfo.size === 'number') {
            size = fileInfo.size;
          } else {
            size = asset.mediaType === 'video' ? 45 * 1024 * 1024 : 8 * 1024 * 1024;
          }
        } catch {
          size = asset.mediaType === 'video' ? 45 * 1024 * 1024 : 8 * 1024 * 1024;
        }

        list.push({
          id: asset.id,
          filename: asset.filename || `${asset.mediaType === 'video' ? 'Video' : 'IMG'}_${asset.id.slice(0, 6)}`,
          uri: asset.uri,
          type: asset.mediaType === 'video' ? 'video' : 'photo',
          sizeBytes: size,
          formattedSize: formatByteSize(size),
          duration: asset.duration,
        });
      }

      // Sort heaviest first
      list.sort((a, b) => b.sizeBytes - a.sizeBytes);
      setItems(list);
    } catch (err) {
      console.warn('Failed loading heavy media:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHeavyMedia();
  }, [loadHeavyMedia]);

  const filteredItems = useMemo(() => {
    if (filter === '100mb') return items.filter((i) => i.sizeBytes >= 100 * 1024 * 1024);
    if (filter === '50mb') return items.filter((i) => i.sizeBytes >= 50 * 1024 * 1024);
    if (filter === '25mb') return items.filter((i) => i.sizeBytes >= 25 * 1024 * 1024);
    return items;
  }, [items, filter]);

  const toggleSelect = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedTotalBytes = useMemo(() => {
    return items
      .filter((i) => selectedIds.has(i.id))
      .reduce((sum, i) => sum + i.sizeBytes, 0);
  }, [items, selectedIds]);

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0 || deleting) return;

    Alert.alert(
      t('reviewer.delete'),
      t('reviewer.delete_selected', { count: selectedIds.size }),
      [
        { text: t('settings.cancel'), style: 'cancel' },
        {
          text: t('settings.confirm'),
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            try {
              const idsArray = Array.from(selectedIds);
              await MediaLibrary.deleteAssetsAsync(idsArray);
              recordCleanedVideos(selectedTotalBytes).catch(() => {});
              setSelectedIds(new Set());
              await loadHeavyMedia();
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <AtmosphericBackground />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Top Bar */}
        <Animated.View entering={FadeInDown.duration(400)} style={styles.topBar}>
          <TouchableOpacity activeOpacity={0.8} onPress={onBack} style={styles.backButton}>
            <ArrowLeft color={colors.textPrimary} size={20} strokeWidth={2.4} />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>{t('heavy_media.title')}</Text>
          <View style={{ width: 40 }} />
        </Animated.View>

        {/* Filter Pills */}
        <Animated.View entering={FadeInDown.delay(100)} style={styles.filterSection}>
          <View style={styles.filterRow}>
            {(['all', '100mb', '50mb', '25mb'] as HeavyFilter[]).map((f) => {
              const active = filter === f;
              return (
                <TouchableOpacity
                  key={f}
                  activeOpacity={0.8}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setFilter(f);
                  }}
                  style={[styles.filterPill, active && styles.filterPillActive]}
                >
                  <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
                    {f === 'all'
                      ? t('heavy_media.filter_all')
                      : f === '100mb'
                      ? t('heavy_media.filter_100mb')
                      : f === '50mb'
                      ? t('heavy_media.filter_50mb')
                      : t('heavy_media.filter_25mb')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>

        {/* List */}
        {loading ? (
          <Animated.View entering={FadeIn} style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.dangerRose} style={{ marginBottom: 12 }} />
            <Text style={styles.loadingText}>{t('dashboard.status.scanning')}</Text>
          </Animated.View>
        ) : filteredItems.length === 0 ? (
          <Animated.View entering={FadeIn} style={styles.emptyContainer}>
            <GlassPanel borderRadius={24} style={styles.emptyCard} contentStyle={styles.emptyCardContent}>
              <Flame color={colors.textMuted} size={44} style={{ marginBottom: 12 }} />
              <Text style={styles.emptyText}>{t('heavy_media.no_heavy_files')}</Text>
            </GlassPanel>
          </Animated.View>
        ) : (
          <FlashList
            data={filteredItems}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: Math.max(90, insets.bottom + 60) },
            ]}
            renderItem={({ item }) => {
              const isSelected = selectedIds.has(item.id);
              return (
                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={() => toggleSelect(item.id)}
                  style={styles.cardWrapper}
                >
                  <GlassPanel
                    borderRadius={24}
                    borderColor={isSelected ? colors.dangerRose : 'rgba(255, 255, 255, 0.1)'}
                    style={styles.mediaCard}
                    contentStyle={styles.mediaCardContent}
                    intensity={25}
                  >
                    <Image source={{ uri: item.uri }} style={styles.thumbnail} resizeMode="cover" />

                    <View style={styles.cardDetails}>
                      <Text style={styles.mediaName} numberOfLines={1}>{item.filename}</Text>
                      <View style={styles.badgeRow}>
                        <View style={styles.typeBadge}>
                          {item.type === 'video' ? (
                            <Film color={colors.electricPurple} size={12} style={{ marginRight: 4 }} />
                          ) : (
                            <Images color={colors.neonCyan} size={12} style={{ marginRight: 4 }} />
                          )}
                          <Text style={styles.typeText}>{item.formattedSize}</Text>
                        </View>
                      </View>
                    </View>

                    {/* Checkbox */}
                    <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                      {isSelected && <Check color="#FFF" size={14} strokeWidth={3} />}
                    </View>
                  </GlassPanel>
                </TouchableOpacity>
              );
            }}
          />
        )}

        {/* Floating Delete Bar */}
        {selectedIds.size > 0 && (
          <Animated.View
            entering={FadeInUp.springify()}
            style={[styles.floatingBar, { bottom: Math.max(20, insets.bottom + 10) }]}
          >
            <TouchableOpacity
              activeOpacity={0.85}
              disabled={deleting}
              onPress={handleDeleteSelected}
              style={styles.deleteButton}
            >
              <LinearGradient colors={['#F43F5E', '#BE123C']} style={styles.deleteGradient}>
                {deleting ? (
                  <ActivityIndicator color="#FFF" size="small" style={{ marginRight: 8 }} />
                ) : (
                  <Trash2 color="#FFF" size={18} style={{ marginRight: 8 }} />
                )}
                <Text style={styles.deleteButtonText}>
                  {t('heavy_media.delete_selected', {
                    count: selectedIds.size,
                    size: formatByteSize(selectedTotalBytes),
                  })}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        )}
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.oledBlack,
  },
  safeArea: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  filterSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 10,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterPill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
  },
  filterPillActive: {
    backgroundColor: 'rgba(244, 63, 94, 0.16)',
    borderColor: colors.dangerRose,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  filterPillTextActive: {
    color: colors.dangerRose,
    fontWeight: '800',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 120,
  },
  cardWrapper: {
    marginBottom: 12,
  },
  mediaCard: {
    borderRadius: 24,
  },
  mediaCardContent: {
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 16,
    marginRight: 14,
  },
  cardDetails: {
    flex: 1,
    paddingRight: 8,
  },
  mediaName: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  typeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: colors.dangerRose,
    borderColor: colors.dangerRose,
  },
  floatingBar: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
    zIndex: 50,
  },
  deleteButton: {
    width: '100%',
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
    shadowColor: colors.dangerRose,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  deleteGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '900',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  emptyCard: {
    borderRadius: 24,
  },
  emptyCardContent: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
});
