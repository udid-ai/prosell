import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchProductView, fetchAddoptions, getToken } from "@/lib/prosell";
import ProductDetail from "@/components/ProductDetail";
import ProductTabs from "@/components/ProductTabs";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await getToken(); // 로그인 시 회원가(등급 할인) 반영
  const pv = await fetchProductView(id, token);
  if (!pv) notFound();

  // 추가 주문옵션(addoption) 해석
  const addoptions = pv.addoption.length ? await fetchAddoptions(pv.addoption, token) : [];

  return (
    <main className="mx-auto max-w-content p-4 sm:p-6">
      {/* 브레드크럼 */}
      <nav className="mb-4 flex items-center gap-1 text-[13px] text-sub">
        <Link href="/" className="hover:text-accent">홈</Link>
        <span className="opacity-40">/</span>
        {pv.category ? (
          <Link href={`/category/${encodeURIComponent(pv.category)}`} className="hover:text-accent">카테고리</Link>
        ) : (
          <span>상품</span>
        )}
      </nav>

      <ProductDetail pv={pv} addoptions={addoptions} />

      <ProductTabs
        detailHtml={pv.detail_html}
        information={pv.information}
        shipping={pv.shipping}
        reviewCnt={pv.report.review_cnt}
        inquiryCnt={pv.report.inquiry_cnt}
      />
    </main>
  );
}
