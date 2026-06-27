import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import fa from '../locales/fa.json';
import en from '../locales/en.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      fa: { translation: fa },
      en: { translation: en },
    },
    fallbackLng: 'fa',
    defaultNS: 'translation',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'erp-lang',
    },
  });

export function setLang(lang: 'fa' | 'en') {
  i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
  localStorage.setItem('erp-lang', lang);
}

export function currentLang(): 'fa' | 'en' {
  return (i18n.language?.startsWith('fa') ? 'fa' : 'en') as 'fa' | 'en';
}

export default i18n;
