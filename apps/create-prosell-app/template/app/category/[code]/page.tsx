import Link from "next/link";
import { fetchProducts, fetchCategories, categoryPath } from "@/lib/prosell";
import ProductListing from "@/components/ProductListing";

export const dynamic = "force-dynamic";

// /category/[code] — 해당 카테고리(code)의 상품 목록. code 예: "1", "1-6", "1-6-30".
export default async function CategoryView({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ page?: string; order?: string; limit?: string }>;
}) {
  const { code: raw } = await params;
  const code = decodeURIComponent(raw);
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const order = sp.order || "1";
  const limit = sp.limit || "20";

  const [{ items, total_count }, tree] = await Promise.all([
    fetchProducts({ limit, page: String(page), order, category: code }),
    fetchCategories(),
  ]);

  const path = categoryPath(tree, code);
  const current = path[path.length - 1];
  const title = current?.title ?? "카테고리";
  const subs = current?.children ?? [];

  return (
    <main className="mx-auto max-w-content p-6">
      {/* 브레드크럼 */}
      <nav className="flex flex-wrap items-center gap-1 text-[13px] text-sub">
        <Link href="/category" className="hover:text-accent">전체</Link>
        {path.map((n) => (
          <span key={n.id} className="flex items-center gap-1">
            <span className="opacity-40">/</span>
            <Link href={`/category/${encodeURIComponent(n.code)}`} className="hover:text-accent">{n.title}</Link>
          </span>
        ))}
      </nav>

      <h1 className="mt-1 text-[22px] font-bold">{title}</h1>

      {/* 하위 카테고리 칩 */}
      {subs.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {subs.map((s) => (
            <Link
              key={s.id}
              href={`/category/${encodeURIComponent(s.code)}`}
              className="rounded-full border border-line bg-card px-3 py-1.5 text-[13px] text-text hover:border-accent hover:text-accent"
            >
              {s.title}
            </Link>
          ))}
        </div>
      )}

      <ProductListing
        items={items}
        total={total_count}
        page={page}
        order={order}
        limit={limit}
        basePath={`/category/${encodeURIComponent(code)}`}
      />
    </main>
  );
}
