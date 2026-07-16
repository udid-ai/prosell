import { NextRequest, NextResponse } from "next/server";
import { getToken, submitInquiry, updateInquiry, deleteInquiry } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 동영상 링크 임베드 지원 도메인(리뷰와 동일): youtube/vimeo/naver/kakao + instagram.
const VIDEO_RE = /^(https?:\/\/)?([\w-]+\.)*(youtube\.com|youtu\.be|vimeo\.com|naver\.com|naver\.me|kakao\.com|instagram\.com)\//i;

function normUrl(v: unknown): string { return String(v ?? "").trim().slice(0, 255); }

// 상품문의 등록 — 회원(토큰) 또는 비회원(이름/비밀번호). POST /api/inquiry
export async function POST(req: NextRequest) {
  const token = await getToken();
  const b = (await req.json().catch(() => ({}))) as { product_id?: number; title?: string; content?: string; secret?: number; send_phone?: number; send_email?: number; url?: string; video_url?: string; name?: string; upw?: string; category?: string; files?: number[]; recaptcha?: string };
  const product_id = Number(b.product_id);
  const title = String(b.title ?? "").trim().slice(0, 100);
  const content = String(b.content ?? "").trim().slice(0, 2000);
  const url = normUrl(b.url);
  const video_url = normUrl(b.video_url);
  if (!Number.isInteger(product_id) || product_id <= 0) return NextResponse.json({ ok: false, error: "상품 정보가 올바르지 않습니다." }, { status: 400 });
  if (!title) return NextResponse.json({ ok: false, error: "제목을 입력해 주세요." }, { status: 400 });
  if (!content) return NextResponse.json({ ok: false, error: "문의 내용을 입력해 주세요." }, { status: 400 });
  if (video_url && !VIDEO_RE.test(video_url)) return NextResponse.json({ ok: false, error: "동영상 링크는 YouTube, Vimeo, Naver, Kakao, Instagram 만 추가할 수 있습니다." }, { status: 400 });
  // 비회원: 이름/비밀번호 필수(백엔드도 검증, cs_level_write 로 최종 게이트)
  const name = String(b.name ?? "").trim().slice(0, 20);
  const upw = String(b.upw ?? "").slice(0, 100);
  if (!token) {
    if (!name) return NextResponse.json({ ok: false, error: "작성자명을 입력해 주세요." }, { status: 400 });
    if (!upw) return NextResponse.json({ ok: false, error: "비밀번호를 입력해 주세요." }, { status: 400 });
  }
  const category = String(b.category ?? "").trim().slice(0, 100);
  const files = Array.isArray(b.files) ? b.files.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0) : [];
  const recaptcha = String(b.recaptcha ?? "");
  const r = await submitInquiry(token, { product_id, title, content, secret: b.secret ? 1 : 0, send_phone: b.send_phone ? 1 : 0, send_email: b.send_email ? 1 : 0, url, video_url, name, upw, category, files, recaptcha });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, id: r.id });
}

// 상품문의 수정 — 회원(토큰) 또는 비회원(비밀번호 upw). PUT /api/inquiry
export async function PUT(req: NextRequest) {
  const token = await getToken();
  const b = (await req.json().catch(() => ({}))) as { id?: number; product_id?: number; title?: string; content?: string; secret?: number; url?: string; video_url?: string; category?: string; files?: number[]; upw?: string; send_phone?: number; send_email?: number };
  const id = Number(b.id);
  const title = String(b.title ?? "").trim().slice(0, 100);
  const content = String(b.content ?? "").trim().slice(0, 2000);
  const url = normUrl(b.url);
  const video_url = normUrl(b.video_url);
  const upw = String(b.upw ?? "");
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "문의 정보가 올바르지 않습니다." }, { status: 400 });
  if (!token && !upw) return NextResponse.json({ ok: false, error: "비밀번호를 입력해 주세요." }, { status: 400 });
  if (!title) return NextResponse.json({ ok: false, error: "제목을 입력해 주세요." }, { status: 400 });
  if (!content) return NextResponse.json({ ok: false, error: "문의 내용을 입력해 주세요." }, { status: 400 });
  if (video_url && !VIDEO_RE.test(video_url)) return NextResponse.json({ ok: false, error: "동영상 링크는 YouTube, Vimeo, Naver, Kakao, Instagram 만 추가할 수 있습니다." }, { status: 400 });
  const category = String(b.category ?? "").trim().slice(0, 100);
  const files = Array.isArray(b.files) ? b.files.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0) : [];
  const product_id = Number(b.product_id) > 0 ? Number(b.product_id) : undefined;
  // 답변 알림은 «회원»만 — 값이 온 경우에만 전달(비회원 수정 경로는 서버에서도 무시).
  const notify = token && (b.send_phone !== undefined || b.send_email !== undefined)
    ? { send_phone: (b.send_phone ? 1 : 0) as 0 | 1, send_email: (b.send_email ? 1 : 0) as 0 | 1 }
    : {};
  const r = await updateInquiry(token, { id, product_id, title, content, secret: b.secret ? 1 : 0, url, video_url, category, files, upw, ...notify });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}

// 상품문의 삭제 — 회원(토큰) 또는 비회원(비밀번호 upw). DELETE /api/inquiry
export async function DELETE(req: NextRequest) {
  const token = await getToken();
  const b = (await req.json().catch(() => ({}))) as { id?: number; upw?: string };
  const id = Number(b.id);
  const upw = String(b.upw ?? "");
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "문의 정보가 올바르지 않습니다." }, { status: 400 });
  if (!token && !upw) return NextResponse.json({ ok: false, error: "비밀번호를 입력해 주세요." }, { status: 400 });
  const r = await deleteInquiry(token, id, upw);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
