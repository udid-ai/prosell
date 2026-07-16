import Link from "next/link";
import { imgUrl, won, payMethodLabel, type MemberOrder, type MemberOrderItem } from "@/lib/prosell";
import { formatDateTime, formatPhone, orderDeliveryFee } from "@/lib/format";
import AddonBox from "@/components/OrderAddonBox";
import ReceiptPopupBtn from "@/components/ReceiptPopupBtn";
import ReceiveEditButton from "@/components/ReceiveEditButton";
import PurchaseConfirmButton from "@/components/PurchaseConfirmButton";
import ReviewWriteButton from "@/components/ReviewWriteButton";
import CancelRequestButton, { type CancelLine } from "@/components/CancelRequestButton";
import RefundRequestButton, { type RefundLine } from "@/components/RefundRequestButton";
import ExchangeRequestButton, { type ExchangeLine, type ExchangeOption } from "@/components/ExchangeRequestButton";

// 주문 상세(배송그룹 단위) — 회원 마이페이지·비회원 주문조회 공용.
//  guest=true 면 회원 전용 액션(취소/반품/교환/배송지변경/포인트혜택)은 숨긴다.
//  단, 배송조회·구매확정·상품평·영수증은 비회원 주문조회도 가능(백엔드가 guest 스코프 소유권 검증).
//  exchOptionMap 은 교환 옵션 목록(회원만 사용) — 비회원은 빈 Map.

const cardCls = "rounded-md border border-line bg-card p-6";
// 상품 하단 클레임 버튼(취소/반품/교환/진행) — 넓은 화면에서 과도하게 늘어나지 않도록 max-width 적용.
const claimBtnCls = "flex-1 basis-0 max-w-[220px] whitespace-nowrap rounded-lg border border-line bg-surface py-3 text-sm font-semibold text-text hover:bg-line disabled:opacity-60";
type Tone = "normal" | "active" | "warn" | "muted";
const isProduct = (t: number) => t === 0 || t === 10;

function proStatus(s: number): { label: string; tone: Tone } {
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
function deliveryMethodName(delType: number): string {
  const m: Record<number, string> = { 0: "미배송", 1: "택배", 2: "퀵배송", 3: "직접배송", 4: "방문수령", 5: "해외배송", 7: "당일배송", 8: "새벽배송" };
  return m[Math.floor((delType || 0) / 100)] ?? "택배";
}
function monthDayOrEmpty(v?: string | null): string {
  const m = String(v ?? "").match(/\d{4}-(\d{2})-(\d{2})/);
  return m && !String(v).startsWith("0000") ? `${Number(m[1])}월 ${Number(m[2])}일` : "";
}
function payStateLabel(s?: number): string {
  const m: Record<number, string> = { 0: "미결제", 1: "입금대기", 2: "결제보류", 10: "결제완료", 90: "취소접수", 99: "취소완료" };
  return m[s ?? 0] ?? "처리중";
}
function discountInfo(p: MemberOrderItem["product"]) {
  const bulk = p.pro_bulk_discount_price ?? 0;
  const level = (p.level_discount_price ?? 0) * (p.pro_quantity || 0);
  const disc = p.pro_discount_price ?? 0;
  const immediate = Math.max(0, disc - bulk - level);
  const coupon = p.pro_coupon_price ?? 0;
  const bundle = p.pro_bundle_price ?? 0;
  const total = disc + coupon + bundle;
  const after = p.pro_amount_price;
  const items = [
    { label: "즉시할인", v: immediate },
    { label: "등급할인", v: level },
    { label: "대량구매 할인", v: bulk },
    { label: "상품쿠폰", v: coupon },
    { label: "묶음쿠폰", v: bundle },
  ].filter((x) => x.v > 0);
  return { total, before: after + total, after, items };
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

export default function OrderDetailView({ order, dno, pointReward, exchOptionMap, guest = false, reviewTitleEnabled = false }: {
  order: MemberOrder;
  dno: string;
  pointReward: { review: number; review_photo: number };
  exchOptionMap?: Map<number, ExchangeOption[]>;
  guest?: boolean;
  reviewTitleEnabled?: boolean; // 통합 게시판(board_type=1)이면 상품평 제목 입력 노출
}) {
  const optMap = exchOptionMap ?? new Map<number, ExchangeOption[]>();
  const items = (order.items ?? []).filter((it) => String(it.product.dno || it.delivery?.dno || 0) === String(dno));
  const d = items[0]?.delivery;
  const tr = items.find((it) => it.tracking?.tr_state)?.tracking ?? null;
  const lines = toLines(items);
  const lineHasActions = (ln: Line) => {
    const a = ln.main.actions;
    // 배송조회·구매확정·상품평은 회원/비회원(주문조회) 공통. 비회원 주문도 구매확정·상품평 작성 가능.
    return (!!a && (a.can_tracking || a.can_decide || a.can_review) === 1) || ((ln.main.product.pro_review_id ?? 0) > 0);
  };
  const anyActions = lines.some(lineHasActions);
  const isOverseas = !!d?.rec_country;
  const isStoreVisit = Math.floor((d?.del_type ?? 0) / 100) === 4;
  const storeAddr = [d?.del_store_zipcode ? `(${d.del_store_zipcode})` : "", d?.del_store_addr1, d?.del_store_addr2].filter(Boolean).join(" ");
  const delHead = Math.floor((d?.del_type ?? 0) / 100);
  const isDirectMove = delHead === 3;
  const isMove = delHead === 2 || isDirectMove;
  const moveDueDate = isDirectMove ? monthDayOrEmpty(d?.del_dt) : "";
  const canEditReceive = !guest && !!d && !d.del_split && !!d.del_payment && (d.del_state ?? 99) <= 10 && !order.order.ct;
  const goodsTotal = items.reduce((s, it) => s + (it.product.pro_price || 0), 0);
  const deliveryFee = d?.del_price ?? 0;
  const deliveryFeeText = orderDeliveryFee(d?.del_type ?? 0, deliveryFee);
  const buyPoint = items.reduce((s, it) => s + (it.product.pro_point || 0), 0);
  const prodCnt = d?.del_product_cnt || items.filter((it) => isProduct(it.product.item_type)).length || 0;
  const reviewPt = pointReward.review * prodCnt;
  const photoPt = pointReward.review_photo * prodCnt;
  const showPointBox = buyPoint > 0 || reviewPt > 0 || photoPt > 0;
  const discMap = new Map<string, number>();
  let discTotal = 0;
  for (const it of items) {
    const di = discountInfo(it.product);
    discTotal += di.total;
    for (const x of di.items) discMap.set(x.label, (discMap.get(x.label) ?? 0) + x.v);
  }
  const deliveryDiscount = order.order.delivery_coupon_price ?? 0;
  if (deliveryDiscount > 0) {
    discMap.set("배송할인", (discMap.get("배송할인") ?? 0) + deliveryDiscount);
    discTotal += deliveryDiscount;
  }
  const discRows = [...discMap.entries()].filter(([, v]) => v > 0);

  // 회원 전용 액션 대상 계산(비회원은 미사용)
  const decideItems = lines
    .filter((l) => l.main.actions?.can_decide === 1)
    .map((l) => {
      const pp = l.main.product;
      return {
        prno: pp.prno,
        title: pp.products_title || pp.pro_title || "상품",
        option: pp.products_option_type > 0 ? [pp.pro_title, pp.option_name].filter(Boolean).join(" / ") : "",
        thumb: imgUrl(l.main.images?.[0]?.thumb || l.main.images?.[0]?.src),
        quantity: pp.pro_quantity,
      };
    });
  const cancelUnpaid = (order.payment.pay_state ?? 0) < 10;
  const cancelSourceLines = cancelUnpaid ? toLines(order.items ?? []) : lines;
  const cancelLines: CancelLine[] = guest ? [] : cancelSourceLines
    .filter((l) => l.main.actions?.can_cancel === 1)
    .map((l) => {
      const pp = l.main.product;
      return {
        prno: pp.prno,
        title: pp.products_title || pp.pro_title || "상품",
        option: pp.products_option_type > 0 ? [pp.pro_title, pp.option_name].filter(Boolean).join(" / ") : "",
        thumb: imgUrl(l.main.images?.[0]?.thumb || l.main.images?.[0]?.src),
        quantity: pp.pro_quantity,
        price: pp.pro_amount_price,
        addons: l.addons.map((a) => ({
          prno: a.product.prno,
          quantity: a.product.pro_quantity,
          title: [a.product.products_title || a.product.pro_title, a.product.option_name].filter(Boolean).join(" / ") || "추가옵션",
        })),
      };
    });
  const refundLines: RefundLine[] = guest ? [] : lines
    .filter((l) => l.main.actions?.can_refund === 1)
    .map((l) => {
      const pp = l.main.product;
      return {
        prno: pp.prno,
        title: pp.products_title || pp.pro_title || "상품",
        option: pp.products_option_type > 0 ? [pp.pro_title, pp.option_name].filter(Boolean).join(" / ") : "",
        thumb: imgUrl(l.main.images?.[0]?.thumb || l.main.images?.[0]?.src),
        quantity: pp.pro_quantity,
        price: pp.pro_amount_price,
        addons: l.addons.map((a) => ({
          prno: a.product.prno,
          quantity: a.product.pro_quantity,
          title: [a.product.products_title || a.product.pro_title, a.product.option_name].filter(Boolean).join(" / ") || "추가옵션",
        })),
      };
    });
  const exchangeLines: ExchangeLine[] = guest ? [] : lines
    .filter((l) => l.main.actions?.can_exchange === 1)
    .map((l) => {
      const pp = l.main.product;
      return {
        prno: pp.prno,
        title: pp.products_title || pp.pro_title || "상품",
        option: pp.products_option_type > 0 ? [pp.pro_title, pp.option_name].filter(Boolean).join(" / ") : "",
        thumb: imgUrl(l.main.images?.[0]?.thumb || l.main.images?.[0]?.src),
        quantity: pp.pro_quantity,
        price: pp.pro_amount_price,
        products_id: pp.products_id,
        product_id: pp.product_id ?? 0,
        options: pp.products_option_type > 0 ? (optMap.get(pp.products_id) ?? []) : [],
        addons: l.addons.map((a) => ({
          prno: a.product.prno,
          quantity: a.product.pro_quantity,
          title: [a.product.products_title || a.product.pro_title, a.product.option_name].filter(Boolean).join(" / ") || "추가옵션",
        })),
      };
    });
  const some = (k: keyof NonNullable<MemberOrderItem["actions"]>) => lines.some((l) => l.main.actions?.[k] === 1);
  const claimActions = guest ? [] : [
    { key: "view_exchange", label: "교환 진행", on: some("can_view_exchange") },
    { key: "view_refund", label: "반품 진행", on: some("can_view_refund") },
  ].filter((x) => x.on);

  return (
    <div className="space-y-4">
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-text">주문 상세</h1>
        {/* 영수증/전표 — 회원·비회원 공통(구매영수증·세금계산서는 백엔드가 guest 스코프 소유권 검증) */}
        <div className="flex flex-wrap gap-1.5">
          <ReceiptPopupBtn href={`/receipt/${order.payment.pno}`} name="purchase_receipt" width={600} height={900} title="법적효력 없는 참고용 구매영수증입니다.">구매영수증</ReceiptPopupBtn>
          {order.payment.receipt_tax_url && (
            <ReceiptPopupBtn href={`/taxinvoice/${order.payment.pno}`} name="receipt_tax" width={520} height={420}>세금계산서</ReceiptPopupBtn>
          )}
          <ReceiptPopupBtn href={order.payment.pay_bill_url} name="sales_bill" width={600} height={700}>매출전표</ReceiptPopupBtn>
          <ReceiptPopupBtn href={order.payment.pay_receipt_url} name="cash_receipt" width={480} height={700}>현금영수증</ReceiptPopupBtn>
        </div>
      </div>

      <section className="rounded-2xl border border-line bg-card px-5 py-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <Badge tone="muted">{deliveryMethodName(d?.del_type ?? 0)}</Badge>
          {guest ? (
            <span className="text-[13px] font-semibold text-text">주문번호 {dno}</span>
          ) : (
            <Link href={`/order/complete/${order.payment.pno}`} className="text-[13px] font-semibold text-text hover:text-accent">주문번호 {dno}</Link>
          )}
          {d?.del_split === 1 && <Badge tone="active">분할배송</Badge>}
        </div>
        {tr?.tr_state && (
          <p className="mt-2 text-[13px] leading-relaxed text-sub">
            <b className="text-text">{tr.tr_state}</b>{tr.tr_place ? ` · ${tr.tr_place}` : ""}{tr.tr_dt ? ` · ${formatDateTime(tr.tr_dt)}` : ""}
          </p>
        )}
      </section>

      {(order.payment.pay_method === 300 || order.payment.pay_method === 130) && (order.payment.pay_state ?? 0) < 10 && (
        <section className="rounded-2xl border border-accent/40 bg-accent/5 p-5">
          <h2 className="mb-3 text-base font-bold text-text">{order.payment.pay_method === 130 ? "가상계좌 입금정보" : "무통장 입금정보"}</h2>
          <dl className="space-y-2 text-sm">
            <Row left k="입금은행" v={`${order.payment.pay_bank_title || "-"}${order.payment.pay_bank_num ? ` ${order.payment.pay_bank_num}` : ""}`} />
            <Row left k="예금주" v={order.payment.pay_bank_holder || "-"} />
            {order.payment.pay_method === 300 && <Row left k="입금자명" v={order.payment.pay_bank_name || "-"} />}
            <Row left k="입금금액" v={won(order.payment.pay_price)} />
            {order.payment.pay_bank_dt ? <Row left k="입금기한" v={formatDateTime(order.payment.pay_bank_dt)} /> : null}
          </dl>
          <p className="mt-3 text-[12px] text-sub">기한 내 미입금 시 주문이 자동 취소될 수 있습니다.</p>
        </section>
      )}

      <section className="rounded-2xl border border-line bg-card">
        <ul className="divide-y divide-line">
          {lines.map((ln) => {
            const p = ln.main.product;
            const a = ln.main.actions;
            const thumb = imgUrl(ln.main.images?.[0]?.thumb || ln.main.images?.[0]?.src);
            const ps = proStatus(p.pro_state);
            const hasActions = lineHasActions(ln);
            return (
              <li key={p.prno} className="flex flex-col px-0 sm:flex-row sm:items-stretch">
                <div className="flex min-w-0 items-stretch sm:flex-1">
                  <Link href={`/products/${p.products_id}`} className="shrink-0 self-start py-4 pl-4 pr-4 sm:pl-5">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className="h-16 w-16 rounded-lg border border-line object-cover" />
                    ) : <div className="h-16 w-16 rounded-lg border border-line bg-surface" />}
                  </Link>
                  <div className="min-w-0 flex-1 py-4 pr-4">
                    <Badge tone={ps.tone}>{ps.label}</Badge>
                    <Link href={`/products/${p.products_id}`} className="mt-1 line-clamp-2 w-fit text-sm font-semibold text-text hover:text-accent">
                      {p.products_title || p.pro_title || "상품"}
                    </Link>
                    {p.products_option_type > 0 && (p.pro_title || p.option_name) && (
                      <p className="mt-0.5 text-[13px] text-sub">{p.pro_title}{p.option_name ? ` / ${p.option_name}` : ""}</p>
                    )}
                    {ln.addons.length > 0 && <AddonBox addons={ln.addons} className="mr-4 sm:mr-0" />}
                  </div>
                  <div className="flex w-[104px] shrink-0 flex-col items-center justify-center gap-0.5 border-l border-line py-4 text-center sm:w-28 sm:border-l sm:border-r-0">
                    <span className="whitespace-nowrap text-[13px] text-sub">수량 {p.pro_quantity}개</span>
                    {(() => {
                      const di = discountInfo(p);
                      if (di.total <= 0) return <span className="whitespace-nowrap text-sm font-semibold text-text">{won(di.after)}</span>;
                      return (
                        <>
                          <div className="group relative inline-flex items-center gap-1">
                            <span className="whitespace-nowrap text-sm font-semibold text-text">{won(di.after)}</span>
                            <span tabIndex={0} className="grid h-4 w-4 cursor-help place-items-center rounded-full border border-line text-[9px] text-sub">?</span>
                            <div className="pointer-events-none absolute right-0 top-full z-20 mt-1 hidden w-44 rounded-md border border-line bg-card p-2 text-left shadow-lg group-hover:block group-focus-within:block sm:left-1/2 sm:right-auto sm:-translate-x-1/2">
                              <div className="flex justify-between text-[12px] font-semibold text-text">
                                <span>총 할인</span><span className="text-sale">- {won(di.total)}</span>
                              </div>
                              <ul className="mt-1 space-y-0.5 text-[11px] text-sub">
                                {di.items.map((x) => (
                                  <li key={x.label} className="flex justify-between gap-2">
                                    <span>· {x.label}</span><span>- {won(x.v)}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                          <span className="whitespace-nowrap text-[11px] text-sub line-through">{won(di.before)}</span>
                        </>
                      );
                    })()}
                  </div>
                </div>

                {hasActions ? (
                  <div className="flex w-full flex-row flex-wrap items-center justify-center gap-1.5 border-t border-line py-3 sm:w-28 sm:shrink-0 sm:flex-col sm:items-center sm:justify-center sm:border-t-0 sm:border-l sm:border-line sm:py-4">
                    {a?.can_tracking === 1 && (
                      <ReceiptPopupBtn href={`/tracking/product/${p.prno}`} name="tracking" width={480} height={640} className="min-w-[72px] px-3 sm:px-0 border-accent bg-accent/5 text-accent hover:bg-accent/10">배송조회</ReceiptPopupBtn>
                    )}
                    {a?.can_decide === 1 && <PurchaseConfirmButton items={decideItems} />}
                    {a?.can_review === 1 ? (
                      <ReviewWriteButton titleEnabled={reviewTitleEnabled} target={{
                        prno: p.prno,
                        productTitle: p.products_title || p.pro_title || "상품",
                        optionTitle: p.products_option_type > 0 ? [p.pro_title, p.option_name].filter(Boolean).join(" / ") : undefined,
                        thumb,
                      }} />
                    ) : (p.pro_review_id ?? 0) > 0 ? (
                      <span className="min-w-[72px] rounded-md border border-success/30 bg-success/5 px-3 py-1.5 text-center text-[12px] font-medium text-success sm:px-0">리뷰완료</span>
                    ) : null}
                  </div>
                ) : anyActions ? (
                  <div className="hidden sm:block sm:w-28 sm:shrink-0 sm:self-stretch sm:border-l sm:border-line" />
                ) : null}
              </li>
            );
          })}
        </ul>

        {(claimActions.length > 0 || cancelLines.length > 0 || refundLines.length > 0 || exchangeLines.length > 0) && (
          <div className="flex flex-row flex-wrap justify-center gap-2 border-t border-line p-4 sm:p-5">
            {cancelLines.length > 0 && <CancelRequestButton ono={order.order.ono} lines={cancelLines} unpaid={cancelUnpaid} className={claimBtnCls} />}
            {refundLines.length > 0 && <RefundRequestButton ono={order.order.ono} lines={refundLines} className={claimBtnCls} />}
            {exchangeLines.length > 0 && <ExchangeRequestButton ono={order.order.ono} lines={exchangeLines} className={claimBtnCls} />}
            {claimActions.map((x) => (
              <button key={x.key} type="button" title="준비 중" className={claimBtnCls}>
                {x.label}
              </button>
            ))}
          </div>
        )}
      </section>

      {isStoreVisit ? (
        <section className={cardCls}>
          <h2 className="mb-3 text-base font-bold text-text">매장방문 정보</h2>
          <dl className="space-y-2 text-sm">
            {d?.del_store_title && <Row left k="매장 이름" v={d.del_store_title} />}
            {d?.del_store_tel && <Row left k="매장 전화" v={formatPhone(d.del_store_tel) || d.del_store_tel} />}
            {storeAddr && <Row left k="매장 주소" v={storeAddr} />}
            {d?.del_store_content && <Row left k="안내" v={d.del_store_content} />}
            {!d?.del_store_title && !storeAddr && <Row left k="안내" v="매장 정보가 아직 등록되지 않았습니다." />}
          </dl>
        </section>
      ) : (
        <section className={cardCls}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-base font-bold text-text">
              배송지 {isOverseas && <Badge tone="active">해외배송</Badge>}
            </h2>
            {canEditReceive && d && <ReceiveEditButton delivery={d} />}
          </div>
          <dl className="space-y-2 text-sm">
            <Row left k="받는분" v={d?.rec_name || "-"} />
            <Row left k="연락처" v={formatPhone(d?.rec_hp || "") || "-"} />
            {isOverseas ? (
              <>
                <Row left k="국가" v={d?.rec_country || "-"} />
                {d?.rec_postcode ? <Row left k="우편번호" v={d.rec_postcode} /> : null}
                <Row left k="주소" v={[d?.rec_detail, d?.rec_city, d?.rec_state].filter(Boolean).join(", ") || "-"} />
              </>
            ) : (
              <Row left k="주소" v={`(${d?.rec_zipcode || ""}) ${d?.rec_addr1 || ""} ${d?.rec_addr2 || ""}`.trim() || "-"} />
            )}
            {isMove && d?.del_move_title && <Row left k="배송담당" v={d.del_move_title} />}
            {isMove && d?.del_move_hp && <Row left k="담당 연락처" v={formatPhone(d.del_move_hp) || d.del_move_hp} />}
            {isMove && moveDueDate && <Row left k="배송 예정일" v={moveDueDate} />}
            {isMove && d?.del_move_msg && <Row left k="배송 안내" v={d.del_move_msg} />}
            <Row left k="배송메시지" v={d?.del_message || "없음"} />
          </dl>
        </section>
      )}

      <section className={cardCls}>
        <h2 className="mb-3 text-base font-bold text-text">주문자 정보</h2>
        <dl className="space-y-2 text-sm">
          <Row left k="주문자" v={order.order.name || "-"} />
          <Row left k="연락처" v={formatPhone(order.order.hp || "") || "-"} />
          {order.order.email ? <Row left k="이메일" v={order.order.email} /> : null}
        </dl>
      </section>

      <div className={showPointBox ? "grid items-start gap-4 lg:grid-cols-2" : ""}>
        <section className={`${cardCls} min-w-0`}>
          <h2 className="mb-3 text-base font-bold text-text">결제 정보</h2>
          <dl className="space-y-2 text-sm">
            <Row k="상품금액" v={won(goodsTotal)} />
            {discTotal > 0 && (
              <div className="flex justify-between gap-4">
                <dt className="group relative flex shrink-0 items-center gap-1 text-sub">
                  <span>할인금액</span>
                  <span tabIndex={0} className="grid h-4 w-4 cursor-help place-items-center rounded-full border border-line text-[9px] text-sub">?</span>
                  <div className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden w-52 rounded-md border border-line bg-card p-2 text-left shadow-lg group-hover:block group-focus-within:block">
                    <div className="flex justify-between text-[12px] font-semibold text-text">
                      <span>총 할인</span><span className="text-sale">- {won(discTotal)}</span>
                    </div>
                    <ul className="mt-1 space-y-0.5 text-[11px] text-sub">
                      {discRows.map(([label, v]) => (
                        <li key={label} className="flex justify-between gap-2">
                          <span>· {label}</span><span>- {won(v)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </dt>
                <dd className="text-right text-sale">- {won(discTotal)}</dd>
              </div>
            )}
            {(order.payment.pay_point ?? 0) > 0 && <Row k="포인트 사용" v={`- ${won(order.payment.pay_point!)}`} sale />}
            <Row k="배송비" v={deliveryFeeText} />
          </dl>

          <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
            <span className="text-sub">총 결제금액</span>
            <span className="text-xl font-extrabold text-text">{won(order.payment.pay_price)}</span>
          </div>

          <div className="mt-4 border-t border-line pt-3">
            <p className="mb-2 text-[13px] font-semibold text-sub">주문 결제 (전체)</p>
            <dl className="space-y-2 text-sm">
              <Row k="결제수단" v={payMethodLabel(order.payment.pay_method) + (order.payment.pay_card_name ? ` (${order.payment.pay_card_name}${order.payment.pay_card_inst && order.payment.pay_card_inst > 1 ? ` ${order.payment.pay_card_inst}개월` : ""})` : "")} />
              <Row k="결제상태" v={payStateLabel(order.payment.pay_state)} />
              {(order.payment.pay_discount_price ?? 0) > 0 && <Row k="할인" v={`- ${won(order.payment.pay_discount_price!)}`} sale />}
            </dl>
          </div>
        </section>

        {!guest && showPointBox && (
          <section className={`${cardCls} min-w-0`}>
            <h2 className="mb-3 text-base font-bold text-text">포인트 혜택</h2>
            <dl className="space-y-2 text-sm">
              {buyPoint > 0 && <Row k="구매확정 적립" v={`${buyPoint.toLocaleString()} P`} />}
              {reviewPt > 0 && <Row k="상품평 적립" v={`${reviewPt.toLocaleString()} P`} />}
              {photoPt > 0 && <Row k="포토 상품평 적립" v={`${photoPt.toLocaleString()} P`} />}
            </dl>
            <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
              <span className="text-sub">총 최대 혜택</span>
              <span className="text-xl font-extrabold text-accent">{(buyPoint + reviewPt + photoPt).toLocaleString()} P</span>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Row({ k, v, sale, left }: { k: string; v: string; sale?: boolean; left?: boolean }) {
  if (left) {
    return (
      <div className="flex gap-3">
        <dt className="w-24 shrink-0 whitespace-nowrap text-sub">{k}</dt>
        <dd className={`min-w-0 whitespace-pre-wrap break-words ${sale ? "text-sale" : "text-text"}`}>{v}</dd>
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
