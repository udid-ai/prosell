import Link from "next/link";
import { getToken, fetchMemberOrders, fetchReviewTitleEnabled } from "@/lib/prosell";
import OrderPeriodPicker from "@/components/OrderPeriodPicker";
import OrderList from "@/components/OrderList";

export const dynamic = "force-dynamic";

const cardCls = "rounded-md border border-line bg-card p-6";
const PERIODS = [3, 12] as const;

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ page?: string; months?: string; start?: string; end?: string }> }) {
  const token = await getToken();
  if (!token) {
    return (
      <div className={cardCls}>
        <h1 className="text-xl">주문 내역</h1>
        <p className="mt-2 text-sub">로그인이 필요합니다.</p>
        <Link href="/auth/login" className="mt-3 inline-block rounded-sm bg-accent px-4 py-2 text-accent-foreground">로그인</Link>
      </div>
    );
  }

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const custom = !!sp.start && !!sp.end && dateRe.test(sp.start) && dateRe.test(sp.end); // 직접 기간설정
  const months = (PERIODS as readonly number[]).includes(Number(sp.months)) ? Number(sp.months) : 3;
  const limit = 10; // 10개씩(배송그룹 아닌 주문 단위 total_count 기준)
  const { orders, total_count } = await fetchMemberOrders(token, custom ? { page, limit, start: sp.start, end: sp.end } : { page, months, limit });
  const hasOrders = orders.some((o) => (o.items ?? []).length > 0);
  const totalPages = Math.max(1, Math.ceil(total_count / limit));
  // 페이지네이션 링크에 현재 기간 조건 유지
  const periodQS = custom ? `start=${sp.start}&end=${sp.end}` : `months=${months}`;

  return (
    <div className="space-y-4">
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-bold text-text">
          주문 내역
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-1.5 text-[12px] font-bold text-accent-foreground">{total_count}</span>
        </h1>
        <div className="flex flex-wrap items-center gap-1 rounded-md border border-line bg-card p-1">
          {PERIODS.map((m) => (
            <Link key={m} href={`/account/orders?months=${m}`}
              className={`rounded px-3 py-1 text-[13px] font-medium ${!custom && m === months ? "bg-accent text-accent-foreground" : "text-sub hover:text-text"}`}>
              최근 {m}개월
            </Link>
          ))}
          <OrderPeriodPicker start={sp.start} end={sp.end} active={custom} />
        </div>
      </div>

      {custom && (
        <p className="text-[13px] text-sub">{sp.start} ~ {sp.end} 기간 조회</p>
      )}

      {!hasOrders ? (
        <div className="rounded-md border border-line bg-card p-12 text-center text-sub">
          {custom ? "해당 기간의 주문 내역이 없습니다." : `최근 ${months}개월 주문 내역이 없습니다.`}
          <div className="mt-4"><Link href="/" className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">쇼핑 계속하기</Link></div>
        </div>
      ) : (
        <OrderList orders={orders} reviewTitleEnabled={await fetchReviewTitleEnabled(token)} />
      )}

      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-1 pt-2">
          {Array.from({ length: totalPages }).map((_, i) => {
            const p = i + 1;
            return (
              <Link key={p} href={`/account/orders?${periodQS}&page=${p}`}
                className={`grid h-9 min-w-9 place-items-center rounded-md border px-2 text-sm ${p === page ? "border-accent bg-accent/5 font-bold text-accent" : "border-line text-text hover:bg-surface"}`}>
                {p}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
