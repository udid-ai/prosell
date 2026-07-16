"use client";

import { useEffect, useState } from "react";
import AccountNav from "./AccountNav";

// 내 계정(account) 사이드바.
//  · 데스크톱(lg+): 좌측 고정 그룹 메뉴.
//  · 모바일: "내 계정 메뉴" 버튼 → 카테고리처럼 왼쪽에서 슬라이드되는 드로어로 메뉴 표시.
export default function AccountSidebar() {
  const [open, setOpen] = useState(false);

  // 드로어 열림 시 body 스크롤 잠금 + ESC 닫기 (CategorySheet 와 동일 패턴).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      {/* 데스크톱 고정 사이드바 (테두리 실선 카드) */}
      <div className="hidden rounded-md border border-line bg-card p-4 lg:block">
        <AccountNav />
      </div>

      {/* 모바일 열기 버튼 */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full cursor-pointer items-center gap-2 rounded-md border border-line bg-card px-4 py-2.5 text-sm font-semibold text-text hover:bg-surface lg:hidden"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        내 계정 메뉴
      </button>

      {/* 모바일 좌측 드로어 */}
      <div className={`fixed inset-0 z-[60] lg:hidden ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
        {/* 배경 */}
        <div
          onClick={() => setOpen(false)}
          className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
        />
        {/* 드로어 본문 (왼쪽에서 슬라이드) */}
        <div
          role="dialog"
          aria-modal="true"
          aria-label="내 계정 메뉴"
          className={`absolute bottom-0 left-0 top-0 right-14 flex flex-col rounded-r-2xl bg-card transition-transform duration-300 ${
            open ? "translate-x-0 shadow-2xl" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="text-base font-bold text-text">내 계정</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="닫기"
              className="grid h-9 w-9 cursor-pointer place-items-center rounded-full text-text hover:bg-line"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <div className="pb-safe flex-1 overflow-y-auto px-4 py-4">
            <AccountNav onNavigate={() => setOpen(false)} hideTitle />
          </div>
        </div>
      </div>
    </>
  );
}
