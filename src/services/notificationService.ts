import * as Notifications from 'expo-notifications';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import i18n from '../i18n';
import { colors } from '../theme/colors';

export type ReminderFrequency = '3days' | 'weekly' | 'monthly' | 'disabled';

export interface AppNotificationSettings {
  enabled: boolean;
  frequency: ReminderFrequency;
  deepScanEnabled: boolean;
  fullscreenEnabled: boolean;
}

/** Result of asking the OS for notification permission. */
export type NotificationPermissionResult =
  | 'granted'
  /** Denied, but the OS will still let us ask again (first refusal). */
  | 'denied'
  /** Permanently denied — only the system Settings screen can change this. */
  | 'blocked';

/** Result of trying to fire the test notification from Settings. */
export type TestNotificationResult = 'sent' | 'denied' | 'blocked' | 'error';

const SETTINGS_FILE_PATH = `${(FileSystem as any).documentDirectory || ''}photocell_settings.json`;
const ANDROID_CHANNEL_ID = 'photocell_reminders';

const DEFAULT_SETTINGS: AppNotificationSettings = {
  enabled: true,
  frequency: 'weekly',
  deepScanEnabled: true,
  // The app is designed edge to edge: the floating tab bar is meant to sit
  // where the system status and navigation bars would otherwise be.
  fullscreenEnabled: true,
};

// Configure how notifications appear when the app is in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
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
        fullscreenEnabled: parsed.fullscreenEnabled ?? true,
      };
    }
  } catch (e) {
    console.warn('Could not read notification settings:', e);
  }
  return DEFAULT_SETTINGS;
}

/**
 * Save user notification & feature settings.
 *
 * Only re-schedules the periodic reminder when `enabled` or `frequency`
 * actually changed. Every save used to reschedule unconditionally, so toggling
 * an unrelated setting (deep scan, fullscreen mode) reset the reminder's timer
 * back to the full interval — a reminder due tomorrow would get pushed a full
 * week out just because the user opened Settings.
 */
export async function saveNotificationSettings(settings: AppNotificationSettings): Promise<void> {
  try {
    const previous = await getNotificationSettings();
    await FileSystem.writeAsStringAsync(SETTINGS_FILE_PATH, JSON.stringify(settings));

    const reminderConfigChanged =
      previous.enabled !== settings.enabled || previous.frequency !== settings.frequency;
    if (!reminderConfigChanged) return;

    if (settings.enabled && settings.frequency !== 'disabled') {
      await schedulePeriodicDetoxReminders(settings.frequency, { requestPermission: true });
    } else {
      await Notifications.cancelAllScheduledNotificationsAsync();
    }
  } catch (e) {
    console.warn('Could not save notification settings:', e);
  }
}

/** Creates (or refreshes) the Android channel the reminders are posted to. */
async function ensureReminderChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: i18n.t('notifications.channel_name'),
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: colors.primary,
  });
}

/**
 * Request system notification permissions and, on Android, ensure the
 * reminder channel exists. Distinguishes a fresh denial (can still ask again
 * later, e.g. next app update) from a permanent one (user must go to the OS
 * Settings screen), so the UI can offer the right next step.
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionResult> {
  try {
    let current = await Notifications.getPermissionsAsync();

    if (current.status !== 'granted' && current.canAskAgain) {
      current = await Notifications.requestPermissionsAsync();
    }

    if (current.status !== 'granted') {
      return current.canAskAgain ? 'denied' : 'blocked';
    }

    await ensureReminderChannel();
    return 'granted';
  } catch (error) {
    console.warn('Failed to request notification permission:', error);
    return 'denied';
  }
}

/**
 * When each reminder fires. Calendar triggers (weekday + clock time) are used
 * instead of "N seconds from now" intervals for two reasons:
 *
 * 1. The old photo and video reminders were both repeating intervals, the
 *    second at exactly half the first. Every 2nd tick of the short one landed
 *    on the long one, so both notifications fired in the same second.
 *    Distinct weekdays can never collide.
 * 2. An interval counts from whenever it was scheduled, so a reminder could
 *    land at 3 AM. These all fire at a sensible hour.
 *
 * weekday: 1 = Sunday ... 7 = Saturday (expo-notifications convention).
 */
type ReminderSlot =
  | { kind: 'photos' | 'videos'; type: 'weekly'; weekday: number; hour: number; minute: number }
  | { kind: 'photos' | 'videos'; type: 'monthly'; day: number; hour: number; minute: number };

const REMINDER_SLOTS: Record<Exclude<ReminderFrequency, 'disabled'>, ReminderSlot[]> = {
  // Photos Mon + Thu (every 3-4 days), video nudge Saturday.
  '3days': [
    { kind: 'photos', type: 'weekly', weekday: 2, hour: 11, minute: 0 },
    { kind: 'photos', type: 'weekly', weekday: 5, hour: 11, minute: 0 },
    { kind: 'videos', type: 'weekly', weekday: 7, hour: 17, minute: 0 },
  ],
  // Photos Sunday late morning, video nudge Thursday evening.
  weekly: [
    { kind: 'photos', type: 'weekly', weekday: 1, hour: 11, minute: 0 },
    { kind: 'videos', type: 'weekly', weekday: 5, hour: 19, minute: 0 },
  ],
  // Photos on the 1st, video nudge on the 15th.
  monthly: [
    { kind: 'photos', type: 'monthly', day: 1, hour: 11, minute: 0 },
    { kind: 'videos', type: 'monthly', day: 15, hour: 19, minute: 0 },
  ],
};

const slotIdentifier = (slot: ReminderSlot): string =>
  slot.type === 'weekly'
    ? `photocell.${slot.kind}.weekly.${slot.weekday}`
    : `photocell.${slot.kind}.monthly.${slot.day}`;

const expectedIdentifiers = (frequency: ReminderFrequency): string[] =>
  frequency === 'disabled' ? [] : REMINDER_SLOTS[frequency].map(slotIdentifier).sort();

/**
 * Scheduling is serialized: app launch and a Settings change can both ask for
 * a reschedule at nearly the same time, and two interleaved
 * "cancel everything, then schedule" runs each leave their own copy of the
 * reminders behind — duplicates. With fixed identifiers a re-run replaces
 * instead of adding, and the queue keeps runs from overlapping at all.
 */
let scheduleQueue: Promise<unknown> = Promise.resolve();

/**
 * Schedule recurring smart reminders based on selected frequency
 */
export function schedulePeriodicDetoxReminders(
  frequency: ReminderFrequency,
  options: { requestPermission?: boolean } = {}
): Promise<void> {
  const run = scheduleQueue
    .catch(() => {})
    .then(() => doScheduleReminders(frequency, options.requestPermission ?? false));
  scheduleQueue = run;
  return run;
}

/**
 * `requestPermission` is only true when the user has just done something that
 * asks for reminders (turning them on in Settings). Everywhere else - notably
 * app launch - scheduling must stay silent: an OS permission dialog appearing
 * unprompted, before the user has seen why, is a bad first impression, and on
 * Android it would re-appear on every launch after a first refusal.
 */
async function doScheduleReminders(
  frequency: ReminderFrequency,
  requestPermission: boolean
): Promise<void> {
  try {
    if (requestPermission) {
      if ((await requestNotificationPermission()) !== 'granted') return;
    } else {
      if ((await getNotificationPermissionState()) !== 'granted') return;
      await ensureReminderChannel();
    }

    // Also sweeps up reminders scheduled by older app versions (random ids,
    // repeating intervals) so they can't keep firing alongside the new ones.
    await Notifications.cancelAllScheduledNotificationsAsync();

    if (frequency === 'disabled') return;

    const t = i18n.t.bind(i18n);

    for (const slot of REMINDER_SLOTS[frequency]) {
      const isPhotos = slot.kind === 'photos';
      const channelId = Platform.OS === 'android' ? ANDROID_CHANNEL_ID : undefined;

      await Notifications.scheduleNotificationAsync({
        identifier: slotIdentifier(slot),
        content: {
          title: t(isPhotos ? 'notifications.weekly_title' : 'notifications.video_title'),
          body: t(isPhotos ? 'notifications.weekly_body' : 'notifications.video_body'),
          sound: true,
          data: { screen: isPhotos ? 'photos' : 'videos' },
        },
        trigger:
          slot.type === 'weekly'
            ? {
                type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
                weekday: slot.weekday,
                hour: slot.hour,
                minute: slot.minute,
                channelId,
              }
            : {
                type: Notifications.SchedulableTriggerInputTypes.MONTHLY,
                day: slot.day,
                hour: slot.hour,
                minute: slot.minute,
                channelId,
              },
      });
    }
  } catch (e) {
    console.warn('Failed scheduling periodic detox reminders:', e);
  }
}

/** Current OS notification permission, without ever showing a prompt. */
export async function getNotificationPermissionState(): Promise<NotificationPermissionResult> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.status === 'granted') return 'granted';
    return current.canAskAgain ? 'denied' : 'blocked';
  } catch {
    return 'denied';
  }
}

/**
 * Fire an immediate test notification so the user can confirm notifications
 * actually reach their device. Works independently of the periodic-reminder
 * toggle — testing delivery shouldn't require turning that on first.
 */
export async function sendTestNotification(): Promise<TestNotificationResult> {
  try {
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      return permission === 'blocked' ? 'blocked' : 'denied';
    }

    const t = i18n.t.bind(i18n);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: t('notifications.test_title'),
        body: t('notifications.test_body'),
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 2,
        channelId: Platform.OS === 'android' ? ANDROID_CHANNEL_ID : undefined,
      },
    });

    return 'sent';
  } catch (e) {
    console.warn('Failed sending test notification:', e);
    return 'error';
  }
}

/**
 * Restore the reminder schedule on app launch, without resetting its timer.
 *
 * Calendar-based reminders persist across restarts on their own, so this only
 * (re)schedules when what is queued doesn't match what the current settings
 * call for — a fresh install, a cleared notification store, or reminders left
 * over from an older version (random ids, interval triggers, the cause of the
 * "two notifications at once" bug). When everything already matches it does
 * nothing.
 */
export async function initializeNotifications(): Promise<void> {
  try {
    const settings = await getNotificationSettings();

    if (!settings.enabled || settings.frequency === 'disabled') {
      await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
      return;
    }

    const existing = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
    const have = existing.map((request) => request.identifier).sort();
    const want = expectedIdentifiers(settings.frequency);

    const inSync = have.length === want.length && have.every((id, index) => id === want[index]);
    if (!inSync) {
      await schedulePeriodicDetoxReminders(settings.frequency);
    }
  } catch (err) {
    console.warn('Notification init error:', err);
  }
}
