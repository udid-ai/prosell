"use client";

// 팝업창 닫기 버튼(window.close). 레거시 receipt 팝업의 '팝업창 닫기'.
export default function PopupCloseButton({ children = "팝업창 닫기", className }: { children?: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.close()}
      className={className ?? "rounded-md border border-line px-3 py-1.5 text-[12px] font-medium text-text hover:bg-surface print:hidden"}
    >
      {children}
    </button>
  );
}
