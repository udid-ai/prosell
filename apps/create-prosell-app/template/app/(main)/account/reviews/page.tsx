import Link from "next/link";
import {
  getToken, fetchMyReviews, fetchReviewableProducts, fetchProducts, fetchReviewSetup,
  imgUrl, thumbOf, type ProductItem,
} from "@/lib/prosell";
import MyReviewActions from "@/components/MyReviewActions";
import { formatDateTime } from "@/lib/format";
import ReviewWriteButton from "@/components/ReviewWriteButton";

export const dynamic = "force-dynamic";

const cardCls = "rounded-md border border-line bg-card p-6";
const LIMIT = 10;
const Stars = ({ score }: { score: number }) => {
  const s = Math.max(0, Math.min(5, score));
  return <span className="text-[13px] tracking-tight text-amber-500" aria-label={`별점 ${s}점`}>{"★".repeat(s)}<span className="text-line">{"★".repeat(5 - s)}</span></span>;
};

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  const token = await getToken();
  if (!token) {
    return (
      <div className={cardCls}>
        <h1 className="text-xl">상품 리뷰</h1>
        <p className="mt-2 text-sub">로그인이 필요합니다.</p>
        <Link href="/auth/login" className="mt-3 inline-block rounded-sm bg-accent px-4 py-2 text-accent-foreground">로그인</Link>
      </div>
    );
  }

  const sp = await searchParams;
  const tab = sp.tab === "written" ? "written" : "writable"; // 기본=작성 가능한 상품(레거시 첫 탭)
  const page = Math.max(1, Number(sp.page) || 1);

  // 두 탭의 개수(뱃지)는 항상 노출 → 각각 1페이지만 개수 조회. 통합게시판이면 리뷰 제목/URL/동영상 입력 노출.
  const [writable, written, reviewSetup] = await Promise.all([
    fetchReviewableProducts(token, { page: tab === "writable" ? page : 1, limit: LIMIT }),
    fetchMyReviews(token, { page: tab === "written" ? page : 1, limit: LIMIT }),
    fetchReviewSetup(token),
  ]);

  const active = tab === "writable" ? writable : written;
  const totalPages = Math.max(1, Math.ceil(active.total_count / LIMIT));

  // 현재 탭 카드의 상품 썸네일 일괄 조회.
  const pidSet = tab === "writable"
    ? [...new Set(writable.items.map((w) => w.products_id))]
    : [...new Set(written.items.map((r) => r.products_id))];
  const fetched = pidSet.length ? (await fetchProducts({ id: pidSet.join(",") }, token)).items : [];
  const pmap = new Map<number, ProductItem>(fetched.map((p) => [Number(p.origin?.id), p]));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-text">상품 리뷰</h1>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-line">
        {([
          { key: "writable", label: "작성 가능한 상품", count: writable.total_count },
          { key: "written", label: "작성한 리뷰", count: written.total_count },
        ] as const).map((t) => (
          <Link
            key={t.key}
            href={`/account/reviews?tab=${t.key}`}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-semibold ${tab === t.key ? "border-accent text-accent" : "border-transparent text-sub hover:text-text"}`}
          >
            {t.label}
            <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${tab === t.key ? "bg-accent text-accent-foreground" : "bg-line text-sub"}`}>{t.count}</span>
          </Link>
        ))}
      </div>

      {/* 작성 가능한 상품 */}
      {tab === "writable" && (
        writable.items.length === 0 ? (
          <div className="rounded-md border border-line bg-card p-12 text-center text-sub">작성 가능한 상품이 없습니다.</div>
        ) : (
          <section className="overflow-hidden rounded-2xl border border-line bg-card">
            <ul className="divide-y divide-line">
              {writable.items.map((w) => {
                const p = pmap.get(w.products_id);
                const thumb = thumbOf(p ?? ({} as ProductItem));
                return (
                  <li key={w.prno} className="flex flex-col px-0 sm:flex-row sm:items-stretch">
                    <div className="flex min-w-0 items-stretch sm:flex-1">
                      <Link href={`/products/${w.products_id}`} className="shrink-0 self-start py-4 pl-4 pr-4 sm:pl-5">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb} alt="" className="h-16 w-16 rounded-lg border border-line object-cover" />
                        ) : <div className="h-16 w-16 rounded-lg border border-line bg-surface" />}
                      </Link>
                      <div className="min-w-0 flex-1 py-4 pr-4">
                        <Link href={`/products/${w.products_id}`} className="line-clamp-2 w-fit text-sm font-semibold text-text hover:text-accent">{w.title}</Link>
                        {w.option && <p className="mt-0.5 text-[13px] text-sub">{w.option}</p>}
                        {w.pro_fix_dt && <p className="mt-1 text-[12px] text-sub">구매확정 {w.pro_fix_dt.slice(0, 10).replace(/-/g, ".")}</p>}
                      </div>
                    </div>
                    <div className="flex w-full items-center justify-center border-t border-line px-4 py-3 sm:w-32 sm:shrink-0 sm:border-l sm:border-t-0 sm:py-4">
                      <ReviewWriteButton
                        target={{ prno: w.prno, productTitle: w.title, optionTitle: w.option || undefined, thumb }}
                        titleEnabled={reviewSetup.titleEnabled}
                        className="w-full border-accent bg-accent text-accent-foreground hover:opacity-90"
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )
      )}

      {/* 작성한 리뷰 */}
      {tab === "written" && (
        written.items.length === 0 ? (
          <div className="rounded-md border border-line bg-card p-12 text-center text-sub">작성한 상품 리뷰가 없습니다.</div>
        ) : (
          <ul className="space-y-3">
            {written.items.map((r) => {
              const p = pmap.get(r.products_id);
              // 상품이 판매중지·삭제(목록 API onoff=1 필터로 미조회)여도 리뷰에 저장된 상품명/이미지로 표시.
              const title = p?.origin?.title || r.product_title || "상품";
              const thumb = thumbOf(p ?? ({} as ProductItem)) || r.thumb || undefined;
              const photos = (r.files ?? []).filter((f) => f.thumb || f.src);
              return (
                <li key={r.id} className="overflow-hidden rounded-2xl border border-line bg-card">
                  <Link href={`/products/${r.products_id}`} className="flex items-center gap-3 border-b border-line bg-surface/60 px-4 py-3 hover:bg-surface">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className="h-11 w-11 shrink-0 rounded-md border border-line object-cover" />
                    ) : <div className="h-11 w-11 shrink-0 rounded-md border border-line bg-card" />}
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-[13px] font-semibold text-text">{title}</p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <Stars score={r.score} />
                        <span className="text-[12px] text-sub">{r.dt ? formatDateTime(r.dt) : ""}</span>
                      </div>
                    </div>
                    {r.best === 1 && <span className="shrink-0 rounded-sm bg-accent/10 px-1.5 py-0.5 text-[11px] font-bold text-accent">베스트</span>}
                  </Link>
                  <div className="px-4 py-3.5">
                    {r.title && <p className="mb-1 text-sm font-bold text-text">{r.title}</p>}
                    <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-text">{r.content || ""}</p>
                    {photos.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {photos.map((f, i) => {
                          const src = imgUrl(f.thumb || f.src || "");
                          return src ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={i} src={src} alt="" className="h-16 w-16 rounded-md border border-line object-cover" />
                          ) : null;
                        })}
                      </div>
                    )}
                    {r.video_src && (
                      <div className={`mt-3 overflow-hidden rounded-lg border border-line bg-black ${r.video_src.includes("instagram.com") ? "aspect-[4/5] max-w-xs" : "aspect-video max-w-md"} w-full`}>
                        <iframe src={r.video_src} className="h-full w-full" allow="autoplay; encrypted-media" allowFullScreen scrolling="no" title="리뷰 동영상" />
                      </div>
                    )}
                    {r.url && (
                      <a href={r.url} target="_blank" rel="noopener noreferrer nofollow"
                        className="mt-2 inline-flex max-w-full items-center gap-1 truncate text-[13px] text-accent underline underline-offset-2 hover:opacity-80">
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                        <span className="truncate">{r.url}</span>
                      </a>
                    )}
                    {r.reply_content && (
                      <div className="mt-3 rounded-lg border border-line bg-surface p-3">
                        <p className="text-[12px] font-semibold text-text">판매자 답변 {r.reply_dt && <span className="ml-1 font-normal text-sub">{formatDateTime(r.reply_dt)}</span>}</p>
                        <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-sub">{r.reply_content}</p>
                      </div>
                    )}
                    {/* 수정/삭제 — shop.review_edit 허용 시 */}
                    {reviewSetup.editEnabled && (
                      <div className="mt-3 flex justify-end">
                        <MyReviewActions review={r} unified={reviewSetup.unified} />
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )
      )}

      {/* 페이지네이션(현재 탭) */}
      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-1 pt-2">
          {Array.from({ length: totalPages }).map((_, i) => {
            const pnum = i + 1;
            return (
              <Link key={pnum} href={`/account/reviews?tab=${tab}&page=${pnum}`}
                className={`grid h-9 min-w-9 place-items-center rounded-md border px-2 text-sm ${pnum === page ? "border-accent bg-accent/5 font-bold text-accent" : "border-line text-text hover:bg-surface"}`}>
                {pnum}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
