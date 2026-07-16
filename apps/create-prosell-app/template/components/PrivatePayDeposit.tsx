import { won, formatDateTime } from "@/lib/format";
import PopupCloseButton from "@/components/PopupCloseButton";
import type { PrivatePayBank } from "@/lib/prosell";

// 무통장/가상계좌 입금정보 카드 — 주문완료 페이지와 동일 구성(accent 강조).
export function DepositCard({ bank, className = "" }: { bank: PrivatePayBank; className?: string }) {
  const isVirtual = bank.method === 130;
  return (
    <section className={`rounded-2xl border border-accent/40 bg-accent/5 p-5 ${className}`}>
      <h2 className="mb-3 text-base font-bold text-text">{isVirtual ? "가상계좌 입금정보" : "무통장 입금정보"}</h2>
      <dl className="space-y-2 text-sm">
        <Row k="입금 은행" v={`${bank.title}${bank.num ? ` ${bank.num}` : ""}`.trim() || "-"} />
        <Row k="예금주" v={bank.holder || "-"} />
        {bank.method === 300 && bank.sender && <Row k="입금자명" v={bank.sender} />}
        <Row k="입금 금액" v={won(bank.amount)} strong />
        {bank.deadline && <Row k="입금 기한" v={formatDateTime(bank.deadline)} />}
      </dl>
      <p className="mt-3 text-[12px] text-sub">기한 내 미입금 시 결제가 자동 취소될 수 있습니다.</p>
    </section>
  );
}

// 이미 입금대기(무통장/가상계좌) 결제창을 다시 열었을 때의 전체 화면(입금정보 안내).
export function DepositView({ bank, no }: { bank: PrivatePayBank; no: string }) {
  return (
    <div className="mx-auto min-h-screen max-w-md p-5">
      <h1 className="text-lg font-extrabold text-text">개인 결제</h1>
      <section className="mt-4 rounded-2xl border border-line bg-card px-5 py-4">
        <p className="text-[13px] text-sub">아직 입금이 확인되지 않았습니다. 아래 계좌로 입금해 주세요.</p>
        <p className="mt-1 text-[12px] text-sub">결제창번호 {no}</p>
      </section>
      <DepositCard bank={bank} className="mt-4" />
      <div className="mt-5 flex justify-center"><PopupCloseButton /></div>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-sub">{k}</dt>
      <dd className={`text-right ${strong ? "text-base font-bold text-accent" : "text-text"}`}>{v}</dd>
    </div>
  );
}
