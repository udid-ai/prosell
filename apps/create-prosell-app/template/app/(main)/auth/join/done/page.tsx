import { Steps, joinOuterCls, joinContentCls } from "@/components/joinShared";

export const dynamic = "force-dynamic";

// 3단계: 가입 완료
export default async function JoinDonePage({ searchParams }: { searchParams: Promise<{ uid?: string }> }) {
  const { uid } = await searchParams;
  return (
    <div className={joinOuterCls}>
      <div className={joinContentCls}>
      <Steps step={3} />
      <div className="py-6 text-center">
        <div className="text-[44px]">🎉</div>
        <h1 className="mt-3 text-xl">가입이 완료되었습니다</h1>
        <p className="mt-2 text-sm text-sub">
          <b>{uid || ""}</b> 님, 환영합니다.
        </p>
        <a href="/auth/login?joined=1" className="mt-5 block rounded-sm bg-accent py-3 text-center text-[15px] text-accent-foreground">
          로그인하러 가기
        </a>
      </div>
      </div>
    </div>
  );
}
