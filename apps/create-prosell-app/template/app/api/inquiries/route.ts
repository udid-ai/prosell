import { NextRequest, NextResponse } from "next/server";
import { fetchProductInquiries, getToken } from "@/lib/prosell";

// 상품문의 목록(공개·읽기 전용) 프록시 — 더보기 페이징용. 로그인 회원이면 토큰 전달로 is_mine·본인 비밀글 반영.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const productsId = String(sp.get("products_id") || "").replace(/\D/g, "");
  if (!productsId) return NextResponse.json({ total_count: 0, items: [] }, { status: 400 });
  const page = Math.max(1, Number(sp.get("page") || 1));
  const token = await getToken();
  const list = await fetchProductInquiries(productsId, { page, limit: 10 }, token || undefined);
  return NextResponse.json(list);
}
