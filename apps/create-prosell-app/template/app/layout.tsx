import type { ReactNode } from "react";
import localFont from "next/font/local";
import "./globals.css";

// Pretendard 가변폰트(자체 호스팅) — next/font 로 최적화(preload·font-display swap·CLS 방지).
// 가변폰트 1개 파일로 전 weight(45~920) 커버. CSS 변수 --font-pretendard 로 노출 → globals.css --font-sans 에서 사용.
const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  variable: "--font-pretendard",
  display: "swap",
  weight: "45 920",
});

export const metadata = {
  title: "프로셀 AI 스토어",
  description: "프로셀 API 기반 AI 스토어프론트",
};

// 루트 레이아웃 — html/body/공통(폰트·테마·globals)만. 헤더/푸터 등 크롬은 (main) 그룹,
// 영수증 등 팝업은 (popup) 그룹이 각자의 레이아웃으로 담당한다.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className={pretendard.variable} suppressHydrationWarning>
      <head>
        {/* 첫 페인트 전 테마 적용(플래시 방지). 정적 파일 src 참조 —
            인라인 콘텐츠가 없어 React 19 의 «script 태그» 렌더 경고가 나지 않는다. */}
        <script src="/theme-init.js" />
      </head>
      <body className="m-0 bg-bg font-sans text-text antialiased">{children}</body>
    </html>
  );
}
