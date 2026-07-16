import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/order/upload — 주문 파일접수 업로드 프록시.
// 클라이언트의 multipart(file, products_id)를 백엔드 /api/v2/order/upload 로 전달(1st-party 클라이언트 인증).
export async function POST(req: NextRequest) {
  const base = process.env.PROSELL_API_BASE;
  const cid = process.env.PROSELL_CLIENT_ID;
  if (!base || !cid) return NextResponse.json({ ok: false, error: "서버 설정 오류" }, { status: 500 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "업로드 형식 오류" }, { status: 400 });
  }

  try {
    const res = await fetch(`${base}/api/v2/order/upload`, {
      method: "POST",
      body: form, // multipart 그대로 전달(경계 자동)
      headers: { "X-App-Client-Id": cid },
      cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.data?.id) {
      return NextResponse.json({ ok: false, error: j?.error?.message ?? "파일 업로드에 실패했습니다." }, { status: 400 });
    }
    // { id, name, size, download }
    return NextResponse.json({ ok: true, ...j.data });
  } catch {
    return NextResponse.json({ ok: false, error: "통신 오류가 발생했습니다." }, { status: 502 });
  }
}
