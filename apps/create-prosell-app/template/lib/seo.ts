import type { Metadata } from "next";

// 사이트명(타이틀 접미사). 환경변수 우선, 없으면 루트 레이아웃과 동일한 기본값.
export const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || "프로셀 AI 스토어";
const DEFAULT_DESC = "프로셀 API 기반 온라인 스토어";

// 프로토콜-상대(//host/...) URL 을 og:image 용 절대 URL 로 보정.
function absUrl(u?: string | null): string | undefined {
  if (!u) return undefined;
  if (u.startsWith("//")) return "https:" + u;
  return u || undefined;
}

// 페이지 공통 SEO 메타데이터 빌더.
//  · title 은 "{페이지} | {사이트명}" 으로 조합(없으면 사이트명만).
//  · description 은 공백 정리 후 160자 컷. keywords/og/twitter/robots 포함.
export function buildMetadata(opts: {
  title?: string | null;
  description?: string | null;
  keywords?: string | null;
  image?: string | null;
  noindex?: boolean;
}): Metadata {
  const t = opts.title ? String(opts.title).trim() : "";
  const title = t ? `${t} | ${SITE_NAME}` : SITE_NAME;
  const description = (opts.description || DEFAULT_DESC).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
  const image = absUrl(opts.image);
  const keywords = opts.keywords ? opts.keywords.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean) : undefined;
  const md: Metadata = {
    title,
    description,
    keywords,
    openGraph: {
      title, description, type: "website", siteName: SITE_NAME,
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title, description, images: image ? [image] : undefined,
    },
    robots: opts.noindex ? { index: false, follow: false } : undefined,
  };
  return md;
}
