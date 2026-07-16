import Link from "next/link";
import { getToken, fetchCouponBox, won, type MemberCoupon } from "@/lib/prosell";
import CouponRegisterButton from "@/components/CouponRegisterButton";
import LevelCouponList from "@/components/LevelCouponList";

export const dynamic = "force-dynamic";

const cardCls = "rounded-md border border-line bg-card p-6";
const TYPE_LABEL: Record<number, string> = { 1: "상품 할인", 2: "묶음 할인", 3: "배송비 할인" };

// 할인 표기 — 정률=「N% 할인 (최대 …)」, 정액=「N원 할인」(체크아웃 쿠폰 모달과 동일 규칙)
function discountText(c: MemberCoupon) {
  return c.discount_type === 2
    ? `${c.discount_percent}% 할인${c.discount_max_price > 0 ? ` (최대 ${won(c.discount_max_price)})` : ""}`
    : `${won(c.discount_price)} 할인`;
}

export default async function CouponsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const token = await getToken();
  if (!token) {
    return (
      <div className={cardCls}>
        <h1 className="text-xl">쿠폰</h1>
        <p className="mt-2 text-sub">로그인이 필요합니다.</p>
        <Link href="/auth/login" className="mt-3 inline-block rounded-sm bg-accent px-4 py-2 text-accent-foreground">로그인</Link>
      </div>
    );
  }

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const box = await fetchCouponBox(token, page);
  const coupons = box?.coupons ?? [];
  const total = box?.total_count ?? 0;
  const level = box?.level ?? { use: false, coupons: [] };
  const limit = 10;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-bold text-text">
          쿠폰
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-1.5 text-[12px] font-bold text-accent-foreground">{total}</span>
        </h1>
        <CouponRegisterButton />
      </div>

      {/* 등급 쿠폰 */}
      {level.use && level.coupons.length > 0 && <LevelCouponList coupons={level.coupons} />}

      {/* 보유 쿠폰 */}
      {coupons.length === 0 ? (
        <div className="rounded-md border border-line bg-card p-12 text-center text-sub">보유 중인 쿠폰이 없습니다.</div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {coupons.map((c) => (
            <li key={c.id} className="overflow-hidden rounded-2xl border border-line bg-card">
              <div className="flex items-stretch">
                {/* 좌측 할인 강조 */}
                <div className="flex w-28 shrink-0 flex-col items-center justify-center gap-1 border-r border-dashed border-line bg-accent/5 px-2 py-4 text-center">
                  <span className="rounded-sm bg-accent/10 px-1.5 py-0.5 text-[11px] font-semibold text-accent">{TYPE_LABEL[c.coupon_type] ?? "할인"}</span>
                  <span className="text-[15px] font-extrabold leading-tight text-accent">
                    {c.discount_type === 2 ? `${c.discount_percent}%` : won(c.discount_price)}
                  </span>
                </div>
                {/* 우측 상세 */}
                <div className="min-w-0 flex-1 p-3.5">
                  <p className="truncate text-sm font-semibold text-text">{c.coupon_name || c.title || "쿠폰"}</p>
                  {c.title && c.coupon_name && <p className="mt-0.5 truncate text-[12px] text-sub">{c.title}</p>}
                  <p className="mt-1 text-[13px] font-medium text-text">{discountText(c)}</p>
                  <dl className="mt-1.5 space-y-0.5 text-[12px] text-sub">
                    <div className="flex gap-1">
                      <dt className="shrink-0 text-text/60">사용조건</dt>
                      <dd>{c.discount_terms_price > 0 ? `${won(c.discount_terms_price)} 이상 구매 시` : "구매금액 제한 없음"}</dd>
                    </div>
                    {c.use_dt && (
                      <div className="flex gap-1">
                        <dt className="shrink-0 text-text/60">유효기간</dt>
                        <dd className={c.dday <= 7 ? "font-medium text-sale" : ""}>
                          {c.use_dt.slice(0, 10)} 까지{c.dday >= 0 ? ` (D-${c.dday})` : ""}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-1 pt-2">
          {Array.from({ length: totalPages }).map((_, i) => {
            const p = i + 1;
            return (
              <Link key={p} href={`/account/coupons?page=${p}`}
                className={`grid h-9 min-w-9 place-items-center rounded-md border px-2 text-sm ${p === page ? "border-accent bg-accent/5 font-bold text-accent" : "border-line text-text hover:bg-surface"}`}>
                {p}
              </Link>
            );
          })}
        </nav>
      )}

      {/* 안내 */}
      <div className="rounded-md border border-line bg-surface p-4 text-[12px] leading-relaxed text-sub">
        <p className="mb-1 font-medium text-text">쿠폰 이용 안내</p>
        <p>· 쿠폰은 유효기간 내에만 사용할 수 있으며, 기간이 지나면 자동 소멸됩니다.</p>
        <p>· 쿠폰마다 최소 구매금액·적용 상품 조건이 다를 수 있습니다.</p>
        <p>· 보유하신 PIN 번호는 «쿠폰 등록»으로 보관함에 추가할 수 있습니다.</p>
      </div>
    </div>
  );
}
