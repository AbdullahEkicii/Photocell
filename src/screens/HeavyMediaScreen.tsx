import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { notifyPermissionDenied } from '../services/permissionAlerts';
import { withAdRows } from '../components/ads/adRows';
import { AdBanner } from '../components/ads/AdBanner';
import { enter } from '../theme/motion';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Flame, Check, Trash2, Film, Images } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library/legacy';
import { FlashList } from '@shopify/flash-list';

import { AtmosphericBackground } from '../components/glass/AtmosphericBackground';
import { onActionCompleted, showRewardedAd } from '../services/ads/adsService';
import { FREE_HEAVY_MEDIA_DELETIONS_PER_REWARD } from '../services/ads/adsConfig';
import { GlassPanel } from '../components/glass/GlassPanel';
import { ScreenHeader } from '../components/layout/ScreenHeader';
import { FilterChips } from '../components/layout/FilterChips';
import { EmptyState, LoadingState } from '../components/layout/EmptyState';
import { colors, alpha, radius } from '../theme/colors';
import { formatByteSize, recordCleanedPhotos, recordCleanedVideos } from '../services/cacheCleaner';
import { deleteMediaAssets } from '../services/mediaScanner';
import { fetchLikelyHeaviest, measureAssets } from '../services/assetSize';

interface HeavyMediaItem {
  id: string;
  filename: string;
  uri: string;
  type: 'photo' | 'video';
  sizeBytes: number;
  formattedSize: string;
}

type HeavyFilter = 'all' | '100mb' | '50mb' | '25mb';

const FILTER_THRESHOLDS: Record<HeavyFilter, number> = {
  all: 0,
  '25mb': 25 * 1024 * 1024,
  '50mb': 50 * 1024 * 1024,
  '100mb': 100 * 1024 * 1024,
};

/** Assets whose metadata is ranked, and how many of the likeliest get measured. */
const SCAN_POOL = 3000;
const SCAN_MEASURE = 200;

interface Props {
  onBack: () => void;
}

export const HeavyMediaScreen: React.FC<Props> = ({ onBack }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<HeavyMediaItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [permissionDenied, setPermissionDenied] = useState<boolean>(false);
  const [filter, setFilter] = useState<HeavyFilter>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<boolean>(false);

  const loadHeavyMedia = useCallback(async () => {
    try {
      setLoading(true);
      const { status } = await MediaLibrary.requestPermissionsAsync(false, ['photo', 'video']);
      if (status !== 'granted') {
        setPermissionDenied(true);
        notifyPermissionDenied('media');
        return;
      }
      setPermissionDenied(false);

      // Rank the whole library by what is likely to be heavy, then measure only
      // the most promising - see fetchLikelyHeaviest.
      const candidates = await fetchLikelyHeaviest(['photo', 'video'], SCAN_POOL, SCAN_MEASURE);
      const measured = await measureAssets(candidates, 8);

      const list: HeavyMediaItem[] = measured
        // A size radar that invents sizes is worse than one that skips what
        // it cannot measure, so unreadable assets are left out entirely.
        .filter(({ measured: m }) => m.size > 0)
        .map(({ asset, measured: m }) => ({
          id: asset.id,
          filename:
            asset.filename ||
            `${asset.mediaType === 'video' ? 'Video' : 'IMG'}_${asset.id.slice(0, 6)}`,
          uri: asset.uri,
          type: asset.mediaType === 'video' ? ('video' as const) : ('photo' as const),
          sizeBytes: m.size,
          formattedSize: formatByteSize(m.size),
        }));

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

  const filteredItems = useMemo(
    () => items.filter((i) => i.sizeBytes >= FILTER_THRESHOLDS[filter]),
    [items, filter]
  );

  const toggleSelect = (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selection = useMemo(() => {
    const selected = items.filter((i) => selectedIds.has(i.id));
    return {
      totalBytes: selected.reduce((sum, i) => sum + i.sizeBytes, 0),
      photoBytes: selected
        .filter((i) => i.type === 'photo')
        .reduce((sum, i) => sum + i.sizeBytes, 0),
      videoBytes: selected
        .filter((i) => i.type === 'video')
        .reduce((sum, i) => sum + i.sizeBytes, 0),
    };
  }, [items, selectedIds]);

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0 || deleting) return;

    Alert.alert(
      t('heavy_media.delete_confirm_title'),
      t('heavy_media.delete_confirm_desc', {
        count: selectedIds.size,
        size: formatByteSize(selection.totalBytes),
      }),
      [
        { text: t('settings.cancel'), style: 'cancel' },
        {
          text: t('settings.confirm'),
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              // Deleted in pairs: after every 2 deletions a rewarded ad is offered before
              // the next pair. If the user closes the ad, the remaining files are kept.
              const ids = Array.from(selectedIds);
              const byId = new Map(items.map((i) => [i.id, i]));
              let deletedAny = false;
              for (let i = 0; i < ids.length; i += FREE_HEAVY_MEDIA_DELETIONS_PER_REWARD) {
                const chunk = ids.slice(i, i + FREE_HEAVY_MEDIA_DELETIONS_PER_REWARD);
                const deleted = await deleteMediaAssets(chunk);
                if (!deleted) {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
                  Alert.alert(t('general.error'), t('heavy_media.delete_failed'));
                  break;
                }
                deletedAny = true;
                let photoBytes = 0;
                let videoBytes = 0;
                for (const id of chunk) {
                  const item = byId.get(id);
                  if (!item) continue;
                  if (item.type === 'video') videoBytes += item.sizeBytes;
                  else photoBytes += item.sizeBytes;
                }
                if (photoBytes > 0) recordCleanedPhotos(photoBytes).catch(() => {});
                if (videoBytes > 0) recordCleanedVideos(videoBytes).catch(() => {});

                const hasMore = i + FREE_HEAVY_MEDIA_DELETIONS_PER_REWARD < ids.length;
                if (hasMore) {
                  const reward = await showRewardedAd('heavy_media_delete');
                  if (reward === 'dismissed') break;
                }
              }
              if (deletedAny) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              }
              setSelectedIds(new Set());
              await loadHeavyMedia();
              onActionCompleted('heavy_media_delete').catch(() => {});
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const adRows = useMemo(
    () => withAdRows(filteredItems, (entry) => entry.id, 'heavy_media'),
    [filteredItems]
  );

  return (
    <View style={styles.container}>
      <AtmosphericBackground />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader
          title={t('heavy_media.title')}
          onBack={onBack}
          onRefresh={loadHeavyMedia}
        />

        <Animated.View entering={enter(FadeInDown.duration(400).delay(60))} style={styles.filterSection}>
          <FilterChips
            accent={colors.dangerRose}
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: t('heavy_media.filter_all') },
              { value: '100mb', label: t('heavy_media.filter_100mb') },
              { value: '50mb', label: t('heavy_media.filter_50mb') },
              { value: '25mb', label: t('heavy_media.filter_25mb') },
            ]}
          />
        </Animated.View>

        {loading ? (
          <LoadingState label={t('dashboard.status.scanning')} accent={colors.dangerRose} />
        ) : permissionDenied ? (
          <EmptyState
            icon={Flame}
            title={t('heavy_media.permission_title')}
            description={t('heavy_media.permission_desc')}
            accent={colors.warningAmber}
          />
        ) : filteredItems.length === 0 ? (
          <EmptyState
            icon={Flame}
            title={t('heavy_media.no_heavy_files')}
            description={t('heavy_media.no_heavy_files_desc')}
            accent={colors.dangerRose}
          />
        ) : (
          <FlashList
            data={adRows}
            keyExtractor={(row) => row.key}
            extraData={selectedIds}
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingTop: 8,
              paddingBottom: Math.max(100, insets.bottom + 90),
            }}
            renderItem={({ item: row }) => {
              if (row.kind === 'ad') return <AdBanner placement={row.placement} />;
              const item = row.item;
              const isSelected = selectedIds.has(item.id);
              return (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => toggleSelect(item.id)}
                  style={styles.cardWrapper}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected }}
                >
                  <GlassPanel
                    borderRadius={radius.card}
                    borderColor={isSelected ? alpha(colors.dangerRose, 0.5) : colors.border}
                    contentStyle={styles.cardContent}
                    intensity={26}
                  >
                    <Image source={{ uri: item.uri }} style={styles.thumbnail} resizeMethod="resize" resizeMode="cover" />

                    <View style={styles.cardDetails}>
                      <Text style={styles.mediaName} numberOfLines={1}>
                        {item.filename}
                      </Text>
                      <View style={styles.typeBadge}>
                        {item.type === 'video' ? (
                          <Film color={colors.accent} size={11} />
                        ) : (
                          <Images color={colors.primary} size={11} />
                        )}
                        <Text style={styles.typeText}>{item.formattedSize}</Text>
                      </View>
                    </View>

                    <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                      {isSelected && (
                        <Check color={colors.textOnAccent} size={14} strokeWidth={3} />
                      )}
                    </View>
                  </GlassPanel>
                </TouchableOpacity>
              );
            }}
          />
        )}

        {selectedIds.size > 0 && (
          <Animated.View
            entering={enter(FadeInUp.springify())}
            style={[styles.floatingBar, { bottom: Math.max(20, insets.bottom + 10) }]}
          >
            <TouchableOpacity
              activeOpacity={0.85}
              disabled={deleting}
              onPress={handleDeleteSelected}
              style={styles.deleteButton}
              accessibilityRole="button"
            >
              <LinearGradient colors={colors.roseGradient} style={styles.deleteGradient}>
                {deleting ? (
                  <ActivityIndicator color={colors.textOnAccent} size="small" />
                ) : (
                  <Trash2 color={colors.textOnAccent} size={18} />
                )}
                <Text style={styles.deleteButtonText}>
                  {t('heavy_media.delete_selected', {
                    count: selectedIds.size,
                    size: formatByteSize(selection.totalBytes),
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
    backgroundColor: colors.canvas,
  },
  safeArea: {
    flex: 1,
  },
  filterSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  cardWrapper: {
    marginBottom: 10,
  },
  cardContent: {
    padding: 11,
    flexDirection: 'row',
    alignItems: 'center',
  },
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: 15,
    marginRight: 12,
    backgroundColor: colors.surfaceSunken,
  },
  cardDetails: {
    flex: 1,
    paddingRight: 8,
  },
  mediaName: {
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 5,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceSunken,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  typeText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  checkbox: {
    width: 25,
    height: 25,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: colors.dangerRose,
    borderColor: colors.dangerRose,
  },
  floatingBar: {
    position: 'absolute',
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
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  deleteGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  deleteButtonText: {
    color: colors.textOnAccent,
    fontSize: 14,
    fontWeight: '900',
  },
});
