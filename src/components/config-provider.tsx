"use client";
import { createContext, useContext, useMemo } from "react";
import type { ClientConfig } from "@/lib/client-config";
import { formatMinor } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { can, type Capability, type Role } from "@/lib/permissions";
import type { TermKey } from "@/lib/settings";

type Ctx = ClientConfig & {
  t: (key: TermKey, form?: "one" | "many") => string;
  money: (minor: number) => string;
  date: (value: Date | string | null | undefined) => string;
  can: (capability: Capability) => boolean;
};

const ConfigContext = createContext<Ctx | null>(null);

export function ConfigProvider({ config, children }: { config: ClientConfig; children: React.ReactNode }) {
  const value = useMemo<Ctx>(() => ({
    ...config,
    t: (key, form = "one") => config.terminology[key]?.[form] ?? key,
    money: (minor: number) => formatMinor(minor, {
      symbol: config.currencySymbol, locale: config.locale, position: config.currencyPosition,
    }),
    date: (value) => formatDate(value, config.dateFormat),
    can: (capability) => can(config.role as Role, capability),
  }), [config]);

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig(): Ctx {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error("useConfig must be used inside <ConfigProvider>");
  return ctx;
}
