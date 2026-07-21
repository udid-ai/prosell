"use client";

import { useEffect, useRef, useState } from "react";
import type { ProductView, ProductReview, ProductReviewSummary, ProductInquiry, InquiryPermission } from "@/lib/prosell";
import ProductReviews from "./ProductReviews";
import ProductInquiries from "./ProductInquiries";
import type { InquiryOption } from "./InquiryFormModal";

// 상세 하단 섹션: 상세정보 / 배송·교환·반품 / 리뷰 / 상품문의.
// 탭(숨김) 대신 모든 내용을 한 페이지에 렌더하고, 상단 내비는 해당 섹션으로 «이동»만 한다.
//  → 탭으로 감추면 검색 노출에 불리하므로 전 콘텐츠를 DOM 에 유지(SEO 친화).
export default function ProductTabs({
  detailHtml,
  information,
  shipping,
  reviewCnt,
  inquiryCnt,
  media,
  productsId,
  reviews,
  reviewSummary,
  photoReviews = [],
  inquiryProductId,
  inquiryOptions = [],
  inquiryProductTitle,
  inquiries = [],
  inquiryTotal = 0,
  inquiryPermission,
  inquiryCategories = [],
  inquiryRecaptchaSitekey = "",
  inquiryUnified = true,
  inquiryBoardSecret = 1,
  loggedIn = false,
}: {
  detailHtml: string | null;
  information: { name: string; content: string }[];
  shipping: { delivery: string | null; exchange: string | null; as: string | null };
  reviewCnt: number;
  inquiryCnt: number;
  media?: ProductView["media"];
  productsId: number | string;
  reviews: ProductReview[];
  reviewSummary: ProductReviewSummary;
  photoReviews?: ProductReview[];
  inquiryProductId: number | string; // 문의 작성 대상 «옵션» id(단일/폴백)
  inquiryOptions?: InquiryOption[];   // 옵션 2개 이상이면 작성 모달에서 선택
  inquiryProductTitle?: string;       // 단일 옵션일 때 문의 대상 상품명
  inquiries?: ProductInquiry[];
  inquiryTotal?: number;
  inquiryPermission: InquiryPermission;
  inquiryCategories?: string[];
  inquiryRecaptchaSitekey?: string;
  inquiryUnified?: boolean;
  inquiryBoardSecret?: number; // 게시판 설정 — 0=비밀글 미사용 / 1=작성자 선택 / 2=전체 적용
  loggedIn?: boolean;
}) {
  const hasMedia = !!media && (!!media.video || media.videos.length > 0 || media.audios.length > 0);
  const hasShip = !!(shipping.delivery || shipping.exchange || shipping.as);
  // 상품문의 탭 카운트 — 등록/삭제 시 ProductInquiries 가 올려주는 값으로 갱신(초기값은 서버 렌더).
  const [inquiryCount, setInquiryCount] = useState(inquiryTotal || inquiryCnt);
  const navs = [
    { key: "detail", label: "상세정보" },
    { key: "ship", label: "배송·교환·반품" },
    { key: "review", label: `리뷰 ${reviewSummary.count || reviewCnt}` },
    { key: "qna", label: `상품문의 ${inquiryCount}` },
  ] as const;
  const [active, setActive] = useState<(typeof navs)[number]["key"]>("detail");
  const rootRef = useRef<HTMLElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null); // 내비 고정 감지용 센티넬
  const navRef = useRef<HTMLDivElement>(null);     // 고정 내비(높이 측정용)
  const clickLockRef = useRef(false);              // 클릭 이동 중 스크롤스파이 잠금
  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tabs 내비가 화면 최상단(top-0)에 도달하면 body.tabs-stuck 토글 → 사이트 헤더를 위로 숨긴다(globals.css).
  // 헤더(z-40) > Tabs 내비(z-30) 라, 교차 시점에 헤더가 위에서 슬라이드-업 하며 그 아래 Tabs 가 드러난다.
  useEffect(() => {
    const el = stickyRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => document.body.classList.toggle("tabs-stuck", !e.isIntersecting && e.boundingClientRect.top <= 0),
      { threshold: 0 },
    );
    obs.observe(el);
    return () => { obs.disconnect(); document.body.classList.remove("tabs-stuck"); };
  }, []);

  // 스크롤 스파이 — 현재 화면 상단(스티키 내비 바로 아래)에 걸린 섹션을 활성 표시.
  useEffect(() => {
    const ids = navs.map((n) => n.key);
    const els = ids.map((id) => document.getElementById(`pd-${id}`)).filter(Boolean) as HTMLElement[];
    if (!els.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (clickLockRef.current) return; // 클릭 이동 중엔 클릭한 탭 활성 유지
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id.replace("pd-", "") as (typeof navs)[number]["key"]);
      },
      // 내비가 top-0 에 고정(헤더 숨김)되므로 내비 높이(~52)만큼만 상단 여백, 하단 55% 지점 기준으로 활성 전환
      { rootMargin: "-56px 0px -55% 0px", threshold: 0 },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewCnt, inquiryCnt]);

  const go = (key: string) => {
    // 클릭 즉시 활성화 + 스무스 스크롤 동안 스크롤스파이 잠금(활성 탭이 어긋나지 않게).
    setActive(key as (typeof navs)[number]["key"]);
    clickLockRef.current = true;
    if (lockTimer.current) clearTimeout(lockTimer.current);
    lockTimer.current = setTimeout(() => { clickLockRef.current = false; }, 700);

    // 첫 항목(상세정보)은 Tabs 그룹 콘텐츠 최상단(=섹션 top, mt-12 여백 제외)을 기준점으로.
    // 이 위치는 내비 미고정이라 사이트 헤더가 다시 보이므로 헤더 높이만큼 빼서 헤더 바로 아래에 오게 한다.
    if (key === navs[0].key) {
      const sec = rootRef.current;
      const headerH = (document.querySelector(".site-header") as HTMLElement | null)?.offsetHeight ?? 0;
      if (sec) window.scrollTo({ top: window.scrollY + sec.getBoundingClientRect().top - headerH, behavior: "smooth" });
      return;
    }
    // 나머지는 실제 고정 내비 높이만큼 빼서 정확히 내비 바로 아래에 섹션이 오게.
    const el = document.getElementById(`pd-${key}`);
    if (!el) return;
    const navH = navRef.current?.offsetHeight ?? 48;
    window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - navH, behavior: "smooth" });
  };

  // 스크롤스파이 활성 판정용 상단 여백(고정 내비 높이 근사). 클릭 이동은 go() 가 실측으로 처리.
  const anchorCls = "scroll-mt-[52px]";

  return (
    <section ref={rootRef} className="mt-12">
      {/* 내비 고정 감지용 센티넬(내비 바로 위) */}
      <div ref={stickyRef} className="h-0" aria-hidden />
      {/* 이동 내비 — Tabs 도달 시 화면 top-0 에 고정. 헤더(z-40)보다 낮은 z-30 → 교차 시 헤더가 위에서 슬라이드-업하며 드러남 */}
      <div ref={navRef} className="sticky top-0 z-30 flex border-b border-line bg-surface/95 backdrop-blur">
        {navs.map((n) => (
          <button
            key={n.key}
            type="button"
            onClick={() => go(n.key)}
            className={`-mb-px flex-1 cursor-pointer border-b-2 px-2 py-3 text-sm transition-colors ${
              active === n.key ? "border-accent font-bold text-text" : "border-transparent text-sub hover:text-text"
            }`}
          >
            {n.label}
          </button>
        ))}
      </div>

      {/* ── 상세정보 ── */}
      <div id="pd-detail" className={`py-8 ${anchorCls}`}>
        {detailHtml ? (
          // 상세설명 HTML 내 <img> 에도 loading="lazy" 주입(이미 지정된 것은 유지).
          <article className="[&_img]:my-0 [&_img]:block [&_img]:h-auto [&_img]:max-w-full" dangerouslySetInnerHTML={{ __html: detailHtml.replace(/<img(?![^>]*\sloading=)/gi, '<img loading="lazy"') }} />
        ) : null}

        {/* 동영상/오디오(레거시 getVideoHTML/getAudiosHTML/getVideosHTML) */}
        {hasMedia && media && (
          <div className={detailHtml ? "mt-10 space-y-6" : "space-y-6"}>
            {media.videos.map((v, i) => (
              <figure key={`v${i}`}>
                <video controls playsInline className="w-full max-w-full rounded-lg border border-line bg-black"
                  style={media.video_width ? { aspectRatio: `${media.video_width} / ${media.video_height || media.video_width}` } : undefined}>
                  <source src={v.src} type={v.type || undefined} />
                </video>
                {v.title ? <figcaption className="mt-1.5 text-[13px] text-sub">{v.title}</figcaption> : null}
              </figure>
            ))}
            {media.video ? (
              <div className="overflow-hidden rounded-lg border border-line [&_iframe]:aspect-video [&_iframe]:h-auto [&_iframe]:w-full [&_video]:w-full" dangerouslySetInnerHTML={{ __html: media.video }} />
            ) : null}
            {media.audios.map((a, i) => (
              <figure key={`a${i}`} className="rounded-lg border border-line bg-card p-3">
                {a.title ? <figcaption className="mb-1.5 text-[13px] font-medium text-text">{a.title}</figcaption> : null}
                <audio controls className="w-full">
                  <source src={a.src} type={a.type || undefined} />
                </audio>
              </figure>
            ))}
          </div>
        )}

        {/* 상품정보 · 고시정보 */}
        {information.length > 0 && (
          <section className={detailHtml ? "mt-12" : ""}>
            <div className="overflow-hidden rounded-2xl border border-line bg-card">
              <div className="flex items-center gap-2.5 border-b border-line bg-surface/60 px-5 py-4">
                <span className="inline-block h-4 w-1.5 rounded-full bg-accent" />
                <h3 className="text-[15px] font-bold text-text">상품정보 · 고시정보</h3>
              </div>
              <dl>
                {information.map((row, i) => (
                  <div key={i} className="flex flex-col border-b border-line last:border-b-0 sm:flex-row">
                    <dt className="break-keep border-b border-line px-5 py-2.5 text-[13px] font-semibold text-sub sm:w-56 sm:shrink-0 sm:border-b-0 sm:border-r sm:py-3.5">
                      {row.name}
                    </dt>
                    <dd className="min-w-0 flex-1 whitespace-pre-line px-5 py-3 text-sm leading-relaxed text-text sm:py-3.5">
                      {row.content || "-"}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>
        )}

        {!detailHtml && information.length === 0 && !hasMedia && (
          <p className="py-10 text-center text-sub">등록된 상세설명이 없습니다.</p>
        )}
      </div>

      {/* ── 배송·교환·반품 ── */}
      <div id="pd-ship" className={`border-t border-line py-8 ${anchorCls}`}>
        <h2 className="mb-4 text-lg font-bold text-text">배송·교환·반품</h2>
        {hasShip ? (
          <div className="space-y-8 [&_img]:max-w-full">
            {shipping.delivery && (
              <section>
                <h3 className="mb-2 text-base font-bold text-text">배송 안내</h3>
                <div dangerouslySetInnerHTML={{ __html: shipping.delivery }} />
              </section>
            )}
            {shipping.exchange && (
              <section>
                <h3 className="mb-2 text-base font-bold text-text">교환·반품 안내</h3>
                <div dangerouslySetInnerHTML={{ __html: shipping.exchange }} />
              </section>
            )}
            {shipping.as && (
              <section>
                <h3 className="mb-2 text-base font-bold text-text">A/S 안내</h3>
                <div dangerouslySetInnerHTML={{ __html: shipping.as }} />
              </section>
            )}
          </div>
        ) : (
          <div className="space-y-4 text-sm leading-7 text-text">
            <div>
              <h3 className="font-bold">배송 안내</h3>
              <p className="mt-1 text-sub">택배 배송으로 발송되며, 주문 후 평균 1~3일 내 출고됩니다. 도서·산간 지역은 추가 배송비가 발생할 수 있습니다.</p>
            </div>
            <div>
              <h3 className="font-bold">교환·반품 안내</h3>
              <p className="mt-1 text-sub">상품 수령 후 7일 이내 교환·반품 신청이 가능합니다. 단순 변심의 경우 왕복 배송비가 부과되며, 상품 훼손 시 교환·반품이 제한될 수 있습니다.</p>
            </div>
          </div>
        )}
      </div>

      {/* ── 리뷰 ── */}
      <div id="pd-review" className={`border-t border-line py-8 ${anchorCls}`}>
        <h2 className="mb-4 text-lg font-bold text-text">리뷰 {reviewSummary.count > 0 ? `(${reviewSummary.count})` : ""}</h2>
        <ProductReviews productsId={productsId} initialItems={reviews} summary={reviewSummary} photoItems={photoReviews} />
      </div>

      {/* ── 상품문의 ── (타이틀+액션 버튼은 ProductInquiries 헤더에서 렌더) */}
      <div id="pd-qna" className={`border-t border-line py-8 ${anchorCls}`}>
        <ProductInquiries
          productsId={productsId}
          productId={inquiryProductId}
          options={inquiryOptions}
          productTitle={inquiryProductTitle}
          initialItems={inquiries}
          total={inquiryTotal}
          loggedIn={loggedIn}
          permission={inquiryPermission}
          categories={inquiryCategories}
          recaptchaSitekey={inquiryRecaptchaSitekey}
          unified={inquiryUnified}
          boardSecret={inquiryBoardSecret}
          onCountChange={setInquiryCount}
        />
      </div>
    </section>
  );
}
