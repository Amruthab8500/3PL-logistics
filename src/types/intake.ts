/** Core domain types for Style Asia 3PL Intake Hub (mini-CRM). */

export type LeadStatus = "New" | "Quoted" | "Onboarding" | "Active";

/** Yes / No / not answered (public form optional). */
export type YesNo = "" | "yes" | "no";

/** Attached file metadata; `url` is a blob URL when still valid in-session, else null after reload. */
export interface LeadFileAttachment {
  id: string;
  name: string;
  size: string;
  type: string;
  url: string | null;
}

/** Staff row from the directory (includes password for demo / local-managed accounts only). */
export interface StaffDirectoryEntry {
  email: string;
  password: string;
  name: string;
  /** Admins see Settings, workflow snapshot, and full dashboard help text. */
  isAdmin: boolean;
}

/** Persisted session user — never store passwords here. */
export interface SessionUser {
  email: string;
  name: string;
  isAdmin: boolean;
}

/** Webhook + notification targets configured under Settings (Sheets is the cloud source of truth). */
export interface IntegrationsConfig {
  googleSheetsWebhook: string;
  emailWebhook: string;
  notifyEmail: string;
}

export type SyncStateType = "idle" | "success" | "error";

export interface SyncState {
  type: SyncStateType;
  message: string;
}

/** Full client onboarding intake (public + staff), aligned with the printable PDF form. */
export interface LeadIntakeForm {
  companyName: string;
  contactName: string;
  title: string;
  email: string;
  phone: string;
  website: string;
  businessAddress: string;
  businessTypes: string[];
  businessTypeOther: string;
  productCategory: string;
  averageSkuCount: string;
  hazardousItems: YesNo;
  specialHandlingRequired: YesNo;
  specialHandlingExplain: string;
  estimatedMonthlyOrders: string;
  averageUnitsPerOrder: string;
  peakSeasonMonths: string;
  originCountry: string;
  shipmentFrequency: string;
  containerSizes: string[];
  customsCoordination: YesNo;
  fulfillmentOptions: string[];
  salesChannels: string[];
  salesChannelOther: string;
  needSystemIntegration: YesNo;
  estimatedPalletPositions: string;
  specialStorage: string;
  preferredCarriers: string;
  needShippingRateOptimization: YesNo;
  additionalRequirements: string;
  /** Legacy: merged with fulfillment for older rows / exports. */
  services: string[];
  volume: string;
  timeline: string;
  notes: string;
  files: LeadFileAttachment[];
}

/** Stored lead row. */
export interface LeadRecord extends LeadIntakeForm {
  id: number;
  /** Google Sheet row number (1-based) when known — used to push status updates to the Sheet. */
  sheetRow?: number;
  createdAt: string;
  createdBy: string;
  status: LeadStatus;
}

export interface UiPreferences {
  toastsEnabled: boolean;
}

export type FormErrorKey = "companyName" | "contactName" | "email";

export type FormErrors = Partial<Record<FormErrorKey, string>>;
