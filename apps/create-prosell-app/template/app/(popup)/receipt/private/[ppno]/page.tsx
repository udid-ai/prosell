import { getToken, fetchPrivatePayReceipt, won } from "@/lib/prosell";
import { formatDateTime, formatDateTimeSec } from "@/lib/format";
import PrintButton from "@/components/PrintButton";
import PopupCloseButton from "@/components/PopupCloseButton";
import ReceiptPopupBtn from "@/components/ReceiptPopupBtn";

export const dynamic = "force-dynamic";

// 개인결제 구매영수증(참고용) 팝업 — 주문 구매영수증(/receipt/[pno])과 동일한 문서형 패턴.
// 레거시 member/private/purchase 데이터를 반응형 문서로 렌더.

function maskHp(n: string) {
  const d = n.replace(/\D/g, "");
  if (d.length < 4) return n;
  return `${d.slice(0, -2)}**`;
}

export default async function PrivateReceiptPage({ params }: { params: Promise<{ ppno: string }> }) {
  const token = await getToken();
  const { ppno } = await params;
  const data = token ? await fetchPrivatePayReceipt(token, ppno.replace(/[^0-9]/g, "")) : null;

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

  const cur = data.pay_currency || "KRW";
  const money = (v: number) => (cur === "KRW" ? won(v) : `${v.toLocaleString()} ${cur}`);
  const canceled = data.pay_state === 99;
  const paid = data.pay_state >= 10;
  const taxPrice = data.pay_price - (data.pay_vat_price || 0); // 공급가

  return (
    <div className="relative mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8 print:p-0">
      {/* 결제취소 마크 — 콘텐츠 기준 상단 32% 위치 고정. 레거시 mark-cancel */}
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
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5 print:hidden">
            {data.pay_bill_type && data.pay_bill_url ? (
              <ReceiptPopupBtn href={data.pay_bill_url} name="pay_bill" width={600} height={700}>매출전표</ReceiptPopupBtn>
            ) : null}
            {data.pay_receipt_no && data.pay_receipt_url ? (
              <ReceiptPopupBtn href={data.pay_receipt_url} name="pay_receipt" width={480} height={700}>현금영수증</ReceiptPopupBtn>
            ) : null}
            <PrintButton>인쇄</PrintButton>
            <PopupCloseButton>닫기</PopupCloseButton>
          </div>
        </header>

        {/* 식별 정보 */}
        <dl className="grid grid-cols-2 gap-x-5 gap-y-3 border-b border-line px-5 py-4 sm:grid-cols-3 sm:px-7">
          <Meta label="결제창번호" value={data.no} />
          {data.dno ? <Meta label="주문번호" value={String(data.dno)} /> : null}
          <Meta label="발급일시" value={formatDateTimeSec(data.dt)} className={data.dno ? "col-span-2 sm:col-span-1" : ""} />
        </dl>

        {/* 결제상품 */}
        <section className="px-5 py-4 sm:px-7">
          <h2 className="mb-1 text-[12px] font-bold uppercase tracking-wide text-sub">결제상품</h2>
          <ul className="divide-y divide-line/70">
            <li className="flex items-baseline gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-snug text-text">{data.ct_text || "개인 결제"}</p>
              </div>
              <span className="w-24 shrink-0 text-right text-[13px] font-semibold tabular-nums text-text">{money(data.pay_price)}</span>
            </li>
          </ul>
        </section>

        {/* 결제 금액 요약 */}
        <section className="border-t border-line bg-surface/40 px-5 py-4 sm:px-7">
          <dl className="space-y-1.5 text-[13px]">
            {data.pay_vat_price > 0 ? (
              <>
                <Sum label="공급가액" value={money(taxPrice)} />
                <Sum label="부가세" value={money(data.pay_vat_price)} />
              </>
            ) : (
              <Sum label="결제 상품금액" value={money(data.pay_price)} />
            )}
          </dl>
          <div className="mt-3 flex items-center justify-between border-t border-dashed border-line pt-3">
            <span className="text-sm font-semibold text-text">총 결제금액</span>
            <span className="text-2xl font-extrabold tabular-nums text-text">{money(data.pay_price)}</span>
          </div>
        </section>

        {/* 결제 정보 */}
        <section className="border-t border-line px-5 py-4 sm:px-7">
          <h2 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-sub">결제정보</h2>
          <dl className="space-y-2 text-[13px]">
            <Row label="결제상태" value={canceled ? "결제취소" : paid ? "결제완료" : data.pay_state === 1 ? "입금대기" : "미결제"} />
            <Row label="결제일시" value={paid && data.pay_dt ? formatDateTime(data.pay_dt) : "-"} />
            <Row label="결제수단" value={data.pay_method_text || "-"}>
              {(data.pay_card_name || data.pay_card_num || data.pay_mobile_num || data.bank) && (
                <div className="mt-0.5 space-y-0.5 text-[12px] text-sub">
                  {data.pay_card_name && (
                    <div>
                      {data.pay_card_name}
                      {data.pay_card_inst ? (data.pay_card_inst === 1 ? " (일시불)" : ` (${data.pay_card_inst}개월)`) : ""}
                      {data.pay_card_num ? ` · ${data.pay_card_num}` : ""}
                    </div>
                  )}
                  {data.pay_mobile_num && <div>{maskHp(data.pay_mobile_num)}</div>}
                  {data.bank && (
                    <div>{data.bank.title}{data.bank.num ? ` ${data.bank.num}` : ""}{data.bank.holder ? ` (예금주: ${data.bank.holder})` : ""}</div>
                  )}
                </div>
              )}
            </Row>
          </dl>
        </section>

        {/* 안내 */}
        <footer className="border-t border-line px-5 py-4 text-[11px] leading-relaxed text-sub sm:px-7">
          <p>· 본 영수증은 결제내역 확인을 위한 참고용으로 법적 효력이 없습니다.</p>
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

function Sum({ label, value, sale }: { label: string; value: string; sale?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-sub">{label}</dt>
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
