import type { LeadIntakeForm, LeadRecord } from "types/intake";

export const BUSINESS_TYPE_OPTIONS = ["Ecommerce", "Wholesale", "Retail", "Amazon Seller", "Importer"] as const;

export const CONTAINER_SIZE_OPTIONS = ["20ft", "40ft", "LCL"] as const;

export const FULFILLMENT_CHECKBOX_OPTIONS = [
  "Pick & Pack",
  "Amazon FBA Prep",
  "Labeling",
  "Kitting / Bundling",
  "Pallet Distribution",
  "Returns Handling",
  "Quality Inspection",
] as const;

export const SALES_CHANNEL_OPTIONS = ["Shopify", "Amazon", "Walmart"] as const;

/** Kept for optional “when to start” field (stats / CRM). */
export const TIMELINE_OPTIONS = ["Immediately", "1–3 months", "Just exploring"] as const;

export function createEmptyForm(): LeadIntakeForm {
  return {
    companyName: "",
    contactName: "",
    title: "",
    email: "",
    phone: "",
    website: "",
    businessAddress: "",
    businessTypes: [],
    businessTypeOther: "",
    productCategory: "",
    averageSkuCount: "",
    hazardousItems: "",
    specialHandlingRequired: "",
    specialHandlingExplain: "",
    estimatedMonthlyOrders: "",
    averageUnitsPerOrder: "",
    peakSeasonMonths: "",
    originCountry: "",
    shipmentFrequency: "",
    containerSizes: [],
    customsCoordination: "",
    fulfillmentOptions: [],
    salesChannels: [],
    salesChannelOther: "",
    needSystemIntegration: "",
    estimatedPalletPositions: "",
    specialStorage: "",
    preferredCarriers: "",
    needShippingRateOptimization: "",
    additionalRequirements: "",
    services: [],
    volume: "",
    timeline: "",
    notes: "",
    files: [],
  };
}

export function formFromRecord(record: LeadRecord): LeadIntakeForm {
  const { id: _id, sheetRow: _sr, createdAt: _ca, createdBy: _cb, status: _st, ...rest } = record;
  return { ...createEmptyForm(), ...rest };
}

export function ynLabel(v: string): string {
  if (v === "yes") return "Yes";
  if (v === "no") return "No";
  return "";
}
