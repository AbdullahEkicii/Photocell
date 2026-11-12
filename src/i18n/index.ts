import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as RNLocalize from 'react-native-localize';

import { resolveSupportedLanguage } from './languages';

import ar from './locales/ar.json';
import bn from './locales/bn.json';
import de from './locales/de.json';
import en from './locales/en.json';
import es from './locales/es.json';
import fa from './locales/fa.json';
import fil from './locales/fil.json';
import fr from './locales/fr.json';
import hi from './locales/hi.json';
import id from './locales/id.json';
import it from './locales/it.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import ms from './locales/ms.json';
import nl from './locales/nl.json';
import pl from './locales/pl.json';
import pt from './locales/pt.json';
import ro from './locales/ro.json';
import ru from './locales/ru.json';
import th from './locales/th.json';
import tr from './locales/tr.json';
import uk from './locales/uk.json';
import ur from './locales/ur.json';
import vi from './locales/vi.json';
import zh from './locales/zh.json';

const resources = {
  ar: { translation: ar },
  bn: { translation: bn },
  de: { translation: de },
  en: { translation: en },
  es: { translation: es },
  fa: { translation: fa },
  fil: { translation: fil },
  fr: { translation: fr },
  hi: { translation: hi },
  id: { translation: id },
  it: { translation: it },
  ja: { translation: ja },
  ko: { translation: ko },
  ms: { translation: ms },
  nl: { translation: nl },
  pl: { translation: pl },
  pt: { translation: pt },
  ro: { translation: ro },
  ru: { translation: ru },
  th: { translation: th },
  tr: { translation: tr },
  uk: { translation: uk },
  ur: { translation: ur },
  vi: { translation: vi },
  zh: { translation: zh },
};

// The device language, when the app ships it (English otherwise). A language
// the user picked in the app overrides this at startup - see languageService.
const languageDetector = {
  type: 'languageDetector' as const,
  async: false,
  detect: () => {
    const locales = RNLocalize.getLocales();
    return resolveSupportedLanguage(locales.length > 0 ? locales[0].languageTag : 'en');
  },
  init: () => {},
  cacheUserLanguage: () => {},
};

i18n
  .use(languageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    compatibilityJSON: 'v4',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
