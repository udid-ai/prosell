import { NextRequest, NextResponse } from "next/server";
import { getOrderToken, uploadReviewPhotos } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 상품평 사진 업로드 — 회원(pa_at) 또는 비회원 주문조회(guest gt) 토큰. multipart(file) → 백엔드 review/upload.
export async function POST(req: NextRequest) {
  const token = await getOrderToken();
  if (!token) return NextResponse.json({ ok: false, error: "주문 조회 권한이 필요합니다." }, { status: 401 });
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, error: "업로드 방식을 확인해 주세요." }, { status: 400 });
  const files: File[] = [];
  for (const [, v] of form.entries()) {
    if (v instanceof File && v.size > 0) files.push(v);
  }
  if (!files.length) return NextResponse.json({ ok: false, error: "파일을 선택해 주세요." }, { status: 400 });
  const r = await uploadReviewPhotos(token, files);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, items: r.items });
}
