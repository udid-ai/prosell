import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { fetchNotices } from "@/lib/prosell";
import { formatDateTime } from "@/lib/format";
import BoardSearch from "@/components/BoardSearch";
import Pagination from "@/components/Pagination";

export const metadata = buildMetadata({ title: "공지사항", description: "쇼핑몰 공지사항을 확인하세요." });

export const dynamic = "force-dynamic";

const LIMIT = 10;

/** 카테고리 탭 링크 — 검색어는 유지하고 페이지는 1로 되돌린다(다른 분류의 3페이지는 의미가 없다). */
function noticeHref(params: { category?: string; q?: string }): string {
  const sp = new URLSearchParams();
  if (params.category) sp.set("category", params.category);
  if (params.q) sp.set("q", params.q);
  const qs = sp.toString();
  return qs ? `/notice?${qs}` : "/notice";
}

// 공지사항 목록 — board_type 인식(통합 cs_article_board / 개별 cs_article_notice)은 백엔드가 흡수한다.
//  · 카테고리 탭 — 게시판 설정(통합 board.category_list / 개별 cs.cs_ct_list)에서 온다.
//  · 검색 — 제목 LIKE. 상태는 URL(?q=)에 둔다.
//  · 상단고정(fixed)은 목록 맨 위로 올리고 «공지» 배지를 단다.
export default async function NoticePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; category?: string; q?: string }>;
}) {
  const { page: pageStr, category: categoryRaw, q: qRaw } = await searchParams;
  const page = Math.max(1, Number(pageStr) || 1);
  const q = (qRaw || "").trim();
  const category = (categoryRaw || "").trim();

  const list = await fetchNotices({ page, limit: LIMIT, category: category || undefined, q: q || undefined });
  const useCategory = list.board.use_category === 1 && list.board.categories.length > 0;

  // 페이징에 유지할 필터(빈 값은 URL 에 넣지 않는다)
  const pageQuery: Record<string, string> = {};
  if (category) pageQuery.category = category;
  if (q) pageQuery.q = q;

  // 상단고정 먼저 — 그 안에서는 백엔드 정렬(최신순)을 유지한다.
  const items = [...list.items].sort((a, b) => (b.fixed ? 1 : 0) - (a.fixed ? 1 : 0));
  const filtered = !!(category || q);

  const tabCls = (on: boolean) =>
    `shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${
      on ? "border-accent bg-accent font-semibold text-accent-foreground" : "border-line text-sub hover:border-accent hover:text-accent"
    }`;

  return (
    <div className="mx-auto my-10 max-w-content px-4">
      <h1 className="text-center text-3xl font-bold tracking-tight text-text">공지사항</h1>

      {/* 분류 탭 — 중앙 정렬. 개수가 많으면 줄바꿈(가로 스크롤은 중앙정렬과 함께 쓰면 왼쪽이 잘린다). */}
      {useCategory && (
        <div className="mt-5 flex flex-wrap justify-center gap-1.5">
          <Link href={noticeHref({ q })} className={tabCls(!category)}>전체</Link>
          {list.board.categories.map((c) => (
            <Link key={c} href={noticeHref({ category: c, q })} className={tabCls(category === c)}>{c}</Link>
          ))}
        </div>
      )}

      {/* 좌: 전체 카운트(+현재 필터) / 우: 검색 */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="min-w-0 text-[13px] text-sub">
          전체 <strong className="font-bold text-text">{list.total_count.toLocaleString()}</strong>건
          {category && <> · 분류 <strong className="font-semibold text-text">{category}</strong></>}
          {q && <> · <strong className="font-semibold text-text">&ldquo;{q}&rdquo;</strong> 검색 결과</>}
        </p>
        <BoardSearch basePath="/notice" initialQuery={q} category={category} placeholder="제목으로 검색" label="공지사항 제목 검색" />
      </div>

      {items.length === 0 ? (
        <p className="mt-4 rounded-md border border-line bg-card p-12 text-center text-sub">
          {filtered ? "조건에 맞는 공지사항이 없습니다." : "등록된 공지사항이 없습니다."}
        </p>
      ) : (
        <>
          <ul className="mt-3 border-t border-text/80">
            {items.map((n) => (
              <li key={n.id} className="border-b border-line">
                {/* 제목 16px 기준 — 배지·번호·날짜는 12px 로 낮춰 위계를 만든다. 행 높이도 제목에 맞춰 넉넉히. */}
                <Link href={`/notice/${n.id}`} className="flex items-center gap-3 px-1 py-[18px] transition-colors hover:bg-surface">
                  {n.fixed === 1 ? (
                    <span className="shrink-0 rounded bg-accent px-2 py-1 text-[12px] font-bold leading-none text-accent-foreground">공지</span>
                  ) : (
                    <span className="w-9 shrink-0 text-center text-[13px] text-sub">{n.id}</span>
                  )}
                  {n.category && (
                    <span className="shrink-0 rounded bg-surface px-2 py-1 text-[12px] font-semibold leading-none text-sub">{n.category}</span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-base font-medium text-text">{n.title || "공지사항"}</span>
                  <span className="hidden shrink-0 text-[13px] text-sub sm:inline">{n.dt ? formatDateTime(n.dt, false) : ""}</span>
                </Link>
              </li>
            ))}
          </ul>

          {/* 페이징 — 공용 컴포넌트(5페이지 블록 + 첫/마지막 이동). 카테고리·검색어를 유지한다. */}
          <Pagination total={list.total_count} page={page} perPage={LIMIT} basePath="/notice" query={pageQuery} />
        </>
      )}
    </div>
  );
}
