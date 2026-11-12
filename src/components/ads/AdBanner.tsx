import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';

import { colors, radius } from '../../theme/colors';
import { AD_UNITS, ADS_ENABLED } from '../../services/ads/adsConfig';
import { isAdsReady, subscribeAdsReady } from '../../services/ads/adsService';

let Ads: any = null;
try {
  Ads = require('react-native-google-mobile-ads');
} catch {
  // Native module not linked in this build.
}

export interface AdBannerProps {
  placement: string;
  style?: StyleProp<ViewStyle>;
  /**
   * For lazy-loading in long virtualized lists. If active is false, the BannerAd
   * is not mounted and no network request is sent until scrolled into range.
   */
  active?: boolean;
}

/**
 * An inline adaptive banner formatted like an application card.
 * It stays collapsed (zero height) until an ad has loaded (and disappears if it fails),
 * perfectly fitting the porcelain glass layout theme.
 */
export const AdBanner: React.FC<AdBannerProps> = ({
  placement,
  style,
  active = true,
}) => {
  const { t } = useTranslation();
  const [ready, setReady] = useState(isAdsReady());
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setReady(isAdsReady());
    return subscribeAdsReady(() => setReady(isAdsReady()));
  }, []);

  if (!ADS_ENABLED || !Ads || !ready || failed || !active) return null;

  const { BannerAd, BannerAdSize } = Ads;
  return (
    <View
      style={[styles.wrap, style, !loaded && styles.collapsed]}
      accessibilityLabel={t('ads.label')}
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={styles.label}>{t('ads.label')}</Text>
      <View style={styles.slot}>
        <BannerAd
          unitId={AD_UNITS.banner}
          size={BannerAdSize.BANNER}
          requestOptions={{ requestNonPersonalizedAdsOnly: false, keywords: ['photo', 'storage'] }}
          onAdLoaded={() => setLoaded(true)}
          onAdFailedToLoad={() => {
            setFailed(true);
            if (__DEV__) console.log(`[Ads] banner failed for ${placement}`);
          }}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    // Same width and corner radius as the content cards above and below it.
    alignSelf: 'stretch',
    width: '100%',
    marginVertical: 10,
    paddingTop: 6,
    paddingBottom: 6,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    overflow: 'hidden',
  },
  // Completely collapsed while loading or if it fails, preventing empty gaps
  collapsed: {
    height: 0,
    opacity: 0,
    marginTop: 0,
    marginBottom: 0,
    paddingTop: 0,
    paddingBottom: 0,
    borderWidth: 0,
    overflow: 'hidden',
  },
  label: {
    alignSelf: 'flex-start',
    marginLeft: 14,
    marginBottom: 4,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: colors.textMuted,
  },
  slot: {
    alignSelf: 'stretch',
    alignItems: 'center',
    minHeight: 50,
  },
});
