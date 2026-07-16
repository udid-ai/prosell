import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "데이터 삭제 요청 상태", robots: { index: false } };

// 페이스북 데이터 삭제 상태 안내 페이지 — 삭제 콜백이 돌려준 url({origin}/leave/facebook/{code})의 대상.
// 확인 코드는 무상태(HMAC) 값이라 개인정보를 노출하지 않고, 요청 접수/처리 안내만 제공한다.
export default async function FacebookDeletionStatusPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <div className="mx-auto max-w-content px-4 py-16">
      <div className="mx-auto max-w-[560px] text-center">
        <div className="text-[40px]">🗑️</div>
        <h1 className="mt-3 text-xl font-bold text-text">데이터 삭제 요청이 접수되었습니다</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-sub">
          Facebook 계정 연결 해제에 따른 회원 탈퇴 및 개인정보 삭제 요청이 정상적으로 접수되었습니다.
          <br />
          관련 정보는 관계 법령 및 개인정보 처리방침에 따른 보관 기간이 지나면 파기됩니다.
        </p>
        <div className="mt-5 inline-block rounded-md border border-line bg-surface px-4 py-3 text-[13px] text-text">
          확인 코드 <b className="ml-1 font-mono">{code}</b>
        </div>
        <p className="mt-6 text-[12px] text-sub">
          문의사항은 고객센터로 연락해 주세요.
        </p>
      </div>
    </div>
  );
}
