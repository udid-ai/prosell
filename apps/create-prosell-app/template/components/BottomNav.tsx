"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomeIcon, GridIcon, CartIcon, UserIcon } from "./icons";
import CategorySheet from "./CategorySheet";
import type { CategoryNode } from "@/lib/prosell";

// 모바일 하단 플로팅 메뉴 — 데스크탑은 숨김(md:hidden).
// "카테고리" 탭은 이동 대신 전체화면 카테고리 시트를 연다.
export default function BottomNav({ tree }: { tree: CategoryNode[] }) {
  const pathname = usePathname() || "/";
  const [sheet, setSheet] = useState(false);

  const itemCls = (active: boolean) =>
    `flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] transition-colors ${
      active ? "text-accent" : "text-sub hover:text-text"
    }`;

  const links = [
    { href: "/", label: "홈", Icon: HomeIcon, active: pathname === "/" },
    { href: "/cart", label: "장바구니", Icon: CartIcon, active: pathname.startsWith("/cart") },
    { href: "/account", label: "내정보", Icon: UserIcon, active: pathname.startsWith("/account") || pathname.startsWith("/mypage") },
  ];

  const catActive = pathname.startsWith("/category") || sheet;

  return (
    <>
      <nav aria-label="모바일 메뉴" className="bottom-safe fixed inset-x-3 z-50 md:hidden">
        <ul className="flex items-stretch justify-around rounded-2xl border border-line bg-card/95 px-1 py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.18)] backdrop-blur-md">
          <li className="flex-1">
            <Link href="/" aria-current={pathname === "/" ? "page" : undefined} className={itemCls(pathname === "/")}>
              <HomeIcon className={`h-[22px] w-[22px] transition-transform ${pathname === "/" ? "-translate-y-px" : ""}`} />
              <span className={pathname === "/" ? "font-semibold" : ""}>홈</span>
            </Link>
          </li>

          {/* 카테고리 — 시트 열기 */}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setSheet(true)}
              aria-haspopup="dialog"
              aria-expanded={sheet}
              className={`w-full cursor-pointer border-0 bg-transparent ${itemCls(catActive)}`}
            >
              <GridIcon className={`h-[22px] w-[22px] transition-transform ${catActive ? "-translate-y-px" : ""}`} />
              <span className={catActive ? "font-semibold" : ""}>카테고리</span>
            </button>
          </li>

          {links.slice(1).map(({ href, label, Icon, active }) => (
            <li key={href} className="flex-1">
              <Link href={href} aria-current={active ? "page" : undefined} className={itemCls(active)}>
                <Icon className={`h-[22px] w-[22px] transition-transform ${active ? "-translate-y-px" : ""}`} />
                <span className={active ? "font-semibold" : ""}>{label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <CategorySheet tree={tree} open={sheet} onClose={() => setSheet(false)} />
    </>
  );
}
