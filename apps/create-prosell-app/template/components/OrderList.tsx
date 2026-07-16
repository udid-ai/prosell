import Link from "next/link";
import { imgUrl, won, type MemberOrder, type MemberOrderItem } from "@/lib/prosell";
import { formatDateTime } from "@/lib/format";
import AddonBox from "@/components/OrderAddonBox";
import ReceiptPopupBtn from "@/components/ReceiptPopupBtn";
import ReviewWriteButton from "@/components/ReviewWriteButton";

// 주문내역 목록(배송그룹 카드) — 회원 마이페이지·비회원 주문조회 공용.
//  detailBase: 상세내역 링크 베이스(회원 "/account/orders" · 비회원 "/order/guest/orders")
//  guest: 비회원 모드 — 회원 전용 액션(상품평·주문완료 링크) 숨김.

type Tone = "normal" | "active" | "warn" | "muted";

export function proStatus(s: number): { label: string; tone: Tone } {
  if (s === 1) return { label: "입금대기", tone: "warn" };
  if (s === 100 || s === 110) return { label: "결제완료", tone: "normal" };
  if (s === 120) return { label: "배송준비중", tone: "active" };
  if (s === 130) return { label: "발송지연", tone: "warn" };
  if (s === 190 || s === 900) return { label: "취소접수", tone: "warn" };
  if (s === 210) return { label: "배송중", tone: "active" };
  if (s === 290) return { label: "배송완료", tone: "normal" };
  if (s >= 300 && s <= 340) return { label: "교환접수", tone: "warn" };
  if (s === 390) return { label: "교환완료", tone: "muted" };
  if (s === 500) return { label: "구매확정", tone: "normal" };
  if (s >= 800 && s <= 830) return { label: "반품접수", tone: "warn" };
  if (s === 980) return { label: "반품완료", tone: "muted" };
  if (s === 990) return { label: "취소완료", tone: "muted" };
  return { label: "주문접수", tone: "normal" };
}

export const isProduct = (t: number) => t === 0 || t === 10; // 상품(추가옵션 아님)

// del_type(real_delivery_type) 첫자리 → 배송수단명.
export function deliveryMethodName(delType: number): string {
  const m: Record<number, string> = { 0: "미배송", 1: "택배", 2: "퀵배송", 3: "직접배송", 4: "방문수령", 5: "해외배송", 7: "당일배송", 8: "새벽배송" };
  return m[Math.floor((delType || 0) / 100)] ?? "택배";
}

type Line = { main: MemberOrderItem; addons: MemberOrderItem[] };
type DeliveryGroup = {
  key: string; ono: number; pno: number; dno: number; dt: string;
  del_state: number; del_split: number; del_type: number; tracking: MemberOrderItem["tracking"]; lines: Line[];
};

function toGroups(orders: MemberOrder[]): DeliveryGroup[] {
  const map = new Map<string, DeliveryGroup>();
  for (const o of orders) {
    for (const it of o.items ?? []) {
      const dno = it.product.dno || it.delivery?.dno || 0;
      const key = `${o.order.ono}-${dno}`;
      let g = map.get(key);
      if (!g) {
        g = {
          key, ono: o.order.ono, pno: o.payment.pno, dno, dt: o.order.dt,
          del_state: it.delivery?.del_state ?? 0, del_split: it.delivery?.del_split ?? 0,
          del_type: it.delivery?.del_type ?? 0, tracking: it.tracking ?? null, lines: [],
        };
        map.set(key, g);
      }
      if (!g.tracking && it.tracking) g.tracking = it.tracking;
      if (isProduct(it.product.item_type) || g.lines.length === 0) g.lines.push({ main: it, addons: [] });
      else g.lines[g.lines.length - 1].addons.push(it);
    }
  }
  return [...map.values()];
}

export default function OrderList({ orders, detailBase = "/account/orders", guest = false, reviewTitleEnabled = false }: {
  orders: MemberOrder[]; detailBase?: string; guest?: boolean; reviewTitleEnabled?: boolean;
}) {
  const groups = toGroups(orders);
  return (
    <ul className="space-y-4">
      {groups.map((g) => <GroupCard key={g.key} g={g} detailBase={detailBase} guest={guest} reviewTitleEnabled={reviewTitleEnabled} />)}
    </ul>
  );
}

function GroupCard({ g, detailBase, guest, reviewTitleEnabled }: { g: DeliveryGroup; detailBase: string; guest: boolean; reviewTitleEnabled: boolean }) {
  return (
    <li className="overflow-hidden rounded-2xl border border-line bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface/60 px-5 py-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <Badge tone="muted">{deliveryMethodName(g.del_type)}</Badge>
          {guest ? (
            <span className="text-[13px] font-semibold text-text">주문번호 {g.dno}</span>
          ) : (
            <Link href={`/order/complete/${g.pno}`} className="text-[13px] font-semibold text-text hover:text-accent">주문번호 {g.dno}</Link>
          )}
          {g.del_split === 1 && <Badge tone="active">분할배송</Badge>}
        </div>
        <span className="text-[13px] text-sub">{formatDateTime(g.dt)}</span>
      </div>

      {g.tracking?.tr_state && (
        <p className="border-b border-line bg-accent/5 px-5 py-2 text-[12px] text-sub">
          <b className="text-text">{g.tracking.tr_state}</b>
          {g.tracking.tr_place ? ` · ${g.tracking.tr_place}` : ""}{g.tracking.tr_dt ? ` · ${formatDateTime(g.tracking.tr_dt)}` : ""}
        </p>
      )}

      <ul className="divide-y divide-line">
        {g.lines.map((ln) => <LineRow key={ln.main.product.prno} ln={ln} dno={g.dno} detailBase={detailBase} guest={guest} reviewTitleEnabled={reviewTitleEnabled} />)}
      </ul>
    </li>
  );
}

function LineRow({ ln, dno, detailBase, guest, reviewTitleEnabled }: { ln: Line; dno: number; detailBase: string; guest: boolean; reviewTitleEnabled: boolean }) {
  const p = ln.main.product;
  const a = ln.main.actions;
  const thumb = imgUrl(ln.main.images?.[0]?.thumb || ln.main.images?.[0]?.src);
  const st = proStatus(p.pro_state);
  const detailHref = `${detailBase}/${dno}`;
  return (
    <li className="flex flex-col px-0 sm:flex-row sm:items-stretch">
      <div className="flex min-w-0 items-stretch sm:flex-1">
        <Link href={`/products/${p.products_id}`} className="shrink-0 self-start py-4 pl-4 pr-4 sm:pl-5">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" className="h-16 w-16 rounded-lg border border-line object-cover" />
          ) : (
            <div className="h-16 w-16 rounded-lg border border-line bg-surface" />
          )}
        </Link>

        <div className="min-w-0 flex-1 py-4 pr-4">
          <Badge tone={st.tone}>{st.label}</Badge>
          <Link href={detailHref} className="mt-1 line-clamp-2 w-fit text-sm font-semibold text-text hover:text-accent">
            {p.products_title || p.pro_title || "상품"}
          </Link>
          {p.products_option_type > 0 && (p.pro_title || p.option_name) && (
            <p className="mt-0.5 text-[13px] text-sub">{p.pro_title}{p.option_name ? ` / ${p.option_name}` : ""}</p>
          )}
          {ln.addons.length > 0 && <AddonBox addons={ln.addons} className="mr-4 sm:mr-0" />}
        </div>

        <div className="flex w-[104px] shrink-0 flex-col items-center justify-center gap-0.5 border-l border-line py-4 text-center sm:w-28 sm:border-l sm:border-r-0">
          <span className="whitespace-nowrap text-[13px] text-sub">수량 {p.pro_quantity}개</span>
          <span className="whitespace-nowrap text-sm font-semibold text-text">{won(p.pro_amount_price)}</span>
        </div>
      </div>

      <div className="flex w-full flex-row flex-wrap items-center justify-center gap-1.5 border-t border-line py-3 sm:w-28 sm:shrink-0 sm:flex-col sm:items-center sm:justify-center sm:border-t-0 sm:border-l sm:border-line sm:py-4">
        {a?.can_tracking === 1 && (
          <ReceiptPopupBtn href={`/tracking/product/${p.prno}`} name="tracking" width={480} height={640} className="min-w-[72px] px-3 sm:px-0 border-accent bg-accent/5 text-accent hover:bg-accent/10">배송조회</ReceiptPopupBtn>
        )}
        {/* 상품평은 회원 전용 */}
        {!guest && a?.can_review === 1 ? (
          <ReviewWriteButton titleEnabled={reviewTitleEnabled} target={{
            prno: p.prno,
            productTitle: p.products_title || p.pro_title || "상품",
            optionTitle: p.products_option_type > 0 ? [p.pro_title, p.option_name].filter(Boolean).join(" / ") : undefined,
            thumb,
          }} />
        ) : !guest && (p.pro_review_id ?? 0) > 0 ? (
          <span className="min-w-[72px] rounded-md border border-success/30 bg-success/5 px-3 py-1.5 text-center text-[12px] font-medium text-success sm:px-0">리뷰완료</span>
        ) : null}
        <Link href={detailHref}
          className="min-w-[72px] rounded-md border border-line px-3 py-1.5 text-center text-[12px] font-medium text-text hover:bg-surface">
          상세내역
        </Link>
      </div>
    </li>
  );
}

export function Badge({ children, tone }: { children: React.ReactNode; tone: Tone }) {
  const cls = tone === "active" ? "bg-accent/10 text-accent"
    : tone === "warn" ? "bg-sale/10 text-sale"
    : tone === "muted" ? "bg-line text-sub"
    : "bg-success/10 text-success";
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-bold ${cls}`}>{children}</span>;
}
