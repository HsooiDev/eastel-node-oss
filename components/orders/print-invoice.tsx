"use client";

export function PrintInvoice({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="print:hidden rounded-lg border border-[color:var(--acc-border)] px-4 py-2 text-sm font-medium text-[color:var(--acc-text)]">
      {label}
    </button>
  );
}
