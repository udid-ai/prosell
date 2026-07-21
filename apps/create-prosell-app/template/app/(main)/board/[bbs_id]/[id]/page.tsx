import Link from "next/link";
import { notFound } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import { getToken, fetchBbsArticle, fetchBbsList } from "@/lib/prosell";
import { renderContent } from "@/lib/sanitize";
import BbsArticleTable from "@/components/BbsArticleTable";
import BbsVote from "@/components/BbsVote";
import BbsReportButton from "@/components/BbsReportButton";
import BbsReplies from "@/components/BbsReplies";
import BbsSecretGate from "@/components/BbsSecretGate";
import BbsArticleActions from "@/components/BbsArticleActions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ bbs_id: string; id: string }> }) {
  const { bbs_id, id } = await params;
  const v = await fetchBbsArticle(bbs_id, id);
  return buildMetadata({ title: v?.article?.locked ? "비밀글" : (v?.article?.title ?? "게시물"), noindex: !!v?.article?.secret });
}

export default async function BbsArticlePage({ params }: { params: Promise<{ bbs_id: string; id: string }> }) {
  const { bbs_id, id } = await params;
  const token = await getToken();
  const view = await fetchBbsArticle(bbs_id, id, {}, token);
  if (!view || !view.article) notFound();

  const { board, article, prev, next, replies } = view;
  const listHref = `/board/${bbs_id}`;

  // 열람 등급 미달 — 본문 비공개.
  if (article.view_blocked) {
    return (
      <div className="mx-auto my-10 max-w-content px-4">
        <div className="mx-auto max-w-sm rounded-md border border-line bg-card p-8 text-center">
          <h1 className="text-lg font-bold text-text">열람 권한이 없습니다</h1>
          <p className="mt-1 text-[13px] text-sub">이 게시물은 <b className="text-text">등급 {board?.view_level ?? ""}</b> 이상 회원만 볼 수 있습니다.</p>
          <Link href={listHref} className="mt-5 inline-block rounded-md border border-line px-4 py-2 text-[13px] text-text hover:border-accent hover:text-accent">목록으로</Link>
        </div>
      </div>
    );
  }

  // 성인글 차단 — 성인 인증(또는 관리자)이 아니면 본문 비공개.
  if (article.adult_blocked) {
    return (
      <div className="mx-auto my-10 max-w-content px-4">
        <div className="mx-auto max-w-sm rounded-md border border-line bg-card p-8 text-center">
          <h1 className="text-lg font-bold text-text">성인 인증이 필요합니다</h1>
          <p className="mt-1 text-[13px] text-sub">이 게시물은 성인 인증 후 열람할 수 있습니다.</p>
          <Link href={listHref} className="mt-5 inline-block rounded-md border border-line px-4 py-2 text-[13px] text-text hover:border-accent hover:text-accent">목록으로</Link>
        </div>
      </div>
    );
  }

  // 비밀글 잠김 — 비회원은 비밀번호 입력으로 열람(회원 본인/관리자는 이미 열림).
  if (article.locked) {
    return (
      <div className="mx-auto my-10 max-w-content px-4">
        <BbsSecretGate bbsId={bbs_id} id={article.id} listHref={listHref} board={board} isGuestAuthor={article.is_guest} />
      </div>
    );
  }

  // view_list 설정이면 상세 하단에 게시물 리스트를 노출(이전/다음 대신).
  const showList = board?.view_list === 1;
  const list = showList ? await fetchBbsList(bbs_id, { page: 1 }, token) : null;

  return (
    <div className="mx-auto my-10 max-w-content px-4">
      <h1 className="text-center text-2xl font-bold text-text">
        <Link href={listHref} className="hover:text-accent">{board?.title}</Link>
      </h1>

      <article className="mt-6 border-t-2 border-text/80">
        <header className="border-b border-line py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {article.category && <span className="rounded bg-surface px-2 py-0.5 text-[12px] text-sub">{article.category}</span>}
              <h2 className="text-lg font-bold text-text">{article.title}</h2>
            </div>
            {/* 수정/삭제 — 제목 우측 끝 */}
            {(article.can_edit === 1 || article.can_delete === 1) && (
              <BbsArticleActions bbsId={bbs_id} id={article.id} canEdit={article.can_edit === 1} canDelete={article.can_delete === 1} listHref={listHref} />
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-sub">
            <span>{article.name || "비회원"}</span>
            <span>{article.dt}</span>
            <span>조회 {article.view}</span>
            {board && board.police === 1 && article.is_mine !== 1 && (
              <BbsReportButton bbsId={bbs_id} articleId={article.id} reasons={board.report_reasons} loggedIn={!!token} compact />
            )}
          </div>
        </header>

        {/* 첨부파일 — 내용 위쪽(다운로드) */}
        {article.files.length > 0 && (
          <div className="border-b border-line py-4">
            <p className="mb-2 text-[13px] font-semibold text-text">첨부파일</p>
            <ul className="space-y-1.5">
              {article.files.map((f) => (
                <li key={f.id}>
                  <a href={f.href} className="inline-flex items-center gap-1.5 text-[13px] text-accent hover:underline">
                    <ClipIcon /> {f.name} <span className="text-sub">({fmtSize(f.size)})</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 본문(위지윅 HTML — renderContent 로 새니타이즈) */}
        <div className="board-html min-h-[120px] break-words py-6 text-[15px] leading-relaxed text-text"
          dangerouslySetInnerHTML={{ __html: renderContent(article.content ?? "") }} />

        {/* 동영상(YouTube/Vimeo) */}
        {article.videos.length > 0 && (
          <div className="flex flex-col gap-3 pb-6">
            {article.videos.map((v, i) => {
              const src = embedUrl(v);
              return src ? (
                <div key={i} className="relative aspect-video w-full overflow-hidden rounded-md">
                  <iframe src={src} className="absolute inset-0 h-full w-full" allowFullScreen title={`video-${i}`} />
                </div>
              ) : null;
            })}
          </div>
        )}

        {/* 본문 이미지 — items-start 로 flex 세로배치의 가로 stretch(원본 확대) 방지 */}
        {article.images.length > 0 && (
          <div className="flex flex-col items-start gap-3 pb-6">
            {article.images.map((img, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={img.url} alt="" className="h-auto w-auto max-w-full rounded-md" />
            ))}
          </div>
        )}

        {/* 링크/해시태그 */}
        {(article.url || article.hashtags.length > 0) && (
          <div className="border-t border-line py-4 text-[13px]">
            {article.url && (
              <a href={article.url} target="_blank" rel="noopener noreferrer nofollow"
                className="mb-1 inline-flex max-w-full items-center gap-1 truncate text-accent underline underline-offset-2 hover:opacity-80">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                <span className="truncate">{article.url}</span>
              </a>
            )}
            {article.hashtags.length > 0 && (
              <p className="flex flex-wrap gap-1.5 text-sub">{article.hashtags.map((t) => <span key={t}>#{t}</span>)}</p>
            )}
          </div>
        )}
      </article>

      {/* 추천/반대 — 내용 하단 */}
      {board && board.good > 0 && (
        <div className="mt-6">
          <BbsVote
            bbsId={bbs_id}
            articleId={article.id}
            good={article.good}
            nogood={article.nogood}
            showGood={board.good === 1 || board.good === 3}
            showNogood={board.good === 2 || board.good === 3}
          />
        </div>
      )}

      {/* 댓글 */}
      {board && board.reply === 1 && (
        <BbsReplies bbsId={bbs_id} articleId={article.id} initial={replies} loggedIn={!!token} replyGood={board.reply_good} police={board.police} reportReasons={board.report_reasons} />
      )}

      {/* 목록 버튼 — 댓글 아래, 좌측 정렬 */}
      <div className="mt-6 flex justify-start">
        <Link href={listHref} className="rounded-md border border-line px-4 py-2 text-sm text-text hover:border-accent hover:text-accent">목록</Link>
      </div>

      {/* 하단 — view_list 면 게시물 리스트, 아니면 이전/다음(댓글 아래) */}
      {showList && list?.board ? (
        <div className="mt-8">
          <BbsArticleTable
            bbsId={bbs_id}
            board={list.board}
            notices={list.notices}
            articles={list.articles}
            emptyText="등록된 게시물이 없습니다."
            currentId={article.id}
          />
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-line border-y border-line text-sm">
          <PrevNext label="이전글" item={prev} bbsId={bbs_id} />
          <PrevNext label="다음글" item={next} bbsId={bbs_id} />
        </ul>
      )}
    </div>
  );
}

function PrevNext({ label, item, bbsId }: { label: string; item: { id: number; title: string; secret: number } | null; bbsId: string }) {
  return (
    <li className="flex items-center gap-3 px-2 py-3">
      <span className="w-14 shrink-0 text-[12px] text-sub">{label}</span>
      {item ? (
        <Link href={`/board/${bbsId}/${item.id}`} className="min-w-0 flex-1 truncate text-text hover:text-accent">
          {item.secret === 1 ? "비밀글입니다." : item.title}
        </Link>
      ) : (
        <span className="text-sub">없음</span>
      )}
    </li>
  );
}

function ClipIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M21 12.5 12.5 21a5 5 0 0 1-7-7l8-8a3.5 3.5 0 1 1 5 5l-8 8a2 2 0 0 1-3-3l7-7" />
    </svg>
  );
}
// YouTube/Vimeo 주소 → 임베드 URL(허용 호스트만; 그 외 null).
function embedUrl(raw: string): string | null {
  const u = raw.trim();
  let m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/i);
  if (m) return `https://www.youtube.com/embed/${m[1]}`;
  m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (m) return `https://player.vimeo.com/video/${m[1]}`;
  return null;
}
function fmtSize(n: number) {
  if (!n) return "0B";
  if (n < 1024) return `${n}B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1048576).toFixed(1)}MB`;
}
