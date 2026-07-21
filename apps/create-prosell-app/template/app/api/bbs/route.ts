import { NextRequest, NextResponse } from "next/server";
import {
  getToken, fetchBbsArticle,
  createBbsArticle, updateBbsArticle, deleteBbsArticle, uploadBbsFiles,
  type BbsArticleInput,
} from "@/lib/prosell";
import { sanitizeContent, htmlToText } from "@/lib/sanitize";

export const dynamic = "force-dynamic";

const MAX_TITLE = 100;
const MAX_CONTENT = 5000;   // 태그 제외 본문 텍스트 기준

type Body = {
  bbs_id?: string; article_id?: number;
  ar_ct?: string; ar_title?: string; ar_content?: string;
  ar_secret?: number; ar_adult?: number; ar_notice?: number; ar_thumb?: number;
  ar_url?: string; ar_hashtag?: string;
  ar_video1?: string; ar_video2?: string; ar_video3?: string;
  upload_file1?: number; upload_file2?: number; upload_file3?: number;
  name?: string; upw?: string; recaptcha?: string;   // 비회원
};

// 동영상 입력 정규화 — 허용 호스트의 URL 만 통과(임베드 XSS 방지). 빈값이면 "".
// youtube-nocookie 포함(백엔드가 이 호스트로 embed iframe 을 저장 → 수정 시 재전송 대비).
const VIDEO_HOSTS = /^(https?:)?\/\/(www\.)?(youtube\.com|youtube-nocookie\.com|youtu\.be|player\.vimeo\.com|vimeo\.com)\//i;
function normVideo(v: unknown): string {
  let s = String(v ?? "").trim();
  // 혹시 iframe 소스가 넘어오면 src URL 만 추출(백슬래시 이스케이프 허용).
  const m = s.match(/src\s*=\s*\\?["']([^"'\\]+)/i);
  if (m) s = m[1].trim();
  s = s.slice(0, 255);
  return s && VIDEO_HOSTS.test(s) ? s : "";
}

// 게시물 등록/수정 입력 정리(본문은 평문). 실행/스크립트 위험은 백엔드가 다시 새니타이즈.
function parse(b: Body): { input: BbsArticleInput; error?: string } {
  const bbs_id = String(b.bbs_id ?? "").trim();
  const ar_title = String(b.ar_title ?? "").trim().slice(0, MAX_TITLE);
  // 본문은 위지윅(Tiptap) HTML — 저장 전 반드시 새니타이즈(저장형 XSS 차단). 길이는 태그 제외 텍스트 기준.
  const ar_content = sanitizeContent(String(b.ar_content ?? ""));
  const textLen = htmlToText(ar_content).length;
  // 해시태그 — 공백 제거, #는 저장 시 제외(표시할 때 프런트가 붙임).
  const ar_hashtag = String(b.ar_hashtag ?? "").replace(/[#\s]+/g, ",").replace(/^,|,$/g, "").slice(0, 100);
  const input: BbsArticleInput = {
    bbs_id, ar_title, ar_content,
    ar_ct: b.ar_ct ? String(b.ar_ct).trim().slice(0, 50) : undefined,
    ar_secret: b.ar_secret ? 1 : 0,
    ar_adult: b.ar_adult ? 1 : 0,
    ar_notice: b.ar_notice ? 1 : 0,       // 백엔드가 관리자 아니면 거부(코드 004)
    ar_thumb: b.ar_thumb ? 1 : 0,
    // 링크/해시태그/동영상은 빈값도 전달(수정 시 해제하면 비워지도록).
    ar_url: String(b.ar_url ?? "").trim().slice(0, 255),
    ar_hashtag,
    ar_video1: normVideo(b.ar_video1),
    ar_video2: normVideo(b.ar_video2),
    ar_video3: normVideo(b.ar_video3),
  };
  [1, 2, 3].forEach((i) => {
    const v = Number((b as Record<string, unknown>)[`upload_file${i}`]);
    if (Number.isInteger(v) && v > 0) (input as Record<string, unknown>)[`upload_file${i}`] = v;
  });
  // 비회원 작성자 정보(회원이면 백엔드가 무시). 이름 8자·비밀번호는 백엔드에서 검증(050/051).
  if (b.name !== undefined) input.name = String(b.name).trim().slice(0, 8);
  if (b.upw !== undefined) input.upw = String(b.upw);
  if (b.recaptcha !== undefined) input.recaptcha = String(b.recaptcha);   // 비회원 글쓰기 리캡차 토큰
  if (!/^[a-zA-Z0-9_-]+$/.test(bbs_id)) return { input, error: "게시판을 확인해 주세요." };
  if (!ar_title) return { input, error: "제목을 입력해 주세요." };
  if (textLen === 0) return { input, error: "내용을 입력해 주세요." };
  if (textLen > MAX_CONTENT) return { input, error: `내용은 ${MAX_CONTENT}자까지 입력할 수 있습니다.` };
  return { input };
}

// 첨부 업로드(multipart) 또는 게시물 등록.
export async function POST(req: NextRequest) {
  const token = await getToken();   // 비회원이면 undefined(client-id 로 요청)

  if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
    const fd = await req.formData().catch(() => null);
    if (!fd) return NextResponse.json({ ok: false, error: "업로드 형식이 올바르지 않습니다." }, { status: 400 });
    const bbs_id = String(fd.get("bbs_id") ?? "");
    const mode = String(fd.get("mode") ?? "file1");
    const files = fd.getAll("files").filter((v): v is File => v instanceof File);
    if (!files.length) return NextResponse.json({ ok: false, error: "파일이 없습니다." }, { status: 400 });
    const up = await uploadBbsFiles(token, bbs_id, files, mode);
    if (!up.ok) return NextResponse.json({ ok: false, error: up.error }, { status: 400 });
    return NextResponse.json({ ok: true, items: up.items ?? [] });
  }

  const b = (await req.json().catch(() => ({}))) as Body;
  const { input, error } = parse(b);
  if (error) return NextResponse.json({ ok: false, error }, { status: 400 });
  const r = await createBbsArticle(token, input);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, article_id: r.data?.article_id });
}

export async function PUT(req: NextRequest) {
  const token = await getToken();   // 비회원이면 undefined(client-id 로 요청)
  const b = (await req.json().catch(() => ({}))) as Body;
  const article_id = Number(b.article_id);
  if (!Number.isInteger(article_id) || article_id <= 0) return NextResponse.json({ ok: false, error: "게시물 정보가 올바르지 않습니다." }, { status: 400 });
  const { input, error } = parse(b);
  if (error) return NextResponse.json({ ok: false, error }, { status: 400 });
  const r = await updateBbsArticle(token, { ...input, article_id });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, article_id });
}

export async function DELETE(req: NextRequest) {
  const token = await getToken();   // 비회원이면 undefined(client-id 로 요청)
  const b = (await req.json().catch(() => ({}))) as Body;
  const bbs_id = String(b.bbs_id ?? "");
  const article_id = Number(b.article_id);
  if (!/^[a-zA-Z0-9_-]+$/.test(bbs_id) || !Number.isInteger(article_id) || article_id <= 0)
    return NextResponse.json({ ok: false, error: "게시물 정보가 올바르지 않습니다." }, { status: 400 });
  const r = await deleteBbsArticle(token, bbs_id, article_id, b.upw);   // 비회원은 upw 로 본인확인
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}

// 비밀글 열람 — upw 로 본문 재조회(회원 본인/관리자는 자동으로 열림).
export async function GET(req: NextRequest) {
  const token = await getToken();
  const sp = req.nextUrl.searchParams;
  const bbs_id = String(sp.get("bbs_id") ?? "");
  const id = Number(sp.get("id"));
  const upw = String(sp.get("upw") ?? "");
  if (!/^[a-zA-Z0-9_-]+$/.test(bbs_id) || !Number.isInteger(id) || id <= 0)
    return NextResponse.json({ ok: false, error: "요청을 확인해 주세요." }, { status: 400 });
  const view = await fetchBbsArticle(bbs_id, id, { upw }, token);
  if (!view?.article) return NextResponse.json({ ok: false, error: "게시물을 찾을 수 없습니다." }, { status: 404 });
  if (view.article.locked) return NextResponse.json({ ok: false, error: "비밀번호가 일치하지 않습니다." }, { status: 403 });
  return NextResponse.json({ ok: true, article: view.article, replies: view.replies });
}
