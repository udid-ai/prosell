import { buildMetadata } from "@/lib/seo";

// 거래/인증 영역 — 색인 제외(noindex).
export const metadata = buildMetadata({ noindex: true });

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
