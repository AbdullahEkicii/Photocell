import * as MediaLibrary from 'expo-media-library/legacy';
import * as FileSystem from 'expo-file-system/legacy';
import { Video } from 'react-native-compressor';
import { ScanCacheService } from './scanCacheService';

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

    const { assets } = await MediaLibrary.getAssetsAsync({
      mediaType: 'video',
      first: 50,
      sortBy: [['creationTime', false]],
    });

    const videos: VideoAsset[] = [];

    for (const asset of assets) {
      try {
        let size = 0;
        let fileUri = asset.uri;
        const info = await FileSystem.getInfoAsync(asset.uri).catch(() => null);
        if (info && info.exists && 'size' in info && typeof info.size === 'number') {
          size = info.size;
        } else {
          const assetInfo = await MediaLibrary.getAssetInfoAsync(asset).catch(() => null);
          if (assetInfo?.localUri) {
            fileUri = assetInfo.localUri;
            const localInfo = await FileSystem.getInfoAsync(assetInfo.localUri).catch(() => null);
            if (localInfo && localInfo.exists && 'size' in localInfo && typeof localInfo.size === 'number') {
              size = localInfo.size;
            }
          }
        }

        const quality = getQualityTag(asset.width, asset.height);
        const savingRatio = quality === '4K' ? 0.60 : quality === '1080P' ? 0.50 : 0.35;
        const potentialSavingBytes = Math.round(size * savingRatio);

        videos.push({
          id: asset.id,
          filename: asset.filename || `Video_${asset.id.slice(0, 6)}.mp4`,
          uri: fileUri,
          duration: asset.duration,
          width: asset.width,
          height: asset.height,
          size,
          formattedSize: formatByteSize(size),
          qualityTag: quality,
          formattedDuration: formatDuration(asset.duration),
          potentialSavingBytes,
          formattedPotentialSaving: formatByteSize(potentialSavingBytes),
        });
      } catch (err) {
        console.warn('Could not read video info for asset:', asset.id, err);
      }
    }

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
  onProgress?: (progress: number) => void
): Promise<CompressionResult> => {
  const originalSize = video.size;

  try {
    let sourceUri = video.uri;
    try {
      const assetInfo = await MediaLibrary.getAssetInfoAsync(video.id).catch(() => null);
      if (assetInfo?.localUri) {
        sourceUri = assetInfo.localUri;
      }
    } catch {
      // video.uri kullan
    }

    const compressedUri = await Video.compress(
      sourceUri,
      {
        compressionMethod: 'auto',
        maxSize: 1280,
      },
      (progress) => {
        if (onProgress) {
          onProgress(Math.round(progress * 100));
        }
      }
    );

    const fileInfo = await FileSystem.getInfoAsync(compressedUri);
    let compressedSize = 0;
    if (fileInfo.exists && 'size' in fileInfo && typeof fileInfo.size === 'number') {
      compressedSize = fileInfo.size;
    } else {
      compressedSize = Math.round(originalSize * 0.45);
    }

    const savedBytes = Math.max(0, originalSize - compressedSize);

    return {
      success: true,
      outputPath: compressedUri,
      originalSizeBytes: originalSize,
      compressedSizeBytes: compressedSize,
      savedBytes,
      formattedSaved: formatByteSize(savedBytes),
      savedRatioPercent: Math.round((savedBytes / Math.max(1, originalSize)) * 100),
    };
  } catch (error) {
    console.error('Video compression error:', error);
    throw error;
  }
};

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
): Promise<boolean> => {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync(false, ['video']);
    if (status !== 'granted') return false;

    // 1. Sıkıştırılmış dosyanın diskte varlığını doğrula
    const fileInfo = await FileSystem.getInfoAsync(compressedUri);
    if (!fileInfo.exists) {
      console.error('Replace failed: Compressed file does not exist at path:', compressedUri);
      return false;
    }

    // 2. Sıkıştırılmış yeni videoyu galeriye kaydet
    await MediaLibrary.createAssetAsync(compressedUri);

    // 3. Eski orijinal videoyu sil
    if (originalAssetId) {
      await MediaLibrary.deleteAssetsAsync([originalAssetId]);
    }
    ScanCacheService.invalidateVideoList();
    return true;
  } catch (error) {
    console.error('Failed replacing original video:', error);
    return false;
  }
};
