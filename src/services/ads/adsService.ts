import { readJson, writeJson, todayKey } from '../jsonStore';
import { AnalyticsService } from '../analyticsService';
import {
  ADS_ENABLED,
  AD_UNITS,
  FREE_VIDEO_COMPRESSIONS_PER_DAY,
  FREE_PHOTO_COMPRESSIONS_PER_REWARD,
  FREE_VIDEO_COMPRESSIONS_PER_REWARD,
  FREE_HEAVY_MEDIA_DELETIONS_PER_REWARD,
  INTERSTITIAL,
  TEST_DEVICE_IDS,
} from './adsConfig';

/**
 * The Google Mobile Ads module is native. It is required lazily and optionally so a
 * dev client built before the module was added (or any non-Android build) keeps
 * working - every function below degrades to "no ads".
 */
let Ads: any = null;
try {
  Ads = require('react-native-google-mobile-ads');
} catch {
  // Native module not linked in this build.
}

const STATE_FILE = 'photocell_ads_state.json';

interface AdsState {
  firstSeenAt: number;
  actionCount: number;
  lastInterstitialAt: number;
  interstitialDay: string;
  interstitialsToday: number;
  videoDay: string;
  videosToday: number;
  photoCredits?: number;
  videoCredits?: number;
  heavyMediaCredits?: number;
}

const DEFAULT_STATE: AdsState = {
  firstSeenAt: 0,
  actionCount: 0,
  lastInterstitialAt: 0,
  interstitialDay: '',
  interstitialsToday: 0,
  videoDay: '',
  videosToday: 0,
};

let state: AdsState | null = null;
const loadState = async (): Promise<AdsState> => {
  if (!state) {
    state = await readJson<AdsState>(STATE_FILE, DEFAULT_STATE);
    if (!state.firstSeenAt) {
      state.firstSeenAt = Date.now();
      writeJson(STATE_FILE, state);
    }
  }
  return state;
};
const saveState = () => (state ? writeJson(STATE_FILE, state) : Promise.resolve());

// ---------------------------------------------------------------------------
// Readiness (consent + SDK init), observable by banner components
// ---------------------------------------------------------------------------
let ready = false;
let privacyOptionsRequired = false;
let initPromise: Promise<boolean> | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

export const isAdsReady = () => ready;
export const subscribeAdsReady = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

/**
 * Shows the privacy/consent form where the law requires it (EEA/UK), then starts the
 * SDK. Safe to call more than once. Resolves true when ads may be requested.
 */
export function initializeAds(): Promise<boolean> {
  if (!ADS_ENABLED || !Ads) return Promise.resolve(false);
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      await loadState();
      const { AdsConsent, MaxAdContentRating, default: mobileAds } = Ads;

      const info = await AdsConsent.requestInfoUpdate();
      if (info?.isConsentFormAvailable) {
        await AdsConsent.loadAndShowConsentFormIfRequired();
      }
      const after = await AdsConsent.getConsentInfo();
      privacyOptionsRequired = after?.privacyOptionsRequirementStatus === 'REQUIRED';
      if (!after?.canRequestAds) return false;

      await mobileAds().setRequestConfiguration({
        testDeviceIds: TEST_DEVICE_IDS,
        maxAdContentRating: MaxAdContentRating.PG,
        tagForChildDirectedTreatment: false,
        tagForUnderAgeOfConsent: false,
      });
      await mobileAds().initialize();

      ready = true;
      notify();
      preloadInterstitial();
      preloadRewarded();
      return true;
    } catch (err) {
      console.warn('Ads initialization failed:', err);
      return false;
    }
  })();
  return initPromise;
}

export const needsPrivacyOptions = () => privacyOptionsRequired;
export async function openPrivacyOptions(): Promise<void> {
  try {
    await Ads?.AdsConsent?.showPrivacyOptionsForm();
  } catch (err) {
    console.warn('Could not open ad privacy options:', err);
  }
}

// ---------------------------------------------------------------------------
// Interstitial: rationed, shown only after a finished action
// ---------------------------------------------------------------------------
let interstitial: any = null;
let interstitialLoaded = false;

function preloadInterstitial() {
  if (!ready || !Ads || interstitialLoaded) return;
  try {
    const { InterstitialAd, AdEventType } = Ads;
    interstitial = InterstitialAd.createForAdRequest(AD_UNITS.interstitial);
    interstitial.addAdEventListener(AdEventType.LOADED, () => {
      interstitialLoaded = true;
    });
    interstitial.addAdEventListener(AdEventType.ERROR, () => {
      interstitialLoaded = false;
    });
    interstitial.load();
  } catch (err) {
    console.warn('Interstitial preload failed:', err);
  }
}

/**
 * Call when the user has just finished something worthwhile (a review, a bulk delete,
 * a compression). Counts the action and, if the pacing rules allow, shows an
 * interstitial and resolves when it is closed. Resolves false without any UI otherwise.
 */
export async function onActionCompleted(trigger: string): Promise<boolean> {
  if (!ready || !Ads) return false;
  const s = await loadState();
  s.actionCount += 1;

  const now = Date.now();
  if (s.interstitialDay !== todayKey()) {
    s.interstitialDay = todayKey();
    s.interstitialsToday = 0;
  }

  const due =
    interstitialLoaded &&
    now - s.firstSeenAt > INTERSTITIAL.graceMs &&
    s.actionCount % INTERSTITIAL.everyNthAction === 0 &&
    now - s.lastInterstitialAt > INTERSTITIAL.minIntervalMs &&
    s.interstitialsToday < INTERSTITIAL.maxPerDay;

  if (!due || !interstitial) {
    saveState();
    return false;
  }

  return new Promise<boolean>((resolve) => {
    const { AdEventType } = Ads;
    const unsubClosed = interstitial.addAdEventListener(AdEventType.CLOSED, () => {
      unsubClosed();
      interstitialLoaded = false;
      preloadInterstitial();
      resolve(true);
    });
    s.lastInterstitialAt = now;
    s.interstitialsToday += 1;
    saveState();
    AnalyticsService.logEvent('ad_interstitial_shown', { trigger });
    interstitial.show().catch(() => {
      unsubClosed();
      interstitialLoaded = false;
      preloadInterstitial();
      resolve(false);
    });
  });
}

// ---------------------------------------------------------------------------
// Rewarded: the price of compressing more videos today
// ---------------------------------------------------------------------------
let rewarded: any = null;
let rewardedLoaded = false;

function preloadRewarded() {
  if (!ready || !Ads || rewardedLoaded) return;
  try {
    const { RewardedAd, RewardedAdEventType, AdEventType } = Ads;
    rewarded = RewardedAd.createForAdRequest(AD_UNITS.rewarded);
    rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
      rewardedLoaded = true;
    });
    rewarded.addAdEventListener(AdEventType.ERROR, () => {
      rewardedLoaded = false;
    });
    rewarded.load();
  } catch (err) {
    console.warn('Rewarded preload failed:', err);
  }
}

export type RewardedResult = 'rewarded' | 'dismissed' | 'unavailable';

/** True when a rewarded ad is loaded and can be shown right now. */
export const isRewardedAvailable = () => ready && rewardedLoaded;

/** Shows the rewarded ad. 'unavailable' means nothing was shown (no fill / not ready). */
export function showRewardedAd(trigger: string): Promise<RewardedResult> {
  if (!ready || !Ads || !rewarded || !rewardedLoaded) {
    AnalyticsService.logEvent('ad_rewarded_unavailable', { trigger });
    preloadRewarded();
    return Promise.resolve('unavailable');
  }
  return new Promise<RewardedResult>((resolve) => {
    const { RewardedAdEventType, AdEventType } = Ads;
    let earned = false;
    const unsubReward = rewarded.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
      earned = true;
    });
    const unsubClosed = rewarded.addAdEventListener(AdEventType.CLOSED, () => {
      unsubReward();
      unsubClosed();
      rewardedLoaded = false;
      preloadRewarded();
      AnalyticsService.logEvent(earned ? 'ad_rewarded_earned' : 'ad_rewarded_skipped', { trigger });
      resolve(earned ? 'rewarded' : 'dismissed');
    });
    AnalyticsService.logEvent('ad_rewarded_shown', { trigger });
    rewarded.show().catch(() => {
      unsubReward();
      unsubClosed();
      rewardedLoaded = false;
      preloadRewarded();
      resolve('unavailable');
    });
  });
}

// ---------------------------------------------------------------------------
// Quotas for photo and video compression
// ---------------------------------------------------------------------------
/** Photo compressions left (0 means a rewarded ad is needed to renew 3 credits). */
export async function getFreePhotoCompressionsLeft(): Promise<number> {
  if (!ADS_ENABLED || !Ads) return Number.POSITIVE_INFINITY;
  const s = await loadState();
  if (s.photoCredits === undefined) {
    s.photoCredits = FREE_PHOTO_COMPRESSIONS_PER_REWARD;
    await saveState();
  }
  return s.photoCredits;
}

/** Records one photo compression against the quota. */
export async function recordPhotoCompression(): Promise<void> {
  const s = await loadState();
  if (s.photoCredits === undefined) {
    s.photoCredits = FREE_PHOTO_COMPRESSIONS_PER_REWARD;
  }
  s.photoCredits = Math.max(0, s.photoCredits - 1);
  await saveState();
}

/** Grants additional photo compressions (defaults to 3). */
export async function addPhotoCompressions(count = FREE_PHOTO_COMPRESSIONS_PER_REWARD): Promise<void> {
  const s = await loadState();
  s.photoCredits = (s.photoCredits ?? 0) + count;
  await saveState();
}

/** Video compressions left (0 means a rewarded ad is needed to renew 2 credits). */
export async function getFreeVideoCompressionsLeft(): Promise<number> {
  if (!ADS_ENABLED || !Ads) return Number.POSITIVE_INFINITY;
  const s = await loadState();
  if (s.videoCredits === undefined) {
    s.videoCredits = FREE_VIDEO_COMPRESSIONS_PER_REWARD;
    await saveState();
  }
  return s.videoCredits;
}

/** Records one video compression against the quota. */
export async function recordVideoCompression(): Promise<void> {
  const s = await loadState();
  if (s.videoCredits === undefined) {
    s.videoCredits = FREE_VIDEO_COMPRESSIONS_PER_REWARD;
  }
  s.videoCredits = Math.max(0, s.videoCredits - 1);
  await saveState();
}

/** Grants additional video compressions (defaults to 2). */
export async function addVideoCompressions(count = FREE_VIDEO_COMPRESSIONS_PER_REWARD): Promise<void> {
  const s = await loadState();
  s.videoCredits = (s.videoCredits ?? 0) + count;
  await saveState();
}

/** Heavy media deletions left (0 means a rewarded ad is needed to renew 2 deletion credits). */
export async function getFreeHeavyMediaDeletionsLeft(): Promise<number> {
  if (!ADS_ENABLED || !Ads) return Number.POSITIVE_INFINITY;
  const s = await loadState();
  if (s.heavyMediaCredits === undefined) {
    s.heavyMediaCredits = FREE_HEAVY_MEDIA_DELETIONS_PER_REWARD;
    await saveState();
  }
  return s.heavyMediaCredits ?? 0;
}

/** Records heavy media deletions against the quota. */
export async function recordHeavyMediaDeletions(count = 1): Promise<void> {
  const s = await loadState();
  if (s.heavyMediaCredits === undefined) {
    s.heavyMediaCredits = FREE_HEAVY_MEDIA_DELETIONS_PER_REWARD;
  }
  s.heavyMediaCredits = Math.max(0, (s.heavyMediaCredits ?? FREE_HEAVY_MEDIA_DELETIONS_PER_REWARD) - count);
  await saveState();
}

/** Grants additional heavy media deletions (defaults to 2). */
export async function addHeavyMediaDeletions(count = FREE_HEAVY_MEDIA_DELETIONS_PER_REWARD): Promise<void> {
  const s = await loadState();
  s.heavyMediaCredits = (s.heavyMediaCredits ?? 0) + count;
  await saveState();
}
