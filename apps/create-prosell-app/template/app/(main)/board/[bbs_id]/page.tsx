import Link from "next/link";
import { notFound } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import { getToken, fetchBbsList } from "@/lib/prosell";
import Pagination from "@/components/Pagination";
import BbsSearch from "@/components/BbsSearch";
import BbsArticleTable from "@/components/BbsArticleTable";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ bbs_id: string }> }) {
  const { bbs_id } = await params;
  const list = await fetchBbsList(bbs_id, { page: 1 });
  return buildMetadata({ title: list.board?.title ?? "게시판", description: list.board?.slogan || "게시판" });
}

// 자유게시판 목록 — 공개 읽기(회원이면 토큰으로 본인글/비밀글 컨텍스트 반영).
export default async function BbsListPage({
  params, searchParams,
}: {
  params: Promise<{ bbs_id: string }>;
  searchParams: Promise<{ page?: string; ct?: string; q?: string }>;
}) {
  const { bbs_id } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const token = await getToken();

  const q = (sp.q ?? "").trim();
  const list = await fetchBbsList(bbs_id, { page, ct: sp.ct, c: q ? 3 : undefined, q: q || undefined }, token);
  if (!list.board) notFound();

  const b = list.board;
  const rows = b.rows || 20;
  const catQuery: Record<string, string> = {};
  if (sp.ct) catQuery.ct = sp.ct;
  if (q) catQuery.q = q;

  // 목록 열람 권한 없음 — 등급 미달.
  if (list.blocked) {
    return (
      <div className="mx-auto my-10 max-w-content px-4">
        <header className="text-center">
          <h1 className="text-2xl font-bold text-text">{b.title}</h1>
        </header>
        <div className="mx-auto mt-8 max-w-sm rounded-md border border-line bg-card p-8 text-center">
          <h2 className="text-lg font-bold text-text">열람 권한이 없습니다</h2>
          <p className="mt-1 text-[13px] text-sub">이 게시판은 <b className="text-text">등급 {b.list_level}</b> 이상 회원만 볼 수 있습니다.</p>
          {!token && <Link href="/auth/login" className="mt-5 inline-block rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground">로그인</Link>}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto my-10 max-w-content px-4">
      <header className="text-center">
        <h1 className="text-2xl font-bold text-text">{b.title}</h1>
        {b.slogan && <p className="mt-1 text-sm text-sub">{b.slogan}</p>}
      </header>

      {/* 카테고리 탭 */}
      {b.use_category && b.categories.length > 0 && (
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <CatTab bbsId={bbs_id} label="전체" active={!sp.ct} />
          {b.categories.map((c) => (
            <CatTab key={c} bbsId={bbs_id} label={c} ct={c} active={sp.ct === c} />
          ))}
        </div>
      )}

      <div className="mt-6 flex items-center justify-between">
        <p className="text-[13px] text-sub">전체 {list.total_count.toLocaleString("ko-KR")}건</p>
        {b.can_write === 1 && (
          <Link href={`/board/${bbs_id}/write`} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">
            글쓰기
          </Link>
        )}
      </div>

      <div className="mt-3">
        <BbsArticleTable
          bbsId={bbs_id}
          board={b}
          notices={list.notices}
          articles={list.articles}
          emptyText={q ? "검색 결과가 없습니다." : "등록된 게시물이 없습니다."}
        />
      </div>

      <div className="mt-8">
        <Pagination total={list.total_count} page={page} perPage={rows} basePath={`/board/${bbs_id}`} query={catQuery} />
      </div>

      <div className="mt-6 flex justify-center">
        <BbsSearch bbsId={bbs_id} ct={sp.ct} defaultValue={q} />
      </div>
    </div>
  );
}

function CatTab({ bbsId, label, ct, active }: { bbsId: string; label: string; ct?: string; active: boolean }) {
  const href = ct ? `/board/${bbsId}?ct=${encodeURIComponent(ct)}` : `/board/${bbsId}`;
  return (
    <Link href={href}
      className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${active ? "border-accent bg-accent text-accent-foreground" : "border-line text-sub hover:border-accent hover:text-accent"}`}>
      {label}
    </Link>
  );
}
