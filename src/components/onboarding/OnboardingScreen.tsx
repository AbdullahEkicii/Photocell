import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Linking,
  AppState,
  BackHandler,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Animated, {
  FadeInRight,
  FadeOutLeft,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Sparkles,
  Layers,
  ShieldCheck,
  Images,
  Bell,
  Check,
  AlertTriangle,
  Globe,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { AtmosphericBackground } from '../glass/AtmosphericBackground';
import { GlassPanel } from '../glass/GlassPanel';
import { colors, alpha, radius } from '../../theme/colors';
import { checkMediaPermissionsStatus, requestFullMediaAccess } from '../../services/mediaScanner';
import {
  getNotificationPermissionState,
  requestNotificationPermission,
  NotificationPermissionResult,
} from '../../services/notificationService';

const TOTAL_STEPS = 2;

type GalleryState = 'checking' | 'full' | 'limited' | 'denied' | 'blocked';
type NotificationState = 'checking' | NotificationPermissionResult;

interface Props {
  onFinish: () => void;
}

/** One segment of the two-part progress indicator. */
const StepSegment: React.FC<{ active: boolean }> = ({ active }) => {
  const fill = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    fill.value = withTiming(active ? 1 : 0, { duration: 320 });
  }, [active, fill]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  return (
    <View style={styles.segmentTrack}>
      <Animated.View style={[styles.segmentFill, fillStyle]} />
    </View>
  );
};

const Feature: React.FC<{
  icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  accent: string;
  title: string;
  description: string;
  delay: number;
}> = ({ icon: Icon, accent, title, description, delay }) => (
  <Animated.View entering={FadeInDown.duration(420).delay(delay)}>
    <GlassPanel
      borderRadius={radius.card}
      borderColor={alpha(accent, 0.2)}
      glowAccent={accent}
      contentStyle={styles.featureRow}
    >
      <View
        style={[
          styles.featureIcon,
          { backgroundColor: alpha(accent, 0.1), borderColor: alpha(accent, 0.24) },
        ]}
      >
        <Icon color={accent} size={22} strokeWidth={2.2} />
      </View>
      <View style={styles.featureText}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDesc}>{description}</Text>
      </View>
    </GlassPanel>
  </Animated.View>
);

const StatusChip: React.FC<{ label: string; tone: 'good' | 'warn' | 'bad' | 'idle' }> = ({
  label,
  tone,
}) => {
  const tint =
    tone === 'good'
      ? colors.successMint
      : tone === 'warn'
      ? colors.warningAmber
      : tone === 'bad'
      ? colors.dangerRose
      : colors.textMuted;
  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: alpha(tint, 0.11), borderColor: alpha(tint, 0.3) },
      ]}
    >
      {tone === 'good' ? (
        <Check color={tint} size={11} strokeWidth={3} />
      ) : tone === 'warn' || tone === 'bad' ? (
        <AlertTriangle color={tint} size={11} strokeWidth={2.6} />
      ) : null}
      <Text style={[styles.chipText, { color: tint }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
};

export const OnboardingScreen: React.FC<Props> = ({ onFinish }) => {
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState<number>(0);
  const [gallery, setGallery] = useState<GalleryState>('checking');
  const [notifications, setNotifications] = useState<NotificationState>('checking');
  const [requesting, setRequesting] = useState<boolean>(false);
  const isTurkish = (i18n.language || 'tr').startsWith('tr');

  const refreshStatuses = useCallback(async () => {
    try {
      const media = await checkMediaPermissionsStatus();
      if (media.granted) setGallery('full');
      else if (media.isLimited) setGallery('limited');
      else if (media.status !== 'undetermined' && media.canAskAgain === false) setGallery('blocked');
      else setGallery('denied');
    } catch {
      setGallery('denied');
    }
    setNotifications(await getNotificationPermissionState());
  }, []);

  useEffect(() => {
    refreshStatuses();
  }, [refreshStatuses]);

  // Coming back from the system Settings screen: pick up whatever changed.
  const appStateRef = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appStateRef.current.match(/inactive|background/) && next === 'active') {
        refreshStatuses();
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [refreshStatuses]);

  // Back on the permissions step returns to the first one instead of leaving.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step > 0) {
        setStep(0);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [step]);

  const toggleLanguage = () => {
    Haptics.selectionAsync().catch(() => {});
    i18n.changeLanguage(isTurkish ? 'en' : 'tr');
  };

  const needsSettings = gallery === 'limited' || gallery === 'blocked';
  const needsRequest = !needsSettings && (gallery === 'denied' || notifications === 'denied');
  const primaryMode: 'next' | 'settings' | 'request' | 'start' =
    step === 0 ? 'next' : needsSettings ? 'settings' : needsRequest ? 'request' : 'start';

  const handlePrimary = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    if (primaryMode === 'next') {
      setStep(1);
      return;
    }
    if (primaryMode === 'settings') {
      Linking.openSettings().catch(() => {});
      return;
    }
    if (primaryMode === 'start') {
      onFinish();
      return;
    }

    setRequesting(true);
    try {
      if (gallery === 'denied') await requestFullMediaAccess().catch(() => null);
      if (notifications === 'denied') await requestNotificationPermission();
    } finally {
      await refreshStatuses();
      setRequesting(false);
    }
  };

  const primaryLabel =
    primaryMode === 'next'
      ? t('onboarding.next')
      : primaryMode === 'settings'
      ? t('onboarding.open_settings')
      : primaryMode === 'request'
      ? t('onboarding.grant')
      : t('onboarding.start');

  const galleryChip = (): { label: string; tone: 'good' | 'warn' | 'bad' | 'idle' } => {
    switch (gallery) {
      case 'full':
        return { label: t('onboarding.status_granted'), tone: 'good' };
      case 'limited':
        return { label: t('onboarding.status_limited'), tone: 'warn' };
      case 'blocked':
        return { label: t('onboarding.status_blocked'), tone: 'bad' };
      default:
        return { label: t('onboarding.status_denied'), tone: 'idle' };
    }
  };
  const notificationChip = (): { label: string; tone: 'good' | 'warn' | 'bad' | 'idle' } => {
    if (notifications === 'granted') return { label: t('onboarding.status_granted'), tone: 'good' };
    if (notifications === 'blocked') return { label: t('onboarding.status_blocked'), tone: 'bad' };
    return { label: t('onboarding.status_denied'), tone: 'idle' };
  };

  const gChip = galleryChip();
  const nChip = notificationChip();
  const helpText =
    gallery === 'limited'
      ? t('onboarding.limited_help')
      : gallery === 'blocked'
      ? t('onboarding.blocked_help')
      : null;

  return (
    <View style={styles.container}>
      <AtmosphericBackground />

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.topRow}>
          <View style={styles.segments}>
            {Array.from({ length: TOTAL_STEPS }).map((_, index) => (
              <StepSegment key={index} active={index <= step} />
            ))}
          </View>
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={toggleLanguage}
            style={styles.langButton}
            accessibilityRole="button"
          >
            <Globe color={colors.primary} size={15} strokeWidth={2.2} />
            <Text style={styles.langText}>{isTurkish ? 'TR' : 'EN'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
          {step === 0 ? (
            <Animated.View
              key="step-welcome"
              entering={FadeInRight.duration(300)}
              exiting={FadeOutLeft.duration(180)}
              style={styles.stepWrap}
            >
              <View style={styles.heroIconWrap}>
                <GlassPanel
                  borderRadius={32}
                  borderColor={alpha(colors.primary, 0.25)}
                  fillColor="rgba(255,255,255,0.92)"
                  glowAccent={colors.primary}
                  contentStyle={styles.heroIconInner}
                >
                  <Image
                    source={require('../../../assets/photocell512px.png')}
                    style={styles.heroIcon}
                    resizeMode="contain"
                  />
                </GlassPanel>
              </View>

              <Text style={styles.title}>{t('onboarding.welcome_title')}</Text>
              <Text style={styles.subtitle}>{t('onboarding.welcome_subtitle')}</Text>

              <View style={styles.list}>
                <Feature
                  icon={Sparkles}
                  accent={colors.primary}
                  title={t('onboarding.feature_scan_title')}
                  description={t('onboarding.feature_scan_desc')}
                  delay={120}
                />
                <Feature
                  icon={Layers}
                  accent={colors.accent}
                  title={t('onboarding.feature_swipe_title')}
                  description={t('onboarding.feature_swipe_desc')}
                  delay={200}
                />
                <Feature
                  icon={ShieldCheck}
                  accent={colors.successMint}
                  title={t('onboarding.feature_private_title')}
                  description={t('onboarding.feature_private_desc')}
                  delay={280}
                />
              </View>
            </Animated.View>
          ) : (
            <Animated.View
              key="step-permissions"
              entering={FadeInRight.duration(300)}
              exiting={FadeOutLeft.duration(180)}
              style={styles.stepWrap}
            >
              <Text style={styles.title}>{t('onboarding.permissions_title')}</Text>
              <Text style={styles.subtitle}>{t('onboarding.permissions_subtitle')}</Text>

              <View style={styles.list}>
                <Animated.View entering={FadeInDown.duration(420).delay(100)}>
                  <GlassPanel
                    borderRadius={radius.card}
                    borderColor={alpha(gChip.tone === 'good' ? colors.successMint : colors.primary, 0.25)}
                    glowAccent={colors.primary}
                    contentStyle={styles.permissionCard}
                  >
                    <View style={styles.permissionHead}>
                      <View
                        style={[
                          styles.featureIcon,
                          {
                            backgroundColor: alpha(colors.primary, 0.1),
                            borderColor: alpha(colors.primary, 0.24),
                          },
                        ]}
                      >
                        <Images color={colors.primary} size={22} strokeWidth={2.2} />
                      </View>
                      <View style={styles.featureText}>
                        <Text style={styles.featureTitle}>{t('onboarding.gallery_title')}</Text>
                        <View style={styles.requiredRow}>
                          <Text style={styles.requiredText}>{t('onboarding.required')}</Text>
                        </View>
                      </View>
                      <StatusChip label={gChip.label} tone={gChip.tone} />
                    </View>
                    <Text style={styles.permissionDesc}>{t('onboarding.gallery_desc')}</Text>
                    {helpText ? (
                      <View style={styles.helpBox}>
                        <AlertTriangle color={colors.warningAmber} size={15} strokeWidth={2.4} />
                        <Text style={styles.helpText}>{helpText}</Text>
                      </View>
                    ) : null}
                  </GlassPanel>
                </Animated.View>

                <Animated.View entering={FadeInDown.duration(420).delay(180)}>
                  <GlassPanel
                    borderRadius={radius.card}
                    borderColor={colors.border}
                    contentStyle={styles.permissionCard}
                  >
                    <View style={styles.permissionHead}>
                      <View
                        style={[
                          styles.featureIcon,
                          {
                            backgroundColor: alpha(colors.accent, 0.1),
                            borderColor: alpha(colors.accent, 0.24),
                          },
                        ]}
                      >
                        <Bell color={colors.accent} size={22} strokeWidth={2.2} />
                      </View>
                      <View style={styles.featureText}>
                        <Text style={styles.featureTitle}>{t('onboarding.notif_title')}</Text>
                        <View style={styles.requiredRow}>
                          <Text style={[styles.requiredText, { color: colors.textMuted }]}>
                            {t('onboarding.recommended')}
                          </Text>
                        </View>
                      </View>
                      <StatusChip label={nChip.label} tone={nChip.tone} />
                    </View>
                    <Text style={styles.permissionDesc}>{t('onboarding.notif_desc')}</Text>
                  </GlassPanel>
                </Animated.View>
              </View>
            </Animated.View>
          )}
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={handlePrimary}
            disabled={requesting || (step === 1 && gallery === 'checking')}
            style={styles.primaryButton}
            accessibilityRole="button"
          >
            <LinearGradient
              colors={colors.primaryGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.primaryGradient}
            >
              {requesting ? (
                <ActivityIndicator color={colors.textOnAccent} size="small" />
              ) : (
                <Text style={styles.primaryText}>{primaryLabel}</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {step === 1 && primaryMode !== 'start' ? (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={onFinish}
              style={styles.skipButton}
              accessibilityRole="button"
            >
              <Text style={styles.skipText}>{t('onboarding.continue_anyway')}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.skipSpacer} />
          )}
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  safeArea: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 16,
  },
  segments: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  segmentTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceSunken,
    overflow: 'hidden',
  },
  segmentFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  langButton: {
    height: 34,
    paddingHorizontal: 11,
    borderRadius: radius.chip,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  langText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  body: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  stepWrap: {
    width: '100%',
  },
  heroIconWrap: {
    alignSelf: 'center',
    marginBottom: 22,
  },
  heroIconInner: {
    width: 104,
    height: 104,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
  },
  title: {
    fontSize: 27,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: -0.8,
    lineHeight: 33,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14.5,
    color: colors.textSecondary,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 24,
    paddingHorizontal: 6,
  },
  list: {
    gap: 12,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
  },
  featureIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  featureDesc: {
    fontSize: 12.5,
    color: colors.textSecondary,
    lineHeight: 17,
    marginTop: 2,
  },
  permissionCard: {
    padding: 15,
  },
  permissionHead: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  requiredRow: {
    marginTop: 2,
  },
  requiredText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: colors.dangerRose,
    letterSpacing: 0.3,
  },
  permissionDesc: {
    fontSize: 12.5,
    color: colors.textSecondary,
    lineHeight: 18,
    marginTop: 12,
  },
  helpBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 12,
    padding: 11,
    borderRadius: radius.chip,
    backgroundColor: alpha(colors.warningAmber, 0.1),
    borderWidth: 1,
    borderColor: alpha(colors.warningAmber, 0.28),
  },
  helpText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    maxWidth: 130,
  },
  chipText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  primaryButton: {
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 8,
  },
  primaryGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: colors.textOnAccent,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  skipButton: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  skipText: {
    color: colors.textMuted,
    fontSize: 13.5,
    fontWeight: '700',
  },
  skipSpacer: {
    height: 48,
  },
});
