import React from "react";
import { BrandHeader } from "components/BrandHeader";
import {
  BUSINESS_TYPE_OPTIONS,
  CONTAINER_SIZE_OPTIONS,
  FULFILLMENT_CHECKBOX_OPTIONS,
  SALES_CHANNEL_OPTIONS,
} from "constants/onboarding";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 mt-6 border-b-2 border-[#0a3d62] pb-1.5 text-sm font-bold uppercase tracking-wide text-[#0a3d62]">{children}</h2>;
}

function LineField({ label }: { label: string }) {
  return (
    <div className="mb-2 text-sm">
      <span className="font-medium text-slate-800">{label}</span>
      <span className="ml-1 inline-block min-w-[60%] border-b border-slate-400 print:border-slate-600" />
    </div>
  );
}

function CheckboxRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="inline-block h-3.5 w-3.5 shrink-0 border border-slate-700 print:border-slate-900" />
      <span>{label}</span>
    </div>
  );
}

export function ClientOnboardingPrintForm() {
  return (
    <div className="print-form mx-auto max-w-3xl bg-white p-6 text-slate-900 shadow-sm md:p-10 md:shadow-md print:shadow-none">
      <BrandHeader subtitle="Print this form for walk-in clients to complete and sign." className="mb-6" />

      <SectionTitle>Company Information</SectionTitle>
      <div className="grid gap-1 sm:grid-cols-2">
        <LineField label="Company Name:" />
        <LineField label="Contact Person:" />
        <LineField label="Title:" />
        <LineField label="Email:" />
        <LineField label="Phone:" />
        <LineField label="Website:" />
      </div>
      <LineField label="Business Address:" />

      <SectionTitle>Business Type</SectionTitle>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {BUSINESS_TYPE_OPTIONS.map((opt) => (
          <CheckboxRow key={opt} label={opt} />
        ))}
        <div className="flex items-center gap-2 text-sm sm:col-span-2">
          <span className="inline-block h-3.5 w-3.5 shrink-0 border border-slate-700" />
          <span>Other:</span>
          <span className="inline-block min-w-[40%] flex-1 border-b border-slate-400" />
        </div>
      </div>

      <SectionTitle>Products Information</SectionTitle>
      <LineField label="Product Category:" />
      <LineField label="Average SKU Count:" />
      <div className="mt-2 flex flex-wrap gap-6 text-sm">
        <span className="font-medium">Hazardous or regulated items?</span>
        <CheckboxRow label="Yes" />
        <CheckboxRow label="No" />
      </div>
      <div className="mt-2 flex flex-wrap gap-6 text-sm">
        <span className="font-medium">Special handling required?</span>
        <CheckboxRow label="Yes" />
        <CheckboxRow label="No" />
      </div>
      <div className="mt-2 text-sm">
        <span className="font-medium">If yes, please explain:</span>
        <div className="mt-1 min-h-[3rem] border-b border-slate-300 print:border-slate-500" />
      </div>

      <SectionTitle>Shipping Volume</SectionTitle>
      <LineField label="Estimated monthly orders:" />
      <LineField label="Average units per order:" />
      <LineField label="Peak season months:" />

      <SectionTitle>Inbound Shipments</SectionTitle>
      <LineField label="Origin country:" />
      <LineField label="Frequency of shipments:" />
      <div className="mt-2 text-sm font-medium">Container size:</div>
      <div className="mt-1 flex flex-wrap gap-4">
        {CONTAINER_SIZE_OPTIONS.map((c) => (
          <CheckboxRow key={c} label={c} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-6 text-sm">
        <span className="font-medium">Need customs coordination?</span>
        <CheckboxRow label="Yes" />
        <CheckboxRow label="No" />
      </div>

      <SectionTitle>Fulfillment Requirements</SectionTitle>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {FULFILLMENT_CHECKBOX_OPTIONS.map((opt) => (
          <CheckboxRow key={opt} label={opt} />
        ))}
      </div>

      <SectionTitle>Sales channels</SectionTitle>
      <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
        {SALES_CHANNEL_OPTIONS.map((opt) => (
          <CheckboxRow key={opt} label={opt} />
        ))}
        <div className="flex items-center gap-2 text-sm sm:col-span-2">
          <span className="inline-block h-3.5 w-3.5 shrink-0 border border-slate-700" />
          <span>Other:</span>
          <span className="inline-block min-w-[35%] flex-1 border-b border-slate-400" />
        </div>
      </div>

      <SectionTitle>Storage Needs</SectionTitle>
      <LineField label="Estimated pallet positions:" />
      <div className="text-sm">
        <span className="font-medium">Special storage (climate, high value, etc.):</span>
        <div className="mt-1 min-h-[2.5rem] border-b border-slate-300" />
      </div>

      <SectionTitle>Additional Requirements</SectionTitle>
      <div className="min-h-[4rem] border border-dashed border-slate-300 p-2 print:border-slate-500" />

      <div className="mt-10 grid gap-8 border-t border-slate-200 pt-6 text-sm sm:grid-cols-2">
        <div>
          <span className="font-medium">Signature:</span>
          <span className="ml-2 inline-block w-[70%] border-b border-slate-500" />
        </div>
        <div>
          <span className="font-medium">Date:</span>
          <span className="ml-2 inline-block w-[60%] border-b border-slate-500" />
        </div>
      </div>
    </div>
  );
}
