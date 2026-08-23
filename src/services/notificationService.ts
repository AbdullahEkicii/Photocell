import * as Notifications from 'expo-notifications';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import i18n from '../i18n';

export type ReminderFrequency = '3days' | 'weekly' | 'monthly' | 'disabled';

export interface AppNotificationSettings {
  enabled: boolean;
  frequency: ReminderFrequency;
  deepScanEnabled: boolean;
  fullscreenEnabled: boolean;
}

const SETTINGS_FILE_PATH = `${(FileSystem as any).documentDirectory || ''}photocell_settings.json`;

const DEFAULT_SETTINGS: AppNotificationSettings = {
  enabled: true,
  frequency: 'weekly',
  deepScanEnabled: true,
  fullscreenEnabled: false,
};

// Configure how notifications appear when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldPresentAlert: true,
    shouldShowList: true,
  }),
});

/**
 * Load persisted user notification & feature settings
 */
export async function getNotificationSettings(): Promise<AppNotificationSettings> {
  try {
    const info = await FileSystem.getInfoAsync(SETTINGS_FILE_PATH);
    if (info.exists) {
      const content = await FileSystem.readAsStringAsync(SETTINGS_FILE_PATH);
      const parsed = JSON.parse(content);
      return {
        enabled: parsed.enabled ?? true,
        frequency: parsed.frequency ?? 'weekly',
        deepScanEnabled: parsed.deepScanEnabled ?? true,
        fullscreenEnabled: parsed.fullscreenEnabled ?? false,
      };
    }
  } catch (e) {
    console.warn('Could not read notification settings:', e);
  }
  return DEFAULT_SETTINGS;
}

/**
 * Save user notification & feature settings
 */
export async function saveNotificationSettings(settings: AppNotificationSettings): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(SETTINGS_FILE_PATH, JSON.stringify(settings));
    if (settings.enabled && settings.frequency !== 'disabled') {
      await schedulePeriodicDetoxReminders(settings.frequency);
    } else {
      await Notifications.cancelAllScheduledNotificationsAsync();
    }
  } catch (e) {
    console.warn('Could not save notification settings:', e);
  }
}

/**
 * Request system notification permissions
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return false;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('photocell_reminders', {
        name: 'PhotoCell Galeri Hatırlatıcıları',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#00F2FE',
      });
    }

    return true;
  } catch (error) {
    console.warn('Failed to request notification permission:', error);
    return false;
  }
}

/**
 * Schedule recurring smart reminders based on selected frequency
 */
export async function schedulePeriodicDetoxReminders(frequency: ReminderFrequency): Promise<void> {
  try {
    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) return;

    // Clear existing scheduled notifications to avoid duplicates
    await Notifications.cancelAllScheduledNotificationsAsync();

    if (frequency === 'disabled') return;

    let intervalSeconds = 7 * 24 * 60 * 60; // 7 days (weekly) default
    if (frequency === '3days') {
      intervalSeconds = 3 * 24 * 60 * 60;
    } else if (frequency === 'monthly') {
      intervalSeconds = 30 * 24 * 60 * 60;
    }

    const t = i18n.t.bind(i18n);

    // Schedule Main Weekly/Periodic Detox Reminder
    await Notifications.scheduleNotificationAsync({
      content: {
        title: t('notifications.weekly_title', '🧹 Haftalık Galeri Detoksu Vakti!'),
        body: t('notifications.weekly_body', 'Yeni ekran görüntüleri ve kopyaları temizleyerek yer açın.'),
        sound: true,
        data: { screen: 'photos' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: intervalSeconds,
        repeats: true,
      },
    });

    // Schedule Secondary Video Optimization Nudge (half-way offset)
    const secondaryOffset = Math.max(86400, Math.floor(intervalSeconds / 2));
    await Notifications.scheduleNotificationAsync({
      content: {
        title: t('notifications.video_title', '🎬 4K Videolarınızı Optimize Edin'),
        body: t('notifications.video_body', 'Ağır videoları sıkıştırarak gigabaytlarca yer kazanın!'),
        sound: true,
        data: { screen: 'videos' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: secondaryOffset,
        repeats: true,
      },
    });
  } catch (e) {
    console.warn('Failed scheduling periodic detox reminders:', e);
  }
}

/**
 * Trigger immediate test notification to verify system in action
 */
export async function sendTestNotification(): Promise<boolean> {
  try {
    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) return false;

    const t = i18n.t.bind(i18n);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: t('notifications.test_title', '✨ FotoSil Akıllı Hatırlatıcı Aktif'),
        body: t('notifications.test_body', 'Bildirimler ayarlandı! Galeriniz dolduğunda haber vereceğiz.'),
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 2,
      },
    });

    return true;
  } catch (e) {
    console.warn('Failed sending test notification:', e);
    return false;
  }
}

/**
 * Initialize default notification schedule on app launch if enabled
 */
export async function initializeNotifications(): Promise<void> {
  try {
    const settings = await getNotificationSettings();
    if (settings.enabled && settings.frequency !== 'disabled') {
      await schedulePeriodicDetoxReminders(settings.frequency);
    }
  } catch (err) {
    console.warn('Notification init error:', err);
  }
}
