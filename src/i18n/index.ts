import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";
import frFR from "./locales/fr-FR.json";
import koKR from "./locales/ko-KR.json";
import jaJP from "./locales/ja-JP.json";
import ruRU from "./locales/ru-RU.json";
import deDE from "./locales/de-DE.json";
import esES from "./locales/es-ES.json";

i18next
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      "zh-CN": { translation: zhCN },
      "zh-TW": { translation: zhTW },
      "en-US": { translation: enUS },
      "fr-FR": { translation: frFR },
      "ko-KR": { translation: koKR },
      "ja-JP": { translation: jaJP },
      "ru-RU": { translation: ruRU },
      "de-DE": { translation: deDE },
      "es-ES": { translation: esES },
    },
    fallbackLng: "zh-CN",
    interpolation: {
      escapeValue: false,
    },
  });

export default i18next;
