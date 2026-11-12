import * as FileSystem from 'expo-file-system/legacy';

import { AnalyticsService } from './analyticsService';
import i18n from '../i18n';
import { isSupportedLanguage, resolveSupportedLanguage } from '../i18n/languages';

const LANGUAGE_FILE_PATH = `${(FileSystem as any).documentDirectory || ''}photocell_language.json`;

/** The language the user picked in the app, or null when they never chose one. */
export async function loadSavedLanguage(): Promise<string | null> {
  try {
    const info = await FileSystem.getInfoAsync(LANGUAGE_FILE_PATH);
    if (!info.exists) return null;
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(LANGUAGE_FILE_PATH));
    return isSupportedLanguage(parsed?.code) ? parsed.code : null;
  } catch {
    return null;
  }
}

/** Applies the language the user picked last time. Without one the device language stays. */
export async function restoreSavedLanguage(): Promise<void> {
  const saved = await loadSavedLanguage();
  if (saved && saved !== resolveSupportedLanguage(i18n.language)) {
    await i18n.changeLanguage(saved);
  }
}

/** Switches the app language and remembers it for the next launch. */
export async function setAppLanguage(code: string): Promise<void> {
  if (!isSupportedLanguage(code)) return;
  await i18n.changeLanguage(code);
  AnalyticsService.trackLanguageChanged(code);
  try {
    await FileSystem.writeAsStringAsync(LANGUAGE_FILE_PATH, JSON.stringify({ code }));
  } catch (err) {
    console.warn('Could not save the language choice:', err);
  }
}
