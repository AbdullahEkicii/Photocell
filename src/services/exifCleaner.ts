import * as MediaLibrary from 'expo-media-library/legacy';
import type { PermissionKind } from './permissionAlerts';
import { PermissionsAndroid, Platform } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { formatByteSize } from './cacheCleaner';
import { deleteMediaAssets } from './mediaScanner';

/** Upper bound on photos whose EXIF is read in one scan. */
const MAX_INSPECTED = 2500;
const INSPECT_CONCURRENCY = 6;

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
 * Returns the photos that genuinely carry GPS coordinates.
 *
 * The location comes from `getAssetInfoAsync`, which reads the asset's real
 * EXIF position (the app requests `isAccessMediaLocationEnabled`). An earlier
 * version guessed from the filename prefix, so photos with no GPS at all were
 * still listed as "location detected".
 */
/**
 * On Android 10+ the photo's GPS coordinates are only returned when the app holds the
 * runtime permission ACCESS_MEDIA_LOCATION. It is declared in the manifest but must be
 * requested on its own; without it every photo reads as "no location".
 */
let deniedPermission: PermissionKind | null = null;

/** The permission that the last scan was missing, or null. Read by the screen to explain it. */
export function lastDeniedPermission(): PermissionKind | null {
  return deniedPermission;
}

async function ensureMediaLocationAccess(): Promise<boolean> {
  if (Platform.OS !== 'android' || Platform.Version < 29) return true;
  try {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_MEDIA_LOCATION
    );
    const granted = result === PermissionsAndroid.RESULTS.GRANTED;
    if (!granted) deniedPermission = 'location';
    return granted;
  } catch {
    deniedPermission = 'location';
    return false;
  }
}

export async function fetchExifCandidates(limit = 40): Promise<ExifPhotoItem[]> {
  try {
    deniedPermission = null;
    const { status } = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
    if (status !== 'granted') {
      deniedPermission = 'media';
      return [];
    }
    await ensureMediaLocationAccess();

    const items: ExifPhotoItem[] = [];
    const inspect = async (asset: MediaLibrary.Asset) => {
      const info = await MediaLibrary.getAssetInfoAsync(asset).catch(() => null);
      const location = info?.location;
      const hasLocation = Boolean(
        location && (location.latitude !== 0 || location.longitude !== 0)
      );
      if (!hasLocation) return;

      const fileUri = info?.localUri || asset.uri;
      const fileInfo = await FileSystem.getInfoAsync(fileUri).catch(() => null);
      const size =
        fileInfo?.exists && 'size' in fileInfo && typeof fileInfo.size === 'number'
          ? fileInfo.size
          : 0;

      items.push({
        id: asset.id,
        filename: asset.filename || `Photo_${asset.id.slice(0, 6)}.jpg`,
        uri: asset.uri,
        hasLocation,
        sizeBytes: size,
        formattedSize: formatByteSize(size),
        creationTime: asset.creationTime,
      });
    };

    // Reading EXIF needs one native call per photo, so walk the library newest
    // first in pages with a few calls in flight, and stop once enough geotagged
    // photos are found. This used to inspect only the 40 newest photos, so any
    // geotagged photo older than that was never offered for cleaning.
    let after: string | undefined;
    let hasNext = true;
    let inspected = 0;
    while (hasNext && items.length < limit && inspected < MAX_INSPECTED) {
      const page = await MediaLibrary.getAssetsAsync({
        mediaType: 'photo',
        first: 100,
        after,
        sortBy: [['creationTime', false]],
      });
      let cursor = 0;
      const worker = async () => {
        while (cursor < page.assets.length) await inspect(page.assets[cursor++]);
      };
      await Promise.all(Array.from({ length: INSPECT_CONCURRENCY }, worker));
      inspected += page.assets.length;
      hasNext = page.hasNextPage;
      after = page.endCursor;
    }

    return items.sort((x, y) => y.creationTime - x.creationTime).slice(0, limit);
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

export type CleanOutcome =
  /** The clean copy was saved and the original (with its GPS data) was deleted. */
  | 'replaced'
  /** The clean copy was saved but the original, still carrying GPS, is in the gallery. */
  | 'copy_only'
  | 'failed';

/**
 * Saves the cleaned photo and deletes the original, which is the whole point:
 * leaving the geotagged original behind would defeat the cleaning. Android
 * asks the user to confirm the deletion, so the outcome says honestly whether
 * the original is really gone (this used to always keep it and still report
 * "safe to share").
 */
export async function saveCleanedPhoto(
  originalAssetId: string,
  cleanedUri: string
): Promise<CleanOutcome> {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
    if (status !== 'granted') return 'failed';

    await MediaLibrary.createAssetAsync(cleanedUri);
    await FileSystem.deleteAsync(cleanedUri, { idempotent: true }).catch(() => {});

    const deleted = originalAssetId ? await deleteMediaAssets([originalAssetId]) : false;
    return deleted ? 'replaced' : 'copy_only';
  } catch (err) {
    console.error('Failed saving cleaned photo:', err);
    return 'failed';
  }
}
