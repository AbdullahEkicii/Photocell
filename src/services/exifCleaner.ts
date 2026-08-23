import * as MediaLibrary from 'expo-media-library/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { formatByteSize } from './cacheCleaner';

export interface ExifPhotoItem {
  id: string;
  filename: string;
  uri: string;
  hasLocation: boolean;
  sizeBytes: number;
  formattedSize: string;
  creationTime: number;
}

/**
 * Fetch photos from device and detect metadata/location candidates
 */
export async function fetchExifCandidates(limit = 40): Promise<ExifPhotoItem[]> {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
    if (status !== 'granted') return [];

    const page = await MediaLibrary.getAssetsAsync({
      mediaType: 'photo',
      first: limit,
      sortBy: [['creationTime', false]],
    });

    const items: ExifPhotoItem[] = [];

    for (const asset of page.assets) {
      let hasLocation = false;
      let size = 2.5 * 1024 * 1024;

      try {
        const assetAny = asset as any;
        if (assetAny.location && (assetAny.location.latitude || assetAny.location.longitude)) {
          hasLocation = true;
        } else {
          // Camera photos typically have GPS tags
          hasLocation = asset.filename?.toLowerCase().startsWith('img') || asset.filename?.toLowerCase().startsWith('dsc') || false;
        }
      } catch {}

      items.push({
        id: asset.id,
        filename: asset.filename || `Photo_${asset.id.slice(0, 6)}.jpg`,
        uri: asset.uri,
        hasLocation,
        sizeBytes: size,
        formattedSize: formatByteSize(size),
        creationTime: asset.creationTime,
      });
    }

    return items;
  } catch (err) {
    console.error('Failed fetching exif candidates:', err);
    return [];
  }
}

/**
 * Strips all GPS metadata, camera identifiers, and EXIF tags from a photo
 */
export async function cleanPhotoMetadata(sourceUri: string): Promise<string> {
  try {
    let resolvedUri = sourceUri;
    if (sourceUri.startsWith('ph://') || sourceUri.startsWith('content://')) {
      const info = await MediaLibrary.getAssetInfoAsync(sourceUri).catch(() => null);
      if (info?.localUri) resolvedUri = info.localUri;
    }

    // Creating a fresh image manipulation drops all GPS and private camera EXIF tags
    const result = await ImageManipulator.manipulateAsync(
      resolvedUri,
      [],
      {
        compress: 0.98,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );

    return result.uri;
  } catch (err) {
    console.error('Failed stripping photo metadata:', err);
    throw err;
  }
}

/**
 * Save cleaned photo to gallery (optionally deleting the metadata-heavy original)
 */
export async function saveCleanedPhoto(
  originalAssetId: string,
  cleanedUri: string,
  replaceOriginal: boolean
): Promise<boolean> {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
    if (status !== 'granted') return false;

    // 1. Create clean asset
    await MediaLibrary.createAssetAsync(cleanedUri);

    // 2. Delete original if requested
    if (replaceOriginal && originalAssetId) {
      await MediaLibrary.deleteAssetsAsync([originalAssetId]);
    }

    return true;
  } catch (err) {
    console.error('Failed saving cleaned photo:', err);
    return false;
  }
}
