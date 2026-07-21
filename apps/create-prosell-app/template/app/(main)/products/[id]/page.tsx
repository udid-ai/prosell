import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { fetchProductView, fetchAddoptions, fetchProductCoupons, checkWishlist, getToken, fetchProductReviews, fetchProductInquiries, fetchCategories, categoryPath } from "@/lib/prosell";
import { buildMetadata, SITE_NAME } from "@/lib/seo";
import ProductDetail from "@/components/ProductDetail";
import RecordHistory from "@/components/RecordHistory";
import ProductTabs from "@/components/ProductTabs";
import ReviewSwiper from "@/components/ReviewSwiper";

export const dynamic = "force-dynamic";

// 상품 SEO — 레거시 seo_use 시 seo_*, 아니면 상품명/요약/대표이미지.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const pv = await fetchProductView(id).catch(() => null);
  if (!pv) return { title: SITE_NAME };
  // 성인상품(adult) 또는 열람 등급 제한(level_view>0)이면 대표이미지를 SEO(og:image 등)에 노출하지 않는다.
  const restricted = pv.adult === 1 || (pv.state?.level_view ?? 0) > 0;
  return buildMetadata({
    title: pv.seo.title || pv.title,
    description: pv.seo.description || pv.summary || pv.title,
    keywords: pv.seo.keywords,
    image: restricted ? undefined : pv.gallery?.[0]?.src,
  });
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await getToken(); // 로그인 시 회원가(등급 할인) 반영
  const pv = await fetchProductView(id, token);
  if (!pv) notFound();
  // 판매중지/숨김(onoff=0) 상품은 상세 접근 시 목록으로 이동(레거시 공개 노출 규칙과 동일).
  if (pv.state?.onoff === 0) redirect("/");

  // 성인상품(권한 없음) — 상품 관련 컴포넌트는 렌더하지 않고 성인인증 안내만 단독 노출(레거시 성인 게이트).
  if (pv.state?.block === "adult") {
    const loggedIn = !!token;
    return (
      <div className="mx-auto grid min-h-[60vh] max-w-content place-items-center px-4 py-6">
        <div className="w-full max-w-md rounded-2xl border border-line bg-card p-8 text-center shadow-card">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full border-2 border-sale text-xl font-extrabold text-sale">19</span>
          <h1 className="mt-5 text-lg font-bold text-text">성인인증이 필요한 상품입니다</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-sub">
            청소년유해매체물로 분류된 상품으로,<br />성인인증 후 이용하실 수 있습니다.
          </p>
          <div className="mt-6">
            {loggedIn ? (
              <p className="rounded-md bg-surface px-4 py-3 text-[13px] text-sub">
                성인인증이 완료되지 않은 계정입니다.<br />본인인증(성인) 후 다시 시도해 주세요.
              </p>
            ) : (
              <Link href="/auth/login"
                className="inline-flex h-11 w-full items-center justify-center rounded-md bg-accent text-sm font-bold text-accent-foreground hover:opacity-90">
                로그인하고 인증하기
              </Link>
            )}
          </div>
          <Link href="/" className="mt-4 inline-block text-[13px] text-sub underline underline-offset-2 hover:text-text">쇼핑 계속하기</Link>
        </div>
      </div>
    );
  }

  // 접근 권한(level_view) 미달 — 상품 관련 컴포넌트를 렌더하지 않고 등급 안내만 단독 노출(레거시 등급 열람제한 게이트).
  if (pv.state?.block === "level") {
    const loggedIn = !!token;
    const levelName = pv.state.level_view_name || "";
    return (
      <div className="mx-auto grid min-h-[60vh] max-w-content place-items-center px-4 py-6">
        <div className="w-full max-w-md rounded-2xl border border-line bg-card p-8 text-center shadow-card">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full border-2 border-accent text-accent">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
          </span>
          <h1 className="mt-5 text-lg font-bold text-text">열람 권한이 필요한 상품입니다</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-sub">
            {levelName
              ? <><b className="text-text">{levelName}</b> 등급 이상 회원만<br />열람하실 수 있는 상품입니다.</>
              : <>회원 등급에 따라<br />열람하실 수 있는 상품입니다.</>}
          </p>
          <div className="mt-6">
            {loggedIn ? (
              <p className="rounded-md bg-surface px-4 py-3 text-[13px] text-sub">
                현재 등급으로는 열람할 수 없습니다.{levelName ? <><br />{levelName} 등급 이상에서 이용해 주세요.</> : null}
              </p>
            ) : (
              <Link href="/auth/login"
                className="inline-flex h-11 w-full items-center justify-center rounded-md bg-accent text-sm font-bold text-accent-foreground hover:opacity-90">
                로그인
              </Link>
            )}
          </div>
          <Link href="/" className="mt-4 inline-block text-[13px] text-sub underline underline-offset-2 hover:text-text">쇼핑 계속하기</Link>
        </div>
      </div>
    );
  }

  // 추가 주문옵션(addoption) 해석
  const addoptions = pv.addoption.length ? await fetchAddoptions(pv.addoption, token) : [];
  // 상품 다운로드 쿠폰(비회원도 목록 조회)
  const coupons = await fetchProductCoupons(pv.id);
  // 로그인 회원의 관심상품 담김 여부(하트 초기상태) — 계정 보관함과 동기화
  const wished = token ? await checkWishlist(token, pv.id) : false;
  // 상품평(공개·읽기 전용) — 첫 페이지는 서버 ISR 캐시로 주입, 더보기/필터는 클라이언트 프록시.
  // 포토리뷰 갤러리(리뷰 목록 위 스트립) 초기값은 photo=1 필터 첫 페이지를 함께 주입.
  // 상품문의(공개·읽기 전용) 첫 페이지도 서버 주입.
  const [reviews, photoReviews, inquiries, categories] = await Promise.all([
    fetchProductReviews(pv.id, { page: 1, limit: 10 }),
    fetchProductReviews(pv.id, { page: 1, limit: 10, photo: 1 }),
    fetchProductInquiries(pv.id, { page: 1, limit: 10 }, token || undefined),
    fetchCategories(),
  ]);
  // 상품의 카테고리 코드(pv.category)를 트리에서 조상→자신 경로로 해석(실제 분류명 + id 링크). 라우트는 id 기반(/category/[id]).
  const catPath = pv.category ? categoryPath(categories, pv.category) : [];

  return (
    <div className="mx-auto max-w-content px-4 py-4 sm:py-6">
      {/* 브레드크럼 — 홈 / (카테고리 경로: 실제 분류명, id 링크) */}
      <nav className="mb-4 flex flex-wrap items-center gap-1 text-[13px] text-sub">
        <Link href="/" className="hover:text-accent">홈</Link>
        {catPath.length > 0 ? (
          catPath.map((c) => (
            <span key={c.id} className="flex items-center gap-1">
              <span className="opacity-40">/</span>
              <Link href={`/category/${c.id}`} className="hover:text-accent">{c.title}</Link>
            </span>
          ))
        ) : (
          <>
            <span className="opacity-40">/</span>
            <span>상품</span>
          </>
        )}
      </nav>

      <ProductDetail pv={pv} addoptions={addoptions} coupons={coupons} wished={wished} loggedIn={!!token} reviewSummary={reviews.summary} />
      {/* 최근 본 상품 기록(로그인 회원) */}
      <RecordHistory productsId={pv.id} enabled={!!token} />

      {/* 헤더와 Tabs 사이 — 포토리뷰 요약 캐러셀(3개씩, 좌우 버튼) */}
      <ReviewSwiper items={photoReviews.items} summary={reviews.summary} />

      {/* Tabs+하단 콘텐츠(왼쪽 그룹) + 떠다니는 사이드 주문패널(오른쪽, lg+) — ProductDetail 이 슬롯으로 포털 */}
      <div id="pd-tabs-group" className="lg:grid lg:grid-cols-[minmax(0,1fr)_352px] lg:items-start lg:gap-8">
        <div className="min-w-0">
          <ProductTabs
            detailHtml={pv.detail_html}
            information={pv.information}
            shipping={pv.shipping}
            reviewCnt={pv.report.review_cnt}
            inquiryCnt={pv.report.inquiry_cnt}
            media={pv.media}
            productsId={pv.id}
            reviews={reviews.items}
            reviewSummary={reviews.summary}
            photoReviews={photoReviews.items}
            inquiryProductId={pv.options[0]?.id ?? pv.id}
            inquiryOptions={pv.options.map((o) => ({ id: o.id, label: o.label }))}
            inquiryProductTitle={pv.title ?? undefined}
            inquiries={inquiries.items}
            inquiryTotal={inquiries.total_count}
            inquiryPermission={inquiries.permission}
            inquiryCategories={inquiries.board.categories}
            inquiryRecaptchaSitekey={inquiries.recaptcha_sitekey}
            inquiryUnified={inquiries.board.unified === 1}
            inquiryBoardSecret={inquiries.board.secret}
            loggedIn={!!token}
          />
        </div>
        <aside id="pd-side-slot" className="hidden lg:mt-12 lg:block lg:sticky lg:top-5" aria-label="주문 옵션" />
      </div>
    </div>
  );
}
