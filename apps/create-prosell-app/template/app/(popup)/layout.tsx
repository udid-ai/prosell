import type { ReactNode } from "react";
import { buildMetadata } from "@/lib/seo";

// (popup) — 팝업창 전용(영수증 등). 헤더/푸터 없이 콘텐츠만. 색인 제외.
export const metadata = buildMetadata({ noindex: true });

export default function PopupLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-bg">{children}</div>;
}
