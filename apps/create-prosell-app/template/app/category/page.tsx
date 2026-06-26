import Link from "next/link";
import { fetchProducts, fetchCategories } from "@/lib/prosell";
import ProductListing from "@/components/ProductListing";

export const dynamic = "force-dynamic";

// /category — 전체 상품 + 대분류 바로가기 칩.
export default async function CategoryAll({ searchParams }: { searchParams: Promise<{ page?: string; order?: string; limit?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const order = sp.order || "1";
  const limit = sp.limit || "20";

  const [{ items, total_count }, tree] = await Promise.all([
    fetchProducts({ limit, page: String(page), order }),
    fetchCategories(),
  ]);

  return (
    <main className="mx-auto max-w-content p-6">
      <h1 className="text-[22px] font-bold">전체 상품</h1>

      {tree.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {tree.map((c) => (
            <Link
              key={c.id}
              href={`/category/${encodeURIComponent(c.code)}`}
              className="rounded-full border border-line bg-card px-3 py-1.5 text-[13px] text-text hover:border-accent hover:text-accent"
            >
              {c.title}
            </Link>
          ))}
        </div>
      )}

      <ProductListing items={items} total={total_count} page={page} order={order} limit={limit} basePath="/category" />
    </main>
  );
}
