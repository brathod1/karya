import { requireOrgContext } from "@/server/context";
import { BusinessForm } from "./business-form";

export default async function BusinessSettingsPage() {
  const ctx = await requireOrgContext();
  return (
    <BusinessForm
      canManage={ctx.role === "OWNER" || ctx.role === "ADMIN"}
      initial={{
        name: ctx.org.name, logoUrl: ctx.org.logoUrl, currencyCode: ctx.org.currencyCode,
        currencySymbol: ctx.org.currencySymbol, timezone: ctx.org.timezone, locale: ctx.org.locale,
        dateFormat: ctx.config.settings.formats.dateFormat,
        numberLocale: ctx.config.settings.formats.numberLocale,
        currencyPosition: ctx.config.settings.formats.currencyPosition,
        enableCostTracking: ctx.config.settings.pricing.enableCostTracking,
        enableTax: ctx.config.settings.pricing.enableTax,
        taxRatePercent: ctx.config.settings.pricing.taxRatePercent,
        enableDiscounts: ctx.config.settings.pricing.enableDiscounts,
        enableAdditionalCharges: ctx.config.settings.pricing.enableAdditionalCharges,
        enableCustomerSpecificPricing: ctx.config.settings.pricing.enableCustomerSpecificPricing,
        overpaymentPolicy: ctx.config.settings.payments.overpaymentPolicy,
        autoAdvanceStatusOnFullPayment: ctx.config.settings.payments.autoAdvanceStatusOnFullPayment,
        requireCustomer: ctx.config.settings.orders.requireCustomer,
        requireDeliveryDate: ctx.config.settings.orders.requireDeliveryDate,
        defaultDeliveryLeadDays: ctx.config.settings.orders.defaultDeliveryLeadDays,
        dueSoonDays: ctx.config.settings.orders.dueSoonDays,
        allowOverproduction: ctx.config.settings.events.allowOverproduction,
      }}
    />
  );
}
