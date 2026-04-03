import React from "react";
import { Input } from "components/ui/input";
import { Textarea } from "components/ui/textarea";
import { Checkbox } from "components/ui/checkbox";
import { Label } from "components/ui/label";
import type { FormErrors, LeadIntakeForm, YesNo } from "types/intake";
import {
  BUSINESS_TYPE_OPTIONS,
  CONTAINER_SIZE_OPTIONS,
  FULFILLMENT_CHECKBOX_OPTIONS,
  SALES_CHANNEL_OPTIONS,
  TIMELINE_OPTIONS,
} from "constants/onboarding";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/ui/select";

type Props = {
  form: LeadIntakeForm;
  setForm: React.Dispatch<React.SetStateAction<LeadIntakeForm>>;
  formErrors: FormErrors;
  setFormErrors: React.Dispatch<React.SetStateAction<FormErrors>>;
  /** Optional: show “When do you plan to start?” (timeline). */
  showTimeline?: boolean;
  children?: React.ReactNode;
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="border-b-2 border-[#0a3d62] pb-2 text-base font-bold text-[#0a3d62]">{children}</h3>;
}

function toggleInList(list: string[], value: string, on: boolean): string[] {
  if (on) return list.includes(value) ? list : [...list, value];
  return list.filter((x) => x !== value);
}

function YesNoSelect({
  label,
  value,
  onChange,
  id,
}: {
  label: string;
  value: YesNo;
  onChange: (v: YesNo) => void;
  id: string;
}) {
  const v = value || "__unset__";
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-slate-700">
        {label}
      </Label>
      <Select
        value={v}
        onValueChange={(next) => onChange(next === "__unset__" ? "" : (next as YesNo))}
      >
        <SelectTrigger id={id} className="rounded-xl">
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__unset__">—</SelectItem>
          <SelectItem value="yes">Yes</SelectItem>
          <SelectItem value="no">No</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export function OnboardingFields({
  form,
  setForm,
  formErrors,
  setFormErrors,
  showTimeline = true,
  children,
}: Props) {
  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <SectionTitle>Company Information</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="co-name">Company Name *</Label>
            <Input
              id="co-name"
              value={form.companyName}
              onChange={(e) => {
                setForm((f) => ({ ...f, companyName: e.target.value }));
                if (formErrors.companyName) setFormErrors((x) => ({ ...x, companyName: undefined }));
              }}
              className={`rounded-xl ${formErrors.companyName ? "border-red-300" : ""}`}
            />
            {formErrors.companyName && <p className="text-xs text-red-600">{formErrors.companyName}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="contact">Contact Person *</Label>
            <Input
              id="contact"
              value={form.contactName}
              onChange={(e) => {
                setForm((f) => ({ ...f, contactName: e.target.value }));
                if (formErrors.contactName) setFormErrors((x) => ({ ...x, contactName: undefined }));
              }}
              className={`rounded-xl ${formErrors.contactName ? "border-red-300" : ""}`}
            />
            {formErrors.contactName && <p className="text-xs text-red-600">{formErrors.contactName}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="rounded-xl" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => {
                setForm((f) => ({ ...f, email: e.target.value }));
                if (formErrors.email) setFormErrors((x) => ({ ...x, email: undefined }));
              }}
              className={`rounded-xl ${formErrors.email ? "border-red-300" : ""}`}
            />
            {formErrors.email && <p className="text-xs text-red-600">{formErrors.email}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="rounded-xl" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="website">Website</Label>
            <Input id="website" value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} className="rounded-xl" />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="addr">Business Address</Label>
            <Textarea
              id="addr"
              className="min-h-[72px] rounded-xl"
              value={form.businessAddress}
              onChange={(e) => setForm((f) => ({ ...f, businessAddress: e.target.value }))}
            />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle>Business Type</SectionTitle>
        <div className="grid gap-2 sm:grid-cols-2">
          {BUSINESS_TYPE_OPTIONS.map((opt) => (
            <label key={opt} className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm hover:bg-slate-50">
              <Checkbox
                checked={form.businessTypes.includes(opt)}
                onCheckedChange={(c) =>
                  setForm((f) => ({ ...f, businessTypes: toggleInList(f.businessTypes, opt, c === true) }))
                }
              />
              {opt}
            </label>
          ))}
        </div>
        <div className="space-y-1">
          <Label htmlFor="biz-other">Other</Label>
          <Input
            id="biz-other"
            className="rounded-xl"
            value={form.businessTypeOther}
            onChange={(e) => setForm((f) => ({ ...f, businessTypeOther: e.target.value }))}
            placeholder="Describe if Other"
          />
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle>Products Information</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="pcat">Product Category</Label>
            <Input id="pcat" className="rounded-xl" value={form.productCategory} onChange={(e) => setForm((f) => ({ ...f, productCategory: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sku">Average SKU Count</Label>
            <Input id="sku" className="rounded-xl" value={form.averageSkuCount} onChange={(e) => setForm((f) => ({ ...f, averageSkuCount: e.target.value }))} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <YesNoSelect
            id="haz"
            label="Hazardous or regulated items?"
            value={form.hazardousItems}
            onChange={(hazardousItems) => setForm((f) => ({ ...f, hazardousItems }))}
          />
          <YesNoSelect
            id="spec"
            label="Special handling required?"
            value={form.specialHandlingRequired}
            onChange={(specialHandlingRequired) => setForm((f) => ({ ...f, specialHandlingRequired }))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="spec-explain">If yes, please explain</Label>
          <Textarea
            id="spec-explain"
            className="min-h-[72px] rounded-xl"
            value={form.specialHandlingExplain}
            onChange={(e) => setForm((f) => ({ ...f, specialHandlingExplain: e.target.value }))}
          />
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle>Shipping Volume</SectionTitle>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="emo">Estimated monthly orders</Label>
            <Input
              id="emo"
              className="rounded-xl"
              value={form.estimatedMonthlyOrders}
              onChange={(e) => setForm((f) => ({ ...f, estimatedMonthlyOrders: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="auo">Average units per order</Label>
            <Input
              id="auo"
              className="rounded-xl"
              value={form.averageUnitsPerOrder}
              onChange={(e) => setForm((f) => ({ ...f, averageUnitsPerOrder: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="peak">Peak season months</Label>
            <Input id="peak" className="rounded-xl" value={form.peakSeasonMonths} onChange={(e) => setForm((f) => ({ ...f, peakSeasonMonths: e.target.value }))} />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle>Inbound Shipments</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="origin">Origin country</Label>
            <Input id="origin" className="rounded-xl" value={form.originCountry} onChange={(e) => setForm((f) => ({ ...f, originCountry: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="freq">Frequency of shipments</Label>
            <Input
              id="freq"
              className="rounded-xl"
              value={form.shipmentFrequency}
              onChange={(e) => setForm((f) => ({ ...f, shipmentFrequency: e.target.value }))}
            />
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">Container size</p>
          <div className="flex flex-wrap gap-3">
            {CONTAINER_SIZE_OPTIONS.map((opt) => (
              <label key={opt} className="flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm">
                <Checkbox
                  checked={form.containerSizes.includes(opt)}
                  onCheckedChange={(c) =>
                    setForm((f) => ({ ...f, containerSizes: toggleInList(f.containerSizes, opt, c === true) }))
                  }
                />
                {opt}
              </label>
            ))}
          </div>
        </div>
        <YesNoSelect
          id="customs"
          label="Need customs coordination?"
          value={form.customsCoordination}
          onChange={(customsCoordination) => setForm((f) => ({ ...f, customsCoordination }))}
        />
      </section>

      <section className="space-y-3">
        <SectionTitle>Fulfillment Requirements</SectionTitle>
        <div className="grid gap-2 sm:grid-cols-2">
          {FULFILLMENT_CHECKBOX_OPTIONS.map((opt) => (
            <label key={opt} className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm hover:bg-slate-50">
              <Checkbox
                checked={form.fulfillmentOptions.includes(opt)}
                onCheckedChange={(c) =>
                  setForm((f) => ({ ...f, fulfillmentOptions: toggleInList(f.fulfillmentOptions, opt, c === true) }))
                }
              />
              {opt}
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle>Technology &amp; Integration</SectionTitle>
        <p className="text-sm font-medium text-slate-700">Sales channels</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {SALES_CHANNEL_OPTIONS.map((opt) => (
            <label key={opt} className="flex cursor-pointer items-center gap-2 rounded-xl border p-2 text-sm">
              <Checkbox
                checked={form.salesChannels.includes(opt)}
                onCheckedChange={(c) =>
                  setForm((f) => ({ ...f, salesChannels: toggleInList(f.salesChannels, opt, c === true) }))
                }
              />
              {opt}
            </label>
          ))}
        </div>
        <div className="space-y-1">
          <Label htmlFor="sales-other">Other</Label>
          <Input
            id="sales-other"
            className="rounded-xl"
            value={form.salesChannelOther}
            onChange={(e) => setForm((f) => ({ ...f, salesChannelOther: e.target.value }))}
          />
        </div>
        <YesNoSelect
          id="integr"
          label="Need system integration?"
          value={form.needSystemIntegration}
          onChange={(needSystemIntegration) => setForm((f) => ({ ...f, needSystemIntegration }))}
        />
      </section>

      <section className="space-y-4">
        <SectionTitle>Storage Needs</SectionTitle>
        <div className="space-y-1">
          <Label htmlFor="pallets">Estimated pallet positions</Label>
          <Input
            id="pallets"
            className="rounded-xl"
            value={form.estimatedPalletPositions}
            onChange={(e) => setForm((f) => ({ ...f, estimatedPalletPositions: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="st-storage">Special storage (climate, high value, etc.)</Label>
          <Textarea
            id="st-storage"
            className="min-h-[72px] rounded-xl"
            value={form.specialStorage}
            onChange={(e) => setForm((f) => ({ ...f, specialStorage: e.target.value }))}
          />
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle>Transportation</SectionTitle>
        <div className="space-y-1">
          <Label htmlFor="carriers">Preferred carriers</Label>
          <Input
            id="carriers"
            className="rounded-xl"
            value={form.preferredCarriers}
            onChange={(e) => setForm((f) => ({ ...f, preferredCarriers: e.target.value }))}
          />
        </div>
        <YesNoSelect
          id="rateopt"
          label="Need shipping rate optimization?"
          value={form.needShippingRateOptimization}
          onChange={(needShippingRateOptimization) => setForm((f) => ({ ...f, needShippingRateOptimization }))}
        />
      </section>

      {showTimeline ? (
        <section className="space-y-2">
          <SectionTitle>Timing</SectionTitle>
          <Label htmlFor="timeline">When do you plan to start?</Label>
          <Select value={form.timeline || undefined} onValueChange={(timeline) => setForm((f) => ({ ...f, timeline }))}>
            <SelectTrigger id="timeline" className="rounded-xl">
              <SelectValue placeholder="Select timeline" />
            </SelectTrigger>
            <SelectContent>
              {TIMELINE_OPTIONS.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>
      ) : null}

      <section className="space-y-2">
        <SectionTitle>Additional Requirements</SectionTitle>
        <Textarea
          className="min-h-[100px] rounded-xl"
          value={form.additionalRequirements}
          onChange={(e) => setForm((f) => ({ ...f, additionalRequirements: e.target.value }))}
          placeholder="Anything else we should know?"
        />
      </section>

      {children}
    </div>
  );
}
