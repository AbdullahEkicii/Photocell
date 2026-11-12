import * as MediaLibrary from 'expo-media-library/legacy';

import { getScanBudget, yieldToUi } from './scanBudget';
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
import { getNotificationSettings } from './notificationService';

export interface PhotoAsset extends MediaLibrary.Asset {
  fileSize?: number;
  /** True when fileSize came from the library average, not from the file itself. */
  sizeIsEstimated?: boolean;
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

/*
 * Heuristic thresholds. None of these has been calibrated against a labelled set of
 * photos; they were picked by hand. Change them only with a device test in hand.
 */
const BLUR_SCORE_THRESHOLD = 32.0; // Contrast-normalized sharpness threshold

/**
 * Every photo in the library is scanned, newest first, in batches of
 * SCAN_BATCH_SIZE. Only asset metadata is listed up front (no decoding), so the
 * memory cost grows with the library size but stays small.
 */
const MAX_ASSETS = Number.POSITIVE_INFINITY;

/**
 * Blur checks decode each photo, so they are the expensive step. Each batch
 * checks at most this many queued photos so the first results appear quickly;
 * the queue is drained to the end before the scan reports itself finished, so
 * no photo is skipped. "Deep AI analysis" gets a larger per-batch share.
 */
const BLUR_CHECKS_PER_BATCH_DEEP = 240;
const BLUR_CHECKS_PER_BATCH_QUICK = 80;

/** Upper bound on partners compared per photo in each duplicate pass, so bursts or
 * blank images can't make matching quadratic. */
const NEIGHBOUR_LIMIT = 60;

/** "Exact" pass: near-identical copies. Not byte-identical: the hash allows up to 2 bits to differ. */
const EXACT_MAX_HAMMING = 2;
const EXACT_MAX_COLOR = 25;
const EXACT_MAX_ASPECT = 0.05;

/** Similarity tolerances. Deep mode casts a wider net for near-duplicates. */
const SIMILARITY_TOLERANCE = {
  deep: { hamming: 12, color: 60, aspect: 0.25 },
  quick: { hamming: 8, color: 40, aspect: 0.15 },
} as const;

/** The 64-bit dHash split into four 16-bit chunks. A hash that differs in at most
 * 2 bits matches exactly on at least 2 of the 4 chunks (pigeonhole), so indexing by
 * chunk finds every near-identical candidate without comparing all pairs. */
function dHashChunkKeys(dHash: string): string[] {
  const keys: string[] = [];
  for (let c = 0; c < 4; c++) {
    keys.push(`${c}:${dHash.slice(c * 16, (c + 1) * 16)}`);
  }
  return keys;
}

/** First `limit` indices in `list` (sorted ascending) that are greater than `after`. */
function takeIndicesAfter(list: number[], after: number, limit: number): number[] {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid] <= after) lo = mid + 1;
    else hi = mid;
  }
  return list.slice(lo, lo + limit);
}

export interface PermissionStatusResult {
  granted: boolean;
  isLimited: boolean;
  accessPrivileges?: 'all' | 'limited' | 'none';
  status: string;
  /** False once the OS will no longer show the permission dialog. */
  canAskAgain?: boolean;
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
    canAskAgain: perm.canAskAgain,
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
    canAskAgain: perm.canAskAgain,
  };
};

/**
 * Asks for photo AND video access in one go (so the user is not prompted again
 * later by the video tools) and reports whether it is *full* access.
 *
 * `granted` here means full access only. On Android 14+ the user can pick
 * "select photos", which the OS reports as a granted permission but with
 * `accessPrivileges: 'limited'` - the cleaner cannot see the rest of the
 * gallery in that mode, so that is deliberately not treated as granted.
 */
export const requestFullMediaAccess = async (): Promise<PermissionStatusResult> => {
  const perm = await MediaLibrary.requestPermissionsAsync(false, ['photo', 'video']);
  const isLimited = perm.accessPrivileges === 'limited';
  return {
    granted: perm.status === 'granted' && !isLimited,
    isLimited,
    accessPrivileges: perm.accessPrivileges,
    status: perm.status,
    canAskAgain: perm.canAskAgain,
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
  const { album, maxItems = MAX_ASSETS } = options;
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
  // Only iOS `ph://` asset-library URIs need resolving to a real file path.
  // Android `content://` URIs are read directly by ImageManipulator, and
  // resolving them anyway used to cost one extra native round trip per
  // candidate — roughly a third of this pipeline's total bridge-call time.
  if (asset.uri.startsWith('ph://')) {
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
  onProgress?: (current: number, total: number) => void,
  deepScan = true,
  // Reused across incremental batches so an asset fingerprinted in an
  // earlier batch never gets natively re-decoded — only genuinely new
  // candidates in `assets` pay that cost. Matching itself still runs across
  // every fingerprint ever seen, so a burst that straddles a batch boundary
  // is still caught.
  fingerprintCache: Map<string, VisualFingerprint> = new Map()
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

  const candidatesToFingerprint = Array.from(uniqueCandidateMap.values()).filter(
    (asset) => !fingerprintCache.has(asset.id)
  );
  const fingerprints = fingerprintCache;

  // 2. Micro-batched Fingerprint Generation (only for candidates not already
  // in the cache — see the `fingerprintCache` param above)
  const budget = getScanBudget();
  const FINGERPRINT_BATCH = budget.fingerprintConcurrency;
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

    // Let touches/animations finish, then rest so the UI keeps its frames
    await yieldToUi(budget.pauseMs);
  }

  // 3. Cluster by Hamming Distance & Color Similarity
  const assignedToExact = new Set<string>();
  const assignedToSimilar = new Set<string>();

  // Index fingerprinted photos by dHash chunk. Each photo is then compared only with
  // photos that share a chunk, instead of with every other photo.
  const chunkIndex = new Map<string, number[]>();
  sortedAsc.forEach((asset, idx) => {
    const fp = fingerprints.get(asset.id);
    if (!fp) return;
    for (const key of dHashChunkKeys(fp.dHash)) {
      const list = chunkIndex.get(key);
      if (list) list.push(idx);
      else chunkIndex.set(key, [idx]);
    }
  });

  // Pass A: near-identical copies (criteria: EXACT_* constants above).
  for (let i = 0; i < sortedAsc.length; i++) {
    const assetA = sortedAsc[i];
    const fpA = fingerprints.get(assetA.id);
    if (!fpA || assignedToExact.has(assetA.id)) continue;

    const partnerSet = new Set<number>();
    for (const key of dHashChunkKeys(fpA.dHash)) {
      const list = chunkIndex.get(key);
      if (!list) continue;
      for (const j of takeIndicesAfter(list, i, NEIGHBOUR_LIMIT)) partnerSet.add(j);
    }
    const partners = Array.from(partnerSet).sort((x, y) => x - y).slice(0, NEIGHBOUR_LIMIT);

    const group: PhotoAsset[] = [assetA as PhotoAsset];

    for (const j of partners) {
      const assetB = sortedAsc[j];
      const fpB = fingerprints.get(assetB.id);
      if (!fpB || assignedToExact.has(assetB.id)) continue;

      const hamming = computeHammingDistance(fpA.dHash, fpB.dHash);
      const colorDist = computeColorDistance(fpA.colorSignature, fpB.colorSignature);
      const aspectDiff = Math.abs(fpA.aspectRatio - fpB.aspectRatio);

      if (
        hamming <= EXACT_MAX_HAMMING &&
        colorDist < EXACT_MAX_COLOR &&
        aspectDiff < EXACT_MAX_ASPECT
      ) {
        group.push(assetB as PhotoAsset);
        assignedToExact.add(assetB.id);
      }
    }

    if (group.length > 1) {
      assignedToExact.add(assetA.id);
      exactGroups.push(group);
    }
  }

  // Pass B: similar shots / bursts. Only photos within a time window are compared
  // (photos are sorted by time), and each photo examines at most NEIGHBOUR_LIMIT partners.
  const tolerance = deepScan ? SIMILARITY_TOLERANCE.deep : SIMILARITY_TOLERANCE.quick;
  for (let i = 0; i < sortedAsc.length; i++) {
    const assetA = sortedAsc[i];
    const fpA = fingerprints.get(assetA.id);
    if (!fpA || assignedToExact.has(assetA.id) || assignedToSimilar.has(assetA.id)) continue;

    const group: PhotoAsset[] = [assetA as PhotoAsset];
    let examined = 0;

    for (let j = i + 1; j < sortedAsc.length && examined < NEIGHBOUR_LIMIT; j++) {
      const assetB = sortedAsc[j];
      const timeDiff = Math.abs(assetB.creationTime - assetA.creationTime);
      if (timeDiff > SIMILAR_TIME_WINDOW_MS * 2) break; // Beyond temporal locality

      const fpB = fingerprints.get(assetB.id);
      if (!fpB || assignedToExact.has(assetB.id) || assignedToSimilar.has(assetB.id)) continue;
      examined++;

      const hamming = computeHammingDistance(fpA.dHash, fpB.dHash);
      const colorDist = computeColorDistance(fpA.colorSignature, fpB.colorSignature);
      const aspectDiff = Math.abs(fpA.aspectRatio - fpB.aspectRatio);

      if (
        hamming <= tolerance.hamming &&
        colorDist < tolerance.color &&
        aspectDiff < tolerance.aspect
      ) {
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
      [{ resize: { width: 96 } }],
      { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    tempUri = resized.uri;

    if (!resized.base64) return null;

    const bytes = decodeBase64(resized.base64);
    const decoded = jpeg.decode(bytes, { useTArray: true });
    const { width, height, data } = decoded;

    if (!data || width <= 4 || height <= 4) return null;
    // Release base64 string early to free RAM
    (resized as any).base64 = null;

    const totalPixels = width * height;
    const gray = new Float32Array(totalPixels);
    let totalLuminance = 0;

    for (let i = 0; i < totalPixels; i++) {
      const idx = i * 4;
      const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      gray[i] = lum;
      totalLuminance += lum;
    }

    (decoded as any).data = null;
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
  const budget = getScanBudget();
  const BATCH_SIZE = budget.blurConcurrency;

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

    // Let touches/animations finish, then rest (also gives Hermes a GC breath)
    await yieldToUi(budget.pauseMs);
  }

  return blurry;
}

/**
 * Chunked file size calculator preventing native bridge queue overflow
 */
async function computeRealTotalSize(assets: PhotoAsset[]): Promise<number> {
  const CHUNK_SIZE = 12;
  const unmeasured: PhotoAsset[] = [];
  let measuredTotal = 0;
  let measuredCount = 0;

  // Across incremental scan batches this gets called repeatedly with a
  // growing, mostly-overlapping candidate list. An asset already measured
  // (real or estimated) keeps that value instead of hitting the filesystem
  // again — its size can't have changed since the last pass.
  let knownTotal = 0;
  const toMeasure = assets.filter((asset) => {
    if (typeof asset.fileSize === 'number') {
      knownTotal += asset.fileSize;
      return false;
    }
    return true;
  });

  for (let i = 0; i < toMeasure.length; i += CHUNK_SIZE) {
    const chunk = toMeasure.slice(i, i + CHUNK_SIZE);
    await Promise.all(
      chunk.map(async (asset) => {
        try {
          const fileUri = await resolveAssetUri(asset);
          const info = await FileSystem.getInfoAsync(fileUri).catch(() => null);
          if (info && info.exists && 'size' in info && typeof info.size === 'number') {
            asset.fileSize = info.size;
            asset.sizeIsEstimated = false;
            measuredTotal += info.size;
            measuredCount += 1;
            return;
          }
        } catch {
          // Falls through to the estimate below.
        }
        unmeasured.push(asset);
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  // Assets whose file could not be stat'ed get this library's own average
  // rather than a hardcoded constant, so the headline figure stays anchored to
  // the device. With nothing measurable at all they count as zero.
  const average = measuredCount > 0 ? measuredTotal / measuredCount : 0;
  for (const asset of unmeasured) {
    asset.fileSize = Math.round(average);
    asset.sizeIsEstimated = average > 0;
  }

  return knownTotal + measuredTotal + Math.round(average) * unmeasured.length;
}

/**
 * Guards against two full scans running at once — e.g. a background
 * pre-warm kicked off at app launch and the Photos tab both wanting a scan a
 * moment later. Every caller that shows up while a scan is running joins the
 * same run and gets its own progress updates, instead of starting a second,
 * competing scan.
 */
/** How many photos make up one incremental scan step. The first batch is what
 * the user actually waits on — everything after it happens quietly in the
 * background while they're already reviewing what's been found so far. */
const SCAN_BATCH_SIZE = 500;

export interface ScanBatchMeta {
  /** True once every photo in the library has been scanned and the blur queue is drained. */
  isFinal: boolean;
  scannedAssets: number;
  totalAssets: number;
}

export type ScanPartialResultCallback = (result: ScanResult, meta: ScanBatchMeta) => void;

/** Assets deleted during this session; see deleteMediaAssets. */
const deletedAssetIds = new Set<string>();

let inFlightScan: Promise<ScanResult> | null = null;
const inFlightListeners = new Set<ScanProgressCallback>();
const partialResultListeners = new Set<ScanPartialResultCallback>();

function broadcastScanProgress(info: ScanProgressInfo): void {
  inFlightListeners.forEach((listener) => listener(info));
}

function broadcastPartialResult(result: ScanResult, meta: ScanBatchMeta): void {
  partialResultListeners.forEach((listener) => listener(result, meta));
}

export function subscribeScanBatch(callback: ScanPartialResultCallback): () => void {
  partialResultListeners.add(callback);
  return () => {
    partialResultListeners.delete(callback);
  };
}

/**
 * Scans the gallery for duplicates, similar shots, screenshots and blur.
 *
 * The returned promise resolves once the ENTIRE scan (every batch, up to the
 * whole library is done — existing callers that just `await` this
 * don't need to change. But the real work happens in bounded batches of
 * `SCAN_BATCH_SIZE`, and each batch's result is cached and broadcast via
 * `onPartialResult` as soon as it's ready. Pass that callback if you want to
 * show the first ~500 photos' worth of results immediately instead of
 * waiting for the whole gallery — that's the intended way to use this now.
 */
export const scanPhotos = async (
  onProgress?: ScanProgressCallback,
  forceRefresh = false,
  onPartialResult?: ScanPartialResultCallback
): Promise<ScanResult> => {
  // If a scan is already running — e.g. the background pre-warm kicked off
  // at app launch, or another screen already asked — always join it, even if
  // the cache already holds a partial result from one of its earlier
  // batches. Checking the cache first here would let this caller grab a
  // stale snapshot and never hear about the batches still to come. This
  // applies to a forced refresh too: a second scan next to a running one would
  // double the native work and have both overwrite the same cache.
  if (inFlightScan) {
    if (onProgress) inFlightListeners.add(onProgress);
    if (onPartialResult) partialResultListeners.add(onPartialResult);
    try {
      return await inFlightScan;
    } finally {
      if (onProgress) inFlightListeners.delete(onProgress);
      if (onPartialResult) partialResultListeners.delete(onPartialResult);
    }
  }

  // Nothing running — a cached result (from a scan that already finished, or
  // one that errored out mid-way) can be returned instantly.
  if (!forceRefresh) {
    const cached = ScanCacheService.getPhotoScan();
    if (cached) {
      onProgress?.({
        progress: 100,
        stepKey: 'dashboard.status.items_found',
        stepDefault: 'Tarama Tamamlandı',
      });
      return cached;
    }
  }

  if (onProgress) inFlightListeners.add(onProgress);
  if (onPartialResult) partialResultListeners.add(onPartialResult);

  inFlightScan = runFullScan().finally(() => {
    inFlightScan = null;
    inFlightListeners.clear();
    partialResultListeners.clear();
  });

  try {
    return await inFlightScan;
  } finally {
    if (onProgress) inFlightListeners.delete(onProgress);
    if (onPartialResult) partialResultListeners.delete(onPartialResult);
  }
};

let latestBatchMeta: ScanBatchMeta | null = null;

/**
 * Progress of the scan currently running, or null. Lets a screen that opens
 * mid-scan show "scanning in the background: N / M" immediately instead of
 * waiting for the next batch to land.
 */
export function getLatestScanBatchMeta(): ScanBatchMeta | null {
  return inFlightScan && latestBatchMeta && !latestBatchMeta.isFinal ? latestBatchMeta : null;
}

/** True while a scan (foreground or background pre-warm) is actively running. */
export function isPhotoScanInProgress(): boolean {
  return inFlightScan !== null;
}

/**
 * Starts a scan in the background with nobody waiting on it, so the gallery
 * is already analyzed by the time the user actually opens the Photos tab —
 * instead of the whole pipeline only starting the moment that screen mounts.
 * Safe to call speculatively: a cache hit or an already-running scan makes
 * this a no-op via the coalescing in `scanPhotos`.
 */
export const prewarmPhotoScan = (): void => {
  if (ScanCacheService.getPhotoScan()) return;
  // Start when the JS thread is idle, not on top of launch animations.
  const scheduleScan = () => {
    setTimeout(() => {
      if (ScanCacheService.getPhotoScan()) return;
      scanPhotos().catch(() => {});
    }, 2500);
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(scheduleScan, { timeout: 3000 });
  } else {
    setTimeout(scheduleScan, 1000);
  }
};

const emptyScanResult = (): ScanResult => ({
  totalSize: 0,
  exactDuplicates: [],
  similarPhotos: [],
  screenshots: [],
  blurryPhotos: [],
});

/**
 * Runs the scan in bounded batches of `SCAN_BATCH_SIZE`, newest photos first.
 *
 * Each iteration re-examines every asset fetched *so far* (not just the new
 * slice) for duplicates/similar shots — a fingerprint cache carried across
 * iterations means only the genuinely new photos in each batch pay the
 * native decode cost, so this stays cheap, while a duplicate pair that
 * straddles a batch boundary is still caught. Screenshots and blur are
 * per-photo checks with no cross-photo dependency, so those genuinely only
 * touch the new slice each time.
 *
 * The result is cached and broadcast after *every* batch, not just the
 * final one — that's what lets the UI show something in seconds instead of
 * however long the full gallery takes.
 */
async function runFullScan(): Promise<ScanResult> {
  broadcastScanProgress({
    progress: 8,
    stepKey: 'dashboard.status.scan_step_init',
    stepDefault: 'Galeri ve Medya Dizini Başlatılıyor...',
  });

  const perm = await requestMediaPermissions();
  if (!perm.granted && perm.status !== 'granted' && !perm.isLimited) {
    throw new Error('Permission not granted');
  }

  // Honour the "Deep AI analysis" preference: it widens the similarity net,
  // the blur search window, and how far back through the gallery a scan
  // reaches — all at the cost of a longer scan.
  const deepScan = await getNotificationSettings()
    .then((s) => s.deepScanEnabled)
    .catch(() => true);

  // 1. Fetch asset metadata up front — this is a MediaStore/Photos query, no
  // image decoding, so it's cheap even for a large library.
  const allAssetsDesc = await getAllAssets({ maxItems: MAX_ASSETS });

  const fingerprintCache = new Map<string, VisualFingerprint>();
  let screenshots: PhotoAsset[] = [];
  let blurryPhotos: PhotoAsset[] = [];
  let exactDuplicates: PhotoAsset[][] = [];
  let similarPhotos: PhotoAsset[][] = [];
  let latestResult: ScanResult = emptyScanResult();
  // Blur queue: photos waiting for a sharpness check, in newest-first order.
  const blurQueue: MediaLibrary.Asset[] = [];
  let blurHead = 0;
  let blurEnqueuedUpTo = 0;
  const blurLimit = deepScan ? BLUR_CHECKS_PER_BATCH_DEEP : BLUR_CHECKS_PER_BATCH_QUICK;

  const excludedFromBlur = (): Set<string> =>
    new Set([
      ...exactDuplicates.flat().map((s) => s.id),
      ...similarPhotos.flat().map((s) => s.id),
      ...screenshots.map((s) => s.id),
    ]);

  /** Checks up to `blurLimit` queued photos, skipping ones already in another category. */
  const runBlurStep = (excludedIds: Set<string>): Promise<PhotoAsset[]> => {
    const picked: MediaLibrary.Asset[] = [];
    while (picked.length < blurLimit && blurHead < blurQueue.length) {
      const candidate = blurQueue[blurHead];
      blurHead++;
      if (!excludedIds.has(candidate.id)) picked.push(candidate);
    }
    return detectBlurryPhotos(picked, (curr, tot) => {
      broadcastScanProgress({
        progress: Math.round(70 + (curr / Math.max(1, tot)) * 20),
        stepKey: 'dashboard.status.scan_step_blurry',
        stepDefault: 'Yapay Zeka ile Bulanıklık Analizi Yapılıyor...',
        scannedCount: curr,
        totalCount: tot,
      });
    });
  };

  /** Filters out photos deleted meanwhile, measures sizes, then caches and broadcasts. */
  const publishBatch = async (scannedAssets: number, isFinal: boolean): Promise<void> => {
    const isAlive = (a: PhotoAsset) => !deletedAssetIds.has(a.id);
    exactDuplicates = exactDuplicates.map((g) => g.filter(isAlive)).filter((g) => g.length > 1);
    similarPhotos = similarPhotos.map((g) => g.filter(isAlive)).filter((g) => g.length > 1);
    screenshots = screenshots.filter(isAlive);
    blurryPhotos = blurryPhotos.filter(isAlive);

    // Total size — only over the (small) candidate set. computeRealTotalSize
    // itself skips anything already measured in a previous batch.
    const allCandidates = [
      ...exactDuplicates.flat(),
      ...similarPhotos.flat(),
      ...screenshots,
      ...blurryPhotos,
    ] as PhotoAsset[];
    const totalSize = await computeRealTotalSize(allCandidates);

    latestResult = { totalSize, exactDuplicates, similarPhotos, screenshots, blurryPhotos };
    // Cached and broadcast after every batch, so results show up while the rest of the gallery is still being scanned.
    ScanCacheService.setPhotoScan(latestResult);
    latestBatchMeta = { isFinal, scannedAssets, totalAssets: allAssetsDesc.length };
    broadcastPartialResult(latestResult, latestBatchMeta);
  };

  const totalBatches = Math.max(1, Math.ceil(allAssetsDesc.length / SCAN_BATCH_SIZE));

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const batchEnd = Math.min(allAssetsDesc.length, (batchIndex + 1) * SCAN_BATCH_SIZE);
    const accumulated = allAssetsDesc.slice(0, batchEnd);
    const isFinalBatch = batchEnd >= allAssetsDesc.length;

    broadcastScanProgress({
      progress: 15,
      stepKey: 'dashboard.status.scan_step_screenshots',
      stepDefault: 'Eski Ekran Görüntüleri Tespit Ediliyor...',
      scannedCount: batchEnd,
      totalCount: allAssetsDesc.length,
    });

    // 2. Screenshots — a per-photo filename/date check, cheap enough to redo
    // over the accumulated set every batch.
    screenshots = filterOldScreenshots(accumulated);

    broadcastScanProgress({
      progress: 40,
      stepKey: 'dashboard.status.scan_step_hash',
      stepDefault: 'Görsel Benzerlik ve Parmak İzi Analizi Yapılıyor...',
      scannedCount: 0,
      totalCount: accumulated.length,
    });

    // 3. Duplicates & similar shots — reuses fingerprintCache (see its doc
    // comment) so this batch only decodes photos it hasn't seen before.
    const dupResult = await detectVisualDuplicatesAndSimilar(
      accumulated,
      (curr, tot) => {
        const sub = Math.round(40 + (curr / Math.max(1, tot)) * 25);
        broadcastScanProgress({
          progress: sub,
          stepKey: 'dashboard.status.scan_step_hash',
          stepDefault: 'Görsel Benzerlik ve Parmak İzi Analizi Yapılıyor...',
          scannedCount: curr,
          totalCount: tot,
        });
      },
      deepScan,
      fingerprintCache
    );
    exactDuplicates = dupResult.exactDuplicates;
    similarPhotos = dupResult.similarPhotos;

    // 4. Blur — queue the newly fetched photos and check one share of the queue.
    // Every queued photo is checked: here, or in the drain after the loop.
    for (let k = blurEnqueuedUpTo; k < batchEnd; k++) blurQueue.push(allAssetsDesc[k]);
    blurEnqueuedUpTo = batchEnd;

    const excluded = excludedFromBlur();
    const newlyBlurry = await runBlurStep(excluded);
    blurryPhotos = [...blurryPhotos.filter((a) => !excluded.has(a.id)), ...newlyBlurry];

    broadcastScanProgress({
      progress: 92,
      stepKey: 'dashboard.status.scan_step_sizes',
      stepDefault: 'Depolama Tasarrufu ve Boyutlar Hesaplanıyor...',
      scannedCount: batchEnd,
      totalCount: allAssetsDesc.length,
    });

    await publishBatch(batchEnd, false);

    broadcastScanProgress({
      progress: 100,
      stepKey: 'dashboard.status.items_found',
      stepDefault: 'Tarama Tamamlandı',
      scannedCount: batchEnd,
      totalCount: allAssetsDesc.length,
    });

    if (!isFinalBatch) {
      // Let the JS thread and any pending UI update breathe before grinding
      // through the next batch — the whole point is that this keeps running
      // quietly while the user is already looking at what's been found.
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  // Drain the blur queue: photos left over from the per-batch limit are still checked.
  while (blurHead < blurQueue.length) {
    const excludedNow = excludedFromBlur();
    const drained = await runBlurStep(excludedNow);
    blurryPhotos = [...blurryPhotos.filter((a) => !excludedNow.has(a.id)), ...drained];
    await publishBatch(allAssetsDesc.length, false);
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  await publishBatch(allAssetsDesc.length, true);
  return latestResult;
}

/**
 * Serializes every native asset deletion in the app through one queue.
 *
 * On Android 11+, deleting a MediaStore item the app doesn't itself own opens
 * a system confirmation dialog via an Activity Result contract
 * (`MediaStore.createDeleteRequest`, which `expo-media-library` drives under
 * the hood). Firing a second one before the first has resolved crashes the
 * app natively — a JS `try/catch` cannot save you from that, since the crash
 * happens on the native/Activity side, not as a rejected promise.
 *
 * This used to be six independent call sites (the reviewer, Heavy Media, the
 * photo/video "replace original" flows, EXIF cleaning, the vault) each
 * calling `MediaLibrary.deleteAssetsAsync` directly — any two of them firing
 * close together (e.g. swiping through duplicate groups quickly) could race.
 * `deleteMediaAssets` is now the *only* place in the app allowed to call it.
 */
let deleteQueue: Promise<unknown> = Promise.resolve();

export function deleteMediaAssets(ids: string[], freedBytes = 0): Promise<boolean> {
  if (ids.length === 0) return Promise.resolve(true);

  const run = deleteQueue
    .catch(() => {})
    .then(() => MediaLibrary.deleteAssetsAsync(ids))
    .then((deleted) => {
      if (deleted) {
        // Remember what is gone so a scan still running in the background
        // cannot put it back into the results, and drop it from the cached
        // scan right away - whichever screen did the deleting.
        ids.forEach((id) => deletedAssetIds.add(id));
        // Session-only memory: keep the most recent 5000 ids, drop the oldest.
        while (deletedAssetIds.size > 5000) {
          deletedAssetIds.delete(deletedAssetIds.values().next().value as string);
        }
        ScanCacheService.removeDeletedAssets(ids, freedBytes);
        ScanCacheService.invalidateTimeline();
        ScanCacheService.invalidateVideoList();
      }
      return deleted;
    })
    .catch((error) => {
      // Declining Android's "allow this app to delete?" prompt rejects with
      // ERR_PERMISSIONS. That is the user's choice, not a failure worth a
      // console error (and, in development, a red toast).
      if (error?.code !== 'ERR_PERMISSIONS') console.error('Failed to delete assets', error);
      return false;
    });

  // Keep the queue alive regardless of this call's outcome, so whoever is
  // next in line still waits their turn.
  deleteQueue = run;

  return run;
}

export const deleteAssets = async (assets: PhotoAsset[]): Promise<boolean> => {
  if (assets.length === 0) return true;

  const ids = assets.map((a) => a.id);
  const totalFreed = assets.reduce((sum, a) => sum + (a.fileSize || 0), 0);
  // The in-place cache update (no full re-scan) happens inside deleteMediaAssets.
  return deleteMediaAssets(ids, totalFreed);
};