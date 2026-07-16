import Link from "next/link";
import { getToken, fetchMemberRefundByRno, imgUrl, won, type MemberOrderItem } from "@/lib/prosell";
import { formatDateTime, formatDateTimeSec, formatPhone } from "@/lib/format";
import AddonBox from "@/components/OrderAddonBox";
import ReceiptPopupBtn from "@/components/ReceiptPopupBtn";
import RefundParcelButton from "@/components/RefundParcelButton";
import RefundWithdrawButton from "@/components/RefundWithdrawButton";
import PrivatePayPayButton from "@/components/PrivatePayPayButton";

export const dynamic = "force-dynamic";

const cardCls = "rounded-md border border-line bg-card p-6";
type Tone = "normal" | "active" | "warn" | "muted";
const isProduct = (t: number) => t === 0 || t === 10;

// ref_state: 10~19 반품접수 · 20 회수중 · 21 상품검수 · 22 반품승인 · 30 반품완료. 레거시 refund/_lib REF0~4.
function refundStatus(s: number): { label: string; tone: Tone } {
  if (s === 1) return { label: "반품철회", tone: "muted" };
  if (s === 2) return { label: "반품거절", tone: "muted" };
  if (s === 30) return { label: "반품완료", tone: "muted" };
  if (s === 22) return { label: "반품승인", tone: "active" };
  if (s === 21) return { label: "상품검수", tone: "active" };
  if (s === 20) return { label: "회수중", tone: "active" };
  return { label: "반품접수", tone: "warn" };
}

// 진행상태 안내문 — 레거시 refund/_lib order_refund_stblock 대표 문구(M40A~F).
function refundStatusText(s: number): string {
  if (s === 1) return "반품이 철회되었습니다.";
  if (s === 2) return "반품이 거절되었습니다. 자세한 내용은 고객센터로 문의해 주세요.";
  if (s === 30) return "반품이 완료되었습니다. 결제하신 금액은 결제 수단에 따라 1~7일 내 환불이 완료됩니다.";
  if (s === 21) return "회수된 상품을 검수하고 있습니다.";
  if (s === 20) return "반품요청 상품을 회수하고 있습니다.";
  return "요청하신 상품의 반품이 접수되었습니다.";
}

// 날짜 표기(초 단위) — 0000-00-00/빈값이면 하이픈.
function dateSecOrDash(v?: string | null): string {
  if (!v || v.startsWith("0000")) return "-";
  const s = formatDateTimeSec(v);
  return !s || s.startsWith("0000") ? "-" : s;
}

// ref_ret_type: 회수수단(레거시 refund/_lib order_refund_stblock 분기). 1/7/8=택배, 2=퀵, 3=직접전달, 4=방문수거, 5=해외, else=협의.
function retMethodLabel(t: number): string {
  const map: Record<number, string> = { 1: "택배", 2: "퀵서비스", 3: "직접수거", 4: "직접방문", 5: "해외배송", 7: "택배(당일)", 8: "택배(새벽)" };
  return map[t] || "협의";
}
const RET_COURIER = [1, 7, 8];

// 직접 회수 예정일 — "M월 D일"(레거시 M40T3 {C}월 {D}일).
function monthDay(v?: string | null): string {
  const m = String(v ?? "").match(/\d{4}-(\d{2})-(\d{2})/);
  return m ? `${Number(m[1])}월 ${Number(m[2])}일` : "-";
}

// ref_method: 환불수단(레거시 METHOD_ 라벨).
function refundMethod(m?: number): string {
  const map: Record<number, string> = {
    100: "신용/체크 카드", 101: "카드 수기결제", 110: "휴대폰 소액결제", 120: "실시간 계좌이체", 130: "계좌 환불",
    201: "페이코", 202: "토스", 203: "카카오페이", 204: "네이버페이", 205: "네이버페이", 206: "제로페이", 207: "스마일페이", 208: "ApplePay",
    300: "무통장 입금", 500: "해외카드", 900: "전액 적립금",
  };
  return (m && map[m]) || "-";
}

// 반품 품목 할인 내역 — 레거시 refund/view.php 상품 툴팁 + Member/Refund.php getView 계산식 그대로.
//  총할인 = |ref_pro_discount + ref_pro_coupon + ref_pro_bundle|. 항목:
//   등급할인 = level_discount_price × 반품수량, 대량구매할인 = pro_bulk_discount_price,
//   즉시할인 = 상품할인(ref_pro_discount) − 등급 − 대량, 상품할인 쿠폰 = ref_pro_coupon, 묶음할인 쿠폰 = ref_pro_bundle.
function refundDiscount(p: MemberOrderItem["product"]) {
  const qty = p.ref_pro_quantity ?? p.pro_quantity;
  const disc = Math.abs(p.ref_pro_discount_price ?? 0);
  const level = Math.abs((p.level_discount_price ?? 0) * qty);
  const bulk = Math.abs(p.pro_bulk_discount_price ?? 0);
  const immediate = Math.max(0, disc - level - bulk);
  const coupon = Math.abs(p.ref_pro_coupon_price ?? 0);
  const bundle = Math.abs(p.ref_pro_bundle_price ?? 0);
  const total = disc + coupon + bundle;
  const after = p.ref_pro_amount_price ?? p.pro_amount_price;
  const before = p.ref_pro_price ?? after + total;
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

export default async function RefundDetailPage({ params }: { params: Promise<{ rno: string }> }) {
  const token = await getToken();
  if (!token) {
    return (
      <div className={cardCls}>
        <h1 className="text-xl">반품 상세</h1>
        <p className="mt-2 text-sub">로그인이 필요합니다.</p>
        <Link href="/auth/login" className="mt-3 inline-block rounded-sm bg-accent px-4 py-2 text-accent-foreground">로그인</Link>
      </div>
    );
  }
  const { rno } = await params;
  const r = await fetchMemberRefundByRno(token, rno);

  if (!r) {
    return (
      <div className={cardCls}>
        <h1 className="text-xl">반품 상세</h1>
        <p className="mt-2 text-sub">반품 정보를 찾을 수 없습니다.</p>
        <Link href="/account/refunds" className="mt-3 inline-block rounded-md border border-line px-4 py-2 text-sm text-text hover:bg-surface">반품 내역으로</Link>
      </div>
    );
  }

  const rf = r.refund;
  const addr = rf.addressInfo;
  const pay = rf.paymentInfo;
  const ben = rf.benefitInfo;
  const st = refundStatus(rf.ref_state);
  const lines = toLines(r.items ?? []);
  const done = rf.ref_state === 30;
  const bank = [pay.ref_bank_title, pay.ref_bank_num, pay.ref_bank_holder ? `(${pay.ref_bank_holder})` : ""].filter(Boolean).join(" ");
  // 회수지 주소(국내) — 우편번호 + 주소1 + 주소2
  const retAddr = [addr.ref_ret_zipcode ? `[${addr.ref_ret_zipcode}]` : "", addr.ref_ret_addr1, addr.ref_ret_addr2].filter(Boolean).join(" ");
  const isCourier = RET_COURIER.includes(addr.ref_ret_type);   // 택배류(운송장 등록 대상)
  const isVisit = addr.ref_ret_type === 4;                     // 직접방문(수령 매장·방문 수령지 주소 표시)
  const isDirect = addr.ref_ret_type === 3;                    // 직접수거(회수 예정일)
  const isAgent = addr.ref_ret_type === 2 || isDirect;         // 퀵·직접(회수업체·기사 정보)
  const canRegisterParcel = isCourier && rf.ref_state === 20;  // 회수중 + 택배 → 운송장 등록 모달
  // 개인결제(반품 추가비용) — 미결제(pay_state<10)이고 반품완료(30) 전이면 결제 안내 박스 노출
  const priv = rf.private;
  const showPrivate = !!priv && priv.pay_state < 10 && rf.ref_state !== 30;
  const privMoney = (v: number) => (priv?.pay_currency === "KRW" || !priv?.pay_currency ? won(v) : `${v.toLocaleString()} ${priv?.pay_currency}`);

  // 혜택할인 툴팁 분해 — 레거시 refund/view.php c-group 그대로. 행=혜택할인(ref_benefit_price).
  //  등급/즉시/대량은 품목별(level_discount·ref_pro_discount·pro_bulk)로 합산, 쿠폰·무료배송취소는 반품 단위 값.
  const benefitTotal = Math.abs(ben.ref_benefit_price ?? 0);
  const discMap = new Map<string, number>();
  const add = (label: string, v: number) => { if (v > 0) discMap.set(label, (discMap.get(label) ?? 0) + v); };
  for (const it of r.items ?? []) {
    const pp = it.product;
    const qty = pp.ref_pro_quantity ?? pp.pro_quantity;
    const disc = Math.abs(pp.ref_pro_discount_price ?? 0);
    const level = Math.abs((pp.level_discount_price ?? 0) * qty);
    const bulk = Math.abs(pp.pro_bulk_discount_price ?? 0);
    add("등급할인", level);
    add("즉시할인", Math.max(0, disc - level - bulk));
    add("대량구매 할인", bulk);
  }
  add("상품할인 쿠폰", Math.abs(ben.ref_product_coupon_price ?? 0));
  add("묶음할인 쿠폰", Math.abs(ben.ref_bundle_coupon_price ?? 0));
  add("배송할인 쿠폰", Math.abs(ben.ref_delivery_coupon_price ?? 0));
  add("무료배송 취소", Math.abs(ben.ref_delivery_price ?? 0));
  const discRows = [...discMap.entries()].filter(([, v]) => v > 0);

  return (
    <div className="space-y-4">
      {/* 타이틀 + 반품유형 뱃지(왼쪽) · (우측) 영수증/전표 버튼 */}
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-text">반품 상세</h1>
          <Badge tone="muted">{rf.ref_type === 1 ? "전체반품" : "부분반품"}</Badge>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <ReceiptPopupBtn href={`/receipt/${rf.pno}`} name="purchase_receipt" width={600} height={900} title="법적효력 없는 참고용 구매영수증입니다.">구매영수증</ReceiptPopupBtn>
          {r.payment?.pay_bill_type ? <ReceiptPopupBtn href={r.payment.pay_bill_url ?? ""} name="pay_bill" width={600} height={700}>매출전표</ReceiptPopupBtn> : null}
          {r.payment?.pay_receipt_no ? <ReceiptPopupBtn href={r.payment.pay_receipt_url ?? ""} name="pay_receipt" width={480} height={700}>현금영수증</ReceiptPopupBtn> : null}
        </div>
      </div>

      {/* 진행상태 안내 + (반품접수 상태) 반품철회 버튼 */}
      <section className="rounded-2xl border border-line bg-card px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <Badge tone={st.tone}>{st.label}</Badge>
            <span className="text-[13px] font-semibold text-text">반품번호 {rf.rno}</span>
          </div>
          {/* 반품접수(ref_state 10) 상태에서만 철회 가능 — 레거시 btn_refund_cancel(del_state 80 && ref_state<=10) */}
          {rf.ref_state === 10 && <RefundWithdrawButton rno={rf.rno} />}
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-sub">{refundStatusText(rf.ref_state)}</p>
      </section>

      {/* 개인결제(반품 추가비용) — 상품 위 별도 강조 박스(레거시 refund/_lib $is_private). 미결제 시 결제 안내. */}
      {showPrivate && priv && (
        <section className="rounded-2xl border border-accent/40 bg-accent/5 p-5">
          <h2 className="mb-2 text-base font-bold text-text">반품 추가결제 필요</h2>
          <p className="text-[13px] leading-relaxed text-text">
            반품 회수/추가 비용 <b className="text-accent">{privMoney(priv.pay_price)}</b> 결제가 완료되어야 반품이 진행됩니다.
          </p>
          <dl className="mt-3 space-y-2 text-sm">
            {priv.title && <Row left k="결제명" v={`${priv.title} (${priv.private_no})`} />}
            <Row left k="결제금액" v={privMoney(priv.pay_price)} accent />
            <Row left k="결제상태" v="미결제" />
          </dl>
          <div className="mt-4"><PrivatePayPayButton ppno={priv.ppno} /></div>
        </section>
      )}

      {/* 반품 상품 */}
      <section className="rounded-2xl border border-line bg-card">
        <ul className="divide-y divide-line">
          {lines.map((ln) => {
            const p = ln.main.product;
            const thumb = imgUrl(ln.main.images?.[0]?.thumb || ln.main.images?.[0]?.src);
            const qty = p.ref_pro_quantity ?? p.pro_quantity;
            const di = refundDiscount(p);
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
                {/* 가격셀 — 할인 시 판매가 + 취소선 + 툴팁 */}
                <div className="flex w-[104px] shrink-0 flex-col items-center justify-center gap-0.5 border-l border-line py-4 text-center sm:w-28 sm:border-l sm:border-r-0">
                  <span className="whitespace-nowrap text-[13px] text-sub">수량 {qty}개</span>
                  {di.total <= 0 ? (
                    <span className="whitespace-nowrap text-sm font-semibold text-text">{won(di.after)}</span>
                  ) : (
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

      {/* 수거지 정보 — 상품 아래 별도 박스(주문상세 배송지 박스와 동일 구성). 회수수단/택배사/운송장/회수지 + 택배 회수중 운송장 등록 모달. */}
      <section className={cardCls}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-base font-bold text-text">수거 정보</h2>
          {canRegisterParcel && (
            <RefundParcelButton rno={rf.rno} courier={addr.ref_ret_parcel_title} initial={addr.ref_ret_num} />
          )}
        </div>
        <dl className="space-y-2 text-sm">
          <Row left k="회수 방법" v={retMethodLabel(addr.ref_ret_type)} />
          {isVisit ? (
            <>
              {addr.ref_ret_stitle && <Row left k="매장 이름" v={addr.ref_ret_stitle} />}
              {addr.ref_ret_stel && <Row left k="매장 전화" v={formatPhone(addr.ref_ret_stel) || addr.ref_ret_stel} />}
              {addr.ref_ret_store_addr && <Row left k="매장 주소" v={addr.ref_ret_store_addr} />}
              {addr.ref_ret_scontent && <Row left k="안내" v={addr.ref_ret_scontent} />}
            </>
          ) : isAgent ? (
            <>
              {addr.ref_ret_mtitle && <Row left k="회수업체" v={addr.ref_ret_mtitle} />}
              {addr.ref_ret_mhp && <Row left k="회수기사 연락처" v={formatPhone(addr.ref_ret_mhp) || addr.ref_ret_mhp} />}
              {isDirect && addr.ref_ret_dt1 && <Row left k="회수 예정일" v={monthDay(addr.ref_ret_dt1)} />}
              {addr.ref_ret_name && <Row left k="반품자명" v={addr.ref_ret_name} />}
              {retAddr && <Row left k="수거지" v={retAddr} />}
              {addr.ref_ret_mmsg && <Row left k="회수 메시지" v={addr.ref_ret_mmsg} />}
            </>
          ) : (
            <>
              {isCourier && addr.ref_ret_parcel_title && <Row left k="회수 택배사" v={addr.ref_ret_parcel_title} />}
              {isCourier && addr.ref_ret_num && (
                <div className="flex gap-3">
                  <dt className="w-24 shrink-0 whitespace-nowrap text-sub">운송장</dt>
                  <dd className="flex min-w-0 flex-wrap items-center gap-2 break-words text-text">
                    <span>{addr.ref_ret_num}</span>
                    <ReceiptPopupBtn href={`/tracking/refund/${rf.rno}`} name="tracking" width={480} height={640} className="border-accent bg-accent/5 px-2.5 text-accent hover:bg-accent/10">배송조회</ReceiptPopupBtn>
                  </dd>
                </div>
              )}
              {addr.ref_ret_name && <Row left k="반품자명" v={addr.ref_ret_name} />}
              {addr.ref_ret_hp && <Row left k="연락처" v={formatPhone(addr.ref_ret_hp) || addr.ref_ret_hp} />}
              {retAddr && <Row left k="수거지" v={retAddr} />}
            </>
          )}
        </dl>
        {canRegisterParcel && !addr.ref_ret_num && (
          <p className="mt-3 text-[12px] leading-relaxed text-sub">반품 상품을 회수 택배사로 발송하신 뒤 <b className="text-text">운송장 번호를 등록</b>해 주세요. 검수 완료 후 환불이 진행됩니다.</p>
        )}
      </section>

      {/* 반품 정보 + 환불 정보 — 데스크탑(lg) 좌우 2열, 모바일 세로 1열 */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
      {/* 반품 정보 — 주문/반품 식별 + 회수지 + 사유 */}
      <section className={`${cardCls} min-w-0`}>
        <h2 className="mb-3 text-base font-bold text-text">반품 정보</h2>
        <dl className="space-y-2 text-sm">
          <Row left k="주문일시" v={dateSecOrDash(r.order.dt)} />
          <Row left k="반품 접수일시" v={dateSecOrDash(rf.ref_dt)} />
          <Row left k="주문번호" v={String(r.order.ono)} />
          <Row left k="반품번호" v={String(rf.rno)} />
          <Row left k="반품사유" v={rf.ref_ct || "-"} />
          <Row left k="반품사유 상세" v={rf.ref_content || "-"} />
        </dl>
      </section>

      {/* 환불 정보 — 레거시 refund/view.php c-group 그대로 */}
      <section className={`${cardCls} min-w-0`}>
        <h2 className="mb-3 text-base font-bold text-text">
          환불 정보
          {!done && <span className="ml-1.5 text-[12px] font-normal text-sub">(예정)</span>}
        </h2>
        <dl className="space-y-2 text-sm">
          {ben.ref_amt_pro_price > 0 && <Row k="반품 상품/옵션" v={won(ben.ref_amt_pro_price)} />}
          {/* 혜택 할인 — 값=ref_benefit_price, ? 호버 시 등급/즉시/대량/쿠폰/무료배송 분해 툴팁 */}
          {(benefitTotal > 0 || discRows.length > 0) && (
            <div className="flex justify-between gap-4">
              <dt className="group relative flex shrink-0 items-center gap-1 text-sub">
                <span>할인취소 합계</span>
                <span tabIndex={0} className="grid h-4 w-4 cursor-help place-items-center rounded-full border border-line text-[9px] text-sub">?</span>
                <div className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden w-52 rounded-md border border-line bg-card p-2 text-left shadow-lg group-hover:block group-focus-within:block">
                  <div className="flex justify-between text-[12px] font-semibold text-text">
                    <span>할인취소 합계</span><span className="text-sale">- {won(benefitTotal)}</span>
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
          {/* 상품 배송비용 — 금액 있으면 표시, 협의(ref_del_cost==0·금액0·회수 전)면 "협의 후 결정" (레거시 view.php) */}
          {pay.ref_del_price !== 0
            ? <Row k="상품 배송비용" v={pay.ref_del_price < 0 ? `- ${won(Math.abs(pay.ref_del_price))}` : won(pay.ref_del_price)} sale={pay.ref_del_price < 0} />
            : (pay.ref_del_cost === 0 && rf.ref_state < 20 ? <Row k="상품 배송비용" v="협의 후 결정" /> : null)}
          {pay.ref_ret_price !== 0
            ? <Row k="상품 회수비용" v={pay.ref_ret_price < 0 ? `- ${won(Math.abs(pay.ref_ret_price))}` : won(pay.ref_ret_price)} sale={pay.ref_ret_price < 0} />
            : (pay.ref_ret_cost === 0 && rf.ref_state < 20 ? <Row k="상품 회수비용" v="협의 후 결정" /> : null)}
          {pay.ref_deduct_price !== 0 && <Row k="기타 공제" v={pay.ref_deduct_price < 0 ? `- ${won(Math.abs(pay.ref_deduct_price))}` : won(pay.ref_deduct_price)} sale={pay.ref_deduct_price < 0} />}
          {pay.ref_point > 0 && <Row k="반환 적립금" v={`${pay.ref_point.toLocaleString()} P`} />}
        </dl>

        <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
          <span className="text-sub">환불 예정액</span>
          <span className="text-xl font-extrabold text-sale">{won(pay.ref_price)}</span>
        </div>

        {/* 환불 수단 — 레거시 type-method. 수단 라벨 + 계좌(계좌환불) + 완료일 */}
        <div className="mt-4 border-t border-line pt-3">
          <dl className="space-y-2 text-sm">
            <Row k="환불 수단" v={refundMethod(pay.ref_method || r.payment?.pay_method)} />
            {bank && <Row k="환불 계좌" v={bank} />}
            {done && rf.ref_confirm_dt && !rf.ref_confirm_dt.startsWith("0000") && <Row k="환불 완료일" v={formatDateTime(rf.ref_confirm_dt)} />}
          </dl>
        </div>
      </section>
      </div>
    </div>
  );
}

function Row({ k, v, left, sale, accent }: { k: string; v: string; left?: boolean; sale?: boolean; accent?: boolean }) {
  const valueCls = accent ? "font-bold text-accent" : sale ? "text-sale" : "text-text";
  if (left) {
    return (
      <div className="flex gap-3">
        <dt className="w-24 shrink-0 whitespace-nowrap text-sub">{k}</dt>
        <dd className={`min-w-0 whitespace-pre-wrap break-words ${valueCls}`}>{v}</dd>
      </div>
    );
  }
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-sub">{k}</dt>
      <dd className={`text-right ${valueCls}`}>{v}</dd>
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: Tone }) {
  const cls = tone === "active" ? "bg-accent/10 text-accent" : tone === "warn" ? "bg-sale/10 text-sale" : tone === "muted" ? "bg-line text-sub" : "bg-success/10 text-success";
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-bold ${cls}`}>{children}</span>;
}
