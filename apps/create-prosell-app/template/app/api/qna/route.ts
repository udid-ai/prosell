import { NextRequest, NextResponse } from "next/server";
import { getToken, submitQna, updateQna, deleteQna, uploadQnaPhotos, fetchQnaItemSource, type QnaInput, type QnaItemSourceType } from "@/lib/prosell";
import { sanitizeContent, htmlToText } from "@/lib/sanitize";

export const dynamic = "force-dynamic";

type Body = {
  id?: number;
  category?: string; title?: string; content?: string; secret?: number;
  url?: string; video_url?: string; files?: unknown;
  send_phone?: number; send_email?: number;
  item_type?: number; item_ids?: string;
};

// 문의대상 상품 소스 조회 — GET /api/qna?items=1|2|3|4 (회원 전용 프록시).
export async function GET(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
  const t = Number(req.nextUrl.searchParams.get("items"));
  if (![1, 2, 3, 4].includes(t)) return NextResponse.json({ ok: false, error: "유형을 확인해 주세요." }, { status: 400 });
  const items = await fetchQnaItemSource(token, t as QnaItemSourceType);
  return NextResponse.json({ ok: true, items });
}

const MAX_CONTENT = 2000;

// 등록/수정 공통 입력 정리. 통합 게시판 전용 필드(url/video_url/files)는 값이 온 경우에만 포함.
function parse(b: Body): { input: Omit<QnaInput, never>; error?: string } {
  const category = String(b.category ?? "").trim().slice(0, 20);
  const title = String(b.title ?? "").trim().slice(0, 100);
  // 본문은 위지윅(Tiptap) HTML — 저장 전 «반드시» 새니타이즈한다.
  // cs_article_board.content 는 레거시 view.php 가 raw 로 출력하므로 필터 없이 저장하면 저장형 XSS 가 된다.
  const content = sanitizeContent(String(b.content ?? ""));
  // 길이 제한은 태그를 뺀 «본문 텍스트» 기준. HTML 을 그대로 자르면 태그 중간에서 끊겨 마크업이 깨진다.
  const textLen = htmlToText(content).length;

  if (!title) return { input: { category, title, content }, error: "제목을 입력해 주세요." };
  if (textLen === 0) return { input: { category, title, content }, error: "문의 내용을 입력해 주세요." };
  if (textLen > MAX_CONTENT) return { input: { category, title, content }, error: `문의 내용은 ${MAX_CONTENT}자까지 입력할 수 있습니다.` };

  // editor=1 — 본문이 HTML 임을 백엔드에 알린다(개별 게시판 cs_article_qna.ar_editor).
  const input: QnaInput = { category, title, content, secret: b.secret ? 1 : 0, editor: 1 };
  if (b.url !== undefined) input.url = String(b.url).trim().slice(0, 255);
  if (b.video_url !== undefined) input.video_url = String(b.video_url).trim().slice(0, 255);
  if (Array.isArray(b.files)) {
    input.files = b.files.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0).slice(0, 3);
  }
  if (b.send_phone !== undefined) input.send_phone = b.send_phone ? 1 : 0;
  if (b.send_email !== undefined) input.send_email = b.send_email ? 1 : 0;
  // 문의대상 — 등록에서만 유효(백엔드가 수정 PUT 에서 거부). item_ids 는 안전한 형식(숫자·콤마·파이프)만.
  if (b.item_type !== undefined && [0, 1, 2, 3, 4].includes(Number(b.item_type))) {
    input.item_type = Number(b.item_type) as 0 | 1 | 2 | 3 | 4;
    if (input.item_type > 0 && typeof b.item_ids === "string" && /^[0-9|,]+$/.test(b.item_ids)) {
      input.item_ids = b.item_ids;
    }
  }
  return { input };
}

// 1:1 문의(qna) — 회원 전용. 작성/수정/삭제 프록시.
export async function POST(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });

  // 이미지 업로드(multipart) — 등록/수정 전에 cs_file id 를 먼저 확보한다.
  if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
    const fd = await req.formData().catch(() => null);
    if (!fd) return NextResponse.json({ ok: false, error: "업로드 형식이 올바르지 않습니다." }, { status: 400 });
    const files = fd.getAll("files").filter((v): v is File => v instanceof File);
    if (!files.length) return NextResponse.json({ ok: false, error: "파일이 없습니다." }, { status: 400 });
    const up = await uploadQnaPhotos(token, files);
    if (!up.ok) return NextResponse.json({ ok: false, error: up.error }, { status: 400 });
    return NextResponse.json({ ok: true, items: up.items ?? [] });
  }

  const b = (await req.json().catch(() => ({}))) as Body;
  const { input, error } = parse(b);
  if (error) return NextResponse.json({ ok: false, error }, { status: 400 });
  const r = await submitQna(token, input);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, id: r.id });
}

export async function PUT(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Body;
  const id = Number(b.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "문의 정보가 올바르지 않습니다." }, { status: 400 });
  const { input, error } = parse(b);
  if (error) return NextResponse.json({ ok: false, error }, { status: 400 });
  const r = await updateQna(token, { id, ...input });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { id?: number };
  const id = Number(b.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "문의 정보가 올바르지 않습니다." }, { status: 400 });
  const r = await deleteQna(token, id);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
