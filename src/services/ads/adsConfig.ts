import { Platform } from 'react-native';

/**
 * Ads configuration.
 *
 * While USE_TEST_ADS is true every format uses Google's public TEST ad units, so
 * nothing here can earn money or put a real account at risk. Before release:
 *   1. create the app + three ad units in AdMob,
 *   2. paste the unit IDs into PRODUCTION_UNITS,
 *   3. set USE_TEST_ADS = false,
 *   4. set ADMOB_ANDROID_APP_ID for the build (see app.config.js).
 */
// Development builds always use Google's test units, so tapping our own ads never happens.
// Release builds use the real units below.
// EXPO_PUBLIC_ADS_TEST=1 at build time forces Google's test units in a release build.
// Use it only for a local test APK installed on your own phone; Play builds leave it unset.
export const USE_TEST_ADS = __DEV__ || process.env.EXPO_PUBLIC_ADS_TEST === '1';

/**
 * Devices that always get test ads, even in release builds. Add the id AdMob prints in
 * logcat ("Use RequestConfiguration.Builder().setTestDeviceIds(...)").
 */
// Two IDs for the same phone: the hash depends on the app signing key (Play-signed copy vs
// locally signed copy), so both installs need to be listed.
export const TEST_DEVICE_IDS: string[] = [
  '74CE7B92F618A1EFB945AB9FB23B00CF', // Play-signed install
  '44F5D8CC3F57E54F06DA6086C4232856', // locally signed install (adb)
];

// Real AdMob units for com.abdllhekc.photocell. Used only once USE_TEST_ADS is false.
const PRODUCTION_UNITS = {
  banner: 'ca-app-pub-2034009761866400/4293571326',
  interstitial: 'ca-app-pub-2034009761866400/3449273846',
  rewarded: 'ca-app-pub-2034009761866400/6710309114',
};

// Google's public sample units (https://developers.google.com/admob/android/test-ads).
const TEST_UNITS = {
  banner: 'ca-app-pub-3940256099942544/9214589741', // adaptive banner
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
};

export const AD_UNITS = {
  banner: USE_TEST_ADS || !PRODUCTION_UNITS.banner ? TEST_UNITS.banner : PRODUCTION_UNITS.banner,
  interstitial:
    USE_TEST_ADS || !PRODUCTION_UNITS.interstitial
      ? TEST_UNITS.interstitial
      : PRODUCTION_UNITS.interstitial,
  rewarded:
    USE_TEST_ADS || !PRODUCTION_UNITS.rewarded ? TEST_UNITS.rewarded : PRODUCTION_UNITS.rewarded,
};

/** Ads are only wired for Android for now. */
export const ADS_ENABLED = Platform.OS === 'android';

/** Videos and photos compressed before a rewarded ad is required. */
export const FREE_VIDEO_COMPRESSIONS_PER_REWARD = 2;
export const FREE_PHOTO_COMPRESSIONS_PER_REWARD = 3;

/** Heavy media deletions allowed per rewarded ad: a rewarded ad is shown after every 2 deletions. */
export const FREE_HEAVY_MEDIA_DELETIONS_PER_REWARD = 2;

/** Legacy alias */
export const FREE_VIDEO_COMPRESSIONS_PER_DAY = FREE_VIDEO_COMPRESSIONS_PER_REWARD;

/**
 * Interstitial pacing. They only appear at a natural finish line (a review or a
 * compression just completed), never mid-task, and are rationed hard:
 */
export const INTERSTITIAL = {
  /** No interstitials during the first day after install. */
  graceMs: 24 * 60 * 60 * 1000,
  /** At least this long between two interstitials. */
  minIntervalMs: 4 * 60 * 1000,
  /** Every Nth completed action is eligible. */
  everyNthAction: 3,
  /** Hard daily ceiling. */
  maxPerDay: 4,
};
