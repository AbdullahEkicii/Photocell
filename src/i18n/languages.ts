export interface AppLanguage {
  /** i18next language code, also the name of the locale file. */
  code: string;
  /** The language's own name, shown in the picker so anyone can find theirs. */
  name: string;
}

/** Every language the app ships, most widely used first. */
export const LANGUAGES: AppLanguage[] = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'pt', name: 'Português' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'ru', name: 'Русский' },
  { code: 'ar', name: 'العربية' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'it', name: 'Italiano' },
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'th', name: 'ไทย' },
  { code: 'pl', name: 'Polski' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'zh', name: '简体中文' },
  { code: 'bn', name: 'বাংলা' },
  { code: 'uk', name: 'Українська' },
  { code: 'fa', name: 'فارسی' },
  { code: 'ms', name: 'Bahasa Melayu' },
  { code: 'fil', name: 'Filipino' },
  { code: 'ro', name: 'Română' },
  { code: 'ur', name: 'اردو' },
];

/** Codes Android still reports under their older names. */
const LEGACY_CODES: Record<string, string> = { in: 'id', tl: 'fil' };

export const isSupportedLanguage = (code: string | null | undefined): code is string =>
  Boolean(code) && LANGUAGES.some((l) => l.code === code);

/** Maps any device locale tag ("pt-BR", "in", "zh-Hans-CN") to a shipped language, or English. */
export const resolveSupportedLanguage = (tag: string | null | undefined): string => {
  const primary = (tag || '').toLowerCase().split(/[-_]/)[0];
  const code = LEGACY_CODES[primary] ?? primary;
  return isSupportedLanguage(code) ? code : 'en';
};

export const getLanguageName = (code: string | null | undefined): string => {
  const resolved = resolveSupportedLanguage(code);
  return LANGUAGES.find((l) => l.code === resolved)?.name ?? 'English';
};
