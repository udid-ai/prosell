import Link from "next/link";
import type { BbsBoard, BbsArticleSummary } from "@/lib/prosell";

// 게시판 목록 테이블(헤더 + 공지 + 게시물). 목록 페이지와 상세 하단(view_list) 공용.
export default function BbsArticleTable({
  bbsId, board, notices, articles, emptyText, currentId,
}: {
  bbsId: string;
  board: BbsBoard;
  notices: BbsArticleSummary[];
  articles: BbsArticleSummary[];
  emptyText: string;
  currentId?: number;   // 상세 하단일 때 현재 글 강조
}) {
  const f = board.fields_list;

  const Row = ({ a, notice }: { a: BbsArticleSummary; notice?: boolean }) => {
    const cur = currentId === a.id;
    return (
      <li className={`flex items-center gap-3 border-b border-line px-2 py-3 text-sm ${notice ? "bg-accent/5" : ""} ${cur ? "bg-accent/10" : ""}`}>
        {f.num && (
          <span className="w-12 shrink-0 text-center text-[13px] text-sub">
            {notice ? <span className="rounded bg-accent px-1.5 py-0.5 text-[11px] font-bold text-accent-foreground">공지</span> : a.number}
          </span>
        )}
        {f.ct && a.category && (
          <span className="hidden w-16 shrink-0 truncate text-center text-[12px] text-sub sm:block">{a.category}</span>
        )}
        <span className="min-w-0 flex-1">
          <Link href={`/board/${bbsId}/${a.id}`} className={`inline-flex items-center gap-1.5 hover:text-accent ${cur ? "font-bold text-accent" : "text-text"}`}>
            {a.secret === 1 && <LockIcon />}
            <span className="truncate">{a.title}</span>
            {a.reply_count > 0 && <span className="text-[12px] font-bold text-accent">[{a.reply_count}]</span>}
            {a.has_file === 1 && <ClipIcon />}
            {a.is_new === 1 && <span className="rounded bg-red-500 px-1 text-[10px] font-bold leading-4 text-white">N</span>}
          </Link>
        </span>
        {f.name && <span className="hidden w-24 shrink-0 truncate text-center text-[12px] text-sub sm:block">{a.name || "비회원"}</span>}
        {f.dt && <span className="w-16 shrink-0 text-right text-[12px] text-sub">{a.dt}</span>}
        {f.view && <span className="hidden w-12 shrink-0 text-right text-[12px] text-sub sm:block">{a.view}</span>}
        {f.good && <span className="hidden w-12 shrink-0 text-right text-[12px] text-sub sm:block">{a.good}</span>}
        {f.nogood && <span className="hidden w-12 shrink-0 text-right text-[12px] text-sub sm:block">{a.nogood}</span>}
      </li>
    );
  };

  return (
    <ul className="border-t-2 border-text/80">
      {/* 컬럼 헤더(th) */}
      <li className="flex items-center gap-3 border-b border-line bg-surface/60 px-2 py-2.5 text-[12px] font-semibold text-sub">
        {f.num && <span className="w-12 shrink-0 text-center">번호</span>}
        {f.ct && <span className="hidden w-16 shrink-0 text-center sm:block">분류</span>}
        <span className="min-w-0 flex-1 pl-1">제목</span>
        {f.name && <span className="hidden w-24 shrink-0 text-center sm:block">작성자</span>}
        {f.dt && <span className="w-16 shrink-0 text-right">작성일</span>}
        {f.view && <span className="hidden w-12 shrink-0 text-right sm:block">조회</span>}
        {f.good && <span className="hidden w-12 shrink-0 text-right sm:block">추천</span>}
        {f.nogood && <span className="hidden w-12 shrink-0 text-right sm:block">비추천</span>}
      </li>
      {notices.map((a) => <Row key={`n-${a.id}`} a={a} notice />)}
      {articles.length === 0 && notices.length === 0 ? (
        <li className="border-b border-line px-2 py-16 text-center text-sub">{emptyText}</li>
      ) : (
        articles.map((a) => <Row key={a.id} a={a} />)
      )}
    </ul>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-sub" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="5" y="11" width="14" height="9" rx="1.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
function ClipIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-sub" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M21 12.5 12.5 21a5 5 0 0 1-7-7l8-8a3.5 3.5 0 1 1 5 5l-8 8a2 2 0 0 1-3-3l7-7" />
    </svg>
  );
}
