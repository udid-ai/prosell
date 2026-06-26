"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { CategoryNode } from "@/lib/prosell";

// 데스크탑 카테고리 메가메뉴. hover 로 열고, 항목 클릭/마우스이탈 시 닫힌다.
// 데이터는 Header(서버)에서 props 로 받는다(추가 요청 없음).

const cat = (code: string) => `/category/${encodeURIComponent(code)}`;

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden className={`ml-1 h-2.5 w-2.5 opacity-50 transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
      <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function CategoryNav({ tree }: { tree: CategoryNode[] }) {
  const [open, setOpen] = useState<number | null>(null);

  // 다른 탭으로 전환/창 포커스 상실 시 hover 로 열린 메뉴를 닫는다.
  // (마우스가 mouseleave 없이 창을 벗어나면 open 상태가 남아, 복귀 시 열린 채 보이는 문제 방지)
  useEffect(() => {
    if (open === null) return;
    const close = () => setOpen(null);
    const onVis = () => document.visibilityState === "hidden" && close();
    window.addEventListener("blur", close);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("blur", close);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [open]);

  if (!tree.length) return null;

  const close = () => setOpen(null);

  return (
    <nav aria-label="상품 카테고리" className="border-t border-line bg-card" onMouseLeave={close}>
      <ul className="mx-auto flex max-w-content items-stretch gap-1 px-2">
        <li>
          <Link href="/category" onClick={close} className="flex h-11 items-center px-3 text-sm font-bold text-text hover:text-accent">
            전체상품
          </Link>
        </li>

        {tree.map((c) => {
          const hasKids = c.children.length > 0;
          const isOpen = open === c.id;
          return (
            <li
              key={c.id}
              className="relative"
              onMouseEnter={() => setOpen(hasKids ? c.id : null)}
            >
              <Link
                href={cat(c.code)}
                onClick={close}
                onFocus={() => setOpen(hasKids ? c.id : null)}
                className={`flex h-11 items-center px-3 text-sm transition-colors hover:text-accent ${isOpen ? "text-accent" : "text-text"}`}
              >
                {c.title}
                {hasKids && <Chevron open={isOpen} />}
              </Link>

              {hasKids && (
                <div
                  className={`absolute left-0 top-full z-30 transition-all duration-150 ${
                    isOpen ? "visible translate-y-0 opacity-100" : "invisible translate-y-1 opacity-0"
                  }`}
                >
                  <div className="min-w-[15rem] rounded-b-md border border-t-0 border-line bg-card p-3 shadow-lg">
                    <div className="grid auto-cols-[minmax(9rem,1fr)] grid-flow-col gap-x-5 gap-y-1">
                      {c.children.map((sub) => (
                        <div key={sub.id} className="min-w-0">
                          <Link
                            href={cat(sub.code)}
                            onClick={close}
                            className="block truncate rounded px-2 py-1.5 text-[13px] font-semibold text-text hover:bg-bg hover:text-accent"
                          >
                            {sub.title}
                          </Link>
                          {sub.children.length > 0 && (
                            <ul className="mt-0.5 mb-1">
                              {sub.children.map((leaf) => (
                                <li key={leaf.id}>
                                  <Link
                                    href={cat(leaf.code)}
                                    onClick={close}
                                    className="block truncate rounded px-2 py-1 text-[12px] text-sub hover:bg-bg hover:text-accent"
                                  >
                                    {leaf.title}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
