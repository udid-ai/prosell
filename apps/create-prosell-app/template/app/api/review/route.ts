import { NextRequest, NextResponse } from "next/server";
import { getOrderToken, submitReview } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 상품평 등록 — 회원(pa_at) 또는 비회원 주문조회(guest gt) 토큰. POST /api/review { prno, score, content, files? }
export async function POST(req: NextRequest) {
  const token = await getOrderToken();
  if (!token) return NextResponse.json({ ok: false, error: "주문 조회 권한이 필요합니다." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { prno?: number; score?: number; content?: string; files?: number[]; title?: string; url?: string; video_url?: string };
  const prno = Number(b.prno);
  const score = Number(b.score);
  const content = String(b.content ?? "").trim();
  const title = String(b.title ?? "").trim().slice(0, 255);
  const url = String(b.url ?? "").trim().slice(0, 255);
  const video_url = String(b.video_url ?? "").trim().slice(0, 255);
  if (!Number.isInteger(prno) || prno <= 0) return NextResponse.json({ ok: false, error: "상품 정보가 올바르지 않습니다." }, { status: 400 });
  if (!(score >= 1 && score <= 5)) return NextResponse.json({ ok: false, error: "별점을 선택해 주세요." }, { status: 400 });
  if (!content) return NextResponse.json({ ok: false, error: "상품평 내용을 입력해 주세요." }, { status: 400 });
  // 동영상 링크 임베드 지원 도메인: youtube/vimeo/naver/kakao(getView) + instagram(/embed iframe).
  if (video_url && !/^(https?:\/\/)?([\w-]+\.)*(youtube\.com|youtu\.be|vimeo\.com|naver\.com|naver\.me|kakao\.com|instagram\.com)\//i.test(video_url)) {
    return NextResponse.json({ ok: false, error: "동영상 링크는 YouTube, Vimeo, Naver, Kakao, Instagram 만 추가할 수 있습니다." }, { status: 400 });
  }
  const files = Array.isArray(b.files) ? b.files.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0) : [];
  const r = await submitReview(token, { prno, score, content, files, title, url, video_url });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, id: r.id });
}
