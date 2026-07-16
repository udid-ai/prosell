import { NextRequest, NextResponse } from "next/server";
import { getToken, updateReview, deleteReview } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 상품평 수정/삭제 — 회원 전용(본인). shop.review_edit 설정 시에만 백엔드가 허용.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken();
  if (!token) return NextResponse.json({ ok: false, error: "회원 로그인이 필요합니다." }, { status: 401 });
  const { id } = await params;
  const rid = Number(id);
  if (!Number.isInteger(rid) || rid <= 0) return NextResponse.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });

  const b = (await req.json().catch(() => ({}))) as { score?: number; content?: string; files?: number[]; title?: string; url?: string; video_url?: string };
  const score = Number(b.score);
  const content = String(b.content ?? "").trim();
  if (!(score >= 1 && score <= 5)) return NextResponse.json({ ok: false, error: "별점을 선택해 주세요." }, { status: 400 });
  if (!content) return NextResponse.json({ ok: false, error: "상품평 내용을 입력해 주세요." }, { status: 400 });
  const files = Array.isArray(b.files) ? b.files.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0) : undefined;
  // 통합 게시판 전용 필드 — 전달됐을 때만(개별 게시판 리뷰는 안 보냄).
  const title = b.title !== undefined ? String(b.title).slice(0, 255) : undefined;
  const url = b.url !== undefined ? String(b.url).trim().slice(0, 255) : undefined;
  const video_url = b.video_url !== undefined ? String(b.video_url).trim().slice(0, 255) : undefined;
  if (video_url && !/^(https?:\/\/)?([\w-]+\.)*(youtube\.com|youtu\.be|vimeo\.com|naver\.com|naver\.me|kakao\.com|instagram\.com)\//i.test(video_url)) {
    return NextResponse.json({ ok: false, error: "동영상 링크는 YouTube, Vimeo, Naver, Kakao, Instagram 만 추가할 수 있습니다." }, { status: 400 });
  }

  const r = await updateReview(token, rid, { score, content, files, title, url, video_url });
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken();
  if (!token) return NextResponse.json({ ok: false, error: "회원 로그인이 필요합니다." }, { status: 401 });
  const { id } = await params;
  const rid = Number(id);
  if (!Number.isInteger(rid) || rid <= 0) return NextResponse.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });

  const r = await deleteReview(token, rid);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
