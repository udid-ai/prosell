import { NextRequest, NextResponse } from "next/server";
import { fetchPrivatePayInit, submitPrivatePay, pollPrivatePay } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 개인결제 결제창 — 공개 URL(로그인/비회원 무관). 클라이언트 인증(서버가 X-App-Client-Id 부착). ppno 가 접근키.
// GET  /api/privatepay?ppno=            → 결제 준비(금액/통화/상품/사업자정보)
// GET  /api/privatepay?ppno=&callback=1 → 결제 상태 폴링(PG)
// POST /api/privatepay                  → 결제 실행(PrivateCreate)
export async function GET(req: NextRequest) {
  const ppno = req.nextUrl.searchParams.get("ppno") || "";
  if (!/^[0-9]+$/.test(ppno)) return NextResponse.json({ ok: false, error: "결제창번호가 올바르지 않습니다." }, { status: 400 });

  if (req.nextUrl.searchParams.get("callback") === "1") {
    const st = await pollPrivatePay(ppno);
    if (!st) return NextResponse.json({ ok: false, error: "결제 상태를 확인하지 못했습니다." }, { status: 502 });
    return NextResponse.json({ ok: true, ...st });
  }

  const init = await fetchPrivatePayInit(ppno);
  if (!init) return NextResponse.json({ ok: false, error: "결제 정보를 불러오지 못했습니다." }, { status: 404 });
  return NextResponse.json({ ok: true, init });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { input?: Record<string, string | number> };
  if (!body.input || !body.input.ppno) return NextResponse.json({ ok: false, error: "결제 정보가 올바르지 않습니다." }, { status: 400 });

  const r = await submitPrivatePay(body.input);
  if (!r.ok) return NextResponse.json({ ok: false, code: r.code, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, ppno: r.ppno, no: r.no, pg: r.pg, payurl: r.payurl, polling: r.polling });
}
