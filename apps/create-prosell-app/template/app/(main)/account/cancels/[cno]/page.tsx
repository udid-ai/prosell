import Link from "next/link";
import { getToken, fetchMemberCancelByCno, imgUrl, won, type MemberOrderItem } from "@/lib/prosell";
import { formatDateTime, formatDateTimeSec } from "@/lib/format";
import AddonBox from "@/components/OrderAddonBox";
import ReceiptPopupBtn from "@/components/ReceiptPopupBtn";

export const dynamic = "force-dynamic";

const cardCls = "rounded-md border border-line bg-card p-6";
type Tone = "normal" | "active" | "warn" | "muted";
const isProduct = (t: number) => t === 0 || t === 10;

function cancelStatus(s: number): { label: string; tone: Tone } {
  if (s === 2) return { label: "취소완료", tone: "muted" };
  if (s === 1) return { label: "취소처리중", tone: "active" };
  return { label: "취소접수", tone: "warn" };
}

// 진행상태 안내문 — 레거시 cancel/view.php stblock(M90T/M99T). can_type 1=전체·0=부분.
function cancelStatusText(s: number, type: number): string {
  const kind = type === 1 ? "전체" : "부분";
  if (s === 2) return `${kind} 취소가 완료되었습니다. 결제하신 금액은 결제 수단에 따라 1~7일 내 환불이 완료됩니다.`;
  return `${kind} 취소가 접수되었습니다. 감사합니다.`;
}

// 날짜 표기(초 단위) — 미입금 취소 등 0000-00-00/빈값이면 하이픈.
function dateSecOrDash(v?: string | null): string {
  if (!v || v.startsWith("0000")) return "-";
  const s = formatDateTimeSec(v);
  return !s || s.startsWith("0000") ? "-" : s;
}

// can_method: 취소수단(레거시 METHOD_ 라벨).
function cancelMethod(m?: number): string {
  const map: Record<number, string> = {
    100: "신용/체크 카드", 101: "카드 수기결제", 110: "휴대폰 소액결제", 120: "실시간 계좌이체", 130: "가상계좌",
    201: "페이코", 202: "토스", 203: "카카오페이", 204: "네이버페이", 205: "네이버페이", 206: "제로페이", 207: "스마일페이", 208: "ApplePay",
    300: "무통장 입금", 500: "해외카드", 900: "전액 적립금",
  };
  return (m && map[m]) || "-";
}

// 취소 품목 할인 내역 — 레거시 cancel/view.php 상품 툴팁 + Member/Cancel.php getView 계산식 그대로.
//  총할인 = |can_pro_discount + can_pro_coupon + can_pro_bundle|. 항목:
//   등급할인 = level_discount_price × 취소수량, 대량구매할인 = pro_bulk_discount_price,
//   즉시할인 = 상품할인(can_pro_discount) − 등급 − 대량, 상품할인 쿠폰 = can_pro_coupon, 묶음할인 쿠폰 = can_pro_bundle.
function cancelDiscount(p: MemberOrderItem["product"]) {
  const qty = p.can_pro_quantity ?? p.pro_quantity;
  const disc = Math.abs(p.can_pro_discount_price ?? 0);
  const level = Math.abs((p.level_discount_price ?? 0) * qty);
  const bulk = Math.abs(p.pro_bulk_discount_price ?? 0);
  const immediate = Math.max(0, disc - level - bulk);
  const coupon = Math.abs(p.can_pro_coupon_price ?? 0);
  const bundle = Math.abs(p.can_pro_bundle_price ?? 0);
  const total = disc + coupon + bundle;
  const after = p.can_pro_amount_price ?? p.pro_amount_price;
  const before = p.can_pro_price ?? after + total;
  const items = [
    { label: "등급할인", v: level },
    { label: "즉시할인", v: immediate },
    { label: "대량구매 할인", v: bulk },
    { label: "상품할인 쿠폰", v: coupon },
    { label: "묶음할인 쿠폰", v: bundle },
  ].filter((x) => x.v > 0);
  return { total, before, after, items };
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

export default async function CancelDetailPage({ params }: { params: Promise<{ cno: string }> }) {
  const token = await getToken();
  if (!token) {
    return (
      <div className={cardCls}>
        <h1 className="text-xl">취소 상세</h1>
        <p className="mt-2 text-sub">로그인이 필요합니다.</p>
        <Link href="/auth/login" className="mt-3 inline-block rounded-sm bg-accent px-4 py-2 text-accent-foreground">로그인</Link>
      </div>
    );
  }
  const { cno } = await params;
  const c = await fetchMemberCancelByCno(token, cno);

  if (!c) {
    return (
      <div className={cardCls}>
        <h1 className="text-xl">취소 상세</h1>
        <p className="mt-2 text-sub">취소 정보를 찾을 수 없습니다.</p>
        <Link href="/account/cancels" className="mt-3 inline-block rounded-md border border-line px-4 py-2 text-sm text-text hover:bg-surface">취소 내역으로</Link>
      </div>
    );
  }

  const cn = c.cancel;
  const st = cancelStatus(cn.can_state);
  const lines = toLines(c.items ?? []);
  const bank = [cn.can_bank_title, cn.can_bank_num, cn.can_bank_holder ? `(${cn.can_bank_holder})` : ""].filter(Boolean).join(" ");
  const done = cn.can_state === 2;
  const goodsTotal = (c.items ?? []).reduce((s, it) => s + (it.product.can_pro_price ?? 0), 0);

  // 혜택할인 툴팁 분해 — 레거시 cancel/view.php 그대로. 행=혜택할인(can_benefit_price).
  //  툴팁 항목: 등급할인·즉시할인·대량구매할인·배송할인쿠폰 (상품쿠폰·묶음쿠폰 필드는 미계산이라 레거시에서도 미노출).
  //  Member/Cancel.php getView: 즉시할인 = 상품할인(can_pro_discount) - 등급(level×수량) - 대량(pro_bulk).
  const benefitTotal = Math.abs(cn.can_benefit_price ?? 0);
  const discMap = new Map<string, number>();
  const add = (label: string, v: number) => { if (v > 0) discMap.set(label, (discMap.get(label) ?? 0) + v); };
  for (const it of c.items ?? []) {
    const pp = it.product;
    const qty = pp.can_pro_quantity ?? pp.pro_quantity;
    const disc = Math.abs(pp.can_pro_discount_price ?? 0);
    const level = Math.abs((pp.level_discount_price ?? 0) * qty);
    const bulk = Math.abs(pp.pro_bulk_discount_price ?? 0);
    add("등급할인", level);
    add("즉시할인", Math.max(0, disc - level - bulk));
    add("대량구매 할인", bulk);
  }
  add("배송할인 쿠폰", Math.abs(cn.can_delivery_coupon_price ?? 0));
  const discRows = [...discMap.entries()].filter(([, v]) => v > 0);

  return (
    <div className="space-y-4">
      {/* 타이틀 + 취소유형 뱃지(왼쪽) · (우측) 영수증/전표 버튼 */}
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-text">취소 상세</h1>
          <Badge tone="muted">{cn.can_type === 1 ? "전체취소" : "부분취소"}</Badge>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {/* 전체취소 시 구매영수증(원주문). 매출전표·현금영수증은 취소 발행분이 있을 때 */}
          {cn.can_type === 1 && (
            <ReceiptPopupBtn href={`/receipt/${cn.pno}`} name="purchase_receipt" width={600} height={900} title="법적효력 없는 참고용 구매영수증입니다.">구매영수증</ReceiptPopupBtn>
          )}
          {cn.can_bill_type ? <ReceiptPopupBtn href={cn.can_bill_url} name="cancel_bill" width={600} height={700}>매출전표</ReceiptPopupBtn> : null}
          {cn.can_receipt_no ? <ReceiptPopupBtn href={cn.can_receipt_url} name="cancel_receipt" width={480} height={700}>현금영수증</ReceiptPopupBtn> : null}
        </div>
      </div>

      {/* 진행상태 안내 박스 — 반품상세와 동일 구조(상태뱃지 + 취소번호 + 날짜 + 안내문) */}
      <section className="rounded-2xl border border-line bg-card px-5 py-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <Badge tone={st.tone}>{st.label}</Badge>
          <span className="text-[13px] font-semibold text-text">취소번호 {cn.cno}</span>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-sub">{cancelStatusText(cn.can_state, cn.can_type)}</p>
      </section>

      {/* 취소 상품 */}
      <section className="rounded-2xl border border-line bg-card">
        <ul className="divide-y divide-line">
          {lines.map((ln) => {
            const p = ln.main.product;
            const thumb = imgUrl(ln.main.images?.[0]?.thumb || ln.main.images?.[0]?.src);
            const qty = p.can_pro_quantity ?? p.pro_quantity;
            const di = cancelDiscount(p);
            return (
              <li key={p.prno} className="flex items-stretch px-0">
                <Link href={`/products/${p.products_id}`} className="shrink-0 self-start py-4 pl-4 pr-4 sm:pl-5">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className="h-16 w-16 rounded-lg border border-line object-cover" />
                  ) : <div className="h-16 w-16 rounded-lg border border-line bg-surface" />}
                </Link>
                <div className="min-w-0 flex-1 py-4 pr-4">
                  <Link href={`/products/${p.products_id}`} className="line-clamp-2 w-fit text-sm font-semibold text-text hover:text-accent">
                    {p.products_title || p.pro_title || "상품"}
                  </Link>
                  {p.products_option_type > 0 && (p.pro_title || p.option_name) && (
                    <p className="mt-0.5 text-[13px] text-sub">{p.pro_title}{p.option_name ? ` / ${p.option_name}` : ""}</p>
                  )}
                  {ln.addons.length > 0 && <AddonBox addons={ln.addons} className="mr-4 sm:mr-0" />}
                </div>
                {/* 가격셀 — 주문상세와 동일(좌측 세로선·가운데정렬, 고정폭·무패딩/마진). 할인 시 판매가 + 취소선 + 툴팁 */}
                <div className="flex w-[104px] shrink-0 flex-col items-center justify-center gap-0.5 border-l border-line py-4 text-center sm:w-28 sm:border-l sm:border-r-0">
                  <span className="whitespace-nowrap text-[13px] text-sub">수량 {qty}개</span>
                  {di.total <= 0 ? (
                    <span className="whitespace-nowrap text-sm font-semibold text-text">{won(di.after)}</span>
                  ) : (
                    <>
                      <div className="group relative inline-flex items-center gap-1">
                        <span className="whitespace-nowrap text-sm font-semibold text-text">{won(di.after)}</span>
                        <span tabIndex={0} className="grid h-4 w-4 cursor-help place-items-center rounded-full border border-line text-[9px] text-sub">?</span>
                        {/* 모바일: 우측 기준(가로스크롤 방지) / sm+: 가운데 */}
                        <div className="pointer-events-none absolute right-0 top-full z-20 mt-1 hidden w-44 rounded-md border border-line bg-card p-2 text-left shadow-lg group-hover:block group-focus-within:block sm:left-1/2 sm:right-auto sm:-translate-x-1/2">
                          <div className="flex justify-between text-[12px] font-semibold text-text">
                            <span>총 할인</span><span className="text-sale">- {won(di.total)}</span>
                          </div>
                          <ul className="mt-1 space-y-0.5 text-[11px] text-sub">
                            {di.items.map((x) => (
                              <li key={x.label} className="flex justify-between gap-2"><span>· {x.label}</span><span>- {won(x.v)}</span></li>
                            ))}
                          </ul>
                        </div>
                      </div>
                      <span className="whitespace-nowrap text-[11px] text-sub line-through">{won(di.before)}</span>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 취소 정보 + 환불 정보 — 데스크탑(lg) 좌우 2열, 모바일 세로 1열 */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
      {/* 취소 정보 — 주문/취소 식별 + 사유. 상세 내용 없으면 빈칸 표기 */}
      <section className={`${cardCls} min-w-0`}>
        <h2 className="mb-3 text-base font-bold text-text">취소 정보</h2>
        <dl className="space-y-2 text-sm">
          <Row left k="주문일시" v={dateSecOrDash(c.order.dt)} />
          <Row left k="취소 접수일시" v={dateSecOrDash(cn.can_dt)} />
          <Row left k="주문번호" v={String(c.order.ono)} />
          <Row left k="취소번호" v={String(cn.cno)} />
          <Row left k="사유" v={cn.can_title || "-"} />
          <Row left k="상세 내용" v={cn.can_content || "-"} />
        </dl>
      </section>

      {/* 환불 정보 — 레거시 환불 항목 전체 */}
      <section className={`${cardCls} min-w-0`}>
        <h2 className="mb-3 text-base font-bold text-text">환불 정보</h2>
        <dl className="space-y-2 text-sm">
          {goodsTotal > 0 && <Row k="상품 금액" v={won(goodsTotal)} />}
          {/* 혜택 할인 — 레거시 cancel/view.php: 값=can_benefit_price, ? 호버 시 등급/즉시/대량/쿠폰 분해 툴팁 */}
          {(benefitTotal > 0 || discRows.length > 0) && (
            <div className="flex justify-between gap-4">
              <dt className="group relative flex shrink-0 items-center gap-1 text-sub">
                <span>혜택 할인</span>
                <span tabIndex={0} className="grid h-4 w-4 cursor-help place-items-center rounded-full border border-line text-[9px] text-sub">?</span>
                <div className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden w-52 rounded-md border border-line bg-card p-2 text-left shadow-lg group-hover:block group-focus-within:block">
                  <div className="flex justify-between text-[12px] font-semibold text-text">
                    <span>혜택할인</span><span className="text-sale">- {won(benefitTotal)}</span>
                  </div>
                  <ul className="mt-1 space-y-0.5 text-[11px] text-sub">
                    {discRows.map(([label, v]) => (
                      <li key={label} className="flex justify-between gap-2"><span>· {label}</span><span>- {won(v)}</span></li>
                    ))}
                  </ul>
                </div>
              </dt>
              <dd className="text-right text-sale">- {won(benefitTotal)}</dd>
            </div>
          )}
          {(cn.can_delivery_price ?? 0) !== 0 && <Row k="배송비" v={(cn.can_delivery_price ?? 0) < 0 ? `- ${won(Math.abs(cn.can_delivery_price!))}` : won(cn.can_delivery_price!)} sale={(cn.can_delivery_price ?? 0) < 0} />}
          {(cn.can_point ?? 0) > 0 && <Row k="적립금 환불" v={`${cn.can_point.toLocaleString()} P`} />}
        </dl>

        <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
          <span className="text-sub">총 환불금액</span>
          <span className="text-xl font-extrabold text-sale">{won(cn.can_price)}</span>
        </div>

        {/* 취소 수단 — 레거시 type-method. 수단 라벨 + 계좌(계좌환불) + 완료일 */}
        <div className="mt-4 border-t border-line pt-3">
          <dl className="space-y-2 text-sm">
            <Row k="환불 수단" v={cancelMethod(cn.can_method)} />
            {bank && <Row k="환불 계좌" v={bank} />}
            {done && cn.can_confirm_dt && <Row k="환불 완료일" v={formatDateTime(cn.can_confirm_dt)} />}
          </dl>
        </div>
      </section>
      </div>
    </div>
  );
}

function Row({ k, v, left, sale }: { k: string; v: string; left?: boolean; sale?: boolean }) {
  if (left) {
    return (
      <div className="flex gap-3">
        <dt className="w-24 shrink-0 whitespace-nowrap text-sub">{k}</dt>
        <dd className="min-w-0 whitespace-pre-wrap break-words text-text">{v}</dd>
      </div>
    );
  }
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-sub">{k}</dt>
      <dd className={`text-right ${sale ? "text-sale" : "text-text"}`}>{v}</dd>
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: Tone }) {
  const cls = tone === "active" ? "bg-accent/10 text-accent" : tone === "warn" ? "bg-sale/10 text-sale" : tone === "muted" ? "bg-line text-sub" : "bg-success/10 text-success";
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-bold ${cls}`}>{children}</span>;
}
