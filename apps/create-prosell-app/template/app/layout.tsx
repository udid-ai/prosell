import type { ReactNode } from "react";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";
import { fetchCategories } from "@/lib/prosell";

export const metadata = {
  title: "프로셀 AI 스토어",
  description: "프로셀 API 기반 AI 스토어프론트",
};

// 첫 페인트 전에 테마 클래스를 적용 → 다크모드 깜빡임 방지.
const noFlash = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.classList.add('dark');}catch(e){}})();`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Header 와 동일 fetch → 요청 메모이제이션으로 백엔드 호출은 1회. BottomNav(모바일 시트)에 전달.
  const tree = await fetchCategories();

  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlash }} />
      </head>
      <body className="m-0 bg-bg font-sans text-text antialiased">
        <Header />
        <div className="min-h-[60vh]">{children}</div>
        <Footer />
        {/* 모바일 플로팅 메뉴가 콘텐츠를 가리지 않도록 하단 여백 확보(데스크탑 0) */}
        <div className="pb-safe h-20 md:hidden" aria-hidden />
        <BottomNav tree={tree} />
      </body>
    </html>
  );
}
