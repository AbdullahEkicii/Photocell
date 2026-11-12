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
  | 'reviewer'
  | 'onboarding';

export interface AnalyticsEventParams {
  [key: string]: string | number | boolean | undefined;
}

/**
 * Firebase Analytics, resolved lazily and optionally. The native module is only linked
 * in builds made with a google-services.json (see app.config.js); everywhere else the
 * calls below are no-ops, and a failed call switches Firebase off for the session
 * instead of throwing into the UI.
 */
let firebaseAnalytics: any = null;
try {
  firebaseAnalytics = require('@react-native-firebase/analytics');
} catch {
  // Native module not linked in this build.
}

let firebaseBroken = false;
const withFirebase = async (fn: (fa: any, instance: any) => Promise<unknown> | unknown) => {
  if (!firebaseAnalytics || firebaseBroken) return;
  try {
    const instance =
      typeof firebaseAnalytics.getAnalytics === 'function'
        ? firebaseAnalytics.getAnalytics()
        : firebaseAnalytics.default();
    await fn(firebaseAnalytics, instance);
  } catch {
    firebaseBroken = true;
  }
};

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

      await withFirebase((fa, instance) =>
        fa.logScreenView
          ? fa.logScreenView(instance, { screen_name: screenName, screen_class: screenClass || screenName })
          : instance.logScreenView({ screen_name: screenName, screen_class: screenClass || screenName })
      );
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

      await withFirebase((fa, instance) =>
        fa.logEvent ? fa.logEvent(instance, eventName, params) : instance.logEvent(eventName, params)
      );
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
  async trackVaultAction(
    action: 'lock' | 'unlock' | 'restore' | 'delete' | 'pin_create' | 'pin_change' | 'pin_reset' | 'biometric_unlock'
  ): Promise<void> {
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

  /** Onboarding funnel: which step people reach and whether they finish. */
  async trackOnboarding(step: 'started' | 'step_viewed' | 'completed', index?: number): Promise<void> {
    return this.logEvent(`onboarding_${step}`, index === undefined ? undefined : { step_index: index });
  },

  /** The outcome of an OS permission request ("granted" | "denied" | "limited" | "blocked"). */
  async trackPermission(permission: 'gallery' | 'notifications' | 'contacts', result: string): Promise<void> {
    return this.logEvent('permission_result', { permission, result });
  },

  async trackLanguageChanged(language: string): Promise<void> {
    await withFirebase((fa, instance) =>
      fa.setUserProperty ? fa.setUserProperty(instance, 'app_language', language) : null
    );
    return this.logEvent('language_changed', { language });
  },

  /** Tool usage that has no dedicated helper (exif cleaner, contacts, heavy media...). */
  async trackToolUsed(tool: string, detail?: AnalyticsEventParams): Promise<void> {
    return this.logEvent('tool_used', { tool, ...detail });
  },

  /**
   * Get recently logged events (for diagnostics / report screen)
   */
  getRecentEvents(): LoggedEvent[] {
    return [...recentEventsJournal];
  },
};
