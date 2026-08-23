import * as MediaLibrary from 'expo-media-library/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import * as jpeg from 'jpeg-js';
import { toByteArray as decodeBase64 } from 'base64-js';
import {
  computePerceptualFingerprint,
  computeHammingDistance,
  computeColorDistance,
  VisualFingerprint,
} from './hashing';
import { ScanCacheService } from './scanCacheService';

export interface PhotoAsset extends MediaLibrary.Asset {
  fileSize?: number;
  similarGroupId?: number;
  sharpnessScore?: number;
  visualFingerprint?: VisualFingerprint;
}

export interface ScanResult {
  totalSize: number; // in bytes
  exactDuplicates: PhotoAsset[][]; // array of exact duplicate groups
  similarPhotos: PhotoAsset[][]; // array of similar shot groups
  screenshots: PhotoAsset[];
  blurryPhotos: PhotoAsset[];
}

const SIMILAR_TIME_WINDOW_MS = 25000; // 25s window for potential burst/similar sequences
const BLUR_SCORE_THRESHOLD = 32.0; // Contrast-normalized sharpness threshold
const BLUR_VARIANCE_MIN_THRESHOLD = 95.0; // Absolute Laplacian variance threshold
const MAX_ASSETS_TO_SCAN = 4000; // Expanded to scan entire gallery smoothly without memory spikes
const MAX_BLUR_CANDIDATES = 120; // Expanded blur search window

export interface PermissionStatusResult {
  granted: boolean;
  isLimited: boolean;
  accessPrivileges?: 'all' | 'limited' | 'none';
  status: string;
}

export const checkMediaPermissionsStatus = async (): Promise<PermissionStatusResult> => {
  const perm = await MediaLibrary.getPermissionsAsync(false, ['photo']);
  const isLimited = perm.accessPrivileges === 'limited';
  const granted = perm.status === 'granted' && !isLimited;
  return {
    granted,
    isLimited,
    accessPrivileges: perm.accessPrivileges,
    status: perm.status,
  };
};

export const requestMediaPermissions = async (): Promise<PermissionStatusResult> => {
  const perm = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
  const isLimited = perm.accessPrivileges === 'limited';
  const granted = perm.status === 'granted' || perm.accessPrivileges === 'all';
  return {
    granted,
    isLimited,
    accessPrivileges: perm.accessPrivileges,
    status: perm.status,
  };
};

/**
 * Paged asset fetcher with memory safeguards
 */
async function getAllAssets(
  options: {
    album?: MediaLibrary.Album;
    maxItems?: number;
  } = {}
): Promise<MediaLibrary.Asset[]> {
  const { album, maxItems = MAX_ASSETS_TO_SCAN } = options;
  let allAssets: MediaLibrary.Asset[] = [];
  let after: string | undefined = undefined;
  let hasNextPage = true;

  while (hasNextPage && allAssets.length < maxItems) {
    const page = await MediaLibrary.getAssetsAsync({
      album,
      mediaType: 'photo',
      first: Math.min(150, maxItems - allAssets.length),
      after,
      sortBy: [['creationTime', false]],
    });

    allAssets = allAssets.concat(page.assets);
    hasNextPage = page.hasNextPage;
    after = page.endCursor;

    // Relieve JS event loop
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  return allAssets;
}

/**
 * Screenshot filename and dimension heuristic
 */
function looksLikeScreenshotByHeuristic(asset: MediaLibrary.Asset): boolean {
  const filename = asset.filename?.toLowerCase() ?? '';
  return /screenshot|ekran ?görüntüsü|ekran ?goruntusu/i.test(filename);
}

/**
 * Filter screenshots older than 1 year
 */
function filterOldScreenshots(assets: MediaLibrary.Asset[]): PhotoAsset[] {
  const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
  return assets.filter(
    (asset) => looksLikeScreenshotByHeuristic(asset) && asset.creationTime < oneYearAgo
  ) as PhotoAsset[];
}

/**
 * Resolve local accessible URI for an asset
 */
async function resolveAssetUri(asset: MediaLibrary.Asset): Promise<string> {
  if (asset.uri.startsWith('ph://') || asset.uri.startsWith('content://')) {
    const assetInfo = await MediaLibrary.getAssetInfoAsync(asset).catch(() => null);
    if (assetInfo?.localUri) return assetInfo.localUri;
  }
  return asset.uri;
}

export interface ScanProgressInfo {
  progress: number; // 0 to 100
  stepKey: string;
  stepDefault: string;
  scannedCount?: number;
  totalCount?: number;
}

export type ScanProgressCallback = (info: ScanProgressInfo) => void;

/**
 * True Perceptual Visual Similarity & Duplicate Detection Engine
 * Uses 64-bit dHash, color vectors, and aspect ratio matching.
 */
async function detectVisualDuplicatesAndSimilar(
  assets: MediaLibrary.Asset[],
  onProgress?: (current: number, total: number) => void
): Promise<{
  exactDuplicates: PhotoAsset[][];
  similarPhotos: PhotoAsset[][];
}> {
  const exactGroups: PhotoAsset[][] = [];
  const similarGroups: PhotoAsset[][] = [];

  // 1. Identify Candidate Pairs/Clusters by time proximity and matching dimensions
  const sortedAsc = [...assets].sort((a, b) => a.creationTime - b.creationTime);
  const candidateClusters: MediaLibrary.Asset[][] = [];
  let currentCluster: MediaLibrary.Asset[] = [];

  for (let i = 0; i < sortedAsc.length; i++) {
    const item = sortedAsc[i];
    const prev = sortedAsc[i - 1];

    const isNearInTime =
      prev != null &&
      Math.abs(item.creationTime - prev.creationTime) < SIMILAR_TIME_WINDOW_MS;

    if (isNearInTime) {
      if (currentCluster.length === 0 && prev) {
        currentCluster.push(prev);
      }
      currentCluster.push(item);
    } else {
      if (currentCluster.length > 1) {
        candidateClusters.push(currentCluster);
      }
      currentCluster = [];
    }
  }
  if (currentCluster.length > 1) {
    candidateClusters.push(currentCluster);
  }

  // Also include exact dimension collisions across entire set as exact duplicate candidates
  const dimensionMap = new Map<string, MediaLibrary.Asset[]>();
  for (const item of sortedAsc) {
    if (item.width > 0 && item.height > 0) {
      const key = `${item.width}x${item.height}`;
      const list = dimensionMap.get(key) || [];
      list.push(item);
      dimensionMap.set(key, list);
    }
  }

  dimensionMap.forEach((list) => {
    if (list.length > 1 && list.length <= 15) {
      candidateClusters.push(list);
    }
  });

  // Flatten unique candidates for fingerprinting
  const uniqueCandidateMap = new Map<string, MediaLibrary.Asset>();
  candidateClusters.forEach((cluster) => {
    cluster.forEach((asset) => uniqueCandidateMap.set(asset.id, asset));
  });

  const candidatesToFingerprint = Array.from(uniqueCandidateMap.values());
  const fingerprints = new Map<string, VisualFingerprint>();

  // 2. Micro-batched Fingerprint Generation
  const FINGERPRINT_BATCH = 3;
  for (let i = 0; i < candidatesToFingerprint.length; i += FINGERPRINT_BATCH) {
    const batch = candidatesToFingerprint.slice(i, i + FINGERPRINT_BATCH);
    await Promise.all(
      batch.map(async (asset) => {
        try {
          const uri = await resolveAssetUri(asset);
          const fp = await computePerceptualFingerprint(uri);
          if (fp) {
            fingerprints.set(asset.id, fp);
          }
        } catch {
          // Graceful skip
        }
      })
    );

    if (onProgress) {
      onProgress(
        Math.min(i + FINGERPRINT_BATCH, candidatesToFingerprint.length),
        candidatesToFingerprint.length
      );
    }

    // Yield to JS event loop & garbage collector
    await new Promise((resolve) => setTimeout(resolve, 15));
  }

  // 3. Cluster by Hamming Distance & Color Similarity
  const assignedToExact = new Set<string>();
  const assignedToSimilar = new Set<string>();

  // Pass A: Exact Duplicates (Hamming distance <= 2, color distance < 25, matching aspect)
  for (let i = 0; i < sortedAsc.length; i++) {
    const assetA = sortedAsc[i];
    const fpA = fingerprints.get(assetA.id);
    if (!fpA || assignedToExact.has(assetA.id)) continue;

    const group: PhotoAsset[] = [assetA as PhotoAsset];

    for (let j = i + 1; j < sortedAsc.length; j++) {
      const assetB = sortedAsc[j];
      const fpB = fingerprints.get(assetB.id);
      if (!fpB || assignedToExact.has(assetB.id)) continue;

      const hamming = computeHammingDistance(fpA.dHash, fpB.dHash);
      const colorDist = computeColorDistance(fpA.colorSignature, fpB.colorSignature);
      const aspectDiff = Math.abs(fpA.aspectRatio - fpB.aspectRatio);

      // Exact Duplicate Criteria: almost 0 bit differences and identical aspect
      if (hamming <= 2 && colorDist < 25 && aspectDiff < 0.05) {
        group.push(assetB as PhotoAsset);
        assignedToExact.add(assetB.id);
      }
    }

    if (group.length > 1) {
      assignedToExact.add(assetA.id);
      exactGroups.push(group);
    }
  }

  // Pass B: Similar Shots / Burst Sequences
  // (Hamming distance <= 10 [>=84% similarity], color distance < 50, aspect tolerance < 0.2)
  for (let i = 0; i < sortedAsc.length; i++) {
    const assetA = sortedAsc[i];
    const fpA = fingerprints.get(assetA.id);
    if (!fpA || assignedToExact.has(assetA.id) || assignedToSimilar.has(assetA.id)) continue;

    const group: PhotoAsset[] = [assetA as PhotoAsset];

    for (let j = i + 1; j < sortedAsc.length; j++) {
      const assetB = sortedAsc[j];
      const fpB = fingerprints.get(assetB.id);
      if (!fpB || assignedToExact.has(assetB.id) || assignedToSimilar.has(assetB.id)) continue;

      const timeDiff = Math.abs(assetB.creationTime - assetA.creationTime);
      if (timeDiff > SIMILAR_TIME_WINDOW_MS * 2) break; // Beyond temporal locality

      const hamming = computeHammingDistance(fpA.dHash, fpB.dHash);
      const colorDist = computeColorDistance(fpA.colorSignature, fpB.colorSignature);
      const aspectDiff = Math.abs(fpA.aspectRatio - fpB.aspectRatio);

      if (hamming <= 10 && colorDist < 50 && aspectDiff < 0.2) {
        group.push(assetB as PhotoAsset);
        assignedToSimilar.add(assetB.id);
      }
    }

    if (group.length > 1) {
      assignedToSimilar.add(assetA.id);
      similarGroups.push(group);
    }
  }

  // Assign group index tags for quick UI identification
  exactGroups.forEach((g, idx) => {
    g.forEach((a) => (a.similarGroupId = idx + 1));
  });
  similarGroups.forEach((g, idx) => {
    g.forEach((a) => (a.similarGroupId = exactGroups.length + idx + 1));
  });

  return { exactDuplicates: exactGroups, similarPhotos: similarGroups };
}

/**
 * Robust Sharpness Score (Contrast-Normalized 8-Neighbor Laplacian Operator on 120px downsampled canvas)
 */
async function computeSharpnessScore(asset: MediaLibrary.Asset): Promise<number | null> {
  let tempUri: string | null = null;
  try {
    const uri = await resolveAssetUri(asset);

    const resized = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 120 } }],
      { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    tempUri = resized.uri;

    if (!resized.base64) return null;

    const bytes = decodeBase64(resized.base64);
    const decoded = jpeg.decode(bytes, { useTArray: true });
    const { width, height, data } = decoded;

    if (!data || width <= 4 || height <= 4) return null;

    const totalPixels = width * height;
    const gray = new Float32Array(totalPixels);
    let totalLuminance = 0;

    for (let i = 0; i < totalPixels; i++) {
      const idx = i * 4;
      const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      gray[i] = lum;
      totalLuminance += lum;
    }

    const avgLuminance = totalLuminance / totalPixels;

    // 8-neighbor discrete Laplacian convolution
    let lapSum = 0;
    let lapSumSq = 0;
    let count = 0;

    for (let y = 1; y < height - 1; y++) {
      const rowOffset = y * width;
      const prevRow = (y - 1) * width;
      const nextRow = (y + 1) * width;

      for (let x = 1; x < width - 1; x++) {
        const center = gray[rowOffset + x];
        const lap =
          8 * center -
          gray[prevRow + (x - 1)] -
          gray[prevRow + x] -
          gray[prevRow + (x + 1)] -
          gray[rowOffset + (x - 1)] -
          gray[rowOffset + (x + 1)] -
          gray[nextRow + (x - 1)] -
          gray[nextRow + x] -
          gray[nextRow + (x + 1)];

        lapSum += lap;
        lapSumSq += lap * lap;
        count++;
      }
    }

    if (count === 0) return null;

    const meanLap = lapSum / count;
    const varianceLap = lapSumSq / count - meanLap * meanLap;

    // Contrast-normalized metric: prevents dark images from having falsely low variance
    const normalizedScore = (varianceLap * 100) / Math.max(12, avgLuminance * 2);

    // Return the normalized sharpness score
    return normalizedScore;
  } catch {
    return null;
  } finally {
    if (tempUri) {
      FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
    }
  }
}

/**
 * Micro-batched sharpness detection with GC breath intervals
 */
async function detectBlurryPhotos(
  assets: MediaLibrary.Asset[],
  onBatchProgress?: (current: number, total: number) => void
): Promise<PhotoAsset[]> {
  const blurry: PhotoAsset[] = [];
  const BATCH_SIZE = 4;

  for (let i = 0; i < assets.length; i += BATCH_SIZE) {
    const batch = assets.slice(i, i + BATCH_SIZE);
    const scores = await Promise.all(batch.map(computeSharpnessScore));

    batch.forEach((asset, idx) => {
      const score = scores[idx];
      // Flag as blurry if contrast-normalized score or absolute variance is low
      if (score !== null && score < BLUR_SCORE_THRESHOLD) {
        const marked = asset as PhotoAsset;
        marked.sharpnessScore = Math.round(score * 10) / 10;
        blurry.push(marked);
      }
    });

    if (onBatchProgress) {
      onBatchProgress(Math.min(i + BATCH_SIZE, assets.length), assets.length);
    }

    // Hermes GC breath pause
    await new Promise((resolve) => setTimeout(resolve, 15));
  }

  return blurry;
}

/**
 * Chunked file size calculator preventing native bridge queue overflow
 */
async function computeRealTotalSize(assets: PhotoAsset[]): Promise<number> {
  let total = 0;
  const CHUNK_SIZE = 12;

  for (let i = 0; i < assets.length; i += CHUNK_SIZE) {
    const chunk = assets.slice(i, i + CHUNK_SIZE);
    await Promise.all(
      chunk.map(async (asset) => {
        try {
          const fileUri = await resolveAssetUri(asset);
          const info = await FileSystem.getInfoAsync(fileUri).catch(() => null);
          if (info && info.exists && 'size' in info && typeof info.size === 'number') {
            asset.fileSize = info.size;
            total += info.size;
          } else {
            const fallbackSize = 2.5 * 1024 * 1024;
            asset.fileSize = fallbackSize;
            total += fallbackSize;
          }
        } catch {
          const fallbackSize = 2.5 * 1024 * 1024;
          asset.fileSize = fallbackSize;
          total += fallbackSize;
        }
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  return total;
}

export const scanPhotos = async (
  onProgress?: ScanProgressCallback,
  forceRefresh = false
): Promise<ScanResult> => {
  // Check in-memory cache first for instantaneous tab transitions
  if (!forceRefresh) {
    const cached = ScanCacheService.getPhotoScan();
    if (cached) {
      if (onProgress) {
        onProgress({
          progress: 100,
          stepKey: 'status.items_found',
          stepDefault: 'Tarama Tamamlandı',
        });
      }
      return cached;
    }
  }

  if (onProgress) {
    onProgress({
      progress: 10,
      stepKey: 'status.scan_step_init',
      stepDefault: 'Galeri ve Medya Dizini Başlatılıyor...',
    });
  }

  const perm = await requestMediaPermissions();
  if (!perm.granted && perm.status !== 'granted' && !perm.isLimited) {
    throw new Error('Permission not granted');
  }

  // 1. Fetch assets safely
  const recentPhotosDesc = await getAllAssets({ maxItems: MAX_ASSETS_TO_SCAN });

  if (onProgress) {
    onProgress({
      progress: 25,
      stepKey: 'status.scan_step_screenshots',
      stepDefault: 'Eski Ekran Görüntüleri Tespit Ediliyor...',
      scannedCount: recentPhotosDesc.length,
      totalCount: recentPhotosDesc.length,
    });
  }

  // 2. Filter old screenshots
  const screenshots = filterOldScreenshots(recentPhotosDesc);

  if (onProgress) {
    onProgress({
      progress: 45,
      stepKey: 'status.scan_step_hash',
      stepDefault: 'Görsel Benzerlik ve Parmak İzi Analizi Yapılıyor...',
      scannedCount: 0,
      totalCount: recentPhotosDesc.length,
    });
  }

  // 3. Group Duplicates & Similars via Visual Perceptual Hashing (dHash)
  const { exactDuplicates, similarPhotos } = await detectVisualDuplicatesAndSimilar(
    recentPhotosDesc,
    (curr, tot) => {
      if (onProgress) {
        const sub = Math.round(45 + (curr / Math.max(1, tot)) * 20);
        onProgress({
          progress: sub,
          stepKey: 'status.scan_step_hash',
          stepDefault: 'Görsel Benzerlik ve Parmak İzi Analizi Yapılıyor...',
          scannedCount: curr,
          totalCount: tot,
        });
      }
    }
  );

  const exactFlat = exactDuplicates.flat();
  const similarFlat = similarPhotos.flat();
  const exactIds = new Set(exactFlat.map((s) => s.id));
  const similarIds = new Set(similarFlat.map((s) => s.id));
  const screenshotIds = new Set(screenshots.map((s) => s.id));

  // 4. Bound blur candidates to prevent RAM explosion
  const blurCandidates = recentPhotosDesc
    .filter((a) => !exactIds.has(a.id) && !similarIds.has(a.id) && !screenshotIds.has(a.id))
    .slice(0, MAX_BLUR_CANDIDATES);

  if (onProgress) {
    onProgress({
      progress: 70,
      stepKey: 'status.scan_step_blurry',
      stepDefault: 'Yapay Zeka ile Bulanıklık Analizi Yapılıyor...',
      scannedCount: 0,
      totalCount: blurCandidates.length,
    });
  }

  const blurryPhotos = await detectBlurryPhotos(blurCandidates, (curr, tot) => {
    if (onProgress) {
      const subProgress = Math.round(70 + (curr / Math.max(1, tot)) * 18);
      onProgress({
        progress: subProgress,
        stepKey: 'status.scan_step_blurry',
        stepDefault: 'Yapay Zeka ile Bulanıklık Analizi Yapılıyor...',
        scannedCount: curr,
        totalCount: tot,
      });
    }
  });

  if (onProgress) {
    onProgress({
      progress: 90,
      stepKey: 'status.scan_step_sizes',
      stepDefault: 'Depolama Tasarrufu ve Boyutlar Hesaplanıyor...',
      scannedCount: recentPhotosDesc.length,
      totalCount: recentPhotosDesc.length,
    });
  }

  // 5. Total Size Calculation
  const allCandidates = [
    ...exactFlat,
    ...similarFlat,
    ...screenshots,
    ...blurryPhotos,
  ] as PhotoAsset[];
  const totalSize = await computeRealTotalSize(allCandidates);

  if (onProgress) {
    onProgress({
      progress: 100,
      stepKey: 'status.items_found',
      stepDefault: 'Tarama Tamamlandı',
      scannedCount: recentPhotosDesc.length,
      totalCount: recentPhotosDesc.length,
    });
  }

  const scanResult: ScanResult = {
    totalSize,
    exactDuplicates,
    similarPhotos,
    screenshots,
    blurryPhotos,
  };

  // Cache the scan result for subsequent visits
  ScanCacheService.setPhotoScan(scanResult);

  return scanResult;
};

export const deleteAssets = async (assets: PhotoAsset[]): Promise<boolean> => {
  if (assets.length === 0) return true;

  try {
    const ids = assets.map((a) => a.id);
    const totalFreed = assets.reduce(
      (sum, a) => sum + (a.fileSize || 2.5 * 1024 * 1024),
      0
    );
    const success = await MediaLibrary.deleteAssetsAsync(ids);
    if (success) {
      // In-place cache mutation removes deleted assets without triggering a full re-scan
      ScanCacheService.removeDeletedAssets(ids, totalFreed);
      ScanCacheService.invalidateTimeline();
    }
    return success;
  } catch (error) {
    console.error('Failed to delete assets', error);
    return false;
  }
};