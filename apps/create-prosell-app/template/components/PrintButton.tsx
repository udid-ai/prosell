"use client";

// 영수증 팝업 인쇄 버튼.
export default function PrintButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md border border-line px-3 py-1.5 text-[12px] font-medium text-text hover:bg-surface print:hidden"
    >
      {children}
    </button>
  );
}
