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
      const photoAsset: PhotoAsset = {
        ...asset,
        fileSize: 2.8 * 1024 * 1024, // estimated baseline for fast loading
      };
      list.push(photoAsset);
      monthMap.set(key, list);
    }

    const progress = await getTimelineProgress();
    const groups: MonthGroup[] = [];

    monthMap.forEach((assets, key) => {
      const [yearStr, monthStr] = key.split('-');
      const year = parseInt(yearStr, 10);
      const monthIndex = parseInt(monthStr, 10) - 1;
      const title = `${monthNames[monthIndex]} ${year}`;

      const totalSizeBytes = assets.reduce((sum, a) => sum + (a.fileSize || 2.8 * 1024 * 1024), 0);
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
