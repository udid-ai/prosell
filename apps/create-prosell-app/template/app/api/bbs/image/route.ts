import { NextRequest, NextResponse } from "next/server";
import { getToken, uploadBbsFiles } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 에디터 본문 이미지 업로드 — POST /api/bbs/image?bbs_id=free (multipart, field=files)
// RichEditor 가 files 만 보내므로 bbs_id 는 쿼리로 받는다. 업로드된 이미지는 URL 로 본문에 삽입된다
// (첨부 슬롯과 무관 — 본문 인라인 이미지). 응답 items[].src/id 는 RichEditor 규약과 동일.
export async function POST(req: NextRequest) {
  const token = await getToken();   // 비회원이면 undefined(client-id 로 요청)

  const bbs_id = String(req.nextUrl.searchParams.get("bbs_id") ?? "");
  if (!/^[a-zA-Z0-9_-]+$/.test(bbs_id)) return NextResponse.json({ ok: false, error: "게시판을 확인해 주세요." }, { status: 400 });

  const fd = await req.formData().catch(() => null);
  if (!fd) return NextResponse.json({ ok: false, error: "업로드 형식이 올바르지 않습니다." }, { status: 400 });
  const files = fd.getAll("files").filter((v): v is File => v instanceof File);
  if (!files.length) return NextResponse.json({ ok: false, error: "파일이 없습니다." }, { status: 400 });

  const up = await uploadBbsFiles(token, bbs_id, files, "content");
  if (!up.ok) return NextResponse.json({ ok: false, error: up.error }, { status: 400 });
  // 이미지가 아닌 파일은 본문 삽입 대상이 아니므로 걸러낸다.
  const items = (up.items ?? []).filter((it) => it.is_image === 1).map((it) => ({ id: it.id, src: it.src }));
  return NextResponse.json({ ok: true, items });
}
