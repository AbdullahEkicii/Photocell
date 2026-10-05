import * as MediaLibrary from 'expo-media-library/legacy';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { formatByteSize } from './cacheCleaner';
import { deleteMediaAssets } from './mediaScanner';
import { measureAsset, measureAssets, fetchLikelyHeaviest, discardTempFile } from './assetSize';

export interface CompressiblePhoto {
  id: string;
  filename: string;
  uri: string;
  width: number;
  height: number;
  sizeBytes: number;
  formattedSize: string;
  creationTime: number;
}

export interface PhotoCompressionResult {
  success: boolean;
  originalSizeBytes: number;
  compressedSizeBytes: number;
  savedBytes: number;
  formattedSaved: string;
  outputPath: string;
  /** False when re-encoding did not make the file smaller; nothing is worth replacing then. */
  isSmaller: boolean;
}

export type PhotoQualityPreset = 0.5 | 0.75 | 0.9;

/** Photos below this size are not worth compressing. */
const MIN_HEAVY_PHOTO_BYTES = 1024 * 1024;
/** Photos whose metadata is ranked, and how many of the likeliest get measured. */
const HEAVY_POOL = 3000;
const HEAVY_MEASURE_COUNT = 150;

/**
 * Finds the heaviest recent photos, biggest first.
 *
 * This used to return simply the 50 newest photos in date order (despite the
 * name) and substitute an invented 3.5 MB for any it could not read. It now
 * measures a window of recent photos, drops what it can't read or that is too
 * small to matter, and sorts by real size.
 */
export async function fetchHeavyPhotos(limit = 60): Promise<CompressiblePhoto[]> {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
    if (status !== 'granted') return [];

    const candidates = await fetchLikelyHeaviest('photo', HEAVY_POOL, HEAVY_MEASURE_COUNT);

    const measured = await measureAssets(candidates, 8);

    return measured
      .filter(({ measured: m }) => m.size >= MIN_HEAVY_PHOTO_BYTES)
      .sort((a, b) => b.measured.size - a.measured.size)
      .slice(0, limit)
      .map(({ asset, measured: m }) => ({
        id: asset.id,
        filename: asset.filename || `IMG_${asset.id.slice(0, 6)}.jpg`,
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
        sizeBytes: m.size,
        formattedSize: formatByteSize(m.size),
        creationTime: asset.creationTime,
      }));
  } catch (error) {
    console.error('Failed fetching heavy photos:', error);
    return [];
  }
}

/**
 * Re-encodes a photo as a smaller JPEG.
 *
 * Only downscales: the longer side is brought down to the preset's target and
 * a photo already smaller than that is left at its own size. (The previous
 * version always resized *width* to the target, which upscaled small photos —
 * making them bigger — and mis-sized portrait ones.)
 */
export async function compressSinglePhoto(
  photo: CompressiblePhoto,
  quality: PhotoQualityPreset = 0.75
): Promise<PhotoCompressionResult> {
  const originalSizeBytes =
    photo.sizeBytes > 0 ? photo.sizeBytes : (await measureAsset(photo)).size;
  if (originalSizeBytes <= 0) {
    throw new Error('Could not read the original photo size');
  }

  const targetLongSide = quality === 0.5 ? 1920 : 2560;
  const longSide = Math.max(photo.width, photo.height);
  const actions: ImageManipulator.Action[] = [];
  if (longSide > targetLongSide) {
    actions.push({
      resize: photo.width >= photo.height ? { width: targetLongSide } : { height: targetLongSide },
    });
  }

  const manipulated = await ImageManipulator.manipulateAsync(photo.uri, actions, {
    compress: quality,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  const newInfo = await FileSystem.getInfoAsync(manipulated.uri);
  if (!newInfo.exists || !('size' in newInfo) || typeof newInfo.size !== 'number') {
    throw new Error('Could not read the compressed photo size');
  }

  const compressedSizeBytes = newInfo.size;
  const isSmaller = compressedSizeBytes < originalSizeBytes;
  const savedBytes = isSmaller ? originalSizeBytes - compressedSizeBytes : 0;

  // A result that isn't smaller is useless; don't leave it in the cache.
  if (!isSmaller) await discardTempFile(manipulated.uri);

  return {
    success: true,
    originalSizeBytes,
    compressedSizeBytes,
    savedBytes,
    formattedSaved: formatByteSize(savedBytes),
    outputPath: manipulated.uri,
    isSmaller,
  };
}

export type ReplaceOutcome =
  /** The smaller copy was saved and the original was deleted. */
  | 'replaced'
  /** The smaller copy was saved but the original is still there (deletion declined or failed). */
  | 'copy_only'
  | 'failed';

/**
 * Saves the compressed photo and then deletes the original.
 *
 * The outcome is reported honestly. Android asks the user to confirm every
 * deletion, so the original may well survive; this used to report success
 * regardless, leaving the user with both photos and a message saying one had
 * been removed.
 */
export async function replaceOriginalPhoto(
  originalAssetId: string,
  compressedUri: string
): Promise<ReplaceOutcome> {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
    if (status !== 'granted') return 'failed';

    await MediaLibrary.createAssetAsync(compressedUri);

    const deleted = originalAssetId ? await deleteMediaAssets([originalAssetId]) : false;
    await discardTempFile(compressedUri);
    return deleted ? 'replaced' : 'copy_only';
  } catch (err) {
    console.error('Error replacing original photo:', err);
    return 'failed';
  }
}

/**
 * Save compressed photo as a new copy in gallery
 */
export async function saveCompressedPhotoToLibrary(compressedUri: string): Promise<boolean> {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
    if (status !== 'granted') return false;

    await MediaLibrary.createAssetAsync(compressedUri);
    await discardTempFile(compressedUri);
    return true;
  } catch (err) {
    console.error('Error saving compressed photo:', err);
    return false;
  }
}

export { discardTempFile as discardCompressedPhoto };
