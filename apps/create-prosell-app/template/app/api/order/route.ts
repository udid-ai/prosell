import { NextRequest, NextResponse } from "next/server";
import { getToken, checkoutInit, getCheckoutSession, checkoutOrder, getOrderResult, pollOrderCallback, type CheckoutAuth, type CheckoutInput } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// GET  /api/order                     → 주문서 초기화(구매자/은행/포인트/결제수단)
// GET  /api/order?pno=...              → 주문 완료 조회
// GET  /api/order?callback=1&pno=...   → 결제 상태 폴링(PG)
// POST /api/order                     → 주문 생성(체크아웃)
// 인증: 회원은 pa_at 쿠키(Bearer), 비회원은 cart_id 쿠키(게스트 식별자). 둘 다 없으면 401.

const CART_COOKIE = "cart_id";

async function resolveAuth(req: NextRequest): Promise<CheckoutAuth | null> {
  const token = await getToken();
  if (token) return { token };
  const guest = req.cookies.get(CART_COOKIE)?.value;
  if (guest && /^[\w-]{8,64}$/.test(guest)) return { guest };
  return null;
}

export async function GET(req: NextRequest) {
  const auth = await resolveAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "주문 권한이 없습니다." }, { status: 401 });

  const pno = req.nextUrl.searchParams.get("pno");
  const callback = req.nextUrl.searchParams.get("callback") === "1";

  if (pno && callback) {
    const st = await pollOrderCallback(auth, pno);
    if (!st) return NextResponse.json({ ok: false, error: "결제 상태를 확인하지 못했습니다." }, { status: 502 });
    return NextResponse.json({ ok: true, ...st });
  }

  if (pno) {
    const order = await getOrderResult(auth, pno);
    if (!order) return NextResponse.json({ ok: false, error: "주문을 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({ ok: true, order });
  }

  // 주문서 — oid 세션(품목/합계) + init(구매자/은행/포인트/결제수단)
  const oid = req.nextUrl.searchParams.get("oid");
  const init = await checkoutInit(auth);
  if (!init) return NextResponse.json({ ok: false, error: "주문서를 불러오지 못했습니다." }, { status: 502 });
  if (oid) {
    const session = await getCheckoutSession(auth, oid);
    if (!session) return NextResponse.json({ ok: false, error: "주문 세션을 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({ ok: true, init, session });
  }
  return NextResponse.json({ ok: true, init });
}

export async function POST(req: NextRequest) {
  const auth = await resolveAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "주문 권한이 없습니다." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { input?: CheckoutInput; idempotency_key?: string };
  if (!body.input || !body.idempotency_key) {
    return NextResponse.json({ ok: false, error: "주문 정보가 올바르지 않습니다." }, { status: 400 });
  }

  const r = await checkoutOrder(auth, body.input, body.idempotency_key);
  if (!r.ok) return NextResponse.json({ ok: false, code: r.code, error: r.message }, { status: 400 });
  return NextResponse.json({ ok: true, pno: r.pno, pg: r.pg, payurl: r.payurl, polling: r.polling });
}
