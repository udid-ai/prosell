import Link from "next/link";
import { getToken, fetchMemberExchanges, imgUrl, won, type MemberExchange, type MemberExchangeItem } from "@/lib/prosell";
import { formatDateTime } from "@/lib/format";
import OrderPeriodPicker from "@/components/OrderPeriodPicker";
import AddonBox from "@/components/OrderAddonBox";

export const dynamic = "force-dynamic";

const cardCls = "rounded-md border border-line bg-card p-6";
const PERIODS = [3, 12] as const;
type Tone = "normal" | "active" | "warn" | "muted";
const isProduct = (t: number) => t === 0 || t === 10;

// exc_state: 1 철회 · 2 거부 · 10~19 교환접수 · 20 상품회수중 · 21 상품검수 · 22 교환중 · 29 재배송중 · 30 교환완료. 레거시 exchange/_lib EXC0~9.
function exchangeStatus(s: number): { label: string; tone: Tone } {
  if (s === 1) return { label: "교환철회", tone: "muted" };
  if (s === 2) return { label: "교환거부", tone: "muted" };
  if (s === 30) return { label: "교환완료", tone: "muted" };
  if (s === 29) return { label: "재배송중", tone: "active" };
  if (s === 22) return { label: "교환중", tone: "active" };
  if (s === 21) return { label: "상품검수", tone: "active" };
  if (s === 20) return { label: "회수중", tone: "active" };
  return { label: "교환접수", tone: "warn" };
}

// 교환 상품 그룹핑 — 레거시 exchange/list.php 처럼 option_group 기준(주문순서 비의존).
// 상품(isProduct)을 헤드로, 같은 option_group 의 추가주문옵션(item_type 1)을 addons 로. 상품 없으면 첫 옵션이 헤드.
type Line = { main: MemberExchangeItem; addons: MemberExchangeItem[] };
function toGroups(items: MemberExchangeItem[]): Line[] {
  const map = new Map<number, { main?: MemberExchangeItem; addons: MemberExchangeItem[] }>();
  const order: number[] = [];
  for (const it of items) {
    const g = it.exchange.option_group;
    let line = map.get(g);
    if (!line) { line = { addons: [] }; map.set(g, line); order.push(g); }
    if (isProduct(it.exchange.item_type)) line.main = it;
    else line.addons.push(it);
  }
  return order.map((g) => {
    const l = map.get(g)!;
    const main = l.main ?? l.addons[0];
    const addons = l.main ? l.addons : l.addons.slice(1);
    return { main, addons };
  });
}

export default async function ExchangesPage({ searchParams }: { searchParams: Promise<{ page?: string; months?: string; start?: string; end?: string }> }) {
  const token = await getToken();
  if (!token) {
    return (
      <div className={cardCls}>
        <h1 className="text-xl">교환 내역</h1>
        <p className="mt-2 text-sub">로그인이 필요합니다.</p>
        <Link href="/auth/login" className="mt-3 inline-block rounded-sm bg-accent px-4 py-2 text-accent-foreground">로그인</Link>
      </div>
    );
  }

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const custom = !!sp.start && !!sp.end && dateRe.test(sp.start) && dateRe.test(sp.end);
  const months = (PERIODS as readonly number[]).includes(Number(sp.months)) ? Number(sp.months) : 3;
  const limit = 10;
  // 철회(1)·거부(2) 제외한 기본 상태 배열(exc_state[])로 조회. 접수·회수중·검수·교환중·재배송·완료만.
  const DEFAULT_STATES = [10, 20, 21, 22, 29, 30];
  const { exchanges, total_count } = await fetchMemberExchanges(token, custom ? { page, limit, start: sp.start, end: sp.end, state: DEFAULT_STATES } : { page, months, limit, state: DEFAULT_STATES });
  const totalPages = Math.max(1, Math.ceil(total_count / limit));
  const periodQS = custom ? `start=${sp.start}&end=${sp.end}` : `months=${months}`;

  return (
    <div className="space-y-4">
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-bold text-text">
          교환 내역
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-1.5 text-[12px] font-bold text-accent-foreground">{total_count}</span>
        </h1>
        <div className="flex flex-wrap items-center gap-1 rounded-md border border-line bg-card p-1">
          {PERIODS.map((m) => (
            <Link key={m} href={`/account/exchanges?months=${m}`}
              className={`rounded px-3 py-1 text-[13px] font-medium ${!custom && m === months ? "bg-accent text-accent-foreground" : "text-sub hover:text-text"}`}>
              최근 {m}개월
            </Link>
          ))}
          <OrderPeriodPicker start={sp.start} end={sp.end} active={custom} basePath="/account/exchanges" />
        </div>
      </div>

      {custom && <p className="text-[13px] text-sub">{sp.start} ~ {sp.end} 기간 조회</p>}

      {exchanges.length === 0 ? (
        <div className="rounded-md border border-line bg-card p-12 text-center text-sub">
          {custom ? "해당 기간의 교환 내역이 없습니다." : `최근 ${months}개월 교환 내역이 없습니다.`}
        </div>
      ) : (
        <ul className="space-y-4">
          {exchanges.map((r) => <ExchangeCard key={r.exchange.eno} r={r} />)}
        </ul>
      )}

      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-1 pt-2">
          {Array.from({ length: totalPages }).map((_, i) => {
            const p = i + 1;
            return (
              <Link key={p} href={`/account/exchanges?${periodQS}&page=${p}`}
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

function ExchangeCard({ r }: { r: MemberExchange }) {
  const ex = r.exchange;
  const st = exchangeStatus(ex.exc_state);
  const lines = toGroups(r.items ?? []);
  return (
    <li className="overflow-hidden rounded-2xl border border-line bg-card">
      {/* 헤더: 교환상태 뱃지 + 교환번호 + 교환일 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface/60 px-5 py-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <Badge tone={st.tone}>{st.label}</Badge>
          <Link href={`/account/exchanges/${ex.eno}`} className="text-[13px] font-semibold text-text hover:text-accent">교환번호 {ex.eno}</Link>
        </div>
        <span className="text-[13px] text-sub">{formatDateTime(ex.exc_dt)}</span>
      </div>

      {/* 교환 상품(회수 기준) — 반품내역 UI 와 동일(썸네일·상품정보·가격셀·상세내역 액션) */}
      <ul className="divide-y divide-line">
        {lines.map((ln) => {
          const p = ln.main.product;
          const xe = ln.main.exchange;
          const thumb = imgUrl(xe.exc_s_thumb || undefined);
          const qty = xe.exc_pro_quantity || p.pro_quantity;
          return (
            <li key={xe.epno} className="flex flex-col px-0 sm:flex-row sm:items-stretch">
              {/* 본문: 썸네일 + 상품정보 + 가격셀 */}
              <div className="flex min-w-0 items-stretch sm:flex-1">
                <Link href={`/products/${xe.products_id}`} className="shrink-0 self-start py-4 pl-4 pr-4 sm:pl-5">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className="h-16 w-16 rounded-lg border border-line object-cover" />
                  ) : <div className="h-16 w-16 rounded-lg border border-line bg-surface" />}
                </Link>
                <div className="min-w-0 flex-1 py-4 pr-4">
                  <Link href={`/account/exchanges/${ex.eno}`} className="line-clamp-2 w-fit text-sm font-semibold text-text hover:text-accent">
                    {p.products_title || p.pro_title || "상품"}
                  </Link>
                  {p.products_option_type > 0 && (p.pro_title || p.option_name) && (
                    <p className="mt-0.5 text-[13px] text-sub">{p.pro_title}{p.option_name ? ` / ${p.option_name}` : ""}</p>
                  )}
                  {ln.addons.length > 0 && <AddonBox addons={ln.addons} className="mr-4 sm:mr-0" />}
                </div>
                <div className="flex w-[104px] shrink-0 flex-col items-center justify-center gap-0.5 border-l border-line py-4 text-center sm:w-28 sm:border-l sm:border-r-0">
                  <span className="whitespace-nowrap text-[13px] text-sub">수량 {qty}개</span>
                  <span className="whitespace-nowrap text-sm font-semibold text-text">{won(xe.exc_amount_price)}</span>
                </div>
              </div>

              {/* 액션 — 상세내역(모바일 하단 푸터 / sm 우측 세로열) */}
              <div className="flex w-full flex-row flex-wrap items-center justify-center gap-1.5 border-t border-line py-3 sm:w-28 sm:shrink-0 sm:flex-col sm:items-center sm:justify-center sm:border-t-0 sm:border-l sm:border-line sm:py-4">
                <Link href={`/account/exchanges/${ex.eno}`}
                  className="rounded-md border border-line px-3 py-1.5 text-center text-[12px] font-medium text-text hover:bg-surface">
                  상세내역
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </li>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: Tone }) {
  const cls = tone === "active" ? "bg-accent/10 text-accent" : tone === "warn" ? "bg-sale/10 text-sale" : tone === "muted" ? "bg-line text-sub" : "bg-success/10 text-success";
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-bold ${cls}`}>{children}</span>;
}
