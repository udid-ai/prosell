import Link from "next/link";
import { getToken, fetchMemberExchangeByEno, imgUrl, won, type MemberExchange, type MemberExchangeItem } from "@/lib/prosell";
import { formatDateTime, formatDateTimeSec, formatPhone } from "@/lib/format";
import ReceiptPopupBtn from "@/components/ReceiptPopupBtn";
import ExchangeParcelButton from "@/components/ExchangeParcelButton";
import ExchangeWithdrawButton from "@/components/ExchangeWithdrawButton";
import PrivatePayPayButton from "@/components/PrivatePayPayButton";

export const dynamic = "force-dynamic";

const cardCls = "rounded-md border border-line bg-card p-6";
type Tone = "normal" | "active" | "warn" | "muted";
const isProduct = (t: number) => t === 0 || t === 10;
const RET_COURIER = [1, 7, 8];

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

// 진행상태 안내문 — 레거시 exchange/_lib order_exchange_stblock 대표 문구(M30A~F).
function exchangeStatusText(s: number): string {
  if (s === 1) return "교환접수가 철회되었습니다.";
  if (s === 2) return "교환요청이 거부되었습니다.";
  if (s === 30) return "교환이 완료되었습니다.";
  if (s === 29) return "교환 상품을 재배송하고 있습니다.";
  if (s === 22) return "회수된 상품을 확인하고 교환 상품을 준비하고 있습니다.";
  if (s === 21) return "회수된 상품을 검수하고 있습니다.";
  if (s === 20) return "교환요청 상품을 회수하고 있습니다.";
  return "요청하신 상품의 교환이 접수되었습니다.";
}

// 회수/재배송 수단(레거시 exchange/_lib order_exchange_stblock 분기). 1/7/8=택배, 2=퀵, 3=직접수거, 4=직접방문.
function methodLabel(t: number): string {
  const map: Record<number, string> = { 1: "택배", 2: "퀵서비스", 3: "직접수거", 4: "직접방문", 5: "해외배송", 7: "택배(당일)", 8: "택배(새벽)" };
  return map[t] || "협의";
}

// 직접 회수 예정일 — "M월 D일"(레거시 M30T3 {C}월 {D}일).
function monthDay(v?: string | null): string {
  const m = String(v ?? "").match(/\d{4}-(\d{2})-(\d{2})/);
  return m ? `${Number(m[1])}월 ${Number(m[2])}일` : "-";
}

// 날짜 표기(초 단위) — 0000-00-00/빈값이면 하이픈.
function dateSecOrDash(v?: string | null): string {
  if (!v || v.startsWith("0000")) return "-";
  const s = formatDateTimeSec(v);
  return !s || s.startsWith("0000") ? "-" : s;
}

// 교환 상품 그룹핑 — 레거시 exchange/view.php 처럼 option_group 기준(주문순서 비의존).
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

export default async function ExchangeDetailPage({ params }: { params: Promise<{ eno: string }> }) {
  const token = await getToken();
  if (!token) {
    return (
      <div className={cardCls}>
        <h1 className="text-xl">교환 상세</h1>
        <p className="mt-2 text-sub">로그인이 필요합니다.</p>
        <Link href="/auth/login" className="mt-3 inline-block rounded-sm bg-accent px-4 py-2 text-accent-foreground">로그인</Link>
      </div>
    );
  }
  const { eno } = await params;
  const r = await fetchMemberExchangeByEno(token, eno);

  if (!r) {
    return (
      <div className={cardCls}>
        <h1 className="text-xl">교환 상세</h1>
        <p className="mt-2 text-sub">교환 정보를 찾을 수 없습니다.</p>
        <Link href="/account/exchanges" className="mt-3 inline-block rounded-md border border-line px-4 py-2 text-sm text-text hover:bg-surface">교환 내역으로</Link>
      </div>
    );
  }

  const ex = r.exchange;
  const addr = ex.addressInfo;
  const pay = ex.paymentInfo;
  const st = exchangeStatus(ex.exc_state);
  const lines = toGroups(r.items ?? []);

  // 회수 정보 판정 — 레거시 order_exchange_stblock 회수수단 분기.
  const isRetCourier = RET_COURIER.includes(addr.exc_ret_type);
  const isRetVisit = addr.exc_ret_type === 4;
  const isRetDirect = addr.exc_ret_type === 3;
  const isRetAgent = addr.exc_ret_type === 2 || isRetDirect;
  const canRegisterParcel = isRetCourier && ex.exc_state === 20; // 회수중 + 택배 → 운송장 등록 모달
  const retAddr = [addr.exc_ret_zipcode ? `[${addr.exc_ret_zipcode}]` : "", addr.exc_ret_addr1, addr.exc_ret_addr2].filter(Boolean).join(" ");
  const showRetTracking = isRetCourier && !!addr.exc_ret_num && ex.exc_state < 29; // 회수 단계 배송조회

  // 재배송 정보 판정 — 재배송중(29)~ 또는 재배송 정보가 있을 때 노출.
  const hasRedelivery = ex.exc_state >= 29 || !!addr.exc_del_num || !!addr.exc_del_mtitle || !!addr.exc_del_stitle;
  const isDelCourier = RET_COURIER.includes(addr.exc_del_type);
  const isDelVisit = addr.exc_del_type === 4;
  const isDelAgent = addr.exc_del_type === 2 || addr.exc_del_type === 3;
  const delAddr = [addr.exc_del_zipcode ? `[${addr.exc_del_zipcode}]` : "", addr.exc_del_addr1, addr.exc_del_addr2].filter(Boolean).join(" ");
  const delStoreAddr = [addr.exc_del_store_addr1, addr.exc_del_store_addr2].filter(Boolean).join(" ");
  const showDelTracking = isDelCourier && !!addr.exc_del_num && ex.exc_state >= 29;

  // 개인결제(교환 추가비용) — 미결제(pay_state<10)이고 교환완료(30) 전이면 결제 안내 박스 노출
  const priv = ex.private;
  const showPrivate = !!priv && priv.pay_state < 10 && ex.exc_state !== 30;
  const privMoney = (v: number) => (priv?.pay_currency === "KRW" || !priv?.pay_currency ? won(v) : `${v.toLocaleString()} ${priv?.pay_currency}`);

  return (
    <div className="space-y-4">
      {/* 타이틀 + (우측) 영수증/전표 버튼 */}
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-text">교환 상세</h1>
          <Badge tone="muted">교환</Badge>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <ReceiptPopupBtn href={`/receipt/${ex.pno}`} name="purchase_receipt" width={600} height={900} title="법적효력 없는 참고용 구매영수증입니다.">구매영수증</ReceiptPopupBtn>
          {r.payment?.pay_bill_type ? <ReceiptPopupBtn href={r.payment.pay_bill_url ?? ""} name="pay_bill" width={600} height={700}>매출전표</ReceiptPopupBtn> : null}
          {r.payment?.pay_receipt_no ? <ReceiptPopupBtn href={r.payment.pay_receipt_url ?? ""} name="pay_receipt" width={480} height={700}>현금영수증</ReceiptPopupBtn> : null}
        </div>
      </div>

      {/* 진행상태 안내 */}
      <section className="rounded-2xl border border-line bg-card px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <Badge tone={st.tone}>{st.label}</Badge>
            <span className="text-[13px] font-semibold text-text">교환번호 {ex.eno}</span>
          </div>
          {/* 교환 철회 — 교환접수(exc_state 10) 상태 + 추가결제 미완료일 때만. 레거시 btn_exchange_cancel. */}
          {ex.exc_state === 10 && !(priv && priv.pay_state === 10) && <ExchangeWithdrawButton eno={ex.eno} />}
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-sub">{exchangeStatusText(ex.exc_state)}</p>
      </section>

      {/* 개인결제(교환 추가비용) — 상품 위 별도 강조 박스(레거시 exchange/_lib $data_private). 미결제 시 결제 안내. */}
      {showPrivate && priv && (
        <section className="rounded-2xl border border-accent/40 bg-accent/5 p-5">
          <h2 className="mb-2 text-base font-bold text-text">교환 추가결제 필요</h2>
          <p className="text-[13px] leading-relaxed text-text">
            교환 차액/추가 비용 <b className="text-accent">{privMoney(priv.pay_price)}</b> 결제가 완료되어야 교환이 진행됩니다.
          </p>
          <dl className="mt-3 space-y-2 text-sm">
            {priv.title && <Row left k="결제명" v={`${priv.title} (${priv.private_no})`} />}
            <Row left k="결제금액" v={privMoney(priv.pay_price)} accent />
            <Row left k="결제상태" v="미결제" />
          </dl>
          <div className="mt-4"><PrivatePayPayButton ppno={priv.ppno} /></div>
        </section>
      )}

      {/* 회수 상품 */}
      <ItemSection title="회수 상품" lines={lines} side="s" eno={ex.eno} />

      {/* 교환 상품 */}
      <ItemSection title="교환 상품" lines={lines} side="t" eno={ex.eno} />

      {/* 회수 정보 — 상품 아래 별도 박스. 회수수단/택배사/운송장/회수지 + 택배 회수중 운송장 등록 모달. */}
      <section className={cardCls}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-base font-bold text-text">회수 정보</h2>
          {canRegisterParcel && (
            <ExchangeParcelButton eno={ex.eno} courier={addr.exc_ret_parcel_title} initial={addr.exc_ret_num} />
          )}
        </div>
        <dl className="space-y-2 text-sm">
          <Row left k="회수 방법" v={methodLabel(addr.exc_ret_type)} />
          {isRetVisit ? (
            <>
              {addr.exc_ret_stitle && <Row left k="매장 이름" v={addr.exc_ret_stitle} />}
              {addr.exc_ret_stel && <Row left k="매장 전화" v={formatPhone(addr.exc_ret_stel) || addr.exc_ret_stel} />}
              {addr.exc_ret_store_addr && <Row left k="매장 주소" v={addr.exc_ret_store_addr} />}
              {addr.exc_ret_scontent && <Row left k="안내" v={addr.exc_ret_scontent} />}
            </>
          ) : isRetAgent ? (
            <>
              {addr.exc_ret_mtitle && <Row left k="회수업체" v={addr.exc_ret_mtitle} />}
              {addr.exc_ret_mhp && <Row left k="회수기사 연락처" v={formatPhone(addr.exc_ret_mhp) || addr.exc_ret_mhp} />}
              {isRetDirect && addr.exc_ret_dt1 && <Row left k="회수 예정일" v={monthDay(addr.exc_ret_dt1)} />}
              {addr.exc_ret_name && <Row left k="교환자명" v={addr.exc_ret_name} />}
              {retAddr && <Row left k="수거지" v={retAddr} />}
              {addr.exc_ret_mmsg && <Row left k="회수 메시지" v={addr.exc_ret_mmsg} />}
            </>
          ) : (
            <>
              {isRetCourier && addr.exc_ret_parcel_title && <Row left k="회수 택배사" v={addr.exc_ret_parcel_title} />}
              {showRetTracking && (
                <div className="flex gap-3">
                  <dt className="w-24 shrink-0 whitespace-nowrap text-sub">운송장</dt>
                  <dd className="flex min-w-0 flex-wrap items-center gap-2 break-words text-text">
                    <span>{addr.exc_ret_num}</span>
                    <ReceiptPopupBtn href={`/tracking/exchange/${ex.eno}`} name="tracking" width={480} height={640} className="border-accent bg-accent/5 px-2.5 text-accent hover:bg-accent/10">배송조회</ReceiptPopupBtn>
                  </dd>
                </div>
              )}
              {addr.exc_ret_name && <Row left k="교환자명" v={addr.exc_ret_name} />}
              {addr.exc_ret_hp && <Row left k="연락처" v={formatPhone(addr.exc_ret_hp) || addr.exc_ret_hp} />}
              {retAddr && <Row left k="수거지" v={retAddr} />}
            </>
          )}
        </dl>
        {canRegisterParcel && !addr.exc_ret_num && (
          <p className="mt-3 text-[12px] leading-relaxed text-sub">교환 상품을 회수 택배사로 발송하신 뒤 <b className="text-text">운송장 번호를 등록</b>해 주세요. 검수 완료 후 교환 상품이 재배송됩니다.</p>
        )}
      </section>

      {/* 재배송 정보 — 재배송중~ 또는 재배송 정보가 있을 때. 재배송수단/택배사/운송장/배송지. */}
      {hasRedelivery && (
        <section className={cardCls}>
          <h2 className="mb-3 text-base font-bold text-text">재배송 정보</h2>
          <dl className="space-y-2 text-sm">
            <Row left k="재배송 방법" v={methodLabel(addr.exc_del_type)} />
            {isDelVisit ? (
              <>
                {addr.exc_del_stitle && <Row left k="매장 이름" v={addr.exc_del_stitle} />}
                {addr.exc_del_stel && <Row left k="매장 전화" v={formatPhone(addr.exc_del_stel) || addr.exc_del_stel} />}
                {delStoreAddr && <Row left k="매장 주소" v={delStoreAddr} />}
              </>
            ) : isDelAgent ? (
              <>
                {addr.exc_del_mtitle && <Row left k="배송업체" v={addr.exc_del_mtitle} />}
                {addr.exc_del_mhp && <Row left k="배송기사 연락처" v={formatPhone(addr.exc_del_mhp) || addr.exc_del_mhp} />}
                {addr.exc_del_name && <Row left k="받는분" v={addr.exc_del_name} />}
                {delAddr && <Row left k="배송지" v={delAddr} />}
                {addr.exc_del_mmsg && <Row left k="배송 메시지" v={addr.exc_del_mmsg} />}
              </>
            ) : (
              <>
                {isDelCourier && addr.exc_del_parcel_title && <Row left k="재배송 택배사" v={addr.exc_del_parcel_title} />}
                {showDelTracking && (
                  <div className="flex gap-3">
                    <dt className="w-24 shrink-0 whitespace-nowrap text-sub">운송장</dt>
                    <dd className="flex min-w-0 flex-wrap items-center gap-2 break-words text-text">
                      <span>{addr.exc_del_num}</span>
                      <ReceiptPopupBtn href={`/tracking/exchange/${ex.eno}`} name="tracking" width={480} height={640} className="border-accent bg-accent/5 px-2.5 text-accent hover:bg-accent/10">배송조회</ReceiptPopupBtn>
                    </dd>
                  </div>
                )}
                {addr.exc_del_name && <Row left k="받는분" v={addr.exc_del_name} />}
                {addr.exc_del_hp && <Row left k="연락처" v={formatPhone(addr.exc_del_hp) || addr.exc_del_hp} />}
                {delAddr && <Row left k="배송지" v={delAddr} />}
              </>
            )}
          </dl>
        </section>
      )}

      {/* 교환 정보 + 교환 비용 — 데스크탑(lg) 좌우 2열, 모바일 세로 1열 */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {/* 교환 정보 — 주문/교환 식별 + 사유 */}
        <section className={`${cardCls} min-w-0`}>
          <h2 className="mb-3 text-base font-bold text-text">교환 정보</h2>
          <dl className="space-y-2 text-sm">
            <Row left k="주문일시" v={dateSecOrDash(r.order.dt)} />
            <Row left k="교환 접수일시" v={dateSecOrDash(ex.exc_dt)} />
            <Row left k="주문번호" v={String(r.order.ono)} />
            <Row left k="교환번호" v={String(ex.eno)} />
            <Row left k="교환사유" v={ex.exc_ct || "-"} />
            <Row left k="교환사유 상세" v={ex.exc_content || "-"} />
          </dl>
        </section>

        {/* 교환 비용 — 레거시 exchange/view.php c-group 그대로 */}
        <section className={`${cardCls} min-w-0`}>
          <h2 className="mb-3 text-base font-bold text-text">교환 비용</h2>
          <dl className="space-y-2 text-sm">
            <FeeRow k="상품 회수비용" v={pay.exc_ret_price} pending={pay.exc_ret_price === 0 && ex.exc_state < 20} />
            <FeeRow k="상품 재배송비용" v={pay.exc_del_price} pending={pay.exc_del_price === 0 && ex.exc_state < 20} />
            {pay.exc_deduct_price > 0 && <Row k="기타 공제" v={won(pay.exc_deduct_price)} />}
          </dl>
          <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
            <span className="text-sub">교환 결제금액</span>
            <span className="text-xl font-extrabold text-text">{pay.exc_price === 0 && ex.exc_state < 20 ? "미정" : won(pay.exc_price)}</span>
          </div>
          {ex.exc_state === 30 && ex.exc_confirm_dt && !ex.exc_confirm_dt.startsWith("0000") && (
            <div className="mt-4 border-t border-line pt-3">
              <dl className="space-y-2 text-sm"><Row k="교환 완료일" v={formatDateTime(ex.exc_confirm_dt)} /></dl>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// 회수/교환 상품 리스트 — side "s"(회수, exc_s) | "t"(교환, exc_t). 레거시 exchange/view.php 두 리스트.
function ItemSection({ title, lines, side, eno }: { title: string; lines: Line[]; side: "s" | "t"; eno: number }) {
  return (
    <section className="rounded-2xl border border-line bg-card">
      <div className="border-b border-line px-5 py-3">
        <h2 className="text-sm font-bold text-text">{title}</h2>
      </div>
      <ul className="divide-y divide-line">
        {lines.map((ln) => {
          const xe = ln.main.exchange;
          const thumb = imgUrl((side === "s" ? xe.exc_s_thumb : xe.exc_t_thumb) || undefined);
          const itemTitle = side === "s" ? xe.exc_s_title : xe.exc_t_title;
          const title2 = xe.products_option_type > 0 ? (xe.products_title || itemTitle || "상품") : (itemTitle || xe.products_title || "상품");
          const sub = xe.products_option_type > 0 && itemTitle && itemTitle !== xe.products_title ? itemTitle : "";
          const qty = xe.exc_pro_quantity || ln.main.product.pro_quantity;
          return (
            <li key={xe.epno} className="flex items-stretch px-0">
              <Link href={`/products/${xe.products_id}`} className="shrink-0 self-start py-4 pl-4 pr-4 sm:pl-5">
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt="" className="h-16 w-16 rounded-lg border border-line object-cover" />
                ) : <div className="h-16 w-16 rounded-lg border border-line bg-surface" />}
              </Link>
              <div className="min-w-0 flex-1 py-4 pr-4">
                <Link href={`/products/${xe.products_id}`} className="line-clamp-2 w-fit text-sm font-semibold text-text hover:text-accent">
                  {title2}
                </Link>
                {sub && <p className="mt-0.5 text-[13px] text-sub">{sub}</p>}
                {ln.addons.length > 0 && (
                  // 추가주문옵션 — 교환내역(공통 AddonBox)과 동일 디자인. 회수/교환 사이드별 제목(exc_s/exc_t) 사용.
                  <div className="mr-4 mt-2 rounded-md border border-line bg-surface/50 px-2.5 py-2 text-[12px] text-sub sm:mr-0">
                    <p className="font-semibold text-text/70">추가 주문옵션</p>
                    <ul className="mt-1 space-y-0.5">
                      {ln.addons.map((a) => {
                        const at = (side === "s" ? a.exchange.exc_s_title : a.exchange.exc_t_title) || "추가옵션";
                        const paren: string[] = [];
                        if (a.exchange.exc_pro_price > 0) paren.push(won(a.exchange.exc_pro_price));
                        if (a.exchange.exc_pro_quantity > 1) paren.push(`${a.exchange.exc_pro_quantity}개`);
                        const label = at.replace(/^└\s*/, "") + (paren.length ? ` (${paren.join(" / ")})` : "");
                        return <li key={a.exchange.epno} className="truncate">{label}</li>;
                      })}
                    </ul>
                  </div>
                )}
              </div>
              <div className="flex w-[104px] shrink-0 flex-col items-center justify-center gap-0.5 border-l border-line py-4 text-center sm:w-28">
                <span className="whitespace-nowrap text-[13px] text-sub">수량 {qty}개</span>
                <span className="whitespace-nowrap text-sm font-semibold text-text">{won(xe.exc_amount_price)}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// 교환 접수 단계(exc_state<20)에는 회수/재배송 비용이 아직 확정되지 않아 0원이어도 "미정"으로 표기(레거시 exc_ret_cost/exc_del_cost 미산정).
function FeeRow({ k, v, pending }: { k: string; v: number; pending?: boolean }) {
  return <Row k={k} v={pending ? "미정" : won(v)} />;
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
