"use client";

// 영수증 팝업 버튼 — 레거시 order/view 의 data-win-open 팝업 재현(window.open, 고정 크기).
// 구매영수증(receipt/order/{pno}) 등 법적효력 없는 참고용 영수증에 사용.
export default function ReceiptPopupBtn({
  href,
  name,
  width = 1000,
  height = 700,
  title,
  className,
  full,
  children,
}: {
  href?: string | null;
  name: string;          // 팝업 window name(중복 클릭 시 같은 창 재사용)
  width?: number;
  height?: number;
  title?: string;
  className?: string;    // 기본 스타일에 덧붙일 클래스(테두리/색상 오버라이드 등)
  full?: boolean;        // true 면 액션버튼 규격(px-3 py-1.5 text-[12px] font-bold, w-full) — ProductRowActions 와 동일
  children: React.ReactNode;
}) {
  if (!href) return null;
  const open = () => {
    const w = window.innerWidth, h = window.innerHeight;
    const left = Math.max(0, (w - width) / 2 + (window.screenX || 0));
    const top = Math.max(0, (h - height) / 2 + (window.screenY || 0));
    window.open(
      href,
      name,
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`,
    );
  };
  return (
    <button
      type="button"
      onClick={open}
      title={title}
      className={
        full
          ? `w-full rounded-md border px-3 py-1.5 text-center text-[12px] font-bold ${className ?? "border-line text-text hover:bg-surface"}`
          : `rounded-md border py-1.5 text-center text-[12px] font-medium ${className ?? "border-line px-3 text-text hover:bg-surface"}`
      }
    >
      {children}
    </button>
  );
}
