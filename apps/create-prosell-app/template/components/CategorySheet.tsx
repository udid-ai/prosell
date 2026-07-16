"use client";

import { useEffect } from "react";
import Link from "next/link";
import type { CategoryNode } from "@/lib/prosell";

// 모바일 전체화면 카테고리 시트. 항목 클릭 시 onClose 로 닫고 이동(Link).
// 카테고리 링크는 불변 id 기준(레거시와 동일).
const cat = (id: number) => `/category/${id}`;

export default function CategorySheet({
  tree,
  open,
  onClose,
}: {
  tree: CategoryNode[];
  open: boolean;
  onClose: () => void;
}) {
  // 열렸을 때 body 스크롤 잠금 + ESC 닫기.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <div
      className={`fixed inset-0 z-[60] md:hidden ${open ? "" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      {/* 배경 */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
      />

      {/* 시트 본문 (왼쪽에서 오른쪽으로, 상하 꽉 채우고 우측만 여백) */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="카테고리"
        className={`absolute bottom-0 left-0 top-0 right-14 flex flex-col rounded-r-2xl bg-card transition-transform duration-300 ${
          open ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-bold text-text">카테고리</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="grid h-9 w-9 cursor-pointer place-items-center rounded-full text-text hover:bg-line"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="pb-safe flex-1 overflow-y-auto px-5 py-4">
          <Link
            href="/category"
            onClick={onClose}
            className="mb-3 block rounded-lg bg-surface px-3 py-2.5 text-sm font-bold text-text"
          >
            전체상품 보기
          </Link>

          <ul className="space-y-5">
            {tree.map((c) => (
              <li key={c.id}>
                <Link
                  href={cat(c.id)}
                  onClick={onClose}
                  className="text-[15px] font-bold text-text hover:text-accent"
                >
                  {c.title}
                </Link>
                {c.children.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {c.children.map((sub) => (
                      <Link
                        key={sub.id}
                        href={cat(sub.id)}
                        onClick={onClose}
                        className="rounded-full border border-line bg-card px-3 py-1.5 text-[13px] text-sub hover:border-accent hover:text-accent"
                      >
                        {sub.title}
                      </Link>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
