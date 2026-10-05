import * as MediaLibrary from 'expo-media-library/legacy';
import * as FileSystem from 'expo-file-system/legacy';
import { PhotoAsset } from './mediaScanner';
import { formatByteSize } from './cacheCleaner';
import { ScanCacheService } from './scanCacheService';

export interface MonthGroup {
  id: string; // e.g. "2026-08"
  year: number;
  monthIndex: number; // 0-11
  title: string; // e.g. "Ağustos 2026"
  count: number;
  totalSizeBytes: number;
  formattedSize: string;
  coverAssetUri: string;
  assets: PhotoAsset[];
  reviewedCount: number;
  percentReviewed: number;
}

const TIMELINE_PROGRESS_FILE = `${(FileSystem as any).documentDirectory || ''}photocell_timeline_progress.json`;

interface StoredProgress {
  [monthId: string]: {
    reviewedAssetIds: string[];
    isCompleted: boolean;
  };
}

export async function getTimelineProgress(): Promise<StoredProgress> {
  try {
    const info = await FileSystem.getInfoAsync(TIMELINE_PROGRESS_FILE);
    if (info.exists) {
      const content = await FileSystem.readAsStringAsync(TIMELINE_PROGRESS_FILE);
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn('Could not read timeline progress:', err);
  }
  return {};
}

export async function saveMonthProgress(monthId: string, reviewedIds: string[], isCompleted: boolean): Promise<void> {
  try {
    const current = await getTimelineProgress();
    current[monthId] = {
      reviewedAssetIds: reviewedIds,
      isCompleted,
    };
    await FileSystem.writeAsStringAsync(TIMELINE_PROGRESS_FILE, JSON.stringify(current));
    ScanCacheService.invalidateTimeline();
  } catch (err) {
    console.warn('Could not save timeline progress:', err);
  }
}

/**
 * Merges newly reviewed asset ids into a month's stored progress.
 *
 * Called when the reviewer is left, so a partially reviewed month keeps its
 * percentage instead of resetting to zero on the next visit.
 */
export async function addReviewedAssets(
  monthId: string,
  reviewedIds: string[],
  totalInMonth?: number
): Promise<void> {
  if (!monthId || reviewedIds.length === 0) return;
  try {
    const current = await getTimelineProgress();
    const existing = current[monthId]?.reviewedAssetIds ?? [];
    const merged = Array.from(new Set([...existing, ...reviewedIds]));
    const isCompleted =
      typeof totalInMonth === 'number' && totalInMonth > 0
        ? merged.length >= totalInMonth
        : current[monthId]?.isCompleted ?? false;

    await saveMonthProgress(monthId, merged, isCompleted);
  } catch (err) {
    console.warn('Could not record reviewed assets:', err);
  }
}

/**
 * Drops asset ids that no longer exist so a month whose photos were deleted
 * elsewhere does not stay pinned at an impossible percentage.
 */
export async function pruneMonthProgress(monthId: string, livingIds: string[]): Promise<void> {
  try {
    const current = await getTimelineProgress();
    const entry = current[monthId];
    if (!entry) return;

    const living = new Set(livingIds);
    const kept = entry.reviewedAssetIds.filter((id) => living.has(id));
    if (kept.length === entry.reviewedAssetIds.length) return;

    await saveMonthProgress(monthId, kept, kept.length >= livingIds.length && livingIds.length > 0);
  } catch (err) {
    console.warn('Could not prune timeline progress:', err);
  }
}

/** Files measured per month before the rest are averaged from that sample. */
const MONTH_SAMPLE_SIZE = 12;

/** Resolves an asset to a local path and reads its real size, or 0 if unknown. */
async function measureAssetSize(asset: PhotoAsset): Promise<number> {
  try {
    let uri = asset.uri;
    if (uri.startsWith('ph://') || uri.startsWith('content://')) {
      const info = await MediaLibrary.getAssetInfoAsync(asset).catch(() => null);
      if (info?.localUri) uri = info.localUri;
    }
    const fileInfo = await FileSystem.getInfoAsync(uri).catch(() => null);
    if (fileInfo?.exists && 'size' in fileInfo && typeof fileInfo.size === 'number') {
      return fileInfo.size;
    }
  } catch {
    // Unreadable asset — treated as unmeasured rather than guessed.
  }
  return 0;
}

const MONTH_NAMES_TR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
];

const MONTH_NAMES_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export async function fetchTimelineMonthGroups(language: string = 'tr', forceRefresh = false): Promise<MonthGroup[]> {
  if (!forceRefresh) {
    const cached = ScanCacheService.getTimeline();
    if (cached) return cached;
  }
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
    if (status !== 'granted') return [];

    const page = await MediaLibrary.getAssetsAsync({
      mediaType: 'photo',
      first: 1000,
      sortBy: [['creationTime', false]],
    });

    const monthMap = new Map<string, PhotoAsset[]>();
    const monthNames = language.startsWith('tr') ? MONTH_NAMES_TR : MONTH_NAMES_EN;

    for (const asset of page.assets) {
      const date = new Date(asset.creationTime || Date.now());
      const year = date.getFullYear();
      const month = date.getMonth();
      const key = `${year}-${String(month + 1).padStart(2, '0')}`;

      const list = monthMap.get(key) || [];
      list.push({ ...asset } as PhotoAsset);
      monthMap.set(key, list);
    }

    // Measure a bounded sample per month and extrapolate. Reading every file
    // would stall the screen on a large gallery, but the previous flat 2.8 MB
    // guess meant the displayed month sizes were pure invention.
    await Promise.all(
      Array.from(monthMap.values()).map(async (assets) => {
        const sample = assets.slice(0, MONTH_SAMPLE_SIZE);
        let sampledBytes = 0;
        let sampledCount = 0;

        for (const asset of sample) {
          const size = await measureAssetSize(asset);
          if (size > 0) {
            asset.fileSize = size;
            sampledBytes += size;
            sampledCount += 1;
          }
        }

        if (sampledCount === 0) return;
        const average = sampledBytes / sampledCount;
        for (const asset of assets) {
          if (!asset.fileSize) asset.fileSize = Math.round(average);
        }
      })
    );

    const progress = await getTimelineProgress();
    const groups: MonthGroup[] = [];

    monthMap.forEach((assets, key) => {
      const [yearStr, monthStr] = key.split('-');
      const year = parseInt(yearStr, 10);
      const monthIndex = parseInt(monthStr, 10) - 1;
      const title = `${monthNames[monthIndex]} ${year}`;

      const totalSizeBytes = assets.reduce((sum, a) => sum + (a.fileSize || 0), 0);
      const monthProgress = progress[key];
      const reviewedCount = monthProgress?.reviewedAssetIds?.length || 0;
      const percentReviewed = assets.length > 0 ? Math.min(100, Math.round((reviewedCount / assets.length) * 100)) : 0;

      groups.push({
        id: key,
        year,
        monthIndex,
        title,
        count: assets.length,
        totalSizeBytes,
        formattedSize: formatByteSize(totalSizeBytes),
        coverAssetUri: assets[0]?.uri || '',
        assets,
        reviewedCount,
        percentReviewed,
      });
    });

    // Sort newest months first
    groups.sort((a, b) => b.id.localeCompare(a.id));

    ScanCacheService.setTimeline(groups);
    return groups;
  } catch (error) {
    console.error('Failed fetching timeline groups:', error);
    return [];
  }
}
