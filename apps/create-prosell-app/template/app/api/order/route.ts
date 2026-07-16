import { NextRequest, NextResponse } from "next/server";
import { getToken, checkoutInit, getCheckoutSession, checkoutOrder, saveCheckoutSession, getOrderResult, pollOrderCallback, fetchAddresses, type CheckoutAuth, type CheckoutInput } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// GET  /api/order                     → 주문서 초기화(구매자/은행/포인트/결제수단)
// GET  /api/order?pno=...              → 주문 완료 조회
// GET  /api/order?callback=1&pno=...   → 결제 상태 폴링(PG)
// POST  /api/order                    → 주문 생성(체크아웃)
// PATCH /api/order                     → 주문서 입력값 증분 저장(cart_order)
// 인증: 회원은 pa_at 쿠키(Bearer), 비회원은 cart_id 쿠키(게스트 식별자). 둘 다 없으면 401.

const CART_COOKIE = "cart_id";

async function resolveAuth(req: NextRequest): Promise<CheckoutAuth | null> {
  const token = await getToken();
  if (token) return { token };
  // 비회원: 게스트 cart_id 만 인정. member_* 는 로그인 회원 소유라 토큰 없이는 거부(남의 카트/CART_EMPTY 방지).
  const guest = req.cookies.get(CART_COOKIE)?.value;
  if (guest && /^[\w-]{8,64}$/.test(guest) && !/^member_/.test(guest)) return { guest };
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
  // 저장된 배송지(기본/추가) — 회원만. 비회원(게스트)은 빈 배열.
  const addresses = "token" in auth && auth.token ? await fetchAddresses(auth.token) : [];
  if (oid) {
    // ── 비회원 주문 정책(order_guest) 게이트 — 레거시 Cart/Order.php 와 동일 규칙 ──────────
    //  0 = 비회원 주문 불가 → 로그인 필요(«비회원 구매» 선택지 없음)
    //  2 = 로그인 경유    → 로그인 화면에서 «비회원으로 구매» 를 고르면 guest=1 로 되돌아온다
    //  1 = 바로 가능      → 통과
    // 상품/장바구니/목록 등 모든 «주문하기» 진입은 이 주문서로 모이므로 게이트를 여기 한 곳에 둔다.
    const isMember = "token" in auth && !!auth.token;
    if (!isMember) {
      const policy = Number(init.order_guest ?? 1);
      const bypass = req.nextUrl.searchParams.get("guest") === "1";
      if (policy === 0) {
        return NextResponse.json(
          { ok: false, login_required: true, guest_allowed: false, error: "회원만 주문할 수 있습니다." },
          { status: 403 },
        );
      }
      if (policy === 2 && !bypass) {
        return NextResponse.json(
          { ok: false, login_required: true, guest_allowed: true, error: "로그인 후 주문할 수 있습니다." },
          { status: 403 },
        );
      }
    }

    // admcode(법정동코드)를 넘기면 도서산간/제주 배송 할증을 반영해 배송비 견적을 갱신한다.
    const admcode = req.nextUrl.searchParams.get("admcode") || "";
    const session = await getCheckoutSession(auth, oid, admcode);
    if (!session) return NextResponse.json({ ok: false, error: "주문 세션을 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({ ok: true, init, session, addresses });
  }
  return NextResponse.json({ ok: true, init, addresses });
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

// 주문서 입력값 증분 저장 — 새로고침/복수탭에도 유지되도록 cart_order 에 저장.
export async function PATCH(req: NextRequest) {
  const auth = await resolveAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "주문 권한이 없습니다." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { oid?: string; fields?: Record<string, string | number> };
  if (!body.oid || !body.fields) {
    return NextResponse.json({ ok: false, error: "저장 정보가 올바르지 않습니다." }, { status: 400 });
  }
  const ok = await saveCheckoutSession(auth, body.oid, body.fields);
  return NextResponse.json({ ok });
}
