import * as MediaLibrary from 'expo-media-library/legacy';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { formatByteSize } from './cacheCleaner';

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
}

export type PhotoQualityPreset = 0.5 | 0.75 | 0.9;

/**
 * Fetch photos from device with estimated or real file sizes
 */
export async function fetchHeavyPhotos(minItems = 40): Promise<CompressiblePhoto[]> {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
    if (status !== 'granted') return [];

    const page = await MediaLibrary.getAssetsAsync({
      mediaType: 'photo',
      first: minItems,
      sortBy: [['creationTime', false]],
    });

    const results: CompressiblePhoto[] = [];

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
          size = 3.5 * 1024 * 1024; // Baseline fallback
        }
      } catch {
        size = 3.5 * 1024 * 1024;
      }

      results.push({
        id: asset.id,
        filename: asset.filename || `IMG_${asset.id.slice(0, 6)}.jpg`,
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
        sizeBytes: size,
        formattedSize: formatByteSize(size),
        creationTime: asset.creationTime,
      });
    }

    return results;
  } catch (error) {
    console.error('Failed fetching heavy photos:', error);
    return [];
  }
}

/**
 * Hardware-accelerated image compression using ImageManipulator
 */
export async function compressSinglePhoto(
  sourceUri: string,
  quality: PhotoQualityPreset = 0.75
): Promise<PhotoCompressionResult> {
  try {
    let resolvedUri = sourceUri;
    if (sourceUri.startsWith('ph://') || sourceUri.startsWith('content://')) {
      const assetInfo = await MediaLibrary.getAssetInfoAsync(sourceUri).catch(() => null);
      if (assetInfo?.localUri) resolvedUri = assetInfo.localUri;
    }

    // Get original size
    let originalSizeBytes = 3.5 * 1024 * 1024;
    const origInfo = await FileSystem.getInfoAsync(resolvedUri).catch(() => null);
    if (origInfo && origInfo.exists && 'size' in origInfo && typeof origInfo.size === 'number') {
      originalSizeBytes = origInfo.size;
    }

    // Target max dimension 2560px for high definition with optimal weight
    const actions: ImageManipulator.Action[] = [];
    const maxTargetDim = quality === 0.5 ? 1920 : 2560;
    actions.push({ resize: { width: maxTargetDim } });

    const manipulated = await ImageManipulator.manipulateAsync(
      resolvedUri,
      actions,
      {
        compress: quality,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );

    const newInfo = await FileSystem.getInfoAsync(manipulated.uri);
    let compressedSizeBytes = Math.round(originalSizeBytes * 0.35);
    if (newInfo && newInfo.exists && 'size' in newInfo && typeof newInfo.size === 'number') {
      compressedSizeBytes = newInfo.size;
    }

    const savedBytes = Math.max(0, originalSizeBytes - compressedSizeBytes);

    return {
      success: true,
      originalSizeBytes,
      compressedSizeBytes,
      savedBytes,
      formattedSaved: formatByteSize(savedBytes),
      outputPath: manipulated.uri,
    };
  } catch (err) {
    console.error('Photo compression error:', err);
    throw err;
  }
}

/**
 * Replace original high-res photo with compressed version in device gallery
 */
export async function replaceOriginalPhoto(
  originalAssetId: string,
  compressedUri: string
): Promise<boolean> {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
    if (status !== 'granted') return false;

    // 1. Create compressed asset in gallery
    await MediaLibrary.createAssetAsync(compressedUri);

    // 2. Delete original
    if (originalAssetId) {
      await MediaLibrary.deleteAssetsAsync([originalAssetId]);
    }
    return true;
  } catch (err) {
    console.error('Error replacing original photo:', err);
    return false;
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
    return true;
  } catch (err) {
    console.error('Error saving compressed photo:', err);
    return false;
  }
}
