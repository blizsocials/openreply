"use client";

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="min-h-11 rounded-xl px-5 text-sm font-semibold text-black print:hidden"
      style={{ background: "#FFD700", border: "1px solid #0E0E0E" }}
    >
      Save as PDF
    </button>
  );
}
