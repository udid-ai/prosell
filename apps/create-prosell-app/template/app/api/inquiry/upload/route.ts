import { NextRequest, NextResponse } from "next/server";
import { getToken, uploadInquiryPhotos } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 상품문의 이미지 업로드 — 회원(토큰) 또는 비회원(client-id). multipart(file) → 백엔드 inquiry/product/upload.
export async function POST(req: NextRequest) {
  const token = await getToken(); // 없으면 비회원(client-id)로 업로드
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, error: "업로드 방식을 확인해 주세요." }, { status: 400 });
  const files: File[] = [];
  for (const [, v] of form.entries()) {
    if (v instanceof File && v.size > 0) files.push(v);
  }
  if (!files.length) return NextResponse.json({ ok: false, error: "파일을 선택해 주세요." }, { status: 400 });
  const r = await uploadInquiryPhotos(token || undefined, files);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, items: r.items });
}
