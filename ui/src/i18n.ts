import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import it from "./locales/it.json";
import en from "./locales/en.json";

const LANG_STORAGE_KEY = "paperclip.lang";

function getStoredLang(): string {
  if (typeof window === "undefined") return "it";
  try {
    return window.localStorage.getItem(LANG_STORAGE_KEY) || "it";
  } catch {
    return "it";
  }
}

i18n.use(initReactI18next).init({
  resources: {
    it: { translation: it },
    en: { translation: en },
  },
  lng: getStoredLang(),
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export { LANG_STORAGE_KEY };
export default i18n;
