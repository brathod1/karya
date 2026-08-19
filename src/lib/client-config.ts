import type { OrgSettingsData } from "./settings";

/**
 * The serialisable slice of an organisation's configuration that crosses the
 * server/client boundary. It lives in `lib` rather than in the server domain so
 * that client components never import from a `server-only` module, even for types.
 */
export type ClientConfig = {
  orgName: string;
  logoUrl: string | null;
  currencySymbol: string;
  currencyCode: string;
  locale: string;
  dateFormat: string;
  currencyPosition: "before" | "after";
  terminology: OrgSettingsData["terminology"];
  modules: OrgSettingsData["modules"];
  pricing: OrgSettingsData["pricing"];
  orders: OrgSettingsData["orders"];
  events: OrgSettingsData["events"];
  role: string;
};
