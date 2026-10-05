import * as FileSystem from 'expo-file-system/legacy';

export interface RealCacheFile {
  uri: string;
  name: string;
  sizeBytes: number;
  category: 'system' | 'app' | 'browser';
}

export interface CacheCategory {
  id: 'system' | 'app' | 'browser';
  titleKey: string;
  defaultTitle: string;
  sizeBytes: number;
  formattedSize: string;
  iconName: 'system' | 'app' | 'browser';
  accentColor: string;
  selected: boolean;
  fileCount: number;
}

export interface CacheScanResult {
  totalCacheBytes: number;
  formattedTotalCache: string;
  categories: CacheCategory[];
  totalLifetimeSavedFormatted: string;
  photosSavedFormatted: string;
  videosSavedFormatted: string;
  files: RealCacheFile[];
}

const STATS_FILE_PATH = `${(FileSystem as any).documentDirectory || ''}photocell_stats.json`;

interface SavedStats {
  lifetimeSavedBytes: number;
  photosSavedBytes: number;
  videosSavedBytes: number;
}

/**
 * Reads persistent lifetime cleaning stats from local JSON file
 */
export async function getStoredStats(): Promise<SavedStats> {
  try {
    const info = await FileSystem.getInfoAsync(STATS_FILE_PATH);
    if (info.exists) {
      const content = await FileSystem.readAsStringAsync(STATS_FILE_PATH);
      const parsed = JSON.parse(content);
      return {
        lifetimeSavedBytes: parsed.lifetimeSavedBytes || 0,
        photosSavedBytes: parsed.photosSavedBytes || 0,
        videosSavedBytes: parsed.videosSavedBytes || 0,
      };
    }
  } catch (err) {
    console.warn('Could not read stats file:', err);
  }
  // A fresh install has genuinely saved nothing. Seeding a baseline here made
  // the app claim gigabytes it never freed.
  return {
    lifetimeSavedBytes: 0,
    photosSavedBytes: 0,
    videosSavedBytes: 0,
  };
}

/**
 * Saves updated lifetime cleaning stats to local JSON file
 */
export async function recordCleanedPhotos(freedBytes: number): Promise<void> {
  if (!freedBytes || freedBytes <= 0) return;
  try {
    const currentStats = await getStoredStats();
    const newStats: SavedStats = {
      lifetimeSavedBytes: currentStats.lifetimeSavedBytes + freedBytes,
      photosSavedBytes: currentStats.photosSavedBytes + freedBytes,
      videosSavedBytes: currentStats.videosSavedBytes,
    };
    await saveStoredStats(newStats);
  } catch (err) {
    console.warn('Could not record cleaned photos stats:', err);
  }
}

export async function recordCleanedVideos(savedBytes: number): Promise<void> {
  if (!savedBytes || savedBytes <= 0) return;
  try {
    const currentStats = await getStoredStats();
    const newStats: SavedStats = {
      lifetimeSavedBytes: currentStats.lifetimeSavedBytes + savedBytes,
      photosSavedBytes: currentStats.photosSavedBytes,
      videosSavedBytes: currentStats.videosSavedBytes + savedBytes,
    };
    await saveStoredStats(newStats);
  } catch (err) {
    console.warn('Could not record cleaned videos stats:', err);
  }
}

export async function saveStoredStats(stats: SavedStats): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(STATS_FILE_PATH, JSON.stringify(stats));
  } catch (err) {
    console.warn('Could not write stats file:', err);
  }
}

export const formatByteSize = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

/**
 * Classifies a file into system, app, or browser/media cache based on extension & name
 */
function classifyFileCategory(filename: string, uri: string): 'system' | 'app' | 'browser' {
  const lower = filename.toLowerCase();
  if (
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.png') ||
    lower.endsWith('.webp') ||
    lower.endsWith('.heic') ||
    lower.includes('thumb') ||
    lower.includes('image')
  ) {
    return 'app';
  }

  if (
    lower.endsWith('.mp4') ||
    lower.endsWith('.mov') ||
    lower.endsWith('.m4v') ||
    lower.endsWith('.mkv') ||
    lower.includes('video') ||
    lower.includes('compressed') ||
    lower.includes('http') ||
    lower.includes('cache_web')
  ) {
    return 'browser';
  }

  return 'system';
}

/**
 * Deeply scans a directory recursively and collects real file stats
 */
async function scanDirectoryRecursive(
  dirUri: string,
  collectedFiles: RealCacheFile[]
): Promise<number> {
  let totalBytes = 0;
  try {
    const entries = await FileSystem.readDirectoryAsync(dirUri);

    for (const entry of entries) {
      const fileUri = `${dirUri}${entry}`;
      const info = await FileSystem.getInfoAsync(fileUri);

      if (info.exists) {
        if (info.isDirectory) {
          totalBytes += await scanDirectoryRecursive(`${fileUri}/`, collectedFiles);
        } else {
          const size = 'size' in info && typeof info.size === 'number' ? info.size : 0;
          totalBytes += size;
          const category = classifyFileCategory(entry, fileUri);
          collectedFiles.push({
            uri: fileUri,
            name: entry,
            sizeBytes: size,
            category,
          });
        }
      }
    }
  } catch (err) {
    // Directory might be restricted or empty
  }
  return totalBytes;
}

/**
 * Scans the app cache directory and reports exactly what is there.
 */
export const scanDeviceCache = async (): Promise<CacheScanResult> => {
  const collectedFiles: RealCacheFile[] = [];
  const cacheDir = (FileSystem as any).cacheDirectory || '';

  if (cacheDir) {
    await scanDirectoryRecursive(cacheDir, collectedFiles);
  }

  let systemBytes = 0;
  let systemCount = 0;
  let appBytes = 0;
  let appCount = 0;
  let browserBytes = 0;
  let browserCount = 0;

  for (const file of collectedFiles) {
    if (file.category === 'system') {
      systemBytes += file.sizeBytes;
      systemCount++;
    } else if (file.category === 'app') {
      appBytes += file.sizeBytes;
      appCount++;
    } else if (file.category === 'browser') {
      browserBytes += file.sizeBytes;
      browserCount++;
    }
  }

  const totalCacheBytes = systemBytes + appBytes + browserBytes;
  const storedStats = await getStoredStats();

  return {
    totalCacheBytes,
    formattedTotalCache: formatByteSize(totalCacheBytes),
    totalLifetimeSavedFormatted: formatByteSize(storedStats.lifetimeSavedBytes),
    photosSavedFormatted: formatByteSize(storedStats.photosSavedBytes),
    videosSavedFormatted: formatByteSize(storedStats.videosSavedBytes),
    files: collectedFiles,
    categories: [
      {
        id: 'system',
        titleKey: 'report.system_cache',
        defaultTitle: 'System Cache',
        sizeBytes: systemBytes,
        formattedSize: formatByteSize(systemBytes),
        iconName: 'system',
        accentColor: '#9333EA',
        selected: true,
        fileCount: systemCount,
      },
      {
        id: 'app',
        titleKey: 'report.app_temp',
        defaultTitle: 'App Temporary Files',
        sizeBytes: appBytes,
        formattedSize: formatByteSize(appBytes),
        iconName: 'app',
        accentColor: '#D946EF',
        selected: true,
        fileCount: appCount,
      },
      {
        id: 'browser',
        titleKey: 'report.browser_data',
        defaultTitle: 'Browser & Media Cache',
        sizeBytes: browserBytes,
        formattedSize: formatByteSize(browserBytes),
        iconName: 'browser',
        accentColor: '#10B981',
        selected: true,
        fileCount: browserCount,
      },
    ],
  };
};

/**
 * Real device cache file deletion function with persistent stats recording
 */
export const clearSelectedCache = async (
  selectedCategoryIds: string[],
  scannedFiles: RealCacheFile[]
): Promise<number> => {
  let clearedBytes = 0;
  let clearedPhotos = 0;
  let clearedVideos = 0;

  // 1. Delete physical cache files found
  for (const file of scannedFiles) {
    if (selectedCategoryIds.includes(file.category)) {
      try {
        await FileSystem.deleteAsync(file.uri, { idempotent: true });
        clearedBytes += file.sizeBytes;

        if (file.category === 'app') {
          clearedPhotos += file.sizeBytes;
        } else if (file.category === 'browser') {
          clearedVideos += file.sizeBytes;
        }
      } catch (err) {
        console.warn(`Could not delete cache file ${file.uri}:`, err);
      }
    }
  }

  // Nothing deleted means nothing to record — reporting an invented amount here
  // both lied to the user and permanently inflated the lifetime counters.
  if (clearedBytes === 0) return 0;

  // 2. Update persistent stored stats
  const currentStats = await getStoredStats();
  const newStats: SavedStats = {
    lifetimeSavedBytes: currentStats.lifetimeSavedBytes + clearedBytes,
    photosSavedBytes: currentStats.photosSavedBytes + clearedPhotos,
    videosSavedBytes: currentStats.videosSavedBytes + clearedVideos,
  };

  await saveStoredStats(newStats);

  return clearedBytes;
};
