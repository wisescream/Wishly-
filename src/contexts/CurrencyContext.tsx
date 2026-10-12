import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import {
  type Currency,
  DEFAULT_CURRENCY,
  formatPrice as formatPriceUtil,
  convertCurrency,
  CURRENCIES,
  isSupportedCurrency,
} from "@/lib/currency";
import { useAuth } from "./AuthContext";

interface CurrencyContextValue {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  format: (amount: number, from?: Currency) => string;
  convert: (amount: number, from: Currency) => number;
}

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: DEFAULT_CURRENCY,
  setCurrency: () => {},
  format: (amount) => String(amount),
  convert: (amount) => amount,
});

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [currency, setCurrencyState] = useState<Currency>(() => {
    const stored = localStorage.getItem("wishly-currency") as Currency | null;
    return stored && CURRENCIES[stored] ? stored : DEFAULT_CURRENCY;
  });

  const setCurrency = (c: Currency) => {
    setCurrencyState(c);
    localStorage.setItem("wishly-currency", c);
  };

  useEffect(() => {
    if (
      profile?.currency &&
      CURRENCIES[profile.currency as Currency]
    ) {
      setCurrency(profile.currency as Currency);
    }
  }, [profile?.currency]);

  const format = (amount: number, from?: Currency) => {
    const source = from?.toUpperCase();
    if (source && !isSupportedCurrency(source)) return formatPriceUtil(amount, source);
    const converted = source ? convertCurrency(amount, source, currency).convertedAmount : amount;
    return formatPriceUtil(converted, currency);
  };

  const convert = (amount: number, from: Currency) => {
    const source = from.toUpperCase();
    if (!isSupportedCurrency(source)) return amount;
    return convertCurrency(amount, source, currency).convertedAmount;
  };

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, format, convert }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
