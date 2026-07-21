import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { getToken, fetchAccount, fetchOrderSummary, fetchWishlist } from "@/lib/prosell";

export const dynamic = "force-dynamic";

export const metadata = buildMetadata({ title: "마이페이지", noindex: true });

// 마이페이지 대시보드 — 회원 요약 + 자산(적립금/쿠폰/위시) + 주문 처리 현황 + 바로가기.
//  · 자산 스트립: 적립금 잔액·쿠폰 수는 회원정보(account)에 이미 집계되어 있어 추가 호출 불필요.
//    위시리스트 건수만 별도 조회. 주문 상태 버킷은 신규 order/summary 로 단일 집계.

const nf = (n: number) => n.toLocaleString("ko-KR");

// 바로가기(대시보드에서 다루지 않는 나머지 계정 메뉴)
const QUICK_LINKS = [
  { href: "/account/reviews", title: "상품 리뷰", desc: "작성한 리뷰 관리" },
  { href: "/account/qna", title: "상품 문의", desc: "내 상품 문의 내역" },
  { href: "/account/inquiries", title: "1:1 문의", desc: "1:1 문의 내역" },
  { href: "/account/privatepay", title: "개인 결제", desc: "발급된 개인 결제창" },
  { href: "/account/history", title: "최근 본 상품", desc: "최근 조회한 상품" },
  { href: "/account/address", title: "배송지 관리", desc: "배송지 추가·수정" },
  { href: "/account/info", title: "내 정보", desc: "회원 정보 확인" },
  { href: "/account/edit", title: "정보 수정", desc: "회원 정보 변경" },
];

// 주문 파이프라인 4단계
const PIPELINE = [
  { key: "paywait", label: "입금대기" },
  { key: "preparing", label: "준비중" },
  { key: "shipping", label: "배송중" },
  { key: "delivered", label: "배송완료" },
] as const;

// 진행중 클레임
const CLAIMS = [
  { key: "cancel", label: "취소", href: "/account/cancels" },
  { key: "refund", label: "반품", href: "/account/refunds" },
  { key: "exchange", label: "교환", href: "/account/exchanges" },
] as const;

export default async function AccountHomePage() {
  const token = await getToken();
  if (!token) {
    return (
      <div className="rounded-md border border-line bg-card p-8 text-center">
        <h1 className="text-xl font-bold text-text">마이페이지</h1>
        <p className="mt-2 text-sub">로그인이 필요합니다.</p>
        <Link href="/auth/login" className="mt-4 inline-block rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground">
          로그인
        </Link>
      </div>
    );
  }

  // 3개 소스 병렬 로드(모두 개인 데이터 → no-store). 실패 시 각 함수가 빈값/기본값 반환.
  const [account, summary, wishlist] = await Promise.all([
    fetchAccount(token),
    fetchOrderSummary(token, 3),
    fetchWishlist(token, 1, 1),
  ]);

  const o = account?.origin ?? {};
  const i = account?.info ?? {};
  const name = o.name != null && o.name !== "" ? String(o.name) : null;
  const levelName = o.level_name != null && o.level_name !== "" ? String(o.level_name) : o.level != null ? `LV.${o.level}` : null;
  const point = Number(o.point ?? 0) || 0;
  const couponCnt = Number(i.coupon_cnt ?? 0) || 0;
  const wishCnt = Number(wishlist?.total_count ?? 0) || 0;

  const assets = [
    { label: "적립금", value: `${nf(point)} P`, href: "/account/points" },
    { label: "쿠폰", value: `${nf(couponCnt)} 장`, href: "/account/coupons" },
    { label: "위시리스트", value: `${nf(wishCnt)} 개`, href: "/account/wishlist" },
  ];

  const claimTotal = summary.claims.cancel + summary.claims.refund + summary.claims.exchange;
  const isNew = summary.orders.total === 0 && point === 0 && couponCnt === 0 && wishCnt === 0;

  return (
    <div className="space-y-5">
      <h1 className="sr-only">마이페이지</h1>

      {/* 회원 요약 + 자산 스트립 */}
      <section className="overflow-hidden rounded-md border border-line bg-card">
        <div className="flex flex-wrap items-center gap-2 px-6 pt-6">
          {levelName && (
            <span className="inline-flex items-center rounded-full bg-accent/10 px-2.5 py-1 text-[12px] font-bold text-accent">
              {levelName}
            </span>
          )}
          <p className="text-lg font-bold text-text">
            {name ? <>{name}님</> : "회원님"} <span className="font-normal text-sub">환영합니다</span>
          </p>
        </div>
        <div className="mt-5 grid grid-cols-3 border-t border-line">
          {assets.map((a, idx) => (
            <Link
              key={a.href}
              href={a.href}
              className={`group flex flex-col items-center gap-1 py-5 transition-colors hover:bg-surface ${idx > 0 ? "border-l border-line" : ""}`}
            >
              <span className="text-[13px] text-sub">{a.label}</span>
              <span className="text-lg font-bold text-text group-hover:text-accent">{a.value}</span>
            </Link>
          ))}
        </div>
      </section>

      {isNew ? (
        <section className="rounded-md border border-line bg-card p-10 text-center">
          <p className="text-base font-bold text-text">아직 주문 내역이 없어요</p>
          <p className="mt-1 text-[13px] text-sub">마음에 드는 상품을 담고 첫 주문을 시작해 보세요.</p>
          <Link href="/" className="mt-5 inline-block rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground">
            쇼핑하러 가기
          </Link>
        </section>
      ) : (
        <section className="rounded-md border border-line bg-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-text">주문 처리 현황</h2>
            <Link href="/account/orders" className="text-[13px] text-sub hover:text-text">
              전체 주문내역 &rsaquo;
            </Link>
          </div>
          <p className="mt-1 text-[12px] text-sub">최근 3개월 기준</p>

          {/* 배송 파이프라인 */}
          <div className="mt-4 grid grid-cols-4 overflow-hidden rounded-md border border-line">
            {PIPELINE.map((s, idx) => (
              <Link
                key={s.key}
                href="/account/orders"
                className={`flex flex-col items-center gap-1.5 py-5 transition-colors hover:bg-surface ${idx > 0 ? "border-l border-line" : ""}`}
              >
                <span className="text-2xl font-bold text-text">{nf(summary.orders[s.key])}</span>
                <span className="text-[12px] text-sub">{s.label}</span>
              </Link>
            ))}
          </div>

          {/* 진행중 클레임 */}
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-md bg-surface px-4 py-3">
            <span className="text-[12px] font-medium text-sub">진행중 클레임</span>
            {claimTotal === 0 ? (
              <span className="text-[13px] text-sub">없음</span>
            ) : (
              CLAIMS.map((c) => (
                <Link key={c.key} href={c.href} className="text-[13px] text-text hover:text-accent">
                  {c.label} <b className="font-bold">{nf(summary.claims[c.key])}</b>
                </Link>
              ))
            )}
          </div>
        </section>
      )}

      {/* 바로가기 */}
      <section>
        <h2 className="mb-3 text-base font-bold text-text">바로가기</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_LINKS.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="rounded-md border border-line bg-card p-4 transition-colors hover:border-accent/40 hover:bg-accent/5"
            >
              <p className="text-sm font-bold text-text">{c.title}</p>
              <p className="mt-1 text-[12px] text-sub">{c.desc}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
