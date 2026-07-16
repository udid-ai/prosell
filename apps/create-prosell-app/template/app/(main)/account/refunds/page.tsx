import Link from "next/link";
import { getToken, fetchMemberRefunds, imgUrl, won, type MemberRefund, type MemberOrderItem } from "@/lib/prosell";
import { formatDateTime } from "@/lib/format";
import OrderPeriodPicker from "@/components/OrderPeriodPicker";
import AddonBox from "@/components/OrderAddonBox";

export const dynamic = "force-dynamic";

const cardCls = "rounded-md border border-line bg-card p-6";
const PERIODS = [3, 12] as const;
type Tone = "normal" | "active" | "warn" | "muted";
const isProduct = (t: number) => t === 0 || t === 10;

// ref_state: 10~19 반품접수 · 20 회수중 · 21 상품검수 · 22 반품승인 · 30 반품완료(환불완료). 레거시 refund/_lib REF0~4.
function refundStatus(s: number): { label: string; tone: Tone } {
  if (s === 1) return { label: "반품철회", tone: "muted" };
  if (s === 2) return { label: "반품거절", tone: "muted" };
  if (s === 30) return { label: "반품완료", tone: "muted" };
  if (s === 22) return { label: "반품승인", tone: "active" };
  if (s === 21) return { label: "상품검수", tone: "active" };
  if (s === 20) return { label: "회수중", tone: "active" };
  return { label: "반품접수", tone: "warn" };
}

type Line = { main: MemberOrderItem; addons: MemberOrderItem[] };
function toLines(items: MemberOrderItem[]): Line[] {
  const lines: Line[] = [];
  for (const it of items) {
    if (isProduct(it.product.item_type) || lines.length === 0) lines.push({ main: it, addons: [] });
    else lines[lines.length - 1].addons.push(it);
  }
  return lines;
}

// 반품내역 기본 조회 상태 — 철회(1)·거절(2) 제외. 접수·회수중·검수·결제요청·완료만 노출.
const DEFAULT_STATES = [10, 20, 21, 22, 30];

export default async function RefundsPage({ searchParams }: { searchParams: Promise<{ page?: string; months?: string; start?: string; end?: string }> }) {
  const token = await getToken();
  if (!token) {
    return (
      <div className={cardCls}>
        <h1 className="text-xl">반품 내역</h1>
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
  // 철회·거절 제외한 기본 상태 배열(ref_state[])로 조회.
  const { refunds, total_count } = await fetchMemberRefunds(token, custom ? { page, limit, start: sp.start, end: sp.end, state: DEFAULT_STATES } : { page, months, limit, state: DEFAULT_STATES });
  const totalPages = Math.max(1, Math.ceil(total_count / limit));
  const periodQS = custom ? `start=${sp.start}&end=${sp.end}` : `months=${months}`;

  return (
    <div className="space-y-4">
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-bold text-text">
          반품 내역
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-1.5 text-[12px] font-bold text-accent-foreground">{total_count}</span>
        </h1>
        <div className="flex flex-wrap items-center gap-1 rounded-md border border-line bg-card p-1">
          {PERIODS.map((m) => (
            <Link key={m} href={`/account/refunds?months=${m}`}
              className={`rounded px-3 py-1 text-[13px] font-medium ${!custom && m === months ? "bg-accent text-accent-foreground" : "text-sub hover:text-text"}`}>
              최근 {m}개월
            </Link>
          ))}
          <OrderPeriodPicker start={sp.start} end={sp.end} active={custom} basePath="/account/refunds" />
        </div>
      </div>

      {custom && <p className="text-[13px] text-sub">{sp.start} ~ {sp.end} 기간 조회</p>}

      {refunds.length === 0 ? (
        <div className="rounded-md border border-line bg-card p-12 text-center text-sub">
          {custom ? "해당 기간의 반품 내역이 없습니다." : `최근 ${months}개월 반품 내역이 없습니다.`}
        </div>
      ) : (
        <ul className="space-y-4">
          {refunds.map((r) => <RefundCard key={r.refund.rno} r={r} />)}
        </ul>
      )}

      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-1 pt-2">
          {Array.from({ length: totalPages }).map((_, i) => {
            const p = i + 1;
            return (
              <Link key={p} href={`/account/refunds?${periodQS}&page=${p}`}
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

function RefundCard({ r }: { r: MemberRefund }) {
  const rf = r.refund;
  const st = refundStatus(rf.ref_state);
  const lines = toLines(r.items ?? []);
  return (
    <li className="overflow-hidden rounded-2xl border border-line bg-card">
      {/* 헤더: 반품상태 뱃지 + 반품번호 + 반품일 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface/60 px-5 py-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <Badge tone={st.tone}>{st.label}</Badge>
          <Link href={`/account/refunds/${rf.rno}`} className="text-[13px] font-semibold text-text hover:text-accent">반품번호 {rf.rno}</Link>
        </div>
        <span className="text-[13px] text-sub">{formatDateTime(rf.ref_dt)}</span>
      </div>

      {/* 반품 상품 — 취소내역 UI 와 동일(가격셀·상세내역 액션 컬럼) */}
      <ul className="divide-y divide-line">
        {lines.map((ln) => {
          const p = ln.main.product;
          const thumb = imgUrl(ln.main.images?.[0]?.thumb || ln.main.images?.[0]?.src);
          const qty = p.ref_pro_quantity ?? p.pro_quantity;
          const price = p.ref_pro_amount_price ?? p.pro_amount_price;
          return (
            <li key={p.prno} className="flex flex-col px-0 sm:flex-row sm:items-stretch">
              {/* 본문: 썸네일 + 상품정보 + 가격셀 */}
              <div className="flex min-w-0 items-stretch sm:flex-1">
                <Link href={`/products/${p.products_id}`} className="shrink-0 self-start py-4 pl-4 pr-4 sm:pl-5">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className="h-16 w-16 rounded-lg border border-line object-cover" />
                  ) : <div className="h-16 w-16 rounded-lg border border-line bg-surface" />}
                </Link>
                <div className="min-w-0 flex-1 py-4 pr-4">
                  <Link href={`/account/refunds/${rf.rno}`} className="line-clamp-2 w-fit text-sm font-semibold text-text hover:text-accent">
                    {p.products_title || p.pro_title || "상품"}
                  </Link>
                  {p.products_option_type > 0 && (p.pro_title || p.option_name) && (
                    <p className="mt-0.5 text-[13px] text-sub">{p.pro_title}{p.option_name ? ` / ${p.option_name}` : ""}</p>
                  )}
                  {ln.addons.length > 0 && <AddonBox addons={ln.addons} className="mr-4 sm:mr-0" />}
                </div>
                <div className="flex w-[104px] shrink-0 flex-col items-center justify-center gap-0.5 border-l border-line py-4 text-center sm:w-28 sm:border-l sm:border-r-0">
                  <span className="whitespace-nowrap text-[13px] text-sub">수량 {qty}개</span>
                  <span className="whitespace-nowrap text-sm font-semibold text-text">{won(price)}</span>
                </div>
              </div>

              {/* 액션 — 상세내역(모바일 하단 푸터 / sm 우측 세로열) */}
              <div className="flex w-full flex-row flex-wrap items-center justify-center gap-1.5 border-t border-line py-3 sm:w-28 sm:shrink-0 sm:flex-col sm:items-center sm:justify-center sm:border-t-0 sm:border-l sm:border-line sm:py-4">
                <Link href={`/account/refunds/${rf.rno}`}
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
