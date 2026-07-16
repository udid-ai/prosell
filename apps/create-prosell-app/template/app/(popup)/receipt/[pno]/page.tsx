import { getOrderToken, fetchReceipt, won, payMethodLabel } from "@/lib/prosell";
import { formatDateTime, formatDateTimeSec } from "@/lib/format";
import PrintButton from "@/components/PrintButton";
import PopupCloseButton from "@/components/PopupCloseButton";

export const dynamic = "force-dynamic";

// 구매영수증(법적효력 없는 참고용) 팝업 — 레거시 receipt/order 데이터를 반응형 문서형으로 렌더.
// 주문상세/취소상세의 '구매영수증' 버튼이 window.open 으로 /receipt/{pno} 를 연다.

function maskCard(n: string) {
  const d = n.replace(/\D/g, "");
  if (d.length < 8) return n;
  return `${d.slice(0, 4)}-****-****-${d.slice(-4)}`;
}
function maskHp(n: string) {
  const d = n.replace(/\D/g, "");
  if (d.length < 4) return n;
  return `${d.slice(0, -2)}**`;
}

export default async function ReceiptPage({ params }: { params: Promise<{ pno: string }> }) {
  const token = await getOrderToken();
  const { pno } = await params;
  const data = token ? await fetchReceipt(token, pno) : null;

  if (!data) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center p-8 text-center">
        <div className="w-full rounded-2xl border border-line bg-card p-8">
          <h1 className="text-lg font-bold text-text">구매영수증</h1>
          <p className="mt-3 text-[13px] text-sub">영수증을 불러올 수 없습니다. (로그인 또는 권한을 확인해 주세요.)</p>
          <div className="mt-5 flex justify-center"><PopupCloseButton /></div>
        </div>
      </div>
    );
  }

  const { order, items, totals, payment } = data;
  const cur = order.pay_currency || "KRW";
  const money = (v: number) => (cur === "KRW" ? won(v) : `${v.toLocaleString()} ${cur}`);
  const canceled = order.pay_state === 99;
  const paid = order.pay_state >= 10;

  return (
    <div className="relative mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8 print:p-0">
      {/* 결제취소 마크 — 콘텐츠 기준 상단 32% 위치 고정(스크롤 따라다니지 않음). 레거시 mark-cancel */}
      {canceled && (
        <div className="pointer-events-none absolute left-1/2 top-[32%] z-30 -translate-x-1/2 -translate-y-1/2">
          <span className="inline-block rotate-[-16deg] select-none rounded-2xl border-4 border-sale/70 px-8 py-3 text-4xl font-black tracking-widest text-sale/70 shadow-sm sm:text-5xl">
            결제취소
          </span>
        </div>
      )}
      <div className="overflow-hidden rounded-2xl border border-line bg-card shadow-[0_4px_24px_rgba(0,0,0,0.06)] print:rounded-none print:border-0 print:shadow-none">
        {/* 헤더 */}
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-5 sm:px-7">
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold tracking-tight text-text sm:text-2xl">구매영수증</h1>
            <p className="mt-1 text-[12px] text-sub">법적 효력이 없는 참고용 영수증입니다.</p>
          </div>
          <div className="flex shrink-0 gap-1.5 print:hidden">
            <PrintButton>인쇄</PrintButton>
            <PopupCloseButton>닫기</PopupCloseButton>
          </div>
        </header>

        {/* 주문 정보 */}
        <dl className="grid grid-cols-2 gap-x-5 gap-y-3 border-b border-line px-5 py-4 sm:grid-cols-3 sm:px-7">
          <Meta label="결제번호" value={String(order.pno)} />
          <Meta label="주문번호" value={`${order.dno}${order.delivery_cnt > 1 ? ` 외 ${order.delivery_cnt - 1}건` : ""}`} />
          <Meta label="주문일시" value={formatDateTimeSec(order.dt)} className="col-span-2 sm:col-span-1" />
        </dl>

        {/* 주문상품 */}
        <section className="px-5 py-4 sm:px-7">
          <h2 className="mb-1 text-[12px] font-bold uppercase tracking-wide text-sub">주문상품</h2>
          {items.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-sub">환불된 주문입니다.</p>
          ) : (
            <ul className="divide-y divide-line/70">
              {items.map((it, i) => (
                <li key={i} className="flex items-baseline gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-snug text-text">
                      {it.product_taxfree ? <span className="mr-1 align-middle text-[10px] font-bold text-sale">면세</span> : null}
                      {it.title}
                    </p>
                    {it.sup_title ? <p className="mt-0.5 text-[11px] text-sub">{it.sup_title}</p> : null}
                  </div>
                  <span className="w-10 shrink-0 text-right text-[12px] tabular-nums text-sub">{it.quantity ? `${it.quantity}개` : "-"}</span>
                  <span className="w-24 shrink-0 text-right text-[13px] font-semibold tabular-nums text-text">{money(it.amount_price)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 결제 금액 요약 */}
        <section className="border-t border-line bg-surface/40 px-5 py-4 sm:px-7">
          <dl className="space-y-1.5 text-[13px]">
            {totals.pay_free_price > 0 && <Sum label={totals.pay_tax_price ? "면세 금액" : "상품 금액"} value={money(totals.pay_free_price)} />}
            {totals.pay_tax_price > 0 && (
              <Sum label={totals.pay_free_price ? "과세 금액" : "상품 금액"} value={money(totals.pay_tax_price)}
                sub={totals.pay_vat_price > 0 ? `부가세 ${money(totals.pay_vat_price)} 포함` : undefined} />
            )}
            {totals.delivery_amount_price > 0 && (
              <Sum label="배송비" value={money(totals.delivery_amount_price)}
                sub={totals.delivery_vat_price > 0 ? `부가세 ${money(totals.delivery_vat_price)} 포함` : undefined} />
            )}
            {payment.pay_point > 0 && <Sum label="포인트 사용" value={`- ${payment.pay_point.toLocaleString()} P`} sale />}
          </dl>
          <div className="mt-3 flex items-center justify-between border-t border-dashed border-line pt-3">
            <span className="text-sm font-semibold text-text">총 결제금액</span>
            <span className="text-2xl font-extrabold tabular-nums text-text">{money(payment.pay_price)}</span>
          </div>
        </section>

        {/* 결제 수단 */}
        <section className="border-t border-line px-5 py-4 sm:px-7">
          <h2 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-sub">결제정보</h2>
          <dl className="space-y-2 text-[13px]">
            <Row label="결제일시" value={paid ? formatDateTime(payment.pay_dt) : "입금대기"} />
            <Row label="결제수단" value={payMethodLabel(payment.pay_method)}>
              {(payment.pay_card_name || payment.pay_card_num || payment.pay_mobile_num
                || ((payment.pay_method === 130 || payment.pay_method === 300) && payment.pay_bank_title)) && (
                <div className="mt-0.5 space-y-0.5 text-[12px] text-sub">
                  {payment.pay_card_name && (
                    <div>
                      {payment.pay_card_name}
                      {payment.pay_card_inst ? (payment.pay_card_inst === 1 ? " (일시불)" : ` (${payment.pay_card_inst}개월)`) : ""}
                      {payment.pay_card_num ? ` · ${maskCard(payment.pay_card_num)}` : ""}
                    </div>
                  )}
                  {payment.pay_mobile_num && <div>{maskHp(payment.pay_mobile_num)}</div>}
                  {(payment.pay_method === 130 || payment.pay_method === 300) && payment.pay_bank_title && (
                    <div>{payment.pay_bank_title} {payment.pay_bank_num}{payment.pay_bank_holder ? ` (예금주: ${payment.pay_bank_holder})` : ""}</div>
                  )}
                </div>
              )}
            </Row>
            <Row label="주문금액" value={money(payment.order_amount_price)} />
          </dl>
        </section>

        {/* 안내 */}
        <footer className="border-t border-line px-5 py-4 text-[11px] leading-relaxed text-sub sm:px-7">
          <p>· 본 영수증은 주문내역 확인을 위한 참고용으로 법적 효력이 없습니다.</p>
          <p>· 세금계산서 및 현금영수증은 관련 법령에 따라 별도로 발급됩니다.</p>
        </footer>
      </div>
    </div>
  );
}

function Meta({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={`min-w-0 ${className ?? ""}`}>
      <dt className="text-[11px] text-sub">{label}</dt>
      <dd className="mt-0.5 truncate text-[13px] font-semibold text-text">{value}</dd>
    </div>
  );
}

function Sum({ label, value, sub, sale }: { label: string; value: string; sub?: string; sale?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-sub">
        {label}
        {sub && <span className="ml-1 text-[11px] text-sub/80">({sub})</span>}
      </dt>
      <dd className={`shrink-0 text-right font-medium tabular-nums ${sale ? "text-sale" : "text-text"}`}>{value}</dd>
    </div>
  );
}

function Row({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="w-20 shrink-0 text-sub">{label}</dt>
      <dd className="min-w-0 flex-1 text-right">
        <span className="text-text">{value}</span>
        {children}
      </dd>
    </div>
  );
}
