import { NextRequest, NextResponse } from "next/server";
import { getToken, prepareOrder, type CheckoutAuth, type BuyItem } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// POST /api/order/prepare → 주문 세션 발행. body: { items?: BuyItem[] }
// items 있으면 바로구매, 없으면 장바구니 전체. oid 반환 → 클라이언트가 /order/[oid] 로 이동.
const CART_COOKIE = "cart_id";

// 비회원 게스트 id 발급(cart 라우트 newOwner 와 동일 규칙: 32자 hex).
function newGuest(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

// 인증 해석. 반환 mintGuest: 게스트 id 를 새로 발급했으면 응답에 cart_id 쿠키로 심어야 함.
async function resolveAuth(req: NextRequest): Promise<{ auth: CheckoutAuth; mintGuest?: string } | null> {
  const token = await getToken();
  if (token) return { auth: { token } };
  // 비회원: 게스트 cart_id. member_* 는 로그인 회원 소유라 토큰 없이는 거부(남의 카트/CART_EMPTY 방지).
  const guest = req.cookies.get(CART_COOKIE)?.value;
  if (guest && /^[\w-]{8,64}$/.test(guest) && !/^member_/.test(guest)) return { auth: { guest } };
  // 바로구매 등 장바구니 미경유 → cart_id 가 없다. 즉석 게스트 id 발급(비회원 주문 허용 여부는 백엔드가 검증).
  const minted = newGuest();
  return { auth: { guest: minted }, mintGuest: minted };
}

export async function POST(req: NextRequest) {
  const resolved = await resolveAuth(req);
  if (!resolved) return NextResponse.json({ ok: false, error: "주문 권한이 없습니다." }, { status: 401 });
  const { auth, mintGuest } = resolved;

  const body = (await req.json().catch(() => ({}))) as { items?: BuyItem[]; from_cart?: boolean };
  // 장바구니 전체 주문은 표시(cart)와 동일한 소유자(cart_id)로 세션 생성 → 토큰 mid 와 저장 소유자가 달라도
  // (담기 시 게스트 hex 로 저장된 경우) 실제 카트를 찾는다(CART_EMPTY 오표기 방지).
  // 회원 member_* 는 토큰이 있을 때만 유효(cart 라우트 ownerFor 와 동일 규칙).
  const rawCart = req.cookies.get(CART_COOKIE)?.value;
  const validCart = rawCart && /^[\w-]{8,64}$/.test(rawCart) ? rawCart : undefined;
  const owner = validCart && (!/^member_/.test(validCart) || (await getToken())) ? validCart : undefined;
  // 선택주문(장바구니에서 온 items) → from_cart: 결제완료 시 주문한 장바구니 항목을 비운다.
  const r = await prepareOrder(auth, body.items, owner, !!body.from_cart);

  // 즉석 발급한 게스트 id 는 응답에 cart_id 쿠키로 심는다 → 이후 주문서(/order/[oid]) 조회가
  // 같은 X-Guest-Id 로 방금 만든 세션과 매칭된다(장바구니 담기 withCookie 와 동일 규칙).
  const attach = (res: NextResponse): NextResponse => {
    if (mintGuest) {
      const secure = (req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(/:$/, "")) === "https";
      res.cookies.set(CART_COOKIE, mintGuest, { httpOnly: true, path: "/", sameSite: "lax", secure, maxAge: 60 * 60 * 24 * 90 });
    }
    return res;
  };

  if (!r.ok) return attach(NextResponse.json({ ok: false, code: r.code, error: r.message }, { status: 400 }));
  return attach(NextResponse.json({ ok: true, oid: r.oid, from: r.from }));
}
