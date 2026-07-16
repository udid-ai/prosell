import Link from "next/link";
import { getToken, fetchMyInquiries, fetchProducts, fetchProductInquiries, fetchProductView, thumbOf, type ProductItem } from "@/lib/prosell";
import { formatDateTime } from "@/lib/format";
import MyInquiryActions from "@/components/MyInquiryActions";
import type { InquiryOption } from "@/components/InquiryFormModal";

export const dynamic = "force-dynamic";

const cardCls = "rounded-md border border-line bg-card p-6";
const LIMIT = 10;

export default async function AccountInquiriesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const token = await getToken();
  if (!token) {
    return (
      <div className={cardCls}>
        <h1 className="text-xl">상품 문의</h1>
        <p className="mt-2 text-sub">로그인이 필요합니다.</p>
        <Link href="/auth/login" className="mt-3 inline-block rounded-sm bg-accent px-4 py-2 text-accent-foreground">로그인</Link>
      </div>
    );
  }

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);

  const list = await fetchMyInquiries(token, { page, limit: LIMIT });
  const totalPages = Math.max(1, Math.ceil(list.total_count / LIMIT));

  // 상품 썸네일 일괄 조회.
  const pidSet = [...new Set(list.items.map((q) => q.products_id).filter(Boolean))];
  const fetched = pidSet.length ? (await fetchProducts({ id: pidSet.join(",") }, token)).items : [];
  const pmap = new Map<number, ProductItem>(fetched.map((p) => [Number(p.origin?.id), p]));

  // 수정 모달용 — 통합 게시판 분류(상점 공통) + 상품별 옵션(옵션/분류 변경 가능하게).
  const [board, ...pviews] = await Promise.all([
    pidSet.length ? fetchProductInquiries(pidSet[0], { limit: 1 }, token) : Promise.resolve(null),
    ...pidSet.map((pid) => fetchProductView(String(pid), token)),
  ]);
  const categories = board?.board?.categories ?? [];
  const optMap = new Map<number, { options: InquiryOption[]; title: string }>();
  pviews.forEach((pv) => { if (pv) optMap.set(pv.id, { options: pv.options.map((o) => ({ id: o.id, label: o.label })), title: pv.title ?? "" }); });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-text">상품 문의</h1>

      {list.items.length === 0 ? (
        <div className="rounded-md border border-line bg-card p-12 text-center text-sub">작성한 상품 문의가 없습니다.</div>
      ) : (
        <ul className="space-y-3">
          {list.items.map((q) => {
            const p = pmap.get(q.products_id);
            const title = p?.origin?.title || "상품";
            const thumb = thumbOf(p ?? ({} as ProductItem)) || undefined;
            return (
              <li key={q.id} className="overflow-hidden rounded-2xl border border-line bg-card">
                {/* 상품 헤더 */}
                <Link href={`/products/${q.products_id}`} className="flex items-center gap-3 border-b border-line bg-surface/60 px-4 py-3 hover:bg-surface">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className="h-11 w-11 shrink-0 rounded-md border border-line object-cover" />
                  ) : <div className="h-11 w-11 shrink-0 rounded-md border border-line bg-card" />}
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-[13px] font-semibold text-text">{title}</p>
                    <span className="text-[12px] text-sub">{q.dt ? formatDateTime(q.dt, false) : ""}</span>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${q.answered ? "bg-accent/10 text-accent" : "bg-surface text-sub"}`}>
                    {q.answered ? "답변완료" : "답변대기"}
                  </span>
                </Link>

                {/* 문의 본문 */}
                <div className="px-4 py-3.5">
                  <div className="flex items-center gap-1.5">
                    {q.category && <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-sub">{q.category}</span>}
                    {q.secret === 1 && (
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-sub" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
                    )}
                    {q.title && <p className="text-sm font-bold text-text">{q.title}</p>}
                  </div>
                  {q.content && <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-text">{q.content}</p>}
                  {q.files && q.files.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {q.files.filter((f) => f.src || f.thumb).map((f) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <a key={f.id} href={f.src || f.thumb || "#"} target="_blank" rel="noopener noreferrer" className="h-16 w-16 overflow-hidden rounded-md border border-line bg-surface">
                          <img src={f.thumb || f.src || ""} alt="" className="h-full w-full object-cover" loading="lazy" />
                        </a>
                      ))}
                    </div>
                  )}
                  {q.video_src && (
                    <div className={`mt-3 overflow-hidden rounded-lg border border-line bg-black ${q.video_src.includes("instagram.com") ? "aspect-[4/5] max-w-xs" : "aspect-video max-w-md"} w-full`}>
                      <iframe src={q.video_src} className="h-full w-full" allow="autoplay; encrypted-media" allowFullScreen scrolling="no" title="문의 동영상" />
                    </div>
                  )}
                  {q.url && (
                    <a href={q.url} target="_blank" rel="noopener noreferrer nofollow"
                      className="mt-2 inline-flex max-w-full items-center gap-1 truncate text-[13px] text-accent underline underline-offset-2 hover:opacity-80">
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                      <span className="truncate">{q.url}</span>
                    </a>
                  )}
                  {q.reply_content && (
                    <div className="mt-3 rounded-lg border border-line bg-surface p-3">
                      <p className="text-[12px] font-semibold text-text">
                        {q.reply_name || "판매자"} 답변 {q.reply_dt && <span className="ml-1 font-normal text-sub">{formatDateTime(q.reply_dt, false)}</span>}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-sub">{q.reply_content}</p>
                    </div>
                  )}
                  {/* 수정/삭제 — 답변 전에만(백엔드도 답변 후 차단). 옵션·분류 변경 가능하게 전달. */}
                  {!q.answered && (
                    <MyInquiryActions inquiry={q}
                      options={optMap.get(q.products_id)?.options ?? []}
                      productTitle={optMap.get(q.products_id)?.title}
                      categories={categories}
                      unified={(board?.board?.unified ?? 0) === 1}
                      notifyHp={list.notify_hp} notifyEmail={list.notify_email} />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-1 pt-2">
          {Array.from({ length: totalPages }).map((_, i) => {
            const pnum = i + 1;
            return (
              <Link key={pnum} href={`/account/inquiries?page=${pnum}`}
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
