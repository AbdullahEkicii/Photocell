import { ScanResult, PhotoAsset } from './mediaScanner';
import { VideoAsset } from './videoCompressor';
import { MonthGroup } from './timelineScanner';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes cache lifetime for long sessions
// A finished photo scan stays valid much longer. Expiring it after 30 minutes
// meant leaving the cleaning screen and coming back later silently threw the
// results away and re-ran the whole scan. Deleting photos already updates the
// cache in place, and pull-to-refresh re-scans on demand.
const PHOTO_SCAN_TTL_MS = 6 * 60 * 60 * 1000;

class ScanCacheManager {
  private photoScanCache: CacheEntry<ScanResult> | null = null;
  private videoListCache: CacheEntry<VideoAsset[]> | null = null;
  private timelineCache: CacheEntry<MonthGroup[]> | null = null;

  // --- PHOTO SCAN CACHE ---
  public getPhotoScan(maxAgeMs = PHOTO_SCAN_TTL_MS): ScanResult | null {
    if (!this.photoScanCache) return null;
    const age = Date.now() - this.photoScanCache.timestamp;
    if (age > maxAgeMs) {
      this.photoScanCache = null;
      return null;
    }
    return this.photoScanCache.data;
  }

  public setPhotoScan(result: ScanResult): void {
    this.photoScanCache = {
      data: result,
      timestamp: Date.now(),
    };
  }

  /**
   * In-place cache mutation when items are deleted.
   * Removes deleted assets from all clusters without requiring an expensive full re-scan.
   */
  public removeDeletedAssets(deletedIds: string[], freedBytes = 0): void {
    if (!this.photoScanCache) return;
    const set = new Set(deletedIds);
    const prev = this.photoScanCache.data;

    const newExact = prev.exactDuplicates
      .map((group) => group.filter((a) => !set.has(a.id)))
      .filter((group) => group.length > 1);

    const newSimilar = prev.similarPhotos
      .map((group) => group.filter((a) => !set.has(a.id)))
      .filter((group) => group.length > 1);

    const newScreenshots = prev.screenshots.filter((a) => !set.has(a.id));
    const newBlurry = prev.blurryPhotos.filter((a) => !set.has(a.id));
    const newTotalSize = Math.max(0, prev.totalSize - freedBytes);

    this.photoScanCache = {
      data: {
        totalSize: newTotalSize,
        exactDuplicates: newExact,
        similarPhotos: newSimilar,
        screenshots: newScreenshots,
        blurryPhotos: newBlurry,
      },
      timestamp: Date.now(),
    };
  }

  public invalidatePhotoScan(): void {
    this.photoScanCache = null;
  }

  // --- VIDEO LIST CACHE ---
  public getVideoList(maxAgeMs = DEFAULT_TTL_MS): VideoAsset[] | null {
    if (!this.videoListCache) return null;
    const age = Date.now() - this.videoListCache.timestamp;
    if (age > maxAgeMs) {
      this.videoListCache = null;
      return null;
    }
    return this.videoListCache.data;
  }

  public setVideoList(videos: VideoAsset[]): void {
    this.videoListCache = {
      data: videos,
      timestamp: Date.now(),
    };
  }

  public removeDeletedVideo(deletedId: string): void {
    if (!this.videoListCache) return;
    const prev = this.videoListCache.data;
    const filtered = prev.filter((v) => v.id !== deletedId);
    this.videoListCache = {
      data: filtered,
      timestamp: Date.now(),
    };
  }

  public invalidateVideoList(): void {
    this.videoListCache = null;
  }

  // --- TIMELINE CACHE ---
  public getTimeline(maxAgeMs = DEFAULT_TTL_MS): MonthGroup[] | null {
    if (!this.timelineCache) return null;
    const age = Date.now() - this.timelineCache.timestamp;
    if (age > maxAgeMs) {
      this.timelineCache = null;
      return null;
    }
    return this.timelineCache.data;
  }

  public setTimeline(groups: MonthGroup[]): void {
    this.timelineCache = {
      data: groups,
      timestamp: Date.now(),
    };
  }

  public invalidateTimeline(): void {
    this.timelineCache = null;
  }

  // --- GLOBAL INVALIDATION ---
  public invalidateAll(): void {
    this.photoScanCache = null;
    this.videoListCache = null;
    this.timelineCache = null;
  }
}

export const ScanCacheService = new ScanCacheManager();
