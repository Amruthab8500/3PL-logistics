import React from "react";

const LOGO_SRC = `${process.env.PUBLIC_URL || ""}/logo-styleasia.png`;

type BrandHeaderProps = {
  subtitle?: string;
  className?: string;
};

export function BrandHeader({ subtitle, className = "" }: BrandHeaderProps) {
  return (
    <header className={`flex flex-col items-center gap-3 border-b border-slate-200 pb-6 text-center md:flex-row md:items-end md:text-left ${className}`}>
      <img
        src={LOGO_SRC}
        alt="StyleAsia inc"
        className="h-14 w-auto object-contain md:h-16"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
      <div className="flex-1 md:pb-0.5">
        <h1 className="text-xl font-bold tracking-tight text-[#0a3d62] md:text-2xl">STYLE ASIA 3PL CLIENT ONBOARDING</h1>
        {subtitle ? <p className="mt-1 text-sm font-medium text-slate-600">{subtitle}</p> : null}
        <p className="mt-1 text-xs italic text-slate-500">EVERYDAY, INNOVATIVE PRODUCTS</p>
      </div>
    </header>
  );
}
