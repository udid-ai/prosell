import { getOrderToken, fetchTaxinvoice } from "@/lib/prosell";
import CloseButton from "@/components/PopupCloseButton";

export const dynamic = "force-dynamic";

// 세금계산서 발행상태 팝업 — 레거시 receipt/taxinvoice 스킨을 스타터에서 직접 렌더.
// 실물 세금계산서는 전자세금계산서 서비스가 이메일로 발송하므로, 팝업은 발행상태 안내만 표시.

const STATUS: Record<number, { title: string; guide: (email: string) => string }> = {
  0: { title: "세금계산서 발행요청", guide: (e) => `세금계산서는 발행 시 이메일 ${e || "(등록된 이메일)"} 으로 발송됩니다.` },
  1: { title: "세금계산서 발행완료", guide: (e) => `세금계산서는 주문 시 입력하신 이메일 ${e || "(등록된 이메일)"} 에서 확인하실 수 있습니다.` },
  2: { title: "세금계산서 취소완료", guide: (e) => `수정 발행된 세금계산서는 입력하신 이메일 ${e || "(등록된 이메일)"} 에서 확인하실 수 있습니다.` },
};

export default async function TaxinvoicePage({ params }: { params: Promise<{ pno: string }> }) {
  const token = await getOrderToken();
  const { pno } = await params;
  const data = token ? await fetchTaxinvoice(token, pno) : null;

  const notFound = !data || !data.exists;
  const st = data && data.exists ? STATUS[data.state] : undefined;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center p-8 text-center">
      <div className="w-full rounded-2xl border border-line bg-card p-8">
        <h1 className="text-xl font-extrabold text-text">{st ? st.title : "세금계산서"}</h1>
        <p className="mt-4 text-[13px] leading-relaxed text-sub">
          {notFound
            ? "발행된 세금계산서 내역이 없습니다. (로그인 또는 권한을 확인해 주세요.)"
            : st
              ? st.guide(data!.invoicee_email)
              : "발행상태를 확인해 주세요."}
        </p>
        <p className="mt-3 text-[11px] text-sub">· 세금계산서 실물은 전자세금계산서 서비스에서 이메일로 발송됩니다.</p>

        <div className="mt-6 flex justify-center gap-2">
          <CloseButton />
        </div>
      </div>
    </div>
  );
}
