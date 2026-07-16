import type { ReactNode } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";
import SessionKeeper from "@/components/SessionKeeper";
import ToastHost from "@/components/ToastHost";
import ScrollToTop from "@/components/ScrollToTop";
import { fetchCategories } from "@/lib/prosell";

// (main) — 일반 스토어프론트 크롬(헤더/푸터/모바일 네비). 대부분의 페이지가 여기 속한다.
export default async function MainLayout({ children }: { children: ReactNode }) {
  // Header 와 동일 fetch → 요청 메모이제이션으로 백엔드 호출은 1회. BottomNav(모바일 시트)에 전달.
  const tree = await fetchCategories();

  return (
    <div className="flex min-h-screen flex-col">
      {/* 라우트 이동 시 맨 위로(Chrome 스크롤 복원 보정). 뒤로/앞으로는 복원 유지. */}
      <ScrollToTop />
      {/* 액세스 토큰 클라이언트 선제 갱신(Link 소프트 내비 로그아웃 표시 방지) */}
      <SessionKeeper />
      <ToastHost />
      <Header />
      {/* 페이지 공통 main: 콘텐츠가 짧아도 남는 세로 공간을 채워(flex-1) 푸터를 화면 하단에 고정한다.
          각 페이지는 이 안에서 div 컨테이너만 렌더(페이지당 main 1개 규칙 준수). */}
      <main className="flex-1">{children}</main>
      <Footer />
      {/* 모바일 플로팅 메뉴가 콘텐츠를 가리지 않도록 하단 여백 확보(데스크탑 0) */}
      <div className="pb-safe h-20 md:hidden" aria-hidden />
      <BottomNav tree={tree} />
    </div>
  );
}
