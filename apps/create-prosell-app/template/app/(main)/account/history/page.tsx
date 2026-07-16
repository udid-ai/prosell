import Link from "next/link";
import { getToken, fetchHistory, fetchProducts, priceOf, thumbOf, optionOf, won, type ProductItem } from "@/lib/prosell";
import ProductRowActions from "@/components/ProductRowActions";
import ListClearButton from "@/components/ListClearButton";

export const dynamic = "force-dynamic";

const cardCls = "rounded-md border border-line bg-card p-6";

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const token = await getToken();
  if (!token) {
    return (
      <div className={cardCls}>
        <h1 className="text-xl">최근 본 상품</h1>
        <p className="mt-2 text-sub">로그인이 필요합니다.</p>
        <Link href="/auth/login" className="mt-3 inline-block rounded-sm bg-accent px-4 py-2 text-accent-foreground">로그인</Link>
      </div>
    );
  }

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const limit = 10; // 페이지당 10개
  const { items, total_count, history_day } = await fetchHistory(token, page, limit);

  // 상품 카드 데이터는 목록 API(id 필터)로 일괄 조회 — 판매중(onoff=1)만.
  const ids = items.map((h) => h.products_id);
  const fetched = ids.length ? (await fetchProducts({ id: ids.join(",") }, token)).items : [];
  const byId = new Map<number, ProductItem>(fetched.map((p) => [Number(p.origin?.id), p]));

  // 최근 본 순서(dt desc) 유지 + 존재하는 상품만. dt 는 최근 열람 시각.
  const rows = items
    .map((h) => {
      const p = byId.get(h.products_id);
      if (!p || !p.origin?.id) return null;
      const { price, base } = priceOf(p);
      return {
        hid: h.id, products_id: h.products_id, dt: h.dt,
        title: p.origin.title ?? "상품", thumb: thumbOf(p),
        price: price ?? 0, base: base ?? 0, soldout: !!p.origin.soldout,
        priceOpen: (p.benefit?.price_open ?? 1) !== 0, // 가격 공개 가드(open_price)
        orderOpen: (p.benefit?.order_open ?? 1) !== 0, // 주문 권한 가드(level_order)
        viewOpen: (p.benefit?.view_open ?? 1) !== 0,   // 접근 권한 가드(level_view)
        levelName: p.benefit?.level_view_name || "",   // 열람 가능 최소 등급명
        productId: optionOf(p)?.id ?? 0,
      };
    })
    .filter((r): r is NonNullable<typeof r> => !!r);

  const totalPages = Math.max(1, Math.ceil(total_count / limit));

  return (
    <div className="space-y-4">
      {/* 헤더 — 제목·개수 + 보관기간 안내 + 전체삭제 */}
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-bold text-text">
          최근 본 상품
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-1.5 text-[12px] font-bold text-accent-foreground">{total_count}</span>
        </h1>
        <div className="flex items-center gap-3">
          {history_day > 0 && (
            <span className="text-[12px] text-sub">최근 본 상품은 열람일로부터 {history_day}일 경과 후 삭제됩니다.</span>
          )}
          {total_count > 0 && <ListClearButton url="/api/account/history?all=1" message="최근 본 상품을 모두 삭제하시겠습니까?" />}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-md border border-line bg-card p-12 text-center text-sub">
          최근 본 상품이 없습니다.
          <div className="mt-3">
            <Link href="/products" className="inline-block rounded-md bg-accent px-4 py-2 text-[13px] font-bold text-accent-foreground hover:opacity-90">쇼핑하러 가기</Link>
          </div>
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-line bg-card">
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.hid} className="flex flex-col px-0 sm:flex-row sm:items-stretch">
                {/* 본문: 썸네일 + 상품정보 + 가격. 접근권한(level_view) 미달이면 잠금 처리(이름·가격 숨김). */}
                <div className="flex min-w-0 items-stretch sm:flex-1">
                  <Link href={`/products/${r.products_id}`} className="shrink-0 self-start py-4 pl-4 pr-4 sm:pl-5">
                    {!r.viewOpen ? (
                      <div className="grid h-16 w-16 place-items-center rounded-lg border border-line bg-surface text-sub">
                        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                      </div>
                    ) : r.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.thumb} alt="" className="h-16 w-16 rounded-lg border border-line object-cover" />
                    ) : <div className="h-16 w-16 rounded-lg border border-line bg-surface" />}
                  </Link>
                  <div className="min-w-0 flex-1 py-4 pr-4">
                    {r.dt && <p className="text-[12px] text-sub">{r.dt.slice(0, 10).replace(/-/g, ".")}</p>}
                    {!r.viewOpen ? (
                      <p className="mt-0.5 text-sm font-semibold text-sub">
                        {r.levelName ? <><b className="text-text">{r.levelName}</b> 등급 이상 열람 가능한 상품입니다</> : "열람 권한이 필요한 상품입니다"}
                      </p>
                    ) : (
                      <>
                        <Link href={`/products/${r.products_id}`} className="mt-0.5 line-clamp-2 w-fit text-sm font-semibold text-text hover:text-accent">
                          {r.title}
                        </Link>
                        <div className="mt-1 flex items-baseline gap-1.5">
                          {r.priceOpen ? (
                            <>
                              <span className="text-sm font-bold text-text">{won(r.price)}</span>
                              {r.base > r.price ? <span className="text-[12px] text-sub line-through">{won(r.base)}</span> : null}
                            </>
                          ) : (
                            <span className="text-[13px] font-bold text-sub">회원 전용가</span>
                          )}
                        </div>
                        {r.soldout && <span className="mt-1 inline-block rounded bg-line px-1.5 py-0.5 text-[11px] font-bold text-sub">품절</span>}
                      </>
                    )}
                  </div>
                </div>

                {/* 액션 — 바로구매·장바구니·삭제 */}
                <div className="flex w-full items-center justify-center border-t border-line px-4 py-3 sm:w-32 sm:shrink-0 sm:border-l sm:border-t-0 sm:py-4">
                  <ProductRowActions productsId={r.products_id} productId={r.productId} title={r.title} price={r.price} soldout={r.soldout} canOrder={r.viewOpen && r.orderOpen} removeBase="/api/account/history" />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-1 pt-2">
          {Array.from({ length: totalPages }).map((_, i) => {
            const p = i + 1;
            return (
              <Link key={p} href={`/account/history?page=${p}`}
                className={`grid h-9 min-w-9 place-items-center rounded-md border px-2 text-sm ${p === page ? "border-accent bg-accent/5 font-bold text-accent" : "border-line text-text hover:bg-surface"}`}>
                {p}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
