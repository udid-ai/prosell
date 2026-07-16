import { NextRequest, NextResponse } from "next/server";
import { getToken, fetchProductView, fetchAddoptions, fetchProductCoupons, checkWishlist } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 목록 카드 hover → 빠른주문 모달용 상품 상세 조회. 상품페이지(PDP)와 동일한 로더 재사용.
// GET /api/products/view?id= → { ok, pv, addoptions, coupons, wished, loggedIn }
export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get("id") || "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "상품 정보가 없습니다." }, { status: 400 });

  const token = await getToken(); // 로그인 시 회원가(등급 할인) 반영
  const pv = await fetchProductView(id, token).catch(() => null);
  if (!pv) return NextResponse.json({ ok: false, error: "상품을 찾을 수 없습니다." }, { status: 404 });

  const [addoptions, coupons, wished] = await Promise.all([
    pv.addoption.length ? fetchAddoptions(pv.addoption, token) : Promise.resolve([]),
    fetchProductCoupons(pv.id),
    token ? checkWishlist(token, pv.id) : Promise.resolve(false),
  ]);

  return NextResponse.json({ ok: true, pv, addoptions, coupons, wished, loggedIn: !!token });
}
