import { NextRequest, NextResponse } from "next/server";
import { fetchProductReviews } from "@/lib/prosell";

// 상품평 목록(공개·읽기 전용) 프록시 — 더보기/필터 페이징용. 캐시는 fetchProductReviews 내부 ISR 규칙을 따른다.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const productsId = String(sp.get("products_id") || "").replace(/\D/g, "");
  if (!productsId) return NextResponse.json({ total_count: 0, summary: null, items: [] }, { status: 400 });

  const page = Math.max(1, Number(sp.get("page") || 1));
  const scoreRaw = Number(sp.get("score") || 0);
  const score = scoreRaw >= 1 && scoreRaw <= 5 ? scoreRaw : undefined;
  const photo = sp.get("photo") === "1" ? 1 : undefined;

  const list = await fetchProductReviews(productsId, { page, score, photo, limit: 10 });
  return NextResponse.json(list);
}
