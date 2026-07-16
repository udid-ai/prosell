import Link from "next/link";
import { buildMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata = buildMetadata({ title: "마이페이지", noindex: true });

// 마이페이지 랜딩(계정 섹션 루트) — 주요 메뉴로 이동하는 진입점.
// (기존 /mypage 를 /account 로 이관. 계정 정보는 /account/info 로 이동.)
const CARDS = [
  { href: "/account/orders", title: "주문 내역", desc: "주문·배송 상태를 확인합니다." },
  { href: "/account/cancels", title: "취소 내역", desc: "취소 접수/완료 내역." },
  { href: "/account/refunds", title: "반품 내역", desc: "반품 접수/진행/환불." },
  { href: "/account/exchanges", title: "교환 내역", desc: "교환 접수/재배송." },
  { href: "/account/privatepay", title: "개인 결제", desc: "발급된 개인 결제창." },
  { href: "/account/info", title: "내 정보", desc: "계정·회원 정보 확인." },
];

export default function AccountHomePage() {
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-text">마이페이지</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        {CARDS.map((c) => (
          <Link key={c.href} href={c.href}
            className="rounded-2xl border border-line bg-card p-5 transition-colors hover:border-accent/40 hover:bg-accent/5">
            <p className="text-base font-bold text-text">{c.title}</p>
            <p className="mt-1 text-[13px] text-sub">{c.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
