import Link from "next/link";
import { getToken, fetchMemberPrivatePays, won, type MemberPrivatePay } from "@/lib/prosell";
import { formatDateTime, htmlToText } from "@/lib/format";
import PrivatePayPayButton from "@/components/PrivatePayPayButton";
import ReceiptPopupBtn from "@/components/ReceiptPopupBtn";

export const dynamic = "force-dynamic";

const cardCls = "rounded-md border border-line bg-card p-6";
type Tone = "normal" | "active" | "warn" | "muted";

// pay_state: 0 미결제 · 1 입금대기 · 10 결제완료 · 90 취소접수 · 99 취소완료. 레거시 private_pay_state_text.
function payTone(s: number): Tone {
  if (s === 10) return "active";
  if (s === 99) return "muted";
  if (s === 90) return "warn";
  return "warn"; // 0·1 결제 전
}
const isUnpaid = (s: number) => s < 10; // 결제 전(결제하기 노출)

export default async function PrivatePayPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const token = await getToken();
  if (!token) {
    return (
      <div className={cardCls}>
        <h1 className="text-xl">개인 결제</h1>
        <p className="mt-2 text-sub">로그인이 필요합니다.</p>
        <Link href="/auth/login" className="mt-3 inline-block rounded-sm bg-accent px-4 py-2 text-accent-foreground">로그인</Link>
      </div>
    );
  }

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const limit = 10;
  const { items, total_count, total_page } = await fetchMemberPrivatePays(token, { page, limit });
  const waitCount = items.filter((it) => isUnpaid(it.pay_state)).length;

  return (
    <div className="space-y-4">
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-bold text-text">
          개인 결제
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-1.5 text-[12px] font-bold text-accent-foreground">{total_count}</span>
        </h1>
      </div>

      {/* 안내 — 미결제 건 존재 시 강조 */}
      <div className="rounded-md border border-line bg-card px-5 py-3 text-[13px] text-sub">
        {waitCount > 0
          ? <><b className="text-accent">결제 대기 {waitCount}건</b>이 있습니다. 결제하기 버튼으로 결제를 완료해 주세요.</>
          : "발급된 개인 결제창 내역입니다."}
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-line bg-card p-12 text-center text-sub">개인 결제 내역이 없습니다.</div>
      ) : (
        <ul className="space-y-4">
          {items.map((it) => <PrivatePayCard key={it.ppno} it={it} />)}
        </ul>
      )}

      {total_page > 1 && (
        <nav className="flex items-center justify-center gap-1 pt-2">
          {Array.from({ length: total_page }).map((_, i) => {
            const p = i + 1;
            return (
              <Link key={p} href={`/account/privatepay?page=${p}`}
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

function PrivatePayCard({ it }: { it: MemberPrivatePay }) {
  const tone = payTone(it.pay_state);
  const money = it.pay_currency && it.pay_currency !== "KRW" ? `${it.pay_price.toLocaleString()} ${it.pay_currency}` : won(it.pay_price);
  // 발급완료(pay_state 0)는 결제 전이므로 "결제대기"로 표기. 그 외는 API 상태 텍스트.
  const stateLabel = it.pay_state === 0 ? "결제대기" : (it.pay_state_text || "처리중");
  // 주문 연동(dno) 개인결제면 결제내용 대신 상품명 표기, 아니면 결제내용(<br> 등 개행 처리).
  const desc = it.dno && it.product_title ? it.product_title : htmlToText(it.content);
  return (
    <li className="overflow-hidden rounded-2xl border border-line bg-card">
      {/* 헤더: 결제상태 뱃지 + 개인결제번호 + 발급일 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface/60 px-5 py-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <Badge tone={tone}>{stateLabel}</Badge>
          <span className="text-[13px] font-semibold text-text">{it.no}</span>
        </div>
        <span className="text-[13px] text-sub">{formatDateTime(it.dt)}</span>
      </div>

      {/* 본문: (좌) 결제명/유형·내용·금액  (우) 버튼만, 세로 가운데 정렬 */}
      <div className="flex items-center gap-4 px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-semibold text-text">
            <span className="truncate">{it.title || it.ct_text || "개인 결제"}</span>
            {it.ct_text && <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-[11px] font-normal text-sub">{it.ct_text}</span>}
          </p>
          {desc && <p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-sub">{desc}</p>}
          {it.pay_method_text && it.pay_state >= 10 && <p className="mt-1 text-[12px] text-sub">결제수단 · {it.pay_method_text}{it.pay_dt ? ` · ${formatDateTime(it.pay_dt)}` : ""}</p>}
          <p className="mt-2 text-lg font-extrabold text-text">{money}</p>
        </div>
        <div className="flex shrink-0 flex-col items-stretch justify-center gap-1.5">
          {isUnpaid(it.pay_state) && <PrivatePayPayButton ppno={it.ppno} label={it.pay_state === 1 ? "입금정보" : "결제하기"} />}
          {it.pay_state >= 10 && (
            <ReceiptPopupBtn href={`/receipt/private/${it.ppno}`} name="private_receipt" width={600} height={800} full>구매영수증</ReceiptPopupBtn>
          )}
          {it.pay_bill_type && it.pay_bill_url ? (
            <ReceiptPopupBtn href={it.pay_bill_url} name="pay_bill" width={600} height={700} full>매출전표</ReceiptPopupBtn>
          ) : null}
          {it.pay_receipt_no && it.pay_receipt_url ? (
            <ReceiptPopupBtn href={it.pay_receipt_url} name="pay_receipt" width={480} height={700} full>현금영수증</ReceiptPopupBtn>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: Tone }) {
  const cls = tone === "active" ? "bg-accent/10 text-accent" : tone === "warn" ? "bg-sale/10 text-sale" : tone === "muted" ? "bg-line text-sub" : "bg-success/10 text-success";
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-bold ${cls}`}>{children}</span>;
}
