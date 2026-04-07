import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "components/ui/card";
import { Button } from "components/ui/button";
import { Input } from "components/ui/input";
import { Badge } from "components/ui/badge";
import { Checkbox } from "components/ui/checkbox";
import { Label } from "components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "components/ui/alert-dialog";
import {
  FileText,
  Package,
  Warehouse,
  RotateCcw,
  Search,
  Trash2,
  Download,
  PlusCircle,
  Shield,
  LogOut,
  Upload,
  Settings,
  Mail,
  ExternalLink,
  CheckCircle2,
  Clock3,
  Sparkles,
  Pencil,
  FileSpreadsheet,
  RefreshCw,
  Copy,
  Link2,
  Printer,
  Users,
} from "lucide-react";
import { BrandHeader } from "components/BrandHeader";
import { ClientOnboardingPrintForm } from "components/ClientOnboardingPrintForm";
import { OnboardingFields } from "components/OnboardingFields";
import { createEmptyForm, formFromRecord } from "constants/onboarding";
import type {
  FormErrors,
  IntegrationsConfig,
  LeadFileAttachment,
  LeadIntakeForm,
  LeadRecord,
  LeadStatus,
  SessionUser,
  StaffDirectoryEntry,
  SyncState,
  UiPreferences,
  YesNo,
} from "types/intake";

/** Baked into production build so the **public** (non-staff) page can POST; staff can also paste the same URL in Settings. */
const ENV_GOOGLE_SHEETS_WEBHOOK = (process.env.REACT_APP_GOOGLE_SHEETS_WEBHOOK_URL || "").trim();
const ENV_EMAIL_WEBHOOK = (process.env.REACT_APP_EMAIL_WEBHOOK_URL || "").trim();

const STATUS_OPTIONS: LeadStatus[] = ["New", "Quoted", "Onboarding", "Active"];

/** Seeds localStorage when a browser has no staff list yet. Not shown on the login screen — edit or replace after first admin setup (Settings). */
const DEMO_USERS: StaffDirectoryEntry[] = [
  { email: "admin@styleasia.com", password: "styleasia123", name: "Admin", isAdmin: true },
  { email: "ops@styleasia.com", password: "warehouse123", name: "Operations", isAdmin: false },
];

const defaultIntegrations: IntegrationsConfig = {
  googleSheetsWebhook: "",
  emailWebhook: "",
  notifyEmail: "",
};

const defaultUiPrefs: UiPreferences = { toastsEnabled: true };

const STORAGE = {
  leads: "styleAsia3plLeads",
  integrations: "styleAsia3plIntegrations",
  user: "styleAsia3plUser",
  uiPrefs: "styleAsia3plUiPrefs",
  staffUsers: "styleAsia3plStaffUsers",
} as const;

function asYesNo(v: unknown): YesNo {
  if (v === "yes" || v === "no") return v;
  return "";
}

function normalizeStaffUsers(raw: unknown): StaffDirectoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((o): StaffDirectoryEntry[] => {
    if (!o || typeof o !== "object") return [];
    const r = o as Record<string, unknown>;
    if (typeof r.email !== "string" || typeof r.password !== "string" || typeof r.name !== "string") return [];
    const email = r.email.trim().toLowerCase();
    const name = r.name.trim();
    if (!email || !name) return [];
    const isAdmin: boolean =
      typeof r.isAdmin === "boolean" ? r.isAdmin : email === "admin@styleasia.com";
    return [{ email, password: r.password, name, isAdmin }];
  });
}

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Google Apps Script `/exec` URLs do not complete CORS preflight for `Content-Type: application/json`.
 * `text/plain` is a “simple” type so the browser skips preflight; the body is still JSON and `e.postData.contents` parses the same.
 */
function postHeadersForWebhook(url: string): HeadersInit {
  try {
    const host = new URL(url).hostname;
    if (host === "script.google.com") {
      return { "Content-Type": "text/plain;charset=utf-8" };
    }
  } catch {
    /* invalid url */
  }
  return { "Content-Type": "application/json" };
}

async function postAppsScriptJson(url: string, payload: Record<string, unknown>): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: postHeadersForWebhook(url),
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let json: { ok?: boolean; error?: string };
  try {
    json = JSON.parse(text) as { ok?: boolean; error?: string };
  } catch {
    throw new Error("Apps Script did not return JSON. Deploy the latest scripts/google-apps-script-sample.js.");
  }
  if (!res.ok || json.ok === false) {
    throw new Error(json.error || `Request failed (${res.status})`);
  }
}

function revokeIfBlob(url: string | null | undefined) {
  if (url && url.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
}

function formatFileSize(bytes: number) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function buildAttachment(file: File): LeadFileAttachment {
  return {
    id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: file.name,
    size: formatFileSize(file.size),
    type: file.type || "file",
    url: URL.createObjectURL(file),
  };
}

function isLeadStatus(v: unknown): v is LeadStatus {
  return v === "New" || v === "Quoted" || v === "Onboarding" || v === "Active";
}

function normalizeLeadFile(raw: unknown, stripBlobUrls: boolean): LeadFileAttachment | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : null;
  const name = typeof o.name === "string" ? o.name : null;
  if (!id || !name) return null;
  const size = typeof o.size === "string" ? o.size : "—";
  const type = typeof o.type === "string" ? o.type : "file";
  let url: string | null = typeof o.url === "string" && o.url.startsWith("blob:") ? o.url : null;
  if (stripBlobUrls) url = null;
  return { id, name, size, type, url };
}

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
}

function normalizeLead(raw: unknown): LeadRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const idNum = typeof o.id === "number" ? o.id : Number(o.id);
  if (!Number.isFinite(idNum)) return null;
  const filesRaw = Array.isArray(o.files) ? o.files : [];
  const files = filesRaw
    .map((f) => normalizeLeadFile(f, true))
    .filter((f): f is LeadFileAttachment => f != null);

  const sheetRowRaw = o.sheetRow;
  const sheetRow =
    typeof sheetRowRaw === "number" && Number.isFinite(sheetRowRaw) ? sheetRowRaw : undefined;

  const b = createEmptyForm();

  return {
    id: idNum,
    ...(sheetRow != null ? { sheetRow } : {}),
    createdAt: typeof o.createdAt === "string" ? o.createdAt : "",
    createdBy: typeof o.createdBy === "string" ? o.createdBy : "Staff",
    status: isLeadStatus(o.status) ? o.status : "New",
    ...b,
    companyName: typeof o.companyName === "string" ? o.companyName : "",
    contactName: typeof o.contactName === "string" ? o.contactName : "",
    title: typeof o.title === "string" ? o.title : "",
    email: typeof o.email === "string" ? o.email : "",
    phone: typeof o.phone === "string" ? o.phone : "",
    website: typeof o.website === "string" ? o.website : "",
    businessAddress: typeof o.businessAddress === "string" ? o.businessAddress : "",
    businessTypes: strArr(o.businessTypes),
    businessTypeOther: typeof o.businessTypeOther === "string" ? o.businessTypeOther : "",
    productCategory: typeof o.productCategory === "string" ? o.productCategory : "",
    averageSkuCount: typeof o.averageSkuCount === "string" ? o.averageSkuCount : "",
    hazardousItems: asYesNo(o.hazardousItems),
    specialHandlingRequired: asYesNo(o.specialHandlingRequired),
    specialHandlingExplain: typeof o.specialHandlingExplain === "string" ? o.specialHandlingExplain : "",
    estimatedMonthlyOrders: typeof o.estimatedMonthlyOrders === "string" ? o.estimatedMonthlyOrders : "",
    averageUnitsPerOrder: typeof o.averageUnitsPerOrder === "string" ? o.averageUnitsPerOrder : "",
    peakSeasonMonths: typeof o.peakSeasonMonths === "string" ? o.peakSeasonMonths : "",
    originCountry: typeof o.originCountry === "string" ? o.originCountry : "",
    shipmentFrequency: typeof o.shipmentFrequency === "string" ? o.shipmentFrequency : "",
    containerSizes: strArr(o.containerSizes),
    customsCoordination: asYesNo(o.customsCoordination),
    fulfillmentOptions: strArr(o.fulfillmentOptions),
    salesChannels: strArr(o.salesChannels),
    salesChannelOther: typeof o.salesChannelOther === "string" ? o.salesChannelOther : "",
    needSystemIntegration: asYesNo(o.needSystemIntegration),
    estimatedPalletPositions: typeof o.estimatedPalletPositions === "string" ? o.estimatedPalletPositions : "",
    specialStorage: typeof o.specialStorage === "string" ? o.specialStorage : "",
    preferredCarriers: typeof o.preferredCarriers === "string" ? o.preferredCarriers : "",
    needShippingRateOptimization: asYesNo(o.needShippingRateOptimization),
    additionalRequirements: typeof o.additionalRequirements === "string" ? o.additionalRequirements : "",
    services: strArr(o.services),
    volume: typeof o.volume === "string" ? o.volume : "",
    timeline: typeof o.timeline === "string" ? o.timeline : "",
    notes: typeof o.notes === "string" ? o.notes : "",
    files,
  };
}

function normalizeLeads(raw: unknown): LeadRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeLead).filter((r): r is LeadRecord => r != null);
}

function normalizeIntegrations(raw: unknown): IntegrationsConfig {
  if (!raw || typeof raw !== "object") return { ...defaultIntegrations };
  const o = raw as Record<string, unknown>;
  return {
    googleSheetsWebhook:
      typeof o.googleSheetsWebhook === "string" ? o.googleSheetsWebhook : defaultIntegrations.googleSheetsWebhook,
    emailWebhook: typeof o.emailWebhook === "string" ? o.emailWebhook : defaultIntegrations.emailWebhook,
    notifyEmail: typeof o.notifyEmail === "string" ? o.notifyEmail : defaultIntegrations.notifyEmail,
  };
}

function readIntegrationsFromStorage(): IntegrationsConfig {
  if (typeof window === "undefined") return { ...defaultIntegrations };
  try {
    return normalizeIntegrations(safeJsonParse(localStorage.getItem(STORAGE.integrations), null));
  } catch {
    return { ...defaultIntegrations };
  }
}

/** Prefer React state, then localStorage (public page never synced state before; Pull/submit always see saved URL), then build-time env. */
function resolveGoogleSheetsWebhook(integrationsState: IntegrationsConfig): string {
  const fromState = integrationsState.googleSheetsWebhook.trim();
  if (fromState) return fromState;
  const fromLs = readIntegrationsFromStorage().googleSheetsWebhook.trim();
  if (fromLs) return fromLs;
  return ENV_GOOGLE_SHEETS_WEBHOOK.trim();
}

function resolveEmailWebhook(integrationsState: IntegrationsConfig): string {
  const fromState = integrationsState.emailWebhook.trim();
  if (fromState) return fromState;
  const fromLs = readIntegrationsFromStorage().emailWebhook.trim();
  if (fromLs) return fromLs;
  return ENV_EMAIL_WEBHOOK.trim();
}

function resolveNotifyEmail(integrationsState: IntegrationsConfig): string {
  const fromState = integrationsState.notifyEmail.trim();
  if (fromState) return fromState;
  return readIntegrationsFromStorage().notifyEmail.trim();
}

function normalizeSessionUser(raw: unknown): SessionUser | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.email !== "string" || typeof o.name !== "string") return null;
  const isAdmin = typeof o.isAdmin === "boolean" ? o.isAdmin : false;
  return { email: o.email, name: o.name, isAdmin };
}

function normalizeUiPrefs(raw: unknown): UiPreferences {
  if (!raw || typeof raw !== "object") return { ...defaultUiPrefs };
  const o = raw as Record<string, unknown>;
  return {
    toastsEnabled: typeof o.toastsEnabled === "boolean" ? o.toastsEnabled : defaultUiPrefs.toastsEnabled,
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const statusTone: Record<LeadStatus, string> = {
  New: "bg-sky-50 text-sky-700 border-sky-200",
  Quoted: "bg-amber-50 text-amber-700 border-amber-200",
  Onboarding: "bg-violet-50 text-violet-700 border-violet-200",
  Active: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

/** IDs for rows imported from Sheet — avoids colliding with Date.now() app IDs. */
const SHEET_ROW_ID_BASE = 9_000_000_000_000;

type SheetListLeadRow = {
  rowIndex: number;
  createdAt: string;
  createdBy: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  title?: string;
  website?: string;
  businessAddress?: string;
  businessTypes?: string[];
  businessTypeOther?: string;
  productCategory?: string;
  averageSkuCount?: string;
  hazardousItems?: string;
  specialHandlingRequired?: string;
  specialHandlingExplain?: string;
  estimatedMonthlyOrders?: string;
  averageUnitsPerOrder?: string;
  peakSeasonMonths?: string;
  originCountry?: string;
  shipmentFrequency?: string;
  containerSizes?: string[];
  customsCoordination?: string;
  fulfillmentOptions?: string[];
  salesChannels?: string[];
  salesChannelOther?: string;
  needSystemIntegration?: string;
  estimatedPalletPositions?: string;
  specialStorage?: string;
  preferredCarriers?: string;
  needShippingRateOptimization?: string;
  additionalRequirements?: string;
  services?: string[];
  volume?: string;
  timeline?: string;
  notes?: string;
  status: string;
  files: Array<{ id?: string; name: string; size?: string; type?: string; url?: string | null }>;
};

function leadDedupeKey(r: Pick<LeadRecord, "email" | "createdAt" | "companyName">): string {
  return `${(r.email || "").trim().toLowerCase()}|${(r.createdAt || "").trim()}|${(r.companyName || "").trim().toLowerCase()}`;
}

function sheetApiRowToLeadRecord(row: SheetListLeadRow): LeadRecord {
  const status: LeadStatus = isLeadStatus(row.status) ? row.status : "New";
  const fulfill = row.fulfillmentOptions?.length ? row.fulfillmentOptions : row.services ?? [];
  const b = createEmptyForm();
  return {
    id: SHEET_ROW_ID_BASE + row.rowIndex,
    sheetRow: row.rowIndex,
    createdAt: row.createdAt,
    createdBy: row.createdBy || "Sheet",
    status,
    ...b,
    companyName: row.companyName ?? "",
    contactName: row.contactName ?? "",
    title: row.title ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    website: row.website ?? "",
    businessAddress: row.businessAddress ?? "",
    businessTypes: row.businessTypes ?? [],
    businessTypeOther: row.businessTypeOther ?? "",
    productCategory: row.productCategory ?? "",
    averageSkuCount: row.averageSkuCount ?? "",
    hazardousItems: asYesNo(row.hazardousItems),
    specialHandlingRequired: asYesNo(row.specialHandlingRequired),
    specialHandlingExplain: row.specialHandlingExplain ?? "",
    estimatedMonthlyOrders: row.estimatedMonthlyOrders ?? "",
    averageUnitsPerOrder: row.averageUnitsPerOrder ?? "",
    peakSeasonMonths: row.peakSeasonMonths ?? "",
    originCountry: row.originCountry ?? "",
    shipmentFrequency: row.shipmentFrequency ?? "",
    containerSizes: row.containerSizes ?? [],
    customsCoordination: asYesNo(row.customsCoordination),
    fulfillmentOptions: fulfill,
    salesChannels: row.salesChannels ?? [],
    salesChannelOther: row.salesChannelOther ?? "",
    needSystemIntegration: asYesNo(row.needSystemIntegration),
    estimatedPalletPositions: row.estimatedPalletPositions ?? "",
    specialStorage: row.specialStorage ?? "",
    preferredCarriers: row.preferredCarriers ?? "",
    needShippingRateOptimization: asYesNo(row.needShippingRateOptimization),
    additionalRequirements: row.additionalRequirements ?? "",
    services: row.services ?? fulfill,
    volume: row.volume ?? "",
    timeline: row.timeline ?? "",
    notes: row.notes ?? row.additionalRequirements ?? "",
    files: (Array.isArray(row.files) ? row.files : []).map((f, i) => ({
      id: f.id || `sheet-${row.rowIndex}-${i}-${f.name}`,
      name: f.name,
      size: f.size || "—",
      type: f.type || "file",
      url: f.url ?? null,
    })),
  };
}

function mergeLeadsFromSheet(existing: LeadRecord[], imported: LeadRecord[]): LeadRecord[] {
  const merged = [...existing];
  for (const lead of imported) {
    const k = leadDedupeKey(lead);
    const dupIdx = merged.findIndex((m) => leadDedupeKey(m) === k);
    if (dupIdx >= 0) {
      const cur = merged[dupIdx];
      if (lead.sheetRow != null && cur.sheetRow == null) {
        merged[dupIdx] = { ...cur, sheetRow: lead.sheetRow };
      }
      continue;
    }
    merged.push(lead);
  }
  return merged.sort((a, b) => b.id - a.id);
}

function readStaffPortalFromUrl(): boolean {
  if (typeof window === "undefined") return false;
  const q = new URLSearchParams(window.location.search);
  return q.get("staff") === "1" || q.get("admin") === "1";
}

export default function StyleAsia3PLIntakeApp() {
  /**
   * Staff-only: full CRM, login, Settings, CSV, etc. only when the URL includes `?staff=1` (or `?admin=1`).
   * Bookmark and share only that URL internally—never on the public website.
   * Everyone else (normal customer link from your site) sees **only** the public inquiry form—no login, no demo passwords.
   * Optional: `?inquiry=1` / `?public=1` still mean the same public form (for explicit tracking links).
   */
  const [isStaffPortal] = useState(readStaffPortalFromUrl);
  const isPublicInquiry = !isStaffPortal;

  const [hydrated, setHydrated] = useState(false);
  const [form, setForm] = useState<LeadIntakeForm>(() => createEmptyForm());
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [records, setRecords] = useState<LeadRecord[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | null>(null);
  const [login, setLogin] = useState({ email: "", password: "" });
  const [staffUsers, setStaffUsers] = useState<StaffDirectoryEntry[]>(DEMO_USERS);
  const [newStaff, setNewStaff] = useState({ name: "", email: "", password: "", isAdmin: false });
  const [user, setUser] = useState<SessionUser | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationsConfig>(defaultIntegrations);
  const [uiPrefs, setUiPrefs] = useState<UiPreferences>(defaultUiPrefs);
  const [syncState, setSyncState] = useState<SyncState>({ type: "idle", message: "" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LeadRecord | null>(null);
  const [uploadDragActive, setUploadDragActive] = useState(false);
  /** File IDs that existed when edit mode started — used to revoke only draft-added blobs on cancel/reset. */
  const [editBaselineIds, setEditBaselineIds] = useState<Set<string> | null>(null);
  const [sheetPullLoading, setSheetPullLoading] = useState(false);
  const [lastSheetPullAt, setLastSheetPullAt] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const staffImportInputRef = useRef<HTMLInputElement>(null);

  const staffBookmarkUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const u = new URL(window.location.href);
    u.searchParams.set("staff", "1");
    u.searchParams.delete("admin");
    return u.toString();
  }, []);

  const maybeToast = useCallback(
    (fn: () => void) => {
      if (uiPrefs.toastsEnabled) fn();
    },
    [uiPrefs.toastsEnabled]
  );

  useEffect(() => {
    if (isPublicInquiry) {
      // Same localStorage as staff Settings so the public form POSTs after an admin saves the webhook once on this browser.
      setIntegrations(readIntegrationsFromStorage());
      setUiPrefs(normalizeUiPrefs(safeJsonParse(localStorage.getItem(STORAGE.uiPrefs), null)));
      setHydrated(true);
      return;
    }
    const rawLeads = localStorage.getItem(STORAGE.leads);
    if (rawLeads) setRecords(normalizeLeads(safeJsonParse(rawLeads, [])));

    const sess = sessionStorage.getItem(STORAGE.user);
    if (sess) {
      const u = normalizeSessionUser(safeJsonParse(sess, null));
      if (u) setUser(u);
    }

    setIntegrations(normalizeIntegrations(safeJsonParse(localStorage.getItem(STORAGE.integrations), null)));
    setUiPrefs(normalizeUiPrefs(safeJsonParse(localStorage.getItem(STORAGE.uiPrefs), null)));

    const rawStaff = localStorage.getItem(STORAGE.staffUsers);
    if (rawStaff) {
      const parsed = normalizeStaffUsers(safeJsonParse(rawStaff, []));
      if (parsed.length) setStaffUsers(parsed);
    } else {
      try {
        localStorage.setItem(STORAGE.staffUsers, JSON.stringify(DEMO_USERS));
      } catch {
        /* ignore */
      }
    }

    setHydrated(true);
  }, [isPublicInquiry]);

  useEffect(() => {
    if (!hydrated || isPublicInquiry) return;
    try {
      localStorage.setItem(STORAGE.leads, JSON.stringify(records));
    } catch {
      maybeToast(() => toast.error("Could not save leads to browser storage (quota or privacy mode)."));
    }
  }, [records, hydrated, isPublicInquiry, maybeToast]);

  useEffect(() => {
    if (!hydrated || isPublicInquiry) return;
    try {
      localStorage.setItem(STORAGE.integrations, JSON.stringify(integrations));
    } catch {
      maybeToast(() => toast.error("Could not save integration settings."));
    }
  }, [integrations, hydrated, isPublicInquiry, maybeToast]);

  useEffect(() => {
    if (!hydrated || isPublicInquiry) return;
    try {
      localStorage.setItem(STORAGE.staffUsers, JSON.stringify(staffUsers));
    } catch {
      /* non-critical */
    }
  }, [staffUsers, hydrated, isPublicInquiry]);

  useEffect(() => {
    if (!hydrated || isPublicInquiry) return;
    try {
      localStorage.setItem(STORAGE.uiPrefs, JSON.stringify(uiPrefs));
    } catch {
      /* non-critical */
    }
  }, [uiPrefs, hydrated, isPublicInquiry]);

  useEffect(() => {
    if (user) {
      try {
        sessionStorage.setItem(STORAGE.user, JSON.stringify(user));
      } catch {
        /* ignore */
      }
    } else sessionStorage.removeItem(STORAGE.user);
  }, [user]);

  /** Keep session role in sync when staff directory is edited (e.g. legacy sessions without `isAdmin`). */
  useEffect(() => {
    if (!hydrated || isPublicInquiry || !user) return;
    const entry = staffUsers.find((u) => u.email.trim().toLowerCase() === user.email.trim().toLowerCase());
    if (!entry) return;
    const isAdmin = !!entry.isAdmin;
    if (user.isAdmin !== isAdmin) {
      setUser((prev) => (prev ? { ...prev, isAdmin } : null));
    }
  }, [hydrated, isPublicInquiry, staffUsers, user]);

  const revokeOrphanDraftFiles = (files: LeadFileAttachment[], baseline: Set<string> | null) => {
    if (!baseline) {
      files.forEach((f) => revokeIfBlob(f.url));
      return;
    }
    files.forEach((f) => {
      if (!baseline.has(f.id)) revokeIfBlob(f.url);
    });
  };

  /** Clear the intake form without revoking URLs that are now referenced by a saved lead. */
  const discardFormAfterSave = () => {
    setForm(createEmptyForm());
    setEditingId(null);
    setFormErrors({});
    setEditBaselineIds(null);
  };

  const discardFormCancelOrReset = () => {
    setForm((prev) => {
      revokeOrphanDraftFiles(prev.files, editBaselineIds);
      return createEmptyForm();
    });
    setEditingId(null);
    setFormErrors({});
    setEditBaselineIds(null);
  };

  const statusCounts = useMemo(() => {
    const init: Record<LeadStatus, number> = { New: 0, Quoted: 0, Onboarding: 0, Active: 0 };
    records.forEach((r) => {
      init[r.status]++;
    });
    return init;
  }, [records]);

  const filteredRecords = useMemo(() => {
    const q = query.toLowerCase().trim();
    return records.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (!q) return true;
      const hay = [
        r.companyName,
        r.contactName,
        r.title,
        r.email,
        r.phone,
        r.website,
        r.businessAddress,
        r.productCategory,
        r.volume,
        r.timeline,
        r.notes,
        r.additionalRequirements,
        r.originCountry,
        r.status,
        ...(r.businessTypes || []),
        ...(r.fulfillmentOptions || []),
        ...(r.services || []),
        ...(r.salesChannels || []),
        ...(r.files || []).map((f) => f.name),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [records, query, statusFilter]);

  const stats = useMemo(
    () => ({
      total: records.length,
      immediate: records.filter((r) => r.timeline === "Immediately").length,
      storage: records.filter(
        (r) => !!(r.estimatedPalletPositions || "").trim() || !!(r.specialStorage || "").trim()
      ).length,
      active: records.filter((r) => r.status === "Active").length,
      sheetLinked: records.filter((r) => r.sheetRow != null).length,
    }),
    [records]
  );

  const appendFiles = (list: FileList | File[] | null) => {
    if (!list || !list.length) return;
    const next = Array.from(list).map(buildAttachment);
    setForm((prev) => ({ ...prev, files: [...prev.files, ...next] }));
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    appendFiles(event.target.files);
    event.target.value = "";
  };

  const removePendingFile = (id: string) => {
    setForm((prev) => {
      const victim = prev.files.find((f) => f.id === id);
      revokeIfBlob(victim?.url);
      return { ...prev, files: prev.files.filter((file) => file.id !== id) };
    });
  };

  const validateForm = (): boolean => {
    const e: FormErrors = {};
    if (!form.companyName.trim()) e.companyName = "Company name is required.";
    if (!form.contactName.trim()) e.contactName = "Contact name is required.";
    if (!form.email.trim()) e.email = "Email is required.";
    else if (!EMAIL_RE.test(form.email.trim())) e.email = "Enter a valid email address.";
    setFormErrors(e);
    return Object.keys(e).length === 0;
  };

  const syncLead = async (lead: LeadRecord, source: "staff" | "public" = "staff"): Promise<number | undefined> => {
    const payload = {
      ...lead,
      files: (lead.files || []).map((file) => ({ name: file.name, size: file.size, type: file.type })),
    };

    /** Public form only: tells your webhook (esp. Google Apps Script) to email the customer a “we got it” message. */
    const customerConfirmation =
      source === "public"
        ? {
            send: true,
            to: lead.email.trim(),
            contactName: lead.contactName.trim(),
            companyName: lead.companyName.trim(),
          }
        : undefined;

    const sheetsUrl = resolveGoogleSheetsWebhook(integrations);
    const emailUrl = resolveEmailWebhook(integrations);

    if (!sheetsUrl && !emailUrl) {
      const msg =
        source === "public"
          ? "This form is not connected yet. Please contact Style Asia directly or try again later."
          : "Saved locally only. An admin should open Settings and paste the Google Apps Script web app URL so rows sync to your Sheet.";
      setSyncState({ type: source === "public" ? "error" : "idle", message: msg });
      if (source === "public") toast.error("We could not submit your inquiry. Please try again or call us.");
      return undefined;
    }

    let sheetRowFromAppend: number | undefined;

    try {
      if (sheetsUrl) {
        const res = await fetch(sheetsUrl, {
          method: "POST",
          headers: postHeadersForWebhook(sheetsUrl),
          body: JSON.stringify({
            destination: "google-sheets",
            lead: payload,
            ...(customerConfirmation ? { customerConfirmation } : {}),
          }),
        });
        const text = await res.text();
        let j: { ok?: boolean; sheetRow?: number; error?: string };
        try {
          j = JSON.parse(text) as typeof j;
        } catch {
          throw new Error(sheetsUrl.includes("script.google.com") ? `Bad response from Apps Script` : "Bad JSON from webhook");
        }
        if (!res.ok || j.ok === false) throw new Error(j.error || `HTTP ${res.status}`);
        if (typeof j.sheetRow === "number" && j.sheetRow >= 2) sheetRowFromAppend = j.sheetRow;
      }

      if (emailUrl) {
        const res = await fetch(emailUrl, {
          method: "POST",
          headers: postHeadersForWebhook(emailUrl),
          body: JSON.stringify({
            destination: "email",
            notifyEmail: resolveNotifyEmail(integrations),
            subject: `New 3PL inquiry from ${lead.companyName}`,
            lead: payload,
            ...(customerConfirmation ? { customerConfirmation } : {}),
          }),
        });
        if (!res.ok) throw new Error(`Email webhook HTTP ${res.status}`);
      }

      setSyncState({
        type: "success",
        message:
          source === "public"
            ? "Thank you — we received your inquiry. You should get a confirmation email shortly; our team will follow up soon."
            : "Saved and synced to Google Sheets (and email webhook if configured).",
      });
      if (source === "public") toast.success("Sent! Check your inbox for a quick confirmation.");
      else maybeToast(() => toast.success("Lead synced."));
      return sheetRowFromAppend;
    } catch {
      const msg =
        source === "public"
          ? "We could not confirm your submission. Please try again or contact us by phone."
          : "Saved locally, but sync to Google Sheets or email failed.";
      setSyncState({ type: "error", message: msg });
      if (source === "public") toast.error("Submission failed. Please try again.");
      else maybeToast(() => toast.error("Webhook sync failed; lead is still saved locally."));
      return undefined;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPublicInquiry) {
      if (!validateForm()) {
        toast.error("Please fix the highlighted fields.");
        return;
      }
      const newRecord: LeadRecord = {
        id: Date.now(),
        createdAt: new Date().toLocaleString(),
        createdBy: "Website inquiry",
        status: "New",
        ...form,
        notes: form.additionalRequirements || form.notes,
      };
      await syncLead(newRecord, "public");
      discardFormAfterSave();
      return;
    }

    if (!user || !validateForm()) {
      maybeToast(() => toast.error("Fix the highlighted fields before saving."));
      return;
    }

    if (editingId != null) {
      const prevRec = records.find((r) => r.id === editingId);
      const updated: LeadRecord = {
        id: editingId,
        createdAt: prevRec?.createdAt ?? new Date().toLocaleString(),
        createdBy: prevRec?.createdBy ?? user.name,
        status: prevRec?.status ?? "New",
        ...form,
        notes: form.additionalRequirements || form.notes,
        ...(prevRec?.sheetRow != null ? { sheetRow: prevRec.sheetRow } : {}),
      };
      setRecords((prev) => prev.map((r) => (r.id === editingId ? updated : r)));
      setSyncState({ type: "success", message: "Lead updated locally." });
      maybeToast(() => toast.success("Lead updated."));
      discardFormAfterSave();
      return;
    }

    const newId = Date.now();
    const newRecord: LeadRecord = {
      id: newId,
      createdAt: new Date().toLocaleString(),
      createdBy: user.name,
      status: "New",
      ...form,
      notes: form.additionalRequirements || form.notes,
    };

    setRecords((prev) => [newRecord, ...prev]);
    discardFormAfterSave();
    const sheetRow = await syncLead(newRecord, "staff");
    if (sheetRow != null) {
      setRecords((prev) => prev.map((r) => (r.id === newId ? { ...r, sheetRow } : r)));
    }
  };

  const beginEdit = (record: LeadRecord) => {
    setEditingId(record.id);
    setEditBaselineIds(new Set((record.files || []).map((f) => f.id)));
    setForm(formFromRecord(record));
    setFormErrors({});
    setSyncState({ type: "idle", message: "" });
    maybeToast(() => toast.message("Editing lead — save to apply changes."));
  };

  const cancelEdit = () => {
    discardFormCancelOrReset();
    setSyncState({ type: "idle", message: "" });
  };

  const pushStatusToSheet = async (rowIndex: number | undefined, status: LeadStatus) => {
    if (rowIndex == null) return;
    const url = resolveGoogleSheetsWebhook(integrations);
    if (!url) return;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: postHeadersForWebhook(url),
        body: JSON.stringify({ action: "updateLeadStatus", rowIndex, status }),
      });
      const text = await res.text();
      let j: { ok?: boolean; error?: string };
      try {
        j = JSON.parse(text) as typeof j;
      } catch {
        throw new Error("Script did not return JSON");
      }
      if (!res.ok || j.ok === false) throw new Error(j.error || `HTTP ${res.status}`);
    } catch {
      toast.error("Could not update status in Google Sheet — check row link or redeploy Apps Script.");
    }
  };

  const updateRecordStatus = (id: number, status: LeadStatus) => {
    const cur = records.find((r) => r.id === id);
    const sheetRow = cur?.sheetRow;
    setRecords((prev) => prev.map((record) => (record.id === id ? { ...record, status } : record)));
    void pushStatusToSheet(sheetRow, status);
  };

  const confirmDelete = (id: number) => {
    setRecords((prev) => {
      const victim = prev.find((r) => r.id === id);
      victim?.files?.forEach((f) => revokeIfBlob(f.url));
      return prev.filter((r) => r.id !== id);
    });
    if (editingId === id) discardFormAfterSave();
    setDeleteTarget(null);
    maybeToast(() => toast.success("Lead removed."));
  };

  const exportCSV = (source: "all" | "filtered" = "all") => {
    const list = source === "filtered" ? filteredRecords : records;
    const headers = [
      "Company Name",
      "Contact Person",
      "Title",
      "Email",
      "Phone",
      "Website",
      "Business Address",
      "Business Types",
      "Business Type Other",
      "Product Category",
      "Avg SKU Count",
      "Hazardous",
      "Special Handling Req",
      "Special Handling Explain",
      "Est Monthly Orders",
      "Avg Units Per Order",
      "Peak Season",
      "Origin Country",
      "Shipment Frequency",
      "Container Sizes",
      "Customs Coordination",
      "Fulfillment",
      "Sales Channels",
      "Sales Other",
      "Need Integration",
      "Est Pallet Positions",
      "Special Storage",
      "Preferred Carriers",
      "Rate Optimization",
      "Additional Requirements",
      "Timeline",
      "Status",
      "Sheet row",
      "Files",
      "Legacy Services",
      "Legacy Volume",
      "Notes",
      "Created By",
      "Created At",
    ];

    const escapeCsvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

    const rows = list.map((r) => [
      r.companyName,
      r.contactName,
      r.title,
      r.email,
      r.phone,
      r.website,
      r.businessAddress,
      (r.businessTypes || []).join(" | "),
      r.businessTypeOther,
      r.productCategory,
      r.averageSkuCount,
      r.hazardousItems,
      r.specialHandlingRequired,
      String(r.specialHandlingExplain || "").replace(/\r?\n/g, " "),
      r.estimatedMonthlyOrders,
      r.averageUnitsPerOrder,
      r.peakSeasonMonths,
      r.originCountry,
      r.shipmentFrequency,
      (r.containerSizes || []).join(" | "),
      r.customsCoordination,
      (r.fulfillmentOptions || []).join(" | "),
      (r.salesChannels || []).join(" | "),
      r.salesChannelOther,
      r.needSystemIntegration,
      r.estimatedPalletPositions,
      String(r.specialStorage || "").replace(/\r?\n/g, " "),
      r.preferredCarriers,
      r.needShippingRateOptimization,
      String(r.additionalRequirements || "").replace(/\r?\n/g, " "),
      r.timeline,
      r.status,
      r.sheetRow ?? "",
      (r.files || []).map((file) => file.name).join(" | "),
      (r.services || []).join(" | "),
      r.volume,
      String(r.notes || "").replace(/\r?\n/g, " "),
      r.createdBy,
      r.createdAt,
    ]);

    const csv = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      source === "filtered" ? "style-asia-3pl-leads-filtered.csv" : "style-asia-3pl-leads.csv"
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    maybeToast(() => toast.success("Exported CSV."));
  };

  const pullFromGoogleSheet = async () => {
    const url = resolveGoogleSheetsWebhook(integrations);
    if (!url) {
      const isAdminSession = user != null && user.isAdmin;
      toast.error(
        isAdminSession
          ? 'Google Sheets URL missing. Open Settings → Integrations → paste your Apps Script web app URL (ends with /exec), then try again.'
          : "Google Sheets isn't connected on this browser yet. Open Settings → Integrations and paste the Apps Script URL, or ask an admin to do it once on this computer."
      );
      return;
    }
    setSheetPullLoading(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: postHeadersForWebhook(url),
        body: JSON.stringify({ action: "listLeads" }),
      });
      const text = await res.text();
      let json: { ok?: boolean; leads?: SheetListLeadRow[]; error?: string };
      try {
        json = JSON.parse(text) as typeof json;
      } catch {
        throw new Error(
          "Script did not return JSON. In Apps Script, paste the latest sample from scripts/google-apps-script-sample.js and Deploy a new version."
        );
      }
      if (!res.ok || json.ok === false) throw new Error(json.error || `Request failed (${res.status})`);
      const raw = Array.isArray(json.leads) ? json.leads : [];
      const imported = raw.map(sheetApiRowToLeadRecord);
      setLastSheetPullAt(new Date().toLocaleString());
      setRecords((prev) => {
        const merged = mergeLeadsFromSheet(prev, imported);
        const added = merged.length - prev.length;
        setTimeout(() => {
          if (added > 0) maybeToast(() => toast.success(`Added ${added} new lead(s) from Google Sheet.`));
          else maybeToast(() => toast.message("No new leads to add — your list already includes those rows."));
        }, 0);
        return merged;
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load from Sheet.");
    } finally {
      setSheetPullLoading(false);
    }
  };

  const copyStaffBookmark = async () => {
    if (!staffBookmarkUrl) return;
    try {
      await navigator.clipboard.writeText(staffBookmarkUrl);
      maybeToast(() => toast.success("Staff URL copied — for internal use only."));
    } catch {
      toast.error("Could not copy — select the address bar URL manually.");
    }
  };

  const tryLocalStaffLogin = (emailNorm: string, password: string): boolean => {
    const found = staffUsers.find(
      (staff) => staff.email.trim().toLowerCase() === emailNorm && staff.password === password
    );
    if (!found) return false;
    setUser({ email: found.email, name: found.name, isAdmin: !!found.isAdmin });
    setSyncState({ type: "success", message: `Welcome back, ${found.name}.` });
    maybeToast(() => toast.success(`Welcome back, ${found.name}.`));
    return true;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailNorm = login.email.trim().toLowerCase();
    const password = login.password;
    const url = resolveGoogleSheetsWebhook(integrations);

    if (url) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: postHeadersForWebhook(url),
          body: JSON.stringify({ action: "validateStaffLogin", email: emailNorm, password }),
        });
        const text = await res.text();
        let json: { ok?: boolean; name?: string; email?: string; isAdmin?: boolean; error?: string };
        try {
          json = JSON.parse(text) as typeof json;
        } catch {
          throw new Error("bad_json");
        }
        if (json.ok === true && json.name) {
          setUser({
            email: (json.email || emailNorm).trim().toLowerCase(),
            name: json.name,
            isAdmin: !!json.isAdmin,
          });
          setSyncState({ type: "success", message: `Welcome back, ${json.name}.` });
          maybeToast(() => toast.success(`Welcome back, ${json.name}.`));
          return;
        }
        const errMsg = typeof json.error === "string" ? json.error : "";
        const sheetNotReady =
          /staff tab|sheet tab|add a sheet|no tab named|no user rows|Staff row 1 must|email column|Password and an email|container-bound|SPREADSHEET_ID|active spreadsheet/i.test(
            errMsg
          );
        if (sheetNotReady && tryLocalStaffLogin(emailNorm, password)) {
          maybeToast(() => {
            toast.error(errMsg.slice(0, 280) || "Google Sheet staff list is not set up yet.", { duration: 8000 });
            toast.message("Signed in using this browser’s saved staff list instead. Fix the Sheet issue above, then redeploy the Apps Script.");
          });
          return;
        }
        if (/invalid email|invalid password/i.test(errMsg) && tryLocalStaffLogin(emailNorm, password)) {
          maybeToast(() =>
            toast.message(
              "Google Sheet had no matching staff row — signed in with this browser’s saved list. Add this email/password on the Staff tab (or use Settings → Add user) so login works on every computer."
            )
          );
          return;
        }
        setSyncState({
          type: "error",
          message: errMsg || "Login failed. Check the Staff tab in your Google Sheet or your password.",
        });
        maybeToast(() => toast.error("Login failed."));
        return;
      } catch {
        if (tryLocalStaffLogin(emailNorm, password)) {
          maybeToast(() => toast.message("Could not reach Google — logged in with saved staff list on this browser."));
          return;
        }
      }
    }

    if (!tryLocalStaffLogin(emailNorm, password)) {
      setSyncState({
        type: "error",
        message:
          url
            ? "Login failed. If you use the Staff sheet, add your row there or check your password."
            : "Login failed. Check your email and password, import a staff list, or ask an admin.",
      });
      maybeToast(() => toast.error("Login failed."));
    }
  };

  const addStaffUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newStaff.name.trim();
    const email = newStaff.email.trim().toLowerCase();
    const password = newStaff.password;
    if (!name || !email || !password) {
      toast.error("Name, email, and password are required.");
      return;
    }
    if (!EMAIL_RE.test(email)) {
      toast.error("Enter a valid email for the new account.");
      return;
    }
    if (staffUsers.some((u) => u.email.trim().toLowerCase() === email)) {
      toast.error("That email is already in this browser's staff list.");
      return;
    }
    const sheetsUrl = resolveGoogleSheetsWebhook(integrations);
    if (sheetsUrl) {
      try {
        await postAppsScriptJson(sheetsUrl, {
          action: "upsertStaffUser",
          email,
          password,
          name,
          isAdmin: newStaff.isAdmin,
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not save staff user to Google Sheet.");
        return;
      }
    }
    setStaffUsers((prev) => [...prev, { name, email, password, isAdmin: newStaff.isAdmin }]);
    setNewStaff({ name: "", email: "", password: "", isAdmin: false });
    maybeToast(() =>
      toast.success(
        sheetsUrl ? "Staff user saved to Google Sheet and this browser — they can log in from any computer." : "Staff user added to this browser."
      )
    );
  };

  const removeStaffUser = async (email: string) => {
    const target = staffUsers.find((u) => u.email === email);
    if (target?.isAdmin && staffUsers.filter((u) => u.isAdmin).length <= 1) {
      toast.error("You must keep at least one admin account.");
      return;
    }
    if (staffUsers.length <= 1) {
      toast.error("Keep at least one staff account.");
      return;
    }
    const sheetsUrl = resolveGoogleSheetsWebhook(integrations);
    if (sheetsUrl) {
      try {
        await postAppsScriptJson(sheetsUrl, { action: "removeStaffUser", email: target?.email ?? email });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not remove staff user from Google Sheet.");
        return;
      }
    }
    setStaffUsers((prev) => prev.filter((u) => u.email.trim().toLowerCase() !== email.trim().toLowerCase()));
    maybeToast(() =>
      toast.message(
        sheetsUrl ? "Removed from Google Sheet and this browser." : "Staff user removed from this browser."
      )
    );
  };

  const exportStaffUsersBackup = () => {
    try {
      const blob = new Blob([JSON.stringify(staffUsers, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "style-asia-3pl-staff-users.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      maybeToast(() =>
        toast.success("Staff list downloaded. It contains passwords — keep the file private. Import it on other computers under Settings.")
      );
    } catch {
      toast.error("Could not export staff list.");
    }
  };

  const importStaffUsersFromFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        const data = JSON.parse(text) as unknown;
        const rawList = Array.isArray(data)
          ? data
          : data && typeof data === "object" && Array.isArray((data as Record<string, unknown>).users)
            ? ((data as Record<string, unknown>).users as unknown[])
            : [];
        const parsed = normalizeStaffUsers(rawList);
        if (!parsed.length) {
          toast.error('Import a JSON array of { "name", "email", "password", "isAdmin" }. Export from Settings on the admin computer.');
          return;
        }
        if (!parsed.some((u) => u.isAdmin)) {
          toast.error("Imported list must include at least one admin.");
          return;
        }
        if (
          !window.confirm(
            "Replace all staff users on this browser with the imported list? Current logins on this computer will be overwritten."
          )
        ) {
          return;
        }
        setStaffUsers(parsed);
        toast.success("Staff users imported. Log in with an account from the list.");
      } catch {
        toast.error("Could not read that file. Use a JSON export from this app.");
      }
    };
    reader.readAsText(file);
  };

  const logout = () => {
    setUser(null);
    setSyncState({ type: "idle", message: "Logged out." });
    maybeToast(() => toast.message("Logged out."));
  };

  if (isPublicInquiry) {
    return (
      <div className="min-h-screen bg-white px-4 py-8 md:bg-slate-50 md:py-10">
        <div className="mx-auto max-w-3xl">
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="rounded-[28px] border border-slate-200/80 bg-white shadow-xl md:border-0">
              <CardHeader className="space-y-4">
                <BrandHeader subtitle="Complete all sections that apply. We will email you a confirmation when the form is connected." />
                <CardDescription className="text-center text-slate-600 md:text-left">
                  Fields marked * are required. Your answers are sent securely to our team and recorded in Google Sheets.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-2">
                  <OnboardingFields
                    form={form}
                    setForm={setForm}
                    formErrors={formErrors}
                    setFormErrors={setFormErrors}
                    showTimeline
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          fileInputRef.current?.click();
                        }
                      }}
                      onDragEnter={(e) => {
                        e.preventDefault();
                        setUploadDragActive(true);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setUploadDragActive(true);
                      }}
                      onDragLeave={() => setUploadDragActive(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setUploadDragActive(false);
                        appendFiles(e.dataTransfer.files);
                      }}
                      onClick={() => fileInputRef.current?.click()}
                      className={`cursor-pointer space-y-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-4 transition-colors ${
                        uploadDragActive ? "border-[#0a3d62] bg-slate-100" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2 text-sm font-medium text-[#0a3d62]">
                        <Upload className="h-4 w-4" />
                        Attachments (optional) — specs, SKU lists, etc.
                      </div>
                      <Input ref={fileInputRef} type="file" multiple onChange={handleFileChange} className="hidden" />
                      {form.files.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {form.files.map((file) => (
                            <div
                              key={file.id}
                              className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs"
                            >
                              <span className="max-w-[200px] truncate">{file.name}</span>
                              <button
                                type="button"
                                className="text-slate-500"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  removePendingFile(file.id);
                                }}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </OnboardingFields>

                  {syncState.message && (
                    <div
                      className={`rounded-xl border p-3 text-sm ${
                        syncState.type === "success"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : syncState.type === "error"
                            ? "border-red-200 bg-red-50 text-red-700"
                            : "border-slate-200 bg-slate-50 text-slate-700"
                      }`}
                    >
                      {syncState.message}
                    </div>
                  )}

                  <Button type="submit" className="w-full rounded-2xl bg-[#0a3d62] hover:bg-[#0a3d62]/90">
                    Submit onboarding form
                  </Button>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-100 px-4 py-10">
        <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="rounded-[28px] border-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-2 text-white shadow-2xl">
              <CardContent className="p-8 md:p-10">
                <div className="flex items-center gap-3 text-slate-300">
                  <Shield className="h-5 w-5" />
                  <span className="text-sm uppercase tracking-[0.25em]">Staff Access</span>
                </div>
                <h1 className="mt-4 text-4xl font-bold leading-tight">Style Asia 3PL Intake Hub</h1>
                <p className="mt-4 max-w-xl text-slate-200">
                  One place for staff login, quick lead capture, status tracking, file collection, and sync to Google
                  Sheets (your system of record) plus optional email webhooks.
                </p>
                <p className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                  This page is for authorized staff only. Do not post this URL on the public website. Customer inquiries
                  use the site link <strong>without</strong> <code className="rounded bg-black/20 px-1">?staff=1</code>.
                </p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
            <Card className="rounded-[28px] border-0 shadow-xl">
              <CardHeader>
                <CardTitle className="text-2xl">Login</CardTitle>
                <CardDescription>
                  If your team uses the <strong>Staff</strong> tab in Google Sheets (same Apps Script as leads), use those
                  credentials here — they work from any computer. Otherwise use accounts from <strong>Settings</strong> on
                  this browser or an imported staff file. Keep the staff URL private.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      autoComplete="username"
                      value={login.email}
                      onChange={(e) => setLogin({ ...login, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Password</Label>
                    <Input
                      type="password"
                      autoComplete="current-password"
                      value={login.password}
                      onChange={(e) => setLogin({ ...login, password: e.target.value })}
                    />
                  </div>
                  <Button type="submit" className="w-full rounded-2xl">
                    Enter Dashboard
                  </Button>
                  {syncState.message && (
                    <div
                      className={`rounded-2xl border p-3 text-sm ${
                        syncState.type === "error"
                          ? "border-red-200 bg-red-50 text-red-700"
                          : syncState.type === "success"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-slate-50 text-slate-700"
                      }`}
                    >
                      {syncState.message}
                    </div>
                  )}
                </form>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="no-print rounded-3xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 p-6 text-white shadow-2xl"
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-slate-300">Since 1985</p>
              <h1 className="mt-2 text-3xl font-bold md:text-4xl">Style Asia 3PL Logistics</h1>
              {user.isAdmin ? (
                <p className="mt-2 max-w-3xl text-sm text-slate-200 md:text-base">
                  Staff dashboard for client intake, lead tracking, SKU sheet collection, and sync to Google Sheets with
                  optional email alerts. <strong className="font-semibold text-slate-100">Saved Leads</strong> live in this
                  browser; use <strong className="font-semibold text-slate-100">Pull from Sheet</strong> to load website
                  inquiries from the shared Sheet.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                onClick={() => exportCSV("all")}
                className="rounded-2xl bg-white text-slate-900 hover:bg-slate-100"
              >
                <Download className="mr-2 h-4 w-4" /> Export all CSV
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-2xl border-white/20 bg-white/10 text-white hover:bg-white/20"
                onClick={() => exportCSV("filtered")}
                title="Uses current search and status filter on Saved Leads"
              >
                <Download className="mr-2 h-4 w-4" /> Export view CSV
              </Button>
              <Button variant="outline" className="rounded-2xl border-white/20 bg-white/10 text-white hover:bg-white/20" onClick={logout}>
                <LogOut className="mr-2 h-4 w-4" /> Logout
              </Button>
            </div>
          </div>
          {user.isAdmin ? (
            <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-white/15 bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-200">
                <span className="rounded-full border border-amber-400/40 bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-100">
                  Staff only — do not share publicly
                </span>
                <span className="text-slate-300">
                  Bookmark this staff URL — add <code className="rounded bg-black/25 px-1">?staff=1</code> to your site link.
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 rounded-xl border-white/30 bg-white/10 text-white hover:bg-white/20"
                onClick={copyStaffBookmark}
              >
                <Copy className="mr-2 h-4 w-4" /> Copy staff URL
              </Button>
            </div>
          ) : null}
        </motion.div>

        <div className="no-print grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <Card className="rounded-3xl shadow-sm">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="rounded-2xl bg-slate-100 p-3">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Total Leads</p>
                <h3 className="text-2xl font-bold">{stats.total}</h3>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-3xl shadow-sm">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="rounded-2xl bg-slate-100 p-3">
                <Package className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Need Storage</p>
                <h3 className="text-2xl font-bold">{stats.storage}</h3>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-3xl shadow-sm">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="rounded-2xl bg-slate-100 p-3">
                <Clock3 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Ready Now</p>
                <h3 className="text-2xl font-bold">{stats.immediate}</h3>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-3xl shadow-sm">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="rounded-2xl bg-slate-100 p-3">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Active Accounts</p>
                <h3 className="text-2xl font-bold">{stats.active}</h3>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-3xl shadow-sm">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="rounded-2xl bg-slate-100 p-3">
                <Link2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Linked to Sheet</p>
                <h3 className="text-2xl font-bold">{stats.sheetLinked}</h3>
                {user.isAdmin ? (
                  <p className="mt-0.5 text-xs text-slate-400">Known row for status sync</p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="intake" className="space-y-6">
          <TabsList className="no-print grid h-auto w-full grid-cols-2 gap-1 rounded-2xl bg-white p-1 shadow-sm sm:grid-cols-4">
            <TabsTrigger value="intake" className="rounded-xl">
              Intake
            </TabsTrigger>
            <TabsTrigger value="leads" className="rounded-xl">
              Saved Leads
            </TabsTrigger>
            <TabsTrigger value="print" className="rounded-xl">
              <Printer className="mr-1.5 inline h-4 w-4" />
              Client form
            </TabsTrigger>
            <TabsTrigger value="settings" className="rounded-xl">
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="intake" className="no-print">
            <div className={`grid gap-6 ${user.isAdmin ? "lg:grid-cols-[1.1fr_0.9fr]" : ""}`}>
              <Card className="rounded-3xl border-slate-200/80 shadow-sm">
                <CardHeader className="space-y-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-2xl text-[#0a3d62]">
                        <PlusCircle className="h-5 w-5" />{" "}
                        {editingId != null ? "Edit client onboarding" : "New client onboarding"}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {user.isAdmin
                          ? editingId != null
                            ? "Update locally. Status changes in Saved Leads sync to the Sheet Status column when the row is linked."
                            : "Same fields as the public onboarding form. New saves sync to Google Sheets when your webhook is set."
                          : editingId != null
                            ? "Update this lead and save your changes."
                            : "Enter client onboarding details. Save to add the lead and sync if your team has connected Sheets."}
                      </CardDescription>
                    </div>
                    <img
                      src={`${process.env.PUBLIC_URL || ""}/logo-styleasia.png`}
                      alt=""
                      className="hidden h-10 w-auto object-contain opacity-90 lg:block"
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  {editingId != null && (
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      <span>
                        Editing lead <strong>#{editingId}</strong> — changes apply on save.
                      </span>
                      <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={cancelEdit}>
                        Cancel edit
                      </Button>
                    </div>
                  )}
                  <form onSubmit={handleSubmit} className="space-y-2">
                    <OnboardingFields
                      form={form}
                      setForm={setForm}
                      formErrors={formErrors}
                      setFormErrors={setFormErrors}
                      showTimeline
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter" || ev.key === " ") {
                            ev.preventDefault();
                            fileInputRef.current?.click();
                          }
                        }}
                        onDragEnter={(e) => {
                          e.preventDefault();
                          setUploadDragActive(true);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setUploadDragActive(true);
                        }}
                        onDragLeave={() => setUploadDragActive(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setUploadDragActive(false);
                          appendFiles(e.dataTransfer.files);
                        }}
                        onClick={() => fileInputRef.current?.click()}
                        className={`cursor-pointer space-y-3 rounded-3xl border border-dashed p-4 transition-colors ${
                          uploadDragActive ? "border-[#0a3d62] bg-slate-100" : "border-slate-300 bg-white hover:bg-slate-50/80"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Upload className="h-4 w-4" />
                          <p className="text-sm font-medium text-slate-700">Upload SKU sheet or client files</p>
                        </div>
                        <p className="text-xs text-slate-500">Drag and drop here, or click to browse.</p>
                        <Input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          onChange={handleFileChange}
                          className="pointer-events-none hidden rounded-2xl"
                        />
                        {form.files.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 py-6 text-center text-xs text-slate-400">
                            <Warehouse className="mx-auto mb-2 h-8 w-8 opacity-40" />
                            No files attached yet.
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {form.files.map((file) => (
                              <div key={file.id} className="flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
                                <span className="max-w-[200px] truncate">{file.name}</span>
                                <button
                                  type="button"
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    removePendingFile(file.id);
                                  }}
                                  className="font-semibold text-slate-500"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </OnboardingFields>

                    <div className="flex flex-wrap gap-3 pt-2">
                      <Button type="submit" className="rounded-2xl bg-[#0a3d62] hover:bg-[#0a3d62]/90">
                        {editingId != null ? "Update lead" : "Save & sync"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-2xl"
                        onClick={() => {
                          discardFormCancelOrReset();
                          setSyncState({ type: "idle", message: "" });
                        }}
                      >
                        <RotateCcw className="mr-2 h-4 w-4" /> Reset
                      </Button>
                    </div>
                    {syncState.message ? (
                      <div
                        className={`rounded-2xl border p-4 text-sm ${
                          syncState.type === "success"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : syncState.type === "error"
                              ? "border-red-200 bg-red-50 text-red-700"
                              : "border-slate-200 bg-slate-50 text-slate-700"
                        }`}
                      >
                        {syncState.message}
                      </div>
                    ) : null}
                  </form>
                </CardContent>
              </Card>

              {user.isAdmin ? (
                <Card className="rounded-3xl shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-2xl">
                      <Sparkles className="h-5 w-5" /> Workflow Snapshot
                    </CardTitle>
                    <CardDescription>What this hub is doing right now.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-2xl border p-4">
                      <p className="text-sm font-medium text-slate-700">Logged in staff</p>
                      <p className="mt-1 text-lg font-semibold">{user.name}</p>
                      <p className="text-sm text-slate-500">{user.email}</p>
                    </div>

                    <div className="grid gap-3">
                      <div className="rounded-2xl border p-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                          <FileSpreadsheet className="h-4 w-4" /> Google Sheets
                        </div>
                        <p className="mt-1 text-sm text-slate-500">
                          {resolveGoogleSheetsWebhook(integrations)
                            ? "Connected — new leads sync to your Sheet"
                            : "Not connected yet — add URL in Settings below"}
                        </p>
                      </div>
                      <div className="rounded-2xl border p-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                          <Mail className="h-4 w-4" /> Email Notification
                        </div>
                        <p className="mt-1 text-sm text-slate-500">
                          {resolveEmailWebhook(integrations)
                            ? `Webhook ready${resolveNotifyEmail(integrations) ? ` for ${resolveNotifyEmail(integrations)}` : ""}`
                            : "Not connected yet"}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          </TabsContent>

          <TabsContent value="leads" className="no-print">
            <Card className="rounded-3xl shadow-sm">
              <CardHeader>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-1.5">
                    <CardTitle className="flex items-center gap-2 text-2xl">
                      <Search className="h-5 w-5" /> Saved Inquiries
                    </CardTitle>
                    <CardDescription>
                      {user.isAdmin
                        ? "Track status, files, and notes locally on this device. Pull rows from your Google Sheet to add website submissions that were not captured here. Leads with a Sheet row push status changes back to the Sheet."
                        : "Search and filter leads saved on this device. Pull from Sheet adds new rows your admin has set up."}
                    </CardDescription>
                    {lastSheetPullAt ? (
                      <p className="text-xs text-slate-500">Last pull: {lastSheetPullAt}</p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0 rounded-2xl"
                    disabled={sheetPullLoading}
                    onClick={pullFromGoogleSheet}
                  >
                    <RefreshCw className={`mr-2 h-4 w-4 ${sheetPullLoading ? "animate-spin" : ""}`} />
                    Pull from Sheet
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {records.length === 0 ? (
                  <div className="rounded-3xl border border-dashed bg-slate-50/60 p-10 text-center">
                    <Warehouse className="mx-auto h-10 w-10 text-slate-400" />
                    <p className="mt-4 text-sm font-medium text-slate-700">No leads in this browser yet</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Use Intake to add one, or pull existing rows from the Google Sheet (same webhook as submissions).
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-4 rounded-2xl"
                      disabled={sheetPullLoading}
                      onClick={pullFromGoogleSheet}
                    >
                      <RefreshCw className={`mr-2 h-4 w-4 ${sheetPullLoading ? "animate-spin" : ""}`} />
                      Pull from Google Sheet
                    </Button>
                  </div>
                ) : (
                  <>
                    <Input
                      placeholder="Search by company, contact, email, service, file, or status..."
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <div className="flex flex-wrap gap-2">
                      <span className="w-full text-xs font-medium text-slate-500">Filter by status</span>
                      {STATUS_OPTIONS.map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setStatusFilter((prev) => (prev === st ? null : st))}
                          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                            statusFilter === st
                              ? `${statusTone[st]} border-current`
                              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          {st} <span className="tabular-nums text-slate-500">({statusCounts[st]})</span>
                        </button>
                      ))}
                    </div>

                    <div className="max-h-[760px] space-y-4 overflow-auto pr-1">
                      {filteredRecords.length === 0 ? (
                        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-500">
                          No leads match your search or filter.{" "}
                          <button type="button" className="font-medium text-slate-800 underline" onClick={() => { setQuery(""); setStatusFilter(null); }}>
                            Clear filters
                          </button>
                        </div>
                      ) : (
                        filteredRecords.map((record) => (
                          <motion.div
                            key={record.id}
                            layout
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="rounded-3xl border p-5 shadow-sm"
                          >
                              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="text-xl font-semibold">{record.companyName}</h3>
                                    <Badge className={`rounded-full border px-3 py-1 ${statusTone[record.status]}`}>{record.status}</Badge>
                                    {record.sheetRow != null ? (
                                      <Badge
                                        variant="outline"
                                        className="gap-1 rounded-full border-slate-200 font-normal text-slate-600"
                                      >
                                        <Link2 className="h-3 w-3" />
                                        Sheet row {record.sheetRow}
                                      </Badge>
                                    ) : null}
                                  </div>
                                  <p className="mt-1 text-sm text-slate-600">
                                    {record.contactName} • {record.email}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-400">
                                    Created by {record.createdBy} • {record.createdAt}
                                  </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Button type="button" variant="outline" size="sm" className="rounded-2xl" onClick={() => beginEdit(record)}>
                                    <Pencil className="mr-1 h-3.5 w-3.5" />
                                    Edit
                                  </Button>
                                  <Select value={record.status} onValueChange={(value) => updateRecordStatus(record.id, value as LeadStatus)}>
                                    <SelectTrigger className="w-[170px] rounded-2xl">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {STATUS_OPTIONS.map((status) => (
                                        <SelectItem key={status} value={status}>
                                          {status}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Button variant="ghost" size="icon" type="button" onClick={() => setDeleteTarget(record)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>

                              <div className="mt-4 flex flex-wrap gap-2">
                                {(record.fulfillmentOptions?.length ? record.fulfillmentOptions : record.services || []).map((service) => (
                                  <Badge key={service} variant="secondary" className="rounded-full">
                                    {service}
                                  </Badge>
                                ))}
                              </div>

                              <div className="mt-4 grid gap-3 text-sm text-slate-700 md:grid-cols-2 xl:grid-cols-4">
                                <p>
                                  <span className="font-medium">Phone:</span> {record.phone || "—"}
                                </p>
                                <p>
                                  <span className="font-medium">Volume:</span> {record.volume || "—"}
                                </p>
                                <p>
                                  <span className="font-medium">Timeline:</span> {record.timeline || "—"}
                                </p>
                                <p>
                                  <span className="font-medium">Files:</span> {(record.files || []).length || 0}
                                </p>
                              </div>

                              <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                                <span className="font-medium">Additional requirements:</span>{" "}
                                {record.additionalRequirements || record.notes || "—"}
                              </div>

                              {!!record.files?.length && (
                                <div className="mt-4 flex flex-wrap gap-2">
                                  {record.files.map((file) =>
                                    file.url ? (
                                      <a
                                        key={file.id}
                                        href={file.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs hover:bg-slate-50"
                                      >
                                        <ExternalLink className="h-3.5 w-3.5" />
                                        {file.name}
                                      </a>
                                    ) : (
                                      <span
                                        key={file.id}
                                        className="inline-flex items-center gap-2 rounded-full border border-dashed px-3 py-1 text-xs text-slate-500"
                                        title="Re-attach after page refresh — file metadata only"
                                      >
                                        {file.name} (saved name only)
                                      </span>
                                    )
                                  )}
                                </div>
                              )}
                          </motion.div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="print">
            <div className="space-y-4">
              <Card className="no-print rounded-3xl shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-2xl">
                    <FileText className="h-5 w-5" /> Printable client onboarding
                  </CardTitle>
                  <CardDescription>
                    Print this blank form for warehouse walk-ins. It matches the public online form (plus signature and
                    date lines). Use your browser&apos;s Print dialog — margins &quot;Default&quot; or &quot;Minimum&quot; work best.
                  </CardDescription>
                </CardHeader>
                <CardContent className="no-print">
                  <Button type="button" className="rounded-2xl bg-[#0a3d62] hover:bg-[#0a3d62]/90" onClick={() => window.print()}>
                    <Printer className="mr-2 h-4 w-4" /> Print form
                  </Button>
                </CardContent>
              </Card>
              <ClientOnboardingPrintForm />
            </div>
          </TabsContent>

          <TabsContent value="settings" className="no-print">
            <div className={`grid gap-6 ${user.isAdmin ? "lg:grid-cols-[0.95fr_1.05fr]" : ""}`}>
              {user.isAdmin ? (
                <Card className="rounded-3xl shadow-sm lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-2xl">
                      <Users className="h-5 w-5" /> Staff users
                    </CardTitle>
                    <CardDescription>
                      <strong>Google Sheet (recommended):</strong> add a tab named <code className="rounded bg-slate-100 px-1 text-xs">Staff</code> in
                      the same workbook as Leads (row 1: Email, Password, Name, IsAdmin). Anyone can sign in from any computer when
                      the Apps Script URL is configured — no export/import needed. Passwords in the Sheet are plain text; limit who
                      can edit that tab. <strong>This section</strong> below is a backup list stored in{" "}
                      <strong>this browser only</strong> (export/import between PCs if you are not using the Sheet tab yet).
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <input
                      ref={staffImportInputRef}
                      type="file"
                      accept="application/json,.json"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) importStaffUsersFromFile(f);
                        e.target.value = "";
                      }}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" className="rounded-xl" onClick={exportStaffUsersBackup}>
                        <Download className="mr-2 h-4 w-4" /> Export staff list (JSON)
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-xl"
                        onClick={() => staffImportInputRef.current?.click()}
                      >
                        <Upload className="mr-2 h-4 w-4" /> Import staff list
                      </Button>
                    </div>
                    <form
                      onSubmit={addStaffUser}
                      className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/50 p-4"
                    >
                      <div className="grid gap-3 md:grid-cols-4">
                        <Input
                          placeholder="Full name"
                          value={newStaff.name}
                          onChange={(e) => setNewStaff((s) => ({ ...s, name: e.target.value }))}
                          className="rounded-xl"
                        />
                        <Input
                          type="email"
                          placeholder="Email (login)"
                          value={newStaff.email}
                          onChange={(e) => setNewStaff((s) => ({ ...s, email: e.target.value }))}
                          className="rounded-xl"
                        />
                        <Input
                          type="password"
                          placeholder="Password"
                          value={newStaff.password}
                          onChange={(e) => setNewStaff((s) => ({ ...s, password: e.target.value }))}
                          className="rounded-xl"
                        />
                        <Button type="submit" className="rounded-xl">
                          Add user
                        </Button>
                      </div>
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                        <Checkbox
                          checked={newStaff.isAdmin}
                          onCheckedChange={(v) => setNewStaff((s) => ({ ...s, isAdmin: v === true }))}
                        />
                        Admin access (manage staff users, workflow panel)
                      </label>
                    </form>
                    <ul className="divide-y rounded-2xl border">
                      {staffUsers.map((u) => (
                        <li key={u.email} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <div>
                              <p className="font-medium text-slate-900">{u.name}</p>
                              <p className="text-slate-500">{u.email}</p>
                            </div>
                            {u.isAdmin ? (
                              <Badge variant="secondary" className="rounded-full text-xs">
                                Admin
                              </Badge>
                            ) : null}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:bg-red-50 hover:text-red-700"
                            onClick={() => void removeStaffUser(u.email)}
                            disabled={
                              staffUsers.length <= 1 ||
                              (!!u.isAdmin && staffUsers.filter((x) => x.isAdmin).length <= 1)
                            }
                          >
                            Remove
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ) : null}

              <Card className="rounded-3xl shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-2xl">
                    <Settings className="h-5 w-5" /> Integrations
                  </CardTitle>
                  <CardDescription>
                    Paste your <strong>Google Apps Script</strong> deployment URL here (Deploy → Web app → copy URL; usually
                    ends with <code className="rounded bg-slate-100 px-1 text-xs">/exec</code>). Saved in this browser only.{" "}
                    {user.isAdmin ? (
                      <>
                        For every visitor without a saved URL, you can also set repository secret{" "}
                        <code className="rounded bg-slate-100 px-1 text-xs">REACT_APP_GOOGLE_SHEETS_WEBHOOK_URL</code> in
                        GitHub Actions so the live build includes it.
                      </>
                    ) : null}{" "}
                    <strong>Pull from Sheet</strong> needs your script to accept POST{" "}
                    <code className="rounded bg-slate-100 px-1 text-xs">{"{ action: 'listLeads' }"}</code> (see{" "}
                    <code className="rounded bg-slate-100 px-1 text-xs">scripts/google-apps-script-sample.js</code>).
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Google Sheets Webhook URL</Label>
                    <Input
                      placeholder="https://script.google.com/macros/s/.../exec"
                      value={integrations.googleSheetsWebhook}
                      onChange={(e) => setIntegrations({ ...integrations, googleSheetsWebhook: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email Notification Webhook URL</Label>
                    <Input
                      placeholder="https://your-email-automation-endpoint"
                      value={integrations.emailWebhook}
                      onChange={(e) => setIntegrations({ ...integrations, emailWebhook: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Notification Email</Label>
                    <Input
                      placeholder="ops@styleasia.com"
                      value={integrations.notifyEmail}
                      onChange={(e) => setIntegrations({ ...integrations, notifyEmail: e.target.value })}
                    />
                  </div>

                  <div className="flex items-center gap-3 rounded-2xl border p-4">
                    <Checkbox
                      id="toasts"
                      checked={uiPrefs.toastsEnabled}
                      onCheckedChange={(v) => setUiPrefs((p) => ({ ...p, toastsEnabled: v === true }))}
                    />
                    <Label htmlFor="toasts" className="cursor-pointer text-sm font-normal">
                      Show toast notifications for login, saves, exports, and sync results
                    </Label>
                  </div>
                </CardContent>
              </Card>

              {user.isAdmin ? (
                <Card className="rounded-3xl shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-2xl">How to wire it up</CardTitle>
                    <CardDescription>
                      New leads POST JSON to your Apps Script URL (optional). Customer page uses the same payload. Staff CRM
                      stays usable fully offline in the browser except when syncing to Sheets.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm text-slate-700">
                    <div className="rounded-2xl border p-4">
                      <p className="font-medium">Google Sheets + customer confirmation email</p>
                      <p className="mt-1 text-slate-600">
                        Create a Google Apps Script web app linked to a Sheet. On each POST, append one row. For{" "}
                        <strong>public</strong> inquiries, the JSON includes <code className="rounded bg-slate-100 px-1">customerConfirmation</code>{" "}
                        (<code className="rounded bg-slate-100 px-1">send: true</code>, <code className="rounded bg-slate-100 px-1">to</code>, names) — use{" "}
                        <code className="rounded bg-slate-100 px-1">MailApp.sendEmail</code> in the script to email them
                        “we received your inquiry and will get back to you.” See <code className="rounded bg-slate-100 px-1">scripts/google-apps-script-sample.js</code>{" "}
                        in this project for a paste-in example.
                      </p>
                    </div>
                    <div className="rounded-2xl border p-4">
                      <p className="font-medium">Customer link on your current website</p>
                      <p className="mt-1 text-slate-600">
                        Deploy the app (e.g. GitHub Pages). Link customers to the app URL <strong>without</strong>{" "}
                        <code className="rounded bg-slate-100 px-1">?staff=1</code>—they only get the inquiry form. Staff use a
                        private bookmark with <code className="rounded bg-slate-100 px-1">?staff=1</code>. Optional: add{" "}
                        <code className="rounded bg-slate-100 px-1">REACT_APP_GOOGLE_SHEETS_WEBHOOK_URL</code> as a GitHub
                        Actions secret so the built site posts to Sheets without each browser pasting the URL.
                      </p>
                    </div>
                    <div className="rounded-2xl border p-4">
                      <p className="font-medium">Email notifications</p>
                      <p className="mt-1 text-slate-600">
                        Use a webhook from Zapier, Make, n8n, Resend, SendGrid, or your own mail function. The app sends the
                        lead payload after submission.
                      </p>
                    </div>
                    <div className="rounded-2xl border p-4">
                      <p className="font-medium">Right now</p>
                      <p className="mt-1 text-slate-600">
                        The staff dashboard works locally with login, lead saving, file capture, statuses, search, CSV export,
                        and editing.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this lead?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `This removes “${deleteTarget.companyName}” and revokes any local file previews. This cannot be undone.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-red-600 hover:bg-red-600/90"
              onClick={() => deleteTarget && confirmDelete(deleteTarget.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
