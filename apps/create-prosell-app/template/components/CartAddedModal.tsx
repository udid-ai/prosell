"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

// 장바구니 담기 완료 모달 — 브라우저 confirm 대체.
// 계속 쇼핑(닫기) / 장바구니로 이동 두 액션을 제공. body 로 포탈(카드 <Link>·다른 모달 위에 안전하게 표시).
export default function CartAddedModal({ onClose, onGoCart }: { onClose: () => void; onGoCart: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal((
    <div className="fixed inset-0 z-[80] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="장바구니 담기 완료"
      onClick={(e) => e.stopPropagation()}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-xs rounded-2xl bg-card p-6 text-center shadow-2xl">
        {/* 체크 아이콘 */}
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-success/10 text-success">
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        </span>
        <h2 className="mt-4 text-base font-bold text-text">장바구니에 담았습니다</h2>
        <p className="mt-1 text-[13px] text-sub">장바구니로 이동하시겠어요?</p>
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose}
            className="h-11 flex-1 cursor-pointer rounded-md border border-line bg-card text-sm font-medium text-text hover:bg-surface">계속 쇼핑</button>
          <button type="button" onClick={onGoCart}
            className="h-11 flex-1 cursor-pointer rounded-md bg-accent text-sm font-bold text-accent-foreground hover:opacity-90">장바구니로 이동</button>
        </div>
      </div>
    </div>
  ), document.body);
}
