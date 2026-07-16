"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 내 계정(account) 좌측 그룹 메뉴.
// href 가 있으면 활성 링크, soon:true 는 아직 미구현(준비중, 비활성).
type Item = { label: string; href?: string; soon?: boolean };
type Group = { title: string; items: Item[] };

const GROUPS: Group[] = [
  {
    title: "주문/배송",
    items: [
      { label: "주문 내역", href: "/account/orders" },
      { label: "취소 내역", href: "/account/cancels" },
      { label: "반품 내역", href: "/account/refunds" },
      { label: "교환 내역", href: "/account/exchanges" },
      { label: "개인 결제", href: "/account/privatepay" },
    ],
  },
  {
    title: "혜택",
    items: [
      { label: "쿠폰", href: "/account/coupons" },
      { label: "적립금", href: "/account/points" },
    ],
  },
  {
    title: "관심",
    items: [
      { label: "관심 상품", href: "/account/wishlist" },
      { label: "최근 본 상품", href: "/account/history" },
    ],
  },
  {
    title: "활동",
    items: [
      { label: "상품 리뷰", href: "/account/reviews" },
      { label: "상품 문의", href: "/account/inquiries" },
      { label: "1:1 문의", href: "/account/qna" },
    ],
  },
  {
    title: "회원 정보",
    items: [
      { label: "내 정보", href: "/account/info" },
      { label: "정보 수정", href: "/account/edit" },
      { label: "비밀번호 변경", href: "/account/password" },
      { label: "배송지 관리", href: "/account/address" },
      { label: "회원 탈퇴", href: "/account/dropout" },
    ],
  },
];

// onNavigate: 링크 클릭 시 호출(모바일 드로어 닫기용). hideTitle: 드로어 헤더가 별도 제목을 가질 때 숨김.
export default function AccountNav({ onNavigate, hideTitle }: { onNavigate?: () => void; hideTitle?: boolean } = {}) {
  const pathname = usePathname();

  return (
    <nav aria-label="내 계정 메뉴">
      {!hideTitle && <h2 className="mb-3 px-1 text-lg font-bold text-text">내 계정</h2>}
      <ul className="flex flex-col gap-5">
        {GROUPS.map((g) => (
          <li key={g.title}>
            <p className="mb-1.5 px-1 text-[12px] font-semibold text-sub">{g.title}</p>
            <ul className="flex flex-col">
              {g.items.map((it) => {
                // 활성: 하위 경로 포함 일치(내 정보=/account/info 등). /account 랜딩은 정확일치.
                const active =
                  !!it.href &&
                  (it.href === "/account" ? pathname === "/account" : pathname === it.href || pathname.startsWith(it.href + "/"));
                if (it.soon || !it.href) {
                  return (
                    <li key={it.label}>
                      <span className="flex cursor-default items-center justify-between rounded-md px-3 py-2 text-[14px] text-sub/60">
                        {it.label}
                        <span className="rounded-sm bg-surface px-1.5 py-0.5 text-[10px] text-sub">준비중</span>
                      </span>
                    </li>
                  );
                }
                return (
                  <li key={it.label}>
                    <Link
                      href={it.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`block rounded-md px-3 py-2 text-[14px] transition-colors ${
                        active ? "bg-accent/10 font-semibold text-accent" : "text-text hover:bg-surface"
                      }`}
                    >
                      {it.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}
