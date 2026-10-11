import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import type { Language, Translations } from "@/lib/i18n";
import { translations } from "@/lib/i18n";
import { useAuth } from "./AuthContext";

interface I18nContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  t: Translations;
}

const I18nContext = createContext<I18nContextValue>({
  lang: "en",
  setLang: () => {},
  t: translations.en,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [lang, setLangState] = useState<Language>(() => {
    const stored = localStorage.getItem("wishly-lang");
    if (stored === "en" || stored === "fr") return stored;
    return "en";
  });

  const setLang = (l: Language) => {
    setLangState(l);
    localStorage.setItem("wishly-lang", l);
    document.documentElement.lang = l;
  };

  // Sync with profile language preference
  useEffect(() => {
    if (profile?.language && (profile.language === "en" || profile.language === "fr")) {
      setLang(profile.language as Language);
    }
  }, [profile?.language]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <I18nContext.Provider value={{ lang, setLang, t: translations[lang] }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
