import * as MediaLibrary from 'expo-media-library/legacy';
import * as FileSystem from 'expo-file-system/legacy';
import { Video } from 'react-native-compressor';
import { ScanCacheService } from './scanCacheService';
import { deleteMediaAssets } from './mediaScanner';
import { measureAssets, fetchLikelyHeaviest, discardTempFile } from './assetSize';
import type { ReplaceOutcome } from './photoCompressor';

export interface VideoAsset {
  id: string;
  filename: string;
  uri: string;
  duration: number; // seconds
  width: number;
  height: number;
  size: number; // bytes
  formattedSize: string;
  qualityTag: string; // "4K", "1080P", "720P"
  formattedDuration: string; // "mm:ss"
  potentialSavingBytes: number;
  formattedPotentialSaving: string;
}

export interface CompressionResult {
  success: boolean;
  originalSizeBytes: number;
  compressedSizeBytes: number;
  savedBytes: number;
  formattedSaved: string;
  savedRatioPercent?: number;
  outputPath?: string;
  /** False when compression did not make the file smaller. */
  isSmaller: boolean;
}

export const formatByteSize = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '0 MB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const formatDuration = (seconds: number): string => {
  if (!seconds || seconds <= 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const padMin = mins < 10 ? `0${mins}` : `${mins}`;
  const padSec = secs < 10 ? `0${secs}` : `${secs}`;
  return `${padMin}:${padSec}`;
};

const getQualityTag = (width: number, height: number): string => {
  const maxDim = Math.max(width, height);
  if (maxDim >= 3840) return '4K';
  if (maxDim >= 1920) return '1080P';
  if (maxDim >= 1280) return '720P';
  return 'SD';
};

/** Videos under this size are not worth the time compression takes. */
const MIN_VIDEO_BYTES = 5 * 1024 * 1024;
const VIDEO_POOL = 800;
const VIDEO_MEASURE_COUNT = 80;

export const fetchDeviceVideos = async (forceRefresh = false): Promise<VideoAsset[]> => {
  if (!forceRefresh) {
    const cached = ScanCacheService.getVideoList();
    if (cached) {
      return cached;
    }
  }

  try {
    const { status } = await MediaLibrary.requestPermissionsAsync(false, ['video']);
    if (status !== 'granted') {
      return [];
    }

    const assets = await fetchLikelyHeaviest('video', VIDEO_POOL, VIDEO_MEASURE_COUNT);

    // Real sizes only. A video whose size cannot be read is left out instead of
    // being listed with an invented 0 MB, and the list is heaviest-first since
    // that is where compression pays off.
    const measured = await measureAssets(assets, 6);

    const videos: VideoAsset[] = measured
      .filter(({ measured: m }) => m.size >= MIN_VIDEO_BYTES)
      .sort((a, b) => b.measured.size - a.measured.size)
      .map(({ asset, measured: m }) => {
        const quality = getQualityTag(asset.width, asset.height);
        // A rough expectation by resolution, shown with a "~" - the actual
        // saving is only known once the video has been compressed.
        const savingRatio = quality === '4K' ? 0.6 : quality === '1080P' ? 0.5 : 0.35;
        const potentialSavingBytes = Math.round(m.size * savingRatio);

        return {
          id: asset.id,
          filename: asset.filename || `Video_${asset.id.slice(0, 6)}.mp4`,
          uri: m.uri,
          duration: asset.duration,
          width: asset.width,
          height: asset.height,
          size: m.size,
          formattedSize: formatByteSize(m.size),
          qualityTag: quality,
          formattedDuration: formatDuration(asset.duration),
          potentialSavingBytes,
          formattedPotentialSaving: `~${formatByteSize(potentialSavingBytes)}`,
        };
      });

    ScanCacheService.setVideoList(videos);
    return videos;
  } catch (error) {
    console.error('Failed to fetch device videos:', error);
    return [];
  }
};

/**
 * GERÇEK DONANIM HIZLANDIRMALI VİDEO SIKIŞTIRMA HİZMETİ
 * react-native-compressor kütüphanesini kullanarak videonun boyutunu gerçek anlamda düşürür.
 */
export const compressVideo = async (
  video: VideoAsset,
  onProgress?: (progress: number) => void,
  /** Receives an id that can be passed to `cancelVideoCompression`. */
  onCancellationId?: (cancellationId: string) => void
): Promise<CompressionResult> => {
  const originalSize = video.size;
  if (originalSize <= 0) {
    throw new Error('Could not read the original video size');
  }

  let sourceUri = video.uri;
  try {
    const assetInfo = await MediaLibrary.getAssetInfoAsync(video.id).catch(() => null);
    if (assetInfo?.localUri) sourceUri = assetInfo.localUri;
  } catch {
    // fall back to video.uri
  }

  const compressedUri = await Video.compress(
    sourceUri,
    {
      compressionMethod: 'auto',
      maxSize: 1280,
      getCancellationId: onCancellationId,
    },
    (progress) => {
      onProgress?.(Math.round(progress * 100));
    }
  );

  const fileInfo = await FileSystem.getInfoAsync(compressedUri);
  if (!fileInfo.exists || !('size' in fileInfo) || typeof fileInfo.size !== 'number') {
    throw new Error('Could not read the compressed video size');
  }

  const compressedSize = fileInfo.size;
  // The library may hand back the source untouched when it decides there is
  // nothing to gain; never treat that file as a compressed copy.
  const returnedSource = compressedUri === sourceUri || compressedUri === video.uri;
  const isSmaller = !returnedSource && compressedSize < originalSize;
  const savedBytes = isSmaller ? originalSize - compressedSize : 0;

  if (!isSmaller && !returnedSource) await discardTempFile(compressedUri);

  return {
    success: true,
    outputPath: isSmaller ? compressedUri : undefined,
    originalSizeBytes: originalSize,
    compressedSizeBytes: compressedSize,
    savedBytes,
    formattedSaved: formatByteSize(savedBytes),
    savedRatioPercent: Math.round((savedBytes / Math.max(1, originalSize)) * 100),
    isSmaller,
  };
};

/** Stops a compression that is still running. */
export const cancelVideoCompression = (cancellationId: string): void => {
  try {
    Video.cancelCompression(cancellationId);
  } catch (error) {
    console.warn('Could not cancel video compression:', error);
  }
};

/** Best-effort removal of an unused compressed output. */
export const discardCompressedVideo = discardTempFile;

/**
 * Sıkıştırılmış yeni videoyu galeriye kaydeder (Orijinal korunur).
 */
export const saveCompressedVideoToLibrary = async (fileUri: string): Promise<boolean> => {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync(false, ['video']);
    if (status !== 'granted') return false;

    // Dosyanın diskte varlığını doğrula
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    if (!fileInfo.exists) {
      console.error('Save failed: File does not exist at path:', fileUri);
      return false;
    }

    await MediaLibrary.createAssetAsync(fileUri);
    await discardTempFile(fileUri);
    ScanCacheService.invalidateVideoList();
    return true;
  } catch (error) {
    console.error('Failed to save compressed video to library:', error);
    return false;
  }
};

/**
 * Eski ağır videoyu silip yeni optimize videoyu galeriye ekler (Tek Tıkla Değiştirme).
 */
export const replaceOriginalVideoWithCompressed = async (
  originalAssetId: string,
  compressedUri: string
): Promise<ReplaceOutcome> => {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync(false, ['video']);
    if (status !== 'granted') return 'failed';

    // 1. Sıkıştırılmış dosyanın diskte varlığını doğrula
    const fileInfo = await FileSystem.getInfoAsync(compressedUri);
    if (!fileInfo.exists) {
      console.error('Replace failed: Compressed file does not exist at path:', compressedUri);
      return 'failed';
    }

    // 2. Sıkıştırılmış yeni videoyu galeriye kaydet
    await MediaLibrary.createAssetAsync(compressedUri);

    // 3. Eski orijinal videoyu sil. Android her silme için kullanıcıdan onay
    // ister; reddedilirse orijinal yerinde kalır ve bunu doğru bildirmeliyiz.
    const deleted = originalAssetId ? await deleteMediaAssets([originalAssetId]) : false;
    await discardTempFile(compressedUri);
    ScanCacheService.invalidateVideoList();
    return deleted ? 'replaced' : 'copy_only';
  } catch (error) {
    console.error('Failed replacing original video:', error);
    return 'failed';
  }
};
