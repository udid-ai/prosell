import type { Metadata } from "next";
import Link from "next/link";
import { fetchProducts, fetchCategories, fetchProductFacets, categoryPath, getToken, type CategoryNode } from "@/lib/prosell";
import { buildMetadata } from "@/lib/seo";
import ProductListing from "@/components/ProductListing";
import CategoryFilters from "@/components/CategoryFilters";
import { filterState } from "@/lib/productFilters";

export const dynamic = "force-dynamic";

// 카테고리 SEO — 카테고리명 기반.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const key = decodeURIComponent(id);
  const node = findNode(await fetchCategories(), key);
  const title = node?.title || "카테고리";
  return buildMetadata({ title, description: `${title} 카테고리의 상품을 만나보세요.` });
}

// /category/[id] — 카테고리 numeric id 로 라우팅(레거시와 동일: id=식별, code=계층경로).
//   · id 는 카테고리 이동/재정렬에도 불변 → URL(북마크·SEO) 안정.
//   · 상품 조회는 code 프리픽스(subtree)로 하므로 트리에서 id→node→code 로 변환해 넘긴다.
// 방어: 예전 code URL(예: "26-27")도 폴백 해석(상품상세의 category 링크·기존 북마크 호환).
function findNode(tree: CategoryNode[], key: string): CategoryNode | null {
  const stack = [...tree];
  while (stack.length) {
    const n = stack.shift()!;
    if (String(n.id) === key || n.code === key) return n;
    if (n.children?.length) stack.push(...n.children);
  }
  return null;
}

export default async function CategoryView({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; order?: string; limit?: string; brand?: string; color?: string; size?: string; icon?: string; price_min?: string; price_max?: string; instock?: string }>;
}) {
  const { id: raw } = await params;
  const key = decodeURIComponent(raw);
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const order = sp.order || "1";
  const limit = sp.limit || "20";
  const { api: filterApi, query: filterQuery } = filterState(sp);

  // 트리 먼저 조회 → id(또는 code 폴백)로 노드 확정.
  const tree = await fetchCategories();
  const node = findNode(tree, key);
  const code = node?.code ?? key; // 못 찾으면 원문을 code 로 방어 시도
  // 회원 토큰 전달 → 목록 가격도 등급할인(show_*) 반영. 비회원은 공통가라 ISR 캐시 유지(푸시 동시접속 대비).
  const token = await getToken();
  // 필터 패싯(브랜드=이 카테고리에 상품 있는 것만)과 상품 목록을 병렬 조회.
  const [facets, { items, total_count, viewer }] = await Promise.all([
    fetchProductFacets(code),
    fetchProducts({ limit, page: String(page), order, category: code, ...filterApi }, token),
  ]);

  const path = node ? categoryPath(tree, node.code) : [];
  const title = node?.title ?? "카테고리";
  const basePath = `/category/${node ? node.id : encodeURIComponent(key)}`;

  // 하위 카테고리 내비(레거시 getCategorys 규칙):
  //  · 현재 노드에 자식이 있으면 → 자식 목록 표시
  //  · 말단(자식 없음)이면 → 형제(부모의 자식) 목록 표시 + 현재 활성 (예: cat1의 6,7,8,9 는 6 클릭 후에도 유지)
  //  · "전체보기" = 현재 노드의 부모(없으면 루트 /category)
  const parent = path.length >= 2 ? path[path.length - 2] : null;
  const children = node?.children ?? [];
  const navItems: CategoryNode[] = children.length > 0 ? children : (parent ? parent.children : (node ? tree : []));
  const navActiveId = children.length > 0 ? null : node?.id ?? null; // 말단일 때 현재 카테고리 활성
  const allHref = parent ? `/category/${parent.id}` : "/category";

  return (
    <div className="mx-auto max-w-content px-4 py-6">
      {/* 브레드크럼 (id 링크) */}
      <nav className="flex flex-wrap items-center gap-1 text-[13px] text-sub">
        <Link href="/category" className="hover:text-accent">전체</Link>
        {path.map((n) => (
          <span key={n.id} className="flex items-center gap-1">
            <span className="opacity-40">/</span>
            <Link href={`/category/${n.id}`} className="hover:text-accent">{n.title}</Link>
          </span>
        ))}
      </nav>

      {/* 제목 + 우측 필터 아이콘 + (아래) 하위 카테고리 칩 + 필터 패널 */}
      <div className="mt-1">
        <CategoryFilters
          facets={facets}
          basePath={basePath}
          heading={<h1 className="truncate text-[22px] font-bold">{title}</h1>}
          subnav={navItems.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {/* 전체보기 = 현재 카테고리의 부모(또는 루트) */}
              <Link href={allHref}
                className="rounded-full border border-line bg-card px-3 py-1.5 text-[13px] text-text hover:border-accent hover:text-accent">
                전체보기
              </Link>
              {navItems.map((s) => {
                const active = s.id === navActiveId;
                return (
                  <Link key={s.id} href={`/category/${s.id}`}
                    className={`rounded-full border px-3 py-1.5 text-[13px] ${active ? "border-accent bg-accent/5 font-semibold text-accent" : "border-line bg-card text-text hover:border-accent hover:text-accent"}`}>
                    {s.title}
                  </Link>
                );
              })}
            </div>
          ) : undefined}
        />
      </div>

      <ProductListing
        items={items}
        total={total_count}
        page={page}
        order={order}
        limit={limit}
        basePath={basePath}
        query={filterQuery}
        demoFallback={false}
        adultAllowed={viewer?.adult === 1}
        hideSorts={["0"]}
      />
    </div>
  );
}
