import { useLocale } from '@/context/LocaleContext';
import en from '@/locales/en/common.json';
import tr from '@/locales/tr/common.json';

const translations = { en, tr };

export function useTranslation() {
  const { locale } = useLocale();
  return function t(key) {
    return translations[locale]?.[key] || translations["en"]?.[key] || key;
  };
}
