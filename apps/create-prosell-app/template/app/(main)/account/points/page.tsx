import Link from "next/link";
import { getToken, fetchPointHistory, type PointEntry } from "@/lib/prosell";
import { formatDateTime } from "@/lib/format";
import OrderPeriodPicker from "@/components/OrderPeriodPicker";

export const dynamic = "force-dynamic";

const cardCls = "rounded-md border border-line bg-card p-6";
const PERIODS = [1, 3] as const;
const CT_LABEL: Record<number, string> = { 0: "기타", 1: "로그인", 2: "가입", 3: "주문", 4: "취소", 5: "커뮤니티" };
const P = (n: number) => `${n < 0 ? "-" : ""}${Math.abs(n).toLocaleString()} P`;

export default async function PointsPage({ searchParams }: { searchParams: Promise<{ page?: string; months?: string; start?: string; end?: string }> }) {
  const token = await getToken();
  if (!token) {
    return (
      <div className={cardCls}>
        <h1 className="text-xl">적립금</h1>
        <p className="mt-2 text-sub">로그인이 필요합니다.</p>
        <Link href="/auth/login" className="mt-3 inline-block rounded-sm bg-accent px-4 py-2 text-accent-foreground">로그인</Link>
      </div>
    );
  }

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const custom = !!sp.start && !!sp.end && dateRe.test(sp.start) && dateRe.test(sp.end);
  const months = (PERIODS as readonly number[]).includes(Number(sp.months)) ? Number(sp.months) : 1;
  const limit = 10;

  // 기간 계산 — 프리셋(개월) 또는 커스텀(start/end).
  let start = sp.start, end = sp.end;
  if (!custom) {
    const now = new Date();
    const s = new Date(); s.setMonth(s.getMonth() - months);
    const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    start = ymd(s); end = ymd(now);
  }

  const { items, total_count, balance } = await fetchPointHistory(token, { page, limit, start, end });
  const totalPages = Math.max(1, Math.ceil(total_count / limit));
  const periodQS = custom ? `start=${sp.start}&end=${sp.end}` : `months=${months}`;

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-text">적립금</h1>
        <div className="flex flex-wrap items-center gap-1 rounded-md border border-line bg-card p-1">
          {PERIODS.map((m) => (
            <Link key={m} href={`/account/points?months=${m}`}
              className={`rounded px-3 py-1 text-[13px] font-medium ${!custom && m === months ? "bg-accent text-accent-foreground" : "text-sub hover:text-text"}`}>
              최근 {m}개월
            </Link>
          ))}
          <OrderPeriodPicker start={sp.start} end={sp.end} active={custom} basePath="/account/points" />
        </div>
      </div>

      {/* 보유 적립금 */}
      <section className="rounded-2xl border border-accent/40 bg-accent/5 p-5">
        <p className="text-[13px] text-sub">보유 적립금</p>
        <p className="mt-1 text-2xl font-extrabold text-accent">{balance.toLocaleString()} <span className="text-lg">P</span></p>
        <p className="mt-1 text-[12px] text-sub">100P = 100원 · 상품 구매 시 사용할 수 있습니다.</p>
      </section>

      {custom && <p className="text-[13px] text-sub">{sp.start} ~ {sp.end} 기간 조회</p>}

      {/* 변동 내역 */}
      <section className="overflow-hidden rounded-2xl border border-line bg-card">
        <div className="flex items-center justify-between border-b border-line bg-surface/60 px-5 py-3">
          <span className="text-[13px] font-semibold text-text">변동 내역</span>
          <span className="text-[13px] text-sub">{total_count.toLocaleString()}건</span>
        </div>
        {items.length === 0 ? (
          <div className="p-12 text-center text-sub">설정기간 내 적립금 이용 내역이 없습니다.</div>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((it: PointEntry, i) => (
              <li key={`${it.id}-${i}`} className="flex items-center gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-sm bg-line px-1.5 py-0.5 text-[11px] font-medium text-sub">{CT_LABEL[it.ct] ?? "기타"}</span>
                    <p className="min-w-0 truncate text-[13px] font-medium text-text">{it.content || "적립금 변동"}</p>
                  </div>
                  <p className="mt-0.5 text-[12px] text-sub">{it.dt ? formatDateTime(it.dt) : ""}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-sm font-bold ${it.point < 0 ? "text-sale" : "text-accent"}`}>{it.point >= 0 ? "+" : ""}{P(it.point)}</p>
                  <p className="mt-0.5 text-[12px] text-sub">잔액 {it.total_point.toLocaleString()} P</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-1 pt-2">
          {Array.from({ length: totalPages }).map((_, i) => {
            const p = i + 1;
            return (
              <Link key={p} href={`/account/points?${periodQS}&page=${p}`}
                className={`grid h-9 min-w-9 place-items-center rounded-md border px-2 text-sm ${p === page ? "border-accent bg-accent/5 font-bold text-accent" : "border-line text-text hover:bg-surface"}`}>
                {p}
              </Link>
            );
          })}
        </nav>
      )}

      {/* 안내 */}
      <div className="rounded-md border border-line bg-surface p-4 text-[12px] leading-relaxed text-sub">
        <p className="mb-1 font-medium text-text">적립금 이용 안내</p>
        <p>· 적립금(포인트)은 상품 구매 후 구매확정 시 지급됩니다.</p>
        <p>· 상품평·로그인·출석·커뮤니티 활동 등 이벤트 참여로도 지급됩니다.</p>
        <p>· 100P는 100원의 가치를 지니며 상품 구매 시 사용할 수 있습니다.</p>
      </div>
    </div>
  );
}
