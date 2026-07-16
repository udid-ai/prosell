import Link from "next/link";
import { notFound } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import { fetchNotice, fetchNotices } from "@/lib/prosell";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = await fetchNotice(id);
  return buildMetadata({
    title: n?.title ? `${n.title} | 공지사항` : "공지사항",
    description: "쇼핑몰 공지사항을 확인하세요.",
  });
}

// 공지사항 상세 — 본문은 통합 게시판이면 위지윅 HTML, 개별이면 평문.
// 어느 쪽이든 lib/prosell 의 renderContent 로 새니타이즈·정규화한 값만 렌더한다.
export default async function NoticeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const notice = await fetchNotice(id);
  if (!notice) notFound();

  // 이전/다음 — 단건 API 가 없어 목록에서 위치를 찾는다(공지 수가 많지 않은 게시판 특성).
  const list = await fetchNotices({ page: 1, limit: 100 });
  const idx = list.items.findIndex((n) => n.id === notice.id);
  const prev = idx > 0 ? list.items[idx - 1] : null;       // 목록은 최신순 → 앞이 최신
  const next = idx >= 0 && idx < list.items.length - 1 ? list.items[idx + 1] : null;

  const images = (notice.files ?? []).filter((f) => f.thumb || f.src);
  const files = (notice.files ?? []).filter((f) => !f.thumb && !f.src);

  return (
    <div className="mx-auto my-10 max-w-content px-4">
      <h1 className="text-2xl font-bold text-text">공지사항</h1>

      <article className="mt-6 border-t border-text/80">
        <header className="border-b border-line py-5">
          <div className="flex flex-wrap items-center gap-1.5">
            {notice.fixed === 1 && (
              <span className="rounded bg-accent px-1.5 py-0.5 text-[11px] font-bold text-accent-foreground">공지</span>
            )}
            {notice.category && (
              <span className="rounded bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-sub">{notice.category}</span>
            )}
          </div>
          <h2 className="mt-2 text-xl font-bold text-text">{notice.title || "공지사항"}</h2>
          <p className="mt-1.5 text-[12px] text-sub">{notice.dt ? formatDateTime(notice.dt, false) : ""}</p>
        </header>

        <div className="border-b border-line py-6">
          {images.length > 0 && (
            <div className="mb-4 space-y-2">
              {images.map((f) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={f.id} src={f.src || f.thumb || ""} alt={f.name || ""} className="max-w-full rounded-lg" loading="lazy" />
              ))}
            </div>
          )}

          {notice.content && (
            <div className="board-html text-[15px] leading-relaxed text-text" dangerouslySetInnerHTML={{ __html: notice.content }} />
          )}

          {notice.video_src && (
            <div className={`mt-4 overflow-hidden rounded-lg border border-line bg-black ${notice.video_src.includes("instagram.com") ? "aspect-[4/5] max-w-sm" : "aspect-video max-w-md"} w-full`}>
              <iframe src={notice.video_src} className="h-full w-full" allow="autoplay; encrypted-media" allowFullScreen scrolling="no" title="공지 동영상" />
            </div>
          )}

          {notice.url && (
            <a href={notice.url} target="_blank" rel="noopener noreferrer nofollow"
              className="mt-4 inline-flex max-w-full items-center gap-1 truncate text-[13px] text-accent underline underline-offset-2 hover:opacity-80">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
              <span className="truncate">{notice.url}</span>
            </a>
          )}

          {/* 첨부파일(이미지 아님) — 다운로드 */}
          {files.length > 0 && (
            <ul className="mt-4 space-y-1.5">
              {files.map((f) => (
                <li key={f.id}>
                  <a href={f.download || "#"} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2.5 rounded-lg border border-line bg-card px-2.5 py-2 no-underline transition-colors hover:border-accent">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-surface text-sub">
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-text">{f.name || "첨부파일"}</span>
                      <span className="block text-[11px] text-sub">{f.filesize || ""}</span>
                    </span>
                    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-sub" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </article>

      {/* 이전/다음 */}
      <ul className="border-b border-line">
        {prev && (
          <li className="border-b border-line">
            <Link href={`/notice/${prev.id}`} className="flex items-center gap-3 px-1 py-3.5 text-[15px] transition-colors hover:bg-surface">
              <span className="w-12 shrink-0 text-[12px] font-semibold text-sub">다음글</span>
              <span className="min-w-0 flex-1 truncate text-text">{prev.title || "공지사항"}</span>
            </Link>
          </li>
        )}
        {next && (
          <li>
            <Link href={`/notice/${next.id}`} className="flex items-center gap-3 px-1 py-3.5 text-[15px] transition-colors hover:bg-surface">
              <span className="w-12 shrink-0 text-[12px] font-semibold text-sub">이전글</span>
              <span className="min-w-0 flex-1 truncate text-text">{next.title || "공지사항"}</span>
            </Link>
          </li>
        )}
      </ul>

      <div className="mt-6 text-center">
        <Link href="/notice" className="inline-block rounded-lg border border-line px-6 py-2.5 text-[13px] font-semibold text-text transition-colors hover:border-accent hover:text-accent">
          목록
        </Link>
      </div>
    </div>
  );
}
