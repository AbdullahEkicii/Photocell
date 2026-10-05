import * as MediaLibrary from 'expo-media-library/legacy';
import * as FileSystem from 'expo-file-system/legacy';

type MediaKind = 'photo' | 'video';

/**
 * Rough "how many bytes is this probably" from metadata alone - free, unlike
 * reading the file. Only used to decide which assets are worth actually
 * measuring, never shown to the user.
 */
const estimateWeight = (asset: MediaLibrary.Asset): number => {
  const pixels = (asset.width || 0) * (asset.height || 0);
  if (asset.mediaType === 'video') return pixels * Math.max(asset.duration || 1, 1) * 0.3;
  return pixels * 0.4;
};

/**
 * Finds the assets most likely to be heavy anywhere in the library.
 *
 * Measuring every file would take far too long, and measuring only the newest
 * N misses heavy files that happen to be older. Instead the metadata of up to
 * `pool` assets is ranked by an estimate and only the `take` most promising are
 * returned, to be measured for real.
 */
export async function fetchLikelyHeaviest(
  mediaType: MediaKind | MediaKind[],
  pool: number,
  take: number
): Promise<MediaLibrary.Asset[]> {
  const collected: MediaLibrary.Asset[] = [];
  let after: string | undefined;
  let hasNext = true;

  while (hasNext && collected.length < pool) {
    const page = await MediaLibrary.getAssetsAsync({
      mediaType,
      first: Math.min(500, pool - collected.length),
      after,
      sortBy: [['creationTime', false]],
    });
    collected.push(...page.assets);
    hasNext = page.hasNextPage;
    after = page.endCursor;
  }

  return collected.sort((a, b) => estimateWeight(b) - estimateWeight(a)).slice(0, take);
}

export interface MeasuredAsset {
  /** Real size in bytes, or 0 when the file could not be read. */
  size: number;
  /** A file:// path when one could be resolved, otherwise the original uri. */
  uri: string;
}

/**
 * Reads the real on-disk size of a gallery asset.
 *
 * MediaStore `content://` uris don't always answer a stat, so this resolves
 * the asset's local file path first when it can. A size of 0 means "could not
 * be measured" - callers must skip those rather than substitute a guess.
 */
export async function measureAsset(asset: { id: string; uri: string }): Promise<MeasuredAsset> {
  let uri = asset.uri;
  try {
    if (uri.startsWith('ph://') || uri.startsWith('content://')) {
      const info = await MediaLibrary.getAssetInfoAsync(asset.id).catch(() => null);
      if (info?.localUri) uri = info.localUri;
    }
    const fileInfo = await FileSystem.getInfoAsync(uri).catch(() => null);
    if (fileInfo?.exists && 'size' in fileInfo && typeof fileInfo.size === 'number') {
      return { size: fileInfo.size, uri };
    }
  } catch {
    // Unreadable asset (removed mid-scan, outside limited access, ...).
  }
  return { size: 0, uri: asset.uri };
}

/** Measures many assets with a bounded number of concurrent native calls. */
export async function measureAssets<T extends { id: string; uri: string }>(
  assets: T[],
  concurrency = 8
): Promise<Array<{ asset: T; measured: MeasuredAsset }>> {
  const results: Array<{ asset: T; measured: MeasuredAsset }> = new Array(assets.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < assets.length) {
      const index = cursor++;
      results[index] = { asset: assets[index], measured: await measureAsset(assets[index]) };
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, assets.length) }, worker));
  return results;
}

/** Best-effort removal of a temporary compressor output. */
export async function discardTempFile(uri?: string | null): Promise<void> {
  if (!uri) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // Already gone, or not ours to delete - nothing useful to do.
  }
}
