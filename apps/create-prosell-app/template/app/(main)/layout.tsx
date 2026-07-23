import type { ReactNode } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";
import SessionKeeper from "@/components/SessionKeeper";
import ToastHost from "@/components/ToastHost";
import ScrollToTop from "@/components/ScrollToTop";
import { fetchCategories, fetchFooter } from "@/lib/prosell";

// 모바일 하단 네비의 데이터 셸 — 카테고리 대기를 이 서브트리에만 가둔다.
// (레이아웃 본체에서 await 하면 그 동안 children=페이지 렌더가 통째로 멈춘다)
async function BottomNavShell() {
  const tree = await fetchCategories();
  return <BottomNav tree={tree} />;
}

// (main) — 일반 스토어프론트 크롬(헤더/푸터/모바일 네비). 대부분의 페이지가 여기 속한다.
export default function MainLayout({ children }: { children: ReactNode }) {
  // 공용 데이터 왕복을 «미리 병렬로» 시작만 하고 기다리지 않는다(레이아웃 본체는 동기).
  //  · 예전엔 여기서 카테고리를 await → 그 뒤에야 Header 가 푸터를 조회하고, 페이지 조회까지 뒤로 밀렸다.
  //  · 두 함수 모두 React cache() 로 요청당 1회라, Header/Footer/BottomNavShell 이 각자 다시 불러도
  //    여기서 시작해둔 같은 요청을 그대로 받는다. → 카테고리·푸터·페이지 조회가 모두 동시에 진행.
  //  · catch 는 «대기 전 거부» 로 인한 unhandled rejection 방어용(두 함수는 자체 try/catch 로 폴백을 돌려준다).
  void fetchCategories().catch(() => {});
  void fetchFooter().catch(() => {});

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
      <BottomNavShell />
    </div>
  );
}
