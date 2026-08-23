import { Platform } from 'react-native';

export type ScreenName =
  | 'home'
  | 'photos_dashboard'
  | 'timeline'
  | 'tools_hub'
  | 'photo_compressor'
  | 'video_compressor'
  | 'exif_cleaner'
  | 'heavy_media'
  | 'contacts_cleaner'
  | 'vault'
  | 'report'
  | 'reviewer';

export interface AnalyticsEventParams {
  [key: string]: string | number | boolean | undefined;
}

/**
 * Safely resolves Firebase Analytics native module if linked and configured.
 */
let firebaseAnalyticsModule: any = null;
try {
  const mod = require('@react-native-firebase/analytics');
  if (mod && (mod.default || mod)) {
    firebaseAnalyticsModule = mod.default ? mod.default() : mod();
  }
} catch {
  // Graceful fallback for development / environments without google-services.json
}

/**
 * In-memory analytics event journal for local auditing and debugging.
 */
interface LoggedEvent {
  name: string;
  params?: AnalyticsEventParams;
  timestamp: number;
}
const recentEventsJournal: LoggedEvent[] = [];
const MAX_JOURNAL_ENTRIES = 50;

function pushToJournal(name: string, params?: AnalyticsEventParams) {
  recentEventsJournal.unshift({
    name,
    params,
    timestamp: Date.now(),
  });
  if (recentEventsJournal.length > MAX_JOURNAL_ENTRIES) {
    recentEventsJournal.pop();
  }
}

/**
 * Global Type-Safe Analytics Service
 */
export const AnalyticsService = {
  /**
   * Log a screen view event
   */
  async logScreenView(screenName: ScreenName, screenClass?: string): Promise<void> {
    try {
      pushToJournal(`screen_view_${screenName}`, { screenClass });

      if (firebaseAnalyticsModule?.logScreenView) {
        await firebaseAnalyticsModule.logScreenView({
          screen_name: screenName,
          screen_class: screenClass || screenName,
        });
      }
      if (__DEV__) {
        console.log(`[Analytics] 📱 Screen View: ${screenName}`);
      }
    } catch (e) {
      // Safe fallback - never disrupt UI
    }
  },

  /**
   * Log custom telemetry or user conversion event
   */
  async logEvent(eventName: string, params?: AnalyticsEventParams): Promise<void> {
    try {
      pushToJournal(eventName, params);

      if (firebaseAnalyticsModule?.logEvent) {
        await firebaseAnalyticsModule.logEvent(eventName, params);
      }
      if (__DEV__) {
        console.log(`[Analytics] ⚡ Event: ${eventName}`, params || '');
      }
    } catch (e) {
      // Safe fallback - never disrupt UI
    }
  },

  /**
   * Helper: Track media scan initiation
   */
  async trackScanStarted(maxAssets: number): Promise<void> {
    return this.logEvent('scan_started', {
      max_assets: maxAssets,
      platform: Platform.OS,
    });
  },

  /**
   * Helper: Track scan completion with discovered clutter stats
   */
  async trackScanCompleted(stats: {
    exactDuplicates: number;
    similarPhotos: number;
    blurryPhotos: number;
    screenshots: number;
    totalRecoverableBytes: number;
    durationMs: number;
  }): Promise<void> {
    return this.logEvent('scan_completed', {
      exact_duplicates: stats.exactDuplicates,
      similar_photos: stats.similarPhotos,
      blurry_photos: stats.blurryPhotos,
      screenshots: stats.screenshots,
      recoverable_bytes: stats.totalRecoverableBytes,
      duration_ms: stats.durationMs,
    });
  },

  /**
   * Helper: Track photo deletion batch
   */
  async trackPhotosDeleted(
    category: string,
    count: number,
    freedBytes: number
  ): Promise<void> {
    return this.logEvent('photos_deleted', {
      category,
      count,
      freed_bytes: freedBytes,
    });
  },

  /**
   * Helper: Track video compression
   */
  async trackVideoCompressed(
    originalBytes: number,
    compressedBytes: number,
    savedBytes: number,
    qualityTag: string
  ): Promise<void> {
    return this.logEvent('video_compressed', {
      original_bytes: originalBytes,
      compressed_bytes: compressedBytes,
      saved_bytes: savedBytes,
      quality_tag: qualityTag,
    });
  },

  /**
   * Helper: Track photo compression
   */
  async trackPhotoCompressed(
    originalBytes: number,
    compressedBytes: number,
    savedBytes: number,
    quality: number
  ): Promise<void> {
    return this.logEvent('photo_compressed', {
      original_bytes: originalBytes,
      compressed_bytes: compressedBytes,
      saved_bytes: savedBytes,
      quality_preset: quality,
    });
  },

  /**
   * Helper: Track secret vault actions
   */
  async trackVaultAction(action: 'lock' | 'unlock' | 'restore' | 'delete'): Promise<void> {
    return this.logEvent('vault_action', { action });
  },

  /**
   * Helper: Track setting toggle changes
   */
  async trackSettingToggled(settingKey: string, value: boolean | string): Promise<void> {
    return this.logEvent('setting_changed', {
      setting_key: settingKey,
      new_value: String(value),
    });
  },

  /**
   * Get recently logged events (for diagnostics / report screen)
   */
  getRecentEvents(): LoggedEvent[] {
    return [...recentEventsJournal];
  },
};
