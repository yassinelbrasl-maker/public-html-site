import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
} from "react";
import {
  DICTIONARIES,
  Dictionary,
  Locale,
  LOCALES,
  RTL_LOCALES,
} from "./locales";

const STORAGE_KEY = "cortoba-locale";

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: keyof Dictionary) => string;
  isRTL: boolean;
}

const Ctx = createContext<I18nContextValue | null>(null);

function detectInitial(): Locale {
  if (typeof window === "undefined") return "fr";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && LOCALES.includes(stored as Locale)) return stored as Locale;
  const browser = (window.navigator.language || "fr").toLowerCase().split("-")[0];
  if (LOCALES.includes(browser as Locale)) return browser as Locale;
  return "fr";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectInitial);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, l);
    }
  }, []);

  const isRTL = RTL_LOCALES.includes(locale);

  // Sync <html lang> and <body dir> so CSS + screen readers react properly
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = locale;
    document.documentElement.dir = isRTL ? "rtl" : "ltr";
    document.body.classList.toggle("rtl", isRTL);
  }, [locale, isRTL]);

  const t = useCallback(
    (key: keyof Dictionary): string => DICTIONARIES[locale][key],
    [locale]
  );

  return (
    <Ctx.Provider value={{ locale, setLocale, t, isRTL }}>
      {children}
    </Ctx.Provider>
  );
}

export function useI18n() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n must be used within I18nProvider");
  return v;
}
