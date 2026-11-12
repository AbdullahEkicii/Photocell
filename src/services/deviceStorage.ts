import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library/legacy';

import { formatByteSize } from './cacheCleaner';

export interface StorageBreakdown {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  photoBytes: number;
  videoBytes: number;
  /** Everything used that is not gallery media (OS, apps, documents). */
  otherBytes: number;
  photoCount: number;
  videoCount: number;
  formattedTotal: string;
  formattedFree: string;
  formattedUsed: string;
  formattedPhotos: string;
  formattedVideos: string;
  /** Percent of the disk that is still free, 0-100. */
  freePercent: number;
  /** True when the media figures are extrapolated from a sample, not exact. */
  mediaIsEstimated: boolean;
}

/** How many assets per media type we measure before extrapolating. */
const MEDIA_SAMPLE_SIZE = 40;

const emptyBreakdown = (): StorageBreakdown => ({
  totalBytes: 0,
  freeBytes: 0,
  usedBytes: 0,
  photoBytes: 0,
  videoBytes: 0,
  otherBytes: 0,
  photoCount: 0,
  videoCount: 0,
  formattedTotal: formatByteSize(0),
  formattedFree: formatByteSize(0),
  formattedUsed: formatByteSize(0),
  formattedPhotos: formatByteSize(0),
  formattedVideos: formatByteSize(0),
  freePercent: 0,
  mediaIsEstimated: false,
});

/**
 * Measures a sample of one media type and extrapolates to the full library.
 *
 * Reading every asset's size would take minutes on a large gallery, so we
 * average a bounded sample. The caller is told the result is an estimate.
 */
async function measureMediaType(
  mediaType: MediaLibrary.MediaTypeValue
): Promise<{ bytes: number; count: number; estimated: boolean }> {
  const page = await MediaLibrary.getAssetsAsync({
    first: MEDIA_SAMPLE_SIZE,
    mediaType: [mediaType],
    sortBy: [['creationTime', false]],
  });

  const totalCount = page.totalCount ?? page.assets.length;
  if (totalCount === 0) return { bytes: 0, count: 0, estimated: false };

  let sampledBytes = 0;
  let sampledFiles = 0;

  for (const asset of page.assets) {
    try {
      let uri = asset.uri;
      if (uri.startsWith('ph://') || uri.startsWith('content://')) {
        const info = await MediaLibrary.getAssetInfoAsync(asset).catch(() => null);
        if (info?.localUri) uri = info.localUri;
      }
      const fileInfo = await FileSystem.getInfoAsync(uri).catch(() => null);
      if (fileInfo?.exists && 'size' in fileInfo && typeof fileInfo.size === 'number') {
        sampledBytes += fileInfo.size;
        sampledFiles += 1;
      }
    } catch {
      // Asset unreadable (deleted mid-scan, or outside limited access) — skip it.
    }
  }

  if (sampledFiles === 0) return { bytes: 0, count: totalCount, estimated: false };

  const averageBytes = sampledBytes / sampledFiles;
  const estimated = totalCount > sampledFiles;

  return {
    bytes: Math.round(averageBytes * totalCount),
    count: totalCount,
    estimated,
  };
}

/**
 * Reads the real disk capacity plus a gallery breakdown.
 *
 * Returns zeroed figures rather than invented ones if the platform or the
 * permission state makes the numbers unavailable, so callers can hide the
 * widget instead of showing fiction.
 */
export async function getStorageBreakdown(): Promise<StorageBreakdown> {
  try {
    const [totalBytes, freeBytes] = await Promise.all([
      FileSystem.getTotalDiskCapacityAsync(),
      FileSystem.getFreeDiskStorageAsync(),
    ]);

    if (!totalBytes || totalBytes <= 0) return emptyBreakdown();

    const usedBytes = Math.max(0, totalBytes - freeBytes);

    let photoBytes = 0;
    let videoBytes = 0;
    let photoCount = 0;
    let videoCount = 0;
    let mediaIsEstimated = false;

    const permission = await MediaLibrary.getPermissionsAsync().catch(() => null);
    if (permission?.granted) {
      const [photos, videos] = await Promise.all([
        measureMediaType('photo').catch(() => null),
        measureMediaType('video').catch(() => null),
      ]);

      if (photos) {
        photoBytes = photos.bytes;
        photoCount = photos.count;
        mediaIsEstimated = mediaIsEstimated || photos.estimated;
      }
      if (videos) {
        videoBytes = videos.bytes;
        videoCount = videos.count;
        mediaIsEstimated = mediaIsEstimated || videos.estimated;
      }
    }

    // Media can only ever be part of what is used; clamp so the bar never
    // overflows when the extrapolation runs high.
    const mediaBytes = Math.min(photoBytes + videoBytes, usedBytes);
    if (mediaBytes < photoBytes + videoBytes && photoBytes + videoBytes > 0) {
      const ratio = mediaBytes / (photoBytes + videoBytes);
      photoBytes = Math.round(photoBytes * ratio);
      videoBytes = Math.round(videoBytes * ratio);
    }

    return {
      totalBytes,
      freeBytes,
      usedBytes,
      photoBytes,
      videoBytes,
      otherBytes: Math.max(0, usedBytes - photoBytes - videoBytes),
      photoCount,
      videoCount,
      formattedTotal: formatByteSize(totalBytes),
      formattedFree: formatByteSize(freeBytes),
      formattedUsed: formatByteSize(usedBytes),
      formattedPhotos: formatByteSize(photoBytes),
      formattedVideos: formatByteSize(videoBytes),
      freePercent: Math.round((freeBytes / totalBytes) * 100),
      mediaIsEstimated,
    };
  } catch (err) {
    console.warn('Could not read device storage:', err);
    return emptyBreakdown();
  }
}
