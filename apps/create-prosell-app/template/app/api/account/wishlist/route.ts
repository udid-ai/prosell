import { NextRequest, NextResponse } from "next/server";
import { getToken, toggleWishlist, removeWishlist, clearWishlist } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 관심상품 토글 — POST /api/account/wishlist { products_id }
export async function POST(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ ok: false, error: "회원 로그인이 필요합니다." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { products_id?: unknown };
  const productsId = Number(b.products_id);
  if (!Number.isInteger(productsId) || productsId <= 0) return NextResponse.json({ ok: false, error: "상품번호가 올바르지 않습니다." }, { status: 400 });
  const r = await toggleWishlist(token, productsId);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, wished: r.wished });
}

// 관심상품 삭제 — DELETE /api/account/wishlist?products_id=  또는  ?all=1(전체삭제)
export async function DELETE(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ ok: false, error: "회원 로그인이 필요합니다." }, { status: 401 });
  if (req.nextUrl.searchParams.get("all")) {
    const r = await clearWishlist(token);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  const productsId = Number(req.nextUrl.searchParams.get("products_id"));
  if (!Number.isInteger(productsId) || productsId <= 0) return NextResponse.json({ ok: false, error: "상품번호가 올바르지 않습니다." }, { status: 400 });
  const r = await removeWishlist(token, productsId);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
