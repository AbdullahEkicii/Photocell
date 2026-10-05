import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import {
  X,
  Bell,
  Globe,
  Trash2,
  Sparkles,
  ShieldCheck,
  Check,
  Send,
  HelpCircle,
  Maximize,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';

import { GlassPanel } from '../glass/GlassPanel';
import { GlassButton } from '../glass/GlassButton';
import { colors, alpha, radius } from '../../theme/colors';
import {
  getNotificationSettings,
  saveNotificationSettings,
  sendTestNotification,
  ReminderFrequency,
  AppNotificationSettings,
  TestNotificationResult,
} from '../../services/notificationService';
import { saveStoredStats } from '../../services/cacheCleaner';
import { AnalyticsService } from '../../services/analyticsService';
import { ScanCacheService } from '../../services/scanCacheService';

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  onStatsReset?: () => void;
  onOpenGuide?: () => void;
  onFullscreenChange?: (enabled: boolean) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  visible,
  onClose,
  onStatsReset,
  onOpenGuide,
  onFullscreenChange,
}) => {
  const { t, i18n } = useTranslation();
  const [settings, setSettings] = useState<AppNotificationSettings>({
    enabled: true,
    frequency: 'weekly',
    deepScanEnabled: true,
    fullscreenEnabled: false,
  });
  const [testState, setTestState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');

  useEffect(() => {
    if (visible) {
      getNotificationSettings().then((s) => {
        setSettings(s);
        if (onFullscreenChange) onFullscreenChange(s.fullscreenEnabled);
      });
      setTestState('idle');
    }
  }, [visible, onFullscreenChange]);

  const updateSetting = async <K extends keyof AppNotificationSettings>(
    key: K,
    value: AppNotificationSettings[K]
  ) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    await saveNotificationSettings(updated);
    AnalyticsService.trackSettingToggled(key, String(value)).catch(() => {});
    if (key === 'fullscreenEnabled' && onFullscreenChange) {
      onFullscreenChange(value as boolean);
    }
    if (key === 'deepScanEnabled') {
      // The cached result was produced with the old thresholds, so it would
      // otherwise keep being served and the toggle would look inert.
      ScanCacheService.invalidatePhotoScan();
    }
  };

  const handleSendTestNotification = async () => {
    if (testState === 'sending') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setTestState('sending');

    const result: TestNotificationResult = await sendTestNotification();

    if (result === 'sent') {
      setTestState('sent');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert(t('general.success'), t('settings.test_notification_sent'));
      return;
    }

    setTestState('failed');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});

    if (result === 'blocked') {
      // Permanently denied — the OS won't show the permission dialog again,
      // so the only way forward is the system Settings screen.
      Alert.alert(t('general.error'), t('settings.test_notification_blocked'), [
        { text: t('settings.cancel'), style: 'cancel' },
        { text: t('settings.open_os_settings'), onPress: () => Linking.openSettings().catch(() => {}) },
      ]);
      return;
    }

    Alert.alert(t('general.error'), t('settings.test_notification_failed'));
  };

  const changeLang = (lang: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    i18n.changeLanguage(lang);
  };

  const handleResetStats = () => {
    Alert.alert(
      t('settings.reset_stats'),
      t('settings.reset_stats_confirm'),
      [
        { text: t('settings.cancel'), style: 'cancel' },
        {
          text: t('settings.confirm'),
          style: 'destructive',
          onPress: async () => {
            await saveStoredStats({
              lifetimeSavedBytes: 0,
              photosSavedBytes: 0,
              videosSavedBytes: 0,
            });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            Alert.alert(t('general.success'), t('settings.reset_stats_success'));
            if (onStatsReset) onStatsReset();
          },
        },
      ]
    );
  };

  const currentLang = (i18n.language || 'tr').startsWith('tr') ? 'tr' : 'en';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Animated.View entering={FadeIn.duration(200)} style={styles.modalOverlay}>
        <Animated.View
          entering={FadeInDown.duration(340).springify().damping(19).stiffness(190)}
          style={styles.modalContainer}
        >
          <GlassPanel
            borderRadius={32}
            borderColor="rgba(226, 232, 240, 0.95)"
            fillColor="#FFFFFF"
            intensity={40}
            style={styles.panel}
            contentStyle={styles.panelContent}
            glowAccent={colors.primary}
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerTextGroup}>
                <Text style={styles.title}>{t('settings.title')}</Text>
                <Text style={styles.subtitle}>{t('settings.subtitle')}</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  onClose();
                }}
                style={styles.closeButton}
                activeOpacity={0.7}
              >
                <X color={colors.textPrimary} size={20} strokeWidth={2.4} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              {/* SECTION 1: Notifications */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Bell color={colors.primary} size={18} strokeWidth={2.4} />
                  <Text style={styles.sectionTitle}>
                    {t('settings.section_notifications')}
                  </Text>
                </View>

                {/* Notification Toggle */}
                <View style={styles.rowItem}>
                  <View style={styles.rowTextGroup}>
                    <Text style={styles.itemTitle}>
                      {t('settings.reminders_toggle')}
                    </Text>
                    <Text style={styles.itemDesc}>
                      {t('settings.reminders_desc')}
                    </Text>
                  </View>
                  <Switch
                    value={settings.enabled}
                    onValueChange={(val) => updateSetting('enabled', val)}
                    trackColor={{ false: '#E2E8F0', true: colors.primary }}
                    thumbColor="#FFFFFF"
                  />
                </View>

                {/* Frequency Selector — only meaningful once reminders are on */}
                {settings.enabled && (
                  <View style={styles.frequencyContainer}>
                    <Text style={styles.frequencyLabel}>
                      {t('settings.frequency_title')}
                    </Text>
                    <View style={styles.pillRow}>
                      {(['3days', 'weekly', 'monthly'] as ReminderFrequency[]).map(
                        (freq) => {
                          const isSelected = settings.frequency === freq;
                          return (
                            <TouchableOpacity
                              key={freq}
                              activeOpacity={0.8}
                              onPress={() => updateSetting('frequency', freq)}
                              style={[
                                styles.freqPill,
                                isSelected && styles.freqPillActive,
                              ]}
                            >
                              <Text
                                numberOfLines={1}
                                style={[
                                  styles.freqPillText,
                                  isSelected && styles.freqPillTextActive,
                                ]}
                              >
                                {freq === '3days'
                                  ? t('settings.freq_3days')
                                  : freq === 'weekly'
                                  ? t('settings.freq_weekly')
                                  : t('settings.freq_monthly')}
                              </Text>
                            </TouchableOpacity>
                          );
                        }
                      )}
                    </View>
                  </View>
                )}

                {/* Test Notification Trigger — always available. Testing that
                    notifications actually reach the device shouldn't require
                    the periodic reminder to be turned on first. */}
                <View style={styles.testNotificationContainer}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={handleSendTestNotification}
                    disabled={testState === 'sending'}
                    style={[
                      styles.testNotificationButton,
                      testState === 'sent' && styles.testNotificationButtonSent,
                      testState === 'failed' && styles.testNotificationButtonFailed,
                    ]}
                  >
                    {testState === 'sending' ? (
                      <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 8 }} />
                    ) : testState === 'sent' ? (
                      <Check color={colors.successMint} size={15} style={{ marginRight: 8 }} />
                    ) : (
                      <Send
                        color={testState === 'failed' ? colors.dangerRose : colors.primary}
                        size={15}
                        style={{ marginRight: 8 }}
                      />
                    )}
                    <Text
                      style={[
                        styles.testNotificationText,
                        testState === 'sent' && { color: colors.successMint },
                        testState === 'failed' && { color: colors.dangerRose },
                      ]}
                    >
                      {t('settings.test_notification')}
                    </Text>
                  </TouchableOpacity>
                  <Text style={styles.testNotificationHint}>
                    {t('settings.test_notification_hint')}
                  </Text>
                </View>
              </View>

              {/* SECTION 2: Language & Deep Scan */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Globe color={colors.accent} size={18} strokeWidth={2.4} />
                  <Text style={[styles.sectionTitle, { color: colors.accent }]}>
                    {t('settings.section_general')}
                  </Text>
                </View>

                {/* Language Picker */}
                <View style={styles.rowItem}>
                  <View style={styles.rowTextGroup}>
                    <Text style={styles.itemTitle}>{t('settings.language')}</Text>
                  </View>
                  <View style={styles.langButtonsRow}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => changeLang('tr')}
                      style={[
                        styles.langPill,
                        currentLang === 'tr' && styles.langPillActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.langPillText,
                          currentLang === 'tr' && styles.langPillTextActive,
                        ]}
                      >
                        🇹🇷 TR
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => changeLang('en')}
                      style={[
                        styles.langPill,
                        currentLang === 'en' && styles.langPillActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.langPillText,
                          currentLang === 'en' && styles.langPillTextActive,
                        ]}
                      >
                        🇬🇧 EN
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Deep AI Scan Toggle */}
                <View style={[styles.rowItem, { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E2E8F0' }]}>
                  <View style={styles.rowTextGroup}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Sparkles color={colors.accent} size={15} style={{ marginRight: 6 }} />
                      <Text style={styles.itemTitle}>{t('settings.deep_scan')}</Text>
                    </View>
                    <Text style={styles.itemDesc}>{t('settings.deep_scan_desc')}</Text>
                  </View>
                  <Switch
                    value={settings.deepScanEnabled}
                    onValueChange={(val) => updateSetting('deepScanEnabled', val)}
                    trackColor={{ false: '#E2E8F0', true: colors.accent }}
                    thumbColor="#FFFFFF"
                  />
                </View>

                {/* Fullscreen Mode Toggle */}
                <View style={[styles.rowItem, { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E2E8F0' }]}>
                  <View style={styles.rowTextGroup}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Maximize color={colors.primary} size={15} style={{ marginRight: 6 }} />
                      <Text style={styles.itemTitle}>{t('settings.fullscreen_mode')}</Text>
                    </View>
                    <Text style={styles.itemDesc}>{t('settings.fullscreen_mode_desc')}</Text>
                  </View>
                  <Switch
                    value={settings.fullscreenEnabled}
                    onValueChange={(val) => updateSetting('fullscreenEnabled', val)}
                    trackColor={{ false: '#E2E8F0', true: colors.primary }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              </View>

              {/* SECTION 3: User Guide */}
              {onOpenGuide && (
                <View style={styles.section}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      onClose();
                      onOpenGuide();
                    }}
                    style={styles.guideButton}
                  >
                    <HelpCircle color={colors.primary} size={18} style={{ marginRight: 8 }} />
                    <Text style={styles.guideButtonText}>
                      {t('guide.open_guide')}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* SECTION 4: Storage Reset */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Trash2 color={colors.dangerRose} size={18} strokeWidth={2.4} />
                  <Text style={[styles.sectionTitle, { color: colors.dangerRose }]}>
                    {t('settings.section_storage')}
                  </Text>
                </View>

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={handleResetStats}
                  style={styles.resetButton}
                >
                  <Trash2 color={colors.dangerRose} size={16} style={{ marginRight: 8 }} />
                  <Text style={styles.resetButtonText}>
                    {t('settings.reset_stats')}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* SECTION 5: About Card */}
              <View style={styles.aboutCard}>
                <ShieldCheck color={colors.successMint} size={22} style={{ marginBottom: 6 }} />
                <Text style={styles.aboutVersion}>
                  {t('settings.app_version', {
                    version: Constants.expoConfig?.version ?? '',
                    build: Constants.expoConfig?.android?.versionCode ?? '',
                  })}
                </Text>
                <Text style={styles.aboutTech}>{t('settings.app_tech')}</Text>
                <Text style={styles.privacyNote}>
                  {t('permission.privacy_guarantee_desc')}
                </Text>
              </View>
            </ScrollView>

            {/* Bottom Done Button */}
            <GlassButton
              borderRadius={24}
              borderColor={colors.primary}
              style={styles.bottomDoneButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                onClose();
              }}
            >
              <Text style={styles.bottomDoneText}>{t('settings.close')}</Text>
            </GlassButton>
          </GlassPanel>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 32,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '92%',
  },
  panel: {
    borderRadius: 32,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  panelContent: {
    padding: 20,
    maxHeight: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTextGroup: {
    flex: 1,
    paddingRight: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingVertical: 14,
    gap: 14,
  },
  section: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  rowTextGroup: {
    flex: 1,
    paddingRight: 12,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  itemDesc: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16,
  },
  frequencyContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  frequencyLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 6,
  },
  freqPill: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  freqPillActive: {
    backgroundColor: 'rgba(147, 51, 234, 0.12)',
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  freqPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    textAlign: 'center',
  },
  freqPillTextActive: {
    color: colors.primary,
    fontWeight: '800',
  },
  testNotificationContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  testNotificationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: alpha(colors.primary, 0.08),
    borderWidth: 1,
    borderColor: alpha(colors.primary, 0.3),
    borderRadius: radius.chip,
    paddingVertical: 11,
  },
  testNotificationButtonSent: {
    backgroundColor: alpha(colors.successMint, 0.08),
    borderColor: alpha(colors.successMint, 0.3),
  },
  testNotificationButtonFailed: {
    backgroundColor: alpha(colors.dangerRose, 0.08),
    borderColor: alpha(colors.dangerRose, 0.3),
  },
  testNotificationText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
  },
  testNotificationHint: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 15,
  },
  langButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  langPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  langPillActive: {
    backgroundColor: 'rgba(217, 70, 239, 0.15)',
    borderColor: colors.accent,
    borderWidth: 1.5,
  },
  langPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  langPillTextActive: {
    color: colors.accent,
    fontWeight: '800',
  },
  guideButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(147, 51, 234, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(147, 51, 234, 0.3)',
    borderRadius: 14,
    paddingVertical: 12,
  },
  guideButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(244, 63, 94, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(244, 63, 94, 0.3)',
    borderRadius: 14,
    paddingVertical: 11,
  },
  resetButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.dangerRose,
  },
  aboutCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
  },
  aboutVersion: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  aboutTech: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.successMint,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  privacyNote: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 16,
  },
  bottomDoneButton: {
    width: '100%',
    height: 48,
    marginTop: 6,
  },
  bottomDoneText: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.primary,
  },
});
