import { fetchPrivatePayInit } from "@/lib/prosell";
import PrivatePayCheckout from "@/components/PrivatePayCheckout";
import { DepositView } from "@/components/PrivatePayDeposit";
import PopupCloseButton from "@/components/PopupCloseButton";

export const dynamic = "force-dynamic";

// 개인결제 결제창 팝업 — 공개 URL(로그인/비회원 무관). 결제수단 UI는 주문서(checkout) 참고. 모바일 반응형.
export default async function PrivatePayPopupPage({ params }: { params: Promise<{ ppno: string }> }) {
  const { ppno: raw } = await params;
  const ppno = String(raw).replace(/[^0-9]/g, "");
  const init = await fetchPrivatePayInit(ppno); // 금액/상품/결제수단/은행/사업자정보 일괄

  if (!init) {
    return <Unavailable message="결제 정보를 불러올 수 없습니다. (결제창 번호 또는 결제 상태를 확인해 주세요.)" />;
  }
  if (init.paid) {
    // 무통장/가상계좌 입금대기(pay_state 1)면 입금정보 표기, 완전 결제완료면 안내.
    if (init.bank) return <DepositView bank={init.bank} no={init.no} />;
    return <Unavailable message="이미 결제 완료된 결제창입니다." tone="done" />;
  }

  return <PrivatePayCheckout init={init} />;
}

function Unavailable({ message, tone }: { message: string; tone?: "done" }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center p-8 text-center">
      <div className="w-full rounded-2xl border border-line bg-card p-8">
        <div className={`mx-auto grid h-12 w-12 place-items-center rounded-full text-2xl ${tone === "done" ? "bg-success/15 text-success" : "bg-surface text-sub"}`}>{tone === "done" ? "✓" : "!"}</div>
        <h1 className="mt-3 text-lg font-bold text-text">개인 결제</h1>
        <p className="mt-2 text-[13px] text-sub">{message}</p>
        <div className="mt-5 flex justify-center"><PopupCloseButton /></div>
      </div>
    </div>
  );
}
