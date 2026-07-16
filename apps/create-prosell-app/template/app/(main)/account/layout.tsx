import AccountSidebar from "@/components/AccountSidebar";
import { buildMetadata } from "@/lib/seo";

// 회원 전용 영역 — 색인 제외(개인 페이지). 하위 account/* 전체에 적용.
export const metadata = buildMetadata({ title: "내 계정", noindex: true });

// 내 계정(account) 공통 레이아웃: 좌측 그룹 메뉴 + 우측 콘텐츠(2단).
//  · 데스크톱(lg): 좌측 고정 사이드바(200px) + 우측 콘텐츠.
//  · 모바일: 상단에 "내 계정 메뉴" 버튼 → 왼쪽 드로어(사이드바 컬럼은 auto 라 버튼 높이만 차지).
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto grid max-w-content gap-4 px-4 py-6 lg:grid-cols-[200px_1fr] lg:gap-8 lg:py-8">
      <AccountSidebar />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
