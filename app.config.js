/**
 * Extends app.json with the parts that depend on the environment.
 *
 * - AdMob: the Android app ID is the real one from the AdMob console. The iOS app ID is
 *   still Google's public TEST ID. Override with ADMOB_ANDROID_APP_ID / ADMOB_IOS_APP_ID.
 *   Ad units stay on TEST units until USE_TEST_ADS is flipped in src/services/ads/adsConfig.ts.
 * - Firebase Analytics: only wired in when `google-services.json` (downloaded from
 *   the Firebase console for package com.abdllhekc.photocell) sits in the project
 *   root. Without it the app still builds; analytics calls simply do nothing.
 */
const fs = require('fs');
const path = require('path');


// Real AdMob Android app ID for com.abdllhekc.photocell (AdMob console).
const ADMOB_ANDROID_APP_ID = 'ca-app-pub-2034009761866400~8451172716';
const GOOGLE_TEST_ANDROID_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
const GOOGLE_TEST_IOS_APP_ID = 'ca-app-pub-3940256099942544~1458002511';

module.exports = ({ config }) => {
  const googleServices = path.join(__dirname, 'google-services.json');
  const hasFirebase = fs.existsSync(googleServices);

  const plugins = [...(config.plugins || [])];
  plugins.push([
    'react-native-google-mobile-ads',
    {
      androidAppId: process.env.ADMOB_ANDROID_APP_ID || ADMOB_ANDROID_APP_ID,
      iosAppId: process.env.ADMOB_IOS_APP_ID || GOOGLE_TEST_IOS_APP_ID,
      userTrackingUsageDescription:
        'This identifier is used to deliver more relevant ads and is never used to identify you personally.',
    },
  ]);

  // AD_ID (advertising ID) is kept in the manifest on purpose: the app shows AdMob ads, and
  // Play rejects a build that uses the ID without declaring it. The Play Console ad-ID
  // declaration must say the app uses the advertising ID.

  const android = { ...(config.android || {}) };
  if (hasFirebase) {
    plugins.push('@react-native-firebase/app');
    android.googleServicesFile = './google-services.json';
  } else {
    console.warn(
      '[app.config] google-services.json not found - Firebase Analytics is disabled in this build.'
    );
  }

  return { ...config, android, plugins };
};
