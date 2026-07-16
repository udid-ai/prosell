import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { fetchFaqs } from "@/lib/prosell";
import BoardSearch from "@/components/BoardSearch";
import FaqList from "@/components/FaqList";
import Pagination from "@/components/Pagination";

export const metadata = buildMetadata({ title: "자주 묻는 질문", description: "자주 묻는 질문(FAQ)을 확인하세요." });

export const dynamic = "force-dynamic";

const LIMIT = 10;

/** 카테고리 탭 링크 — 검색어는 유지하고 페이지는 1로 되돌린다(다른 분류의 3페이지는 의미가 없다). */
function faqHref(params: { category?: string; q?: string }): string {
  const sp = new URLSearchParams();
  if (params.category) sp.set("category", params.category);
  if (params.q) sp.set("q", params.q);
  const qs = sp.toString();
  return qs ? `/faq?${qs}` : "/faq";
}

// 자주묻는 질문 — board_type 인식(통합 cs_article_board / 개별 cs_article_faq)은 백엔드가 흡수한다.
//  · 카테고리 탭 — 게시판 설정(통합 board.category_list / 개별 cs.cs_ct_list)에서 온다.
//  · 질문을 누르면 답변이 펼쳐지는 아코디언(FaqList).
export default async function FaqPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; category?: string; q?: string }>;
}) {
  const { page: pageStr, category: categoryRaw, q: qRaw } = await searchParams;
  const page = Math.max(1, Number(pageStr) || 1);
  const q = (qRaw || "").trim();
  const category = (categoryRaw || "").trim();

  const list = await fetchFaqs({ page, limit: LIMIT, category: category || undefined, q: q || undefined });
  const useCategory = list.board.use_category === 1 && list.board.categories.length > 0;
  const filtered = !!(category || q);

  // 페이징에 유지할 필터(빈 값은 URL 에 넣지 않는다)
  const pageQuery: Record<string, string> = {};
  if (category) pageQuery.category = category;
  if (q) pageQuery.q = q;

  const tabCls = (on: boolean) =>
    `shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${
      on ? "border-accent bg-accent font-semibold text-accent-foreground" : "border-line text-sub hover:border-accent hover:text-accent"
    }`;

  return (
    <div className="mx-auto my-10 max-w-content px-4">
      <h1 className="text-center text-3xl font-bold tracking-tight text-text">자주묻는 질문</h1>

      {/* 분류 탭 — 중앙 정렬. 개수가 많으면 줄바꿈(가로 스크롤은 중앙정렬과 함께 쓰면 왼쪽이 잘린다). */}
      {useCategory && (
        <div className="mt-5 flex flex-wrap justify-center gap-1.5">
          <Link href={faqHref({ q })} className={tabCls(!category)}>전체</Link>
          {list.board.categories.map((c) => (
            <Link key={c} href={faqHref({ category: c, q })} className={tabCls(category === c)}>{c}</Link>
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
        <BoardSearch basePath="/faq" initialQuery={q} category={category} placeholder="질문으로 검색" label="자주묻는 질문 검색" />
      </div>

      {list.items.length === 0 ? (
        <p className="mt-4 rounded-md border border-line bg-card p-12 text-center text-sub">
          {filtered ? "조건에 맞는 질문이 없습니다." : "등록된 질문이 없습니다."}
        </p>
      ) : (
        <>
          <FaqList items={list.items} />
          {/* 페이징 — 공용 컴포넌트(5페이지 블록 + 첫/마지막 이동). 카테고리·검색어를 유지한다. */}
          <Pagination total={list.total_count} page={page} perPage={LIMIT} basePath="/faq" query={pageQuery} />
        </>
      )}
    </div>
  );
}
