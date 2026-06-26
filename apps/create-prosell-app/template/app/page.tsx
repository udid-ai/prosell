import { fetchProducts } from "@/lib/prosell";
import ProductListing from "@/components/ProductListing";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ page?: string; order?: string; limit?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const order = sp.order || "1";
  const limit = sp.limit || "20";

  const { items, total_count } = await fetchProducts({ limit, page: String(page), order });

  return (
    <main className="mx-auto max-w-content p-6">
      <h1 className="text-[22px] font-bold">상품</h1>
      <ProductListing items={items} total={total_count} page={page} order={order} limit={limit} basePath="/" />
    </main>
  );
}
