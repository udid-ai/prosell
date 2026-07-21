"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { CategoryNode } from "@/lib/prosell";

// 데스크탑 카테고리 메가메뉴. hover 로 열고, 항목 클릭/마우스이탈 시 닫힌다.
// 데이터는 Header(서버)에서 props 로 받는다(추가 요청 없음).

// 카테고리 링크는 불변 id 기준(레거시와 동일). 이동/재정렬에도 URL 안정.
const cat = (id: number) => `/category/${id}`;

// «전체 메뉴» 우측 바로가기(푸터 고객지원/퀵메뉴 참고).
const SHORTCUTS = [
  { href: "/notice", label: "공지사항" },
  { href: "/faq", label: "자주묻는 질문" },
  { href: "/account/qna", label: "1:1 문의" },
  { href: "/account/orders", label: "주문/배송 조회" },
  { href: "/account/coupons", label: "쿠폰 보관함" },
  { href: "/cart", label: "장바구니" },
  { href: "/pages/policy", label: "이용약관" },
  { href: "/pages/privacy", label: "개인정보 처리방침" },
];

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden className={`ml-1 h-2.5 w-2.5 opacity-50 transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
      <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function CategoryNav({ tree }: { tree: CategoryNode[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);        // 전체 메뉴 패널
  const [cs, setCs] = useState(false);            // 고객센터(바로가기) 드롭다운
  const menuRef = useRef<HTMLLIElement>(null);

  // 전체 메뉴 — 바깥 클릭 / ESC 로 닫기.
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [menu]);

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
    <nav aria-label="상품 카테고리" className="border-t border-line bg-card" onMouseLeave={() => { setOpen(null); setCs(false); }}>
      <ul className="mx-auto flex max-w-content items-stretch gap-1 px-4">
        {/* 전체 메뉴 — 전체상품 좌측. 클릭 시 카테고리 그룹 + 바로가기 메가패널. */}
        <li ref={menuRef} className="relative">
          <button
            type="button"
            aria-label="전체 메뉴"
            title="전체 메뉴"
            aria-expanded={menu}
            onClick={() => setMenu((v) => !v)}
            className={`-ml-2 flex h-11 items-center px-2 hover:text-accent ${menu ? "text-accent" : "text-text"}`}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>

          {menu && (
            <div className="absolute left-0 top-full z-40 w-[1200px] max-w-[calc(100vw-1rem)]">
              <div className="flex gap-6 rounded-b-md border border-t-0 border-line bg-card p-5 shadow-lg">
                {/* 카테고리 그룹(대분류 → 중분류) — 넓은 패널을 채우도록 flex-1 + 다열 */}
                <div className="grid min-w-0 flex-1 grid-cols-4 items-start gap-x-6 gap-y-4 lg:grid-cols-6">
                  {tree.map((c) => (
                    <div key={c.id} className="min-w-0">
                      <Link href={cat(c.id)} onClick={() => setMenu(false)} className="block text-[13px] font-bold text-text hover:text-accent">
                        {c.title}
                      </Link>
                      {c.children.length > 0 && (
                        <ul className="mt-1 space-y-0.5">
                          {c.children.map((sub) => (
                            <li key={sub.id}>
                              <Link href={cat(sub.id)} onClick={() => setMenu(false)} className="block truncate text-[12px] text-sub hover:text-accent">
                                {sub.title}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
                {/* 바로가기(공지사항 등) */}
                <div className="w-40 shrink-0 border-l border-line pl-6">
                  <p className="mb-2 text-[13px] font-bold text-text">바로가기</p>
                  <ul className="space-y-1.5">
                    {SHORTCUTS.map((l) => (
                      <li key={l.href}>
                        <Link href={l.href} onClick={() => setMenu(false)} className="block text-[13px] text-sub hover:text-accent">
                          {l.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </li>

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
                href={cat(c.id)}
                onClick={close}
                onFocus={() => setOpen(hasKids ? c.id : null)}
                className={`flex h-11 items-center px-3 text-sm transition-colors hover:text-accent ${isOpen ? "text-accent" : "text-text"}`}
              >
                {c.title}
                {hasKids && <Chevron open={isOpen} />}
              </Link>

              {hasKids && isOpen && (
                // 열렸을 때만 렌더 — 닫힌 상태로 mount 하면(invisible) 우측 카테고리 드롭다운이 뷰포트 밖으로
                // 뻗어 레이아웃 공간을 차지 → 전역 가로 스크롤 유발. 조건부 렌더로 제거.
                <div className="absolute left-0 top-full z-30">
                  <div className="min-w-[15rem] rounded-b-md border border-t-0 border-line bg-card p-3 shadow-lg">
                    <div className="grid auto-cols-[minmax(9rem,1fr)] grid-flow-col gap-x-5 gap-y-1">
                      {c.children.map((sub) => (
                        <div key={sub.id} className="min-w-0">
                          <Link
                            href={cat(sub.id)}
                            onClick={close}
                            className="block truncate rounded px-2 py-1.5 text-[13px] font-semibold text-text hover:bg-surface hover:text-accent"
                          >
                            {sub.title}
                          </Link>
                          {sub.children.length > 0 && (
                            <ul className="mt-0.5 mb-1">
                              {sub.children.map((leaf) => (
                                <li key={leaf.id}>
                                  <Link
                                    href={cat(leaf.id)}
                                    onClick={close}
                                    className="block truncate rounded px-2 py-1 text-[12px] text-sub hover:bg-surface hover:text-accent"
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

        {/* 고객센터 — 카테고리 우측에 바로 붙임. hover 시 전체 메뉴의 «바로가기» 목록을 드롭다운으로 노출. */}
        <li
          className="relative"
          onMouseEnter={() => { setOpen(null); setCs(true); }}
        >
          <Link
            href="/notice"
            onClick={() => setCs(false)}
            onFocus={() => setCs(true)}
            className={`flex h-11 items-center px-3 text-sm transition-colors hover:text-accent ${cs ? "text-accent" : "text-text"}`}
          >
            고객센터
            <Chevron open={cs} />
          </Link>

          {cs && (
            <div className="absolute left-0 top-full z-30">
              <div className="min-w-[12rem] rounded-b-md border border-t-0 border-line bg-card p-2 shadow-lg">
                <ul>
                  {SHORTCUTS.map((l) => (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        onClick={() => setCs(false)}
                        className="block truncate rounded px-2 py-1.5 text-[13px] text-sub hover:bg-surface hover:text-accent"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </li>
      </ul>
    </nav>
  );
}
