import Link from "next/link";
import { priceOf, thumbOf, thumbHoverOf, won, type ProductItem } from "@/lib/prosell";
import ProductCardActions from "./ProductCardActions";
import LazyImg from "./LazyImg";

// 상품 이미지 비율(레거시 design.image_rate) — 높이/너비. 1=정사각형, 1.25=세로형 등.
// 쇼핑몰 설정값을 .env(NEXT_PUBLIC_PRODUCT_IMAGE_RATE)에 지정. 미설정 시 1(정사각형).
const IMAGE_RATE = Number(process.env.NEXT_PUBLIC_PRODUCT_IMAGE_RATE) > 0 ? Number(process.env.NEXT_PUBLIC_PRODUCT_IMAGE_RATE) : 1;
const IMAGE_ASPECT = `1 / ${IMAGE_RATE}`; // CSS aspect-ratio(너비/높이)

// 디자인 레이어 — 카드 모양/스타일은 여기서 자유롭게 변경.
// 레거시 category 스킨 items.* 표기 항목을 스타터 기본으로 모두 노출:
//   썸네일·상태뱃지·브랜드·상품명·(원가취소선/할인율/판매가)·무료배송·리뷰수/평점·판매량.
export default function ProductCard({ item, adultAllowed = false, priority = false }: { item: ProductItem; adultAllowed?: boolean; priority?: boolean }) {
  const o = item.origin ?? ({} as NonNullable<ProductItem["origin"]>);
  const id = o.id;
  const thumb = thumbOf(item);
  const thumb2 = thumbHoverOf(item); // 두 번째 이미지(hover 전환)
  const hasSecond = !!thumb2 && thumb2 !== thumb; // 첫 이미지와 다를 때만 전환(같으면 1장 취급)
  const { price, base } = priceOf(item);
  // 가격 공개 가드(레거시 open_price) — price_open=0 이면 가격 대신 "회원 전용가" 표기.
  const priceOpen = (item.benefit?.price_open ?? 1) !== 0;
  // 주문 권한 가드(레거시 level_order) — order_open=0 이면 장바구니·구매 버튼 숨김(가격 공개와 별개).
  const orderOpen = (item.benefit?.order_open ?? 1) !== 0;

  const discount = Math.floor(item.benefit?.show_discount_percent ?? 0);
  const brand = o.brand_title || "";
  // 통계값(리뷰·판매량) — 0 이어도 노출.
  const reviewCnt = item.report?.review_cnt ?? 0;
  // review_percent 는 백엔드에서 review_score/review_cnt 를 0~5 로 클램프한 «평균 별점»(0~100 아님).
  // 값이 없으면 review_score(합계)/review_cnt 로 폴백.
  const reviewScore = item.report?.review_percent
    ?? (reviewCnt > 0 ? (item.report?.review_score ?? 0) / reviewCnt : 0);
  const saleQty = item.report?.sale_quantity ?? 0;

  // 배송 뱃지 — 무료(초록) / N원이상 무료(초록) / 유료(배송수단+배송료, 회색).
  const d = item.delivery;
  const hasDelivery = (d?.delivery_use ?? 0) !== 0;
  const basic = d?.parcel_basic_price ?? 0;
  const freeOver = d?.parcel_free_price ?? 0;
  const method = d?.parcel_type ? "택배" : d?.courier_type ? "퀵서비스" : d?.direct_type ? "직접배송" : d?.visit_type ? "방문수령" : d?.country_type ? "해외배송" : "배송";
  const freeBadge = hasDelivery ? (basic === 0 ? "무료배송" : freeOver > 0 ? `${won(freeOver)} 이상 무료배송` : "") : "";
  const paidBadge = hasDelivery && !freeBadge && basic > 0 ? `${method} ${won(basic)}` : "";

  // 상태 뱃지(우선순위: 품절 > 판매중지 > 미표시). 성인은 별도.
  const state = o.soldout ? "품절" : o.productoff ? "판매중지" : o.onoff === 0 ? "미표시" : "";
  const dim = !!state;

  // hover 액션(레거시 PREVIEW): 주문옵션(option_type≥1) 또는 추가옵션(addoption) 있으면 모달, 없으면 즉시 담기.
  const hasOptions = (o.option_type ?? 0) >= 1 || !!o.addoption;
  const optionId = item.product_first?.id ?? id ?? 0;
  // 성인상품(레거시 _is_adult = 미인증 && 성인상품 && !관리자): 성인 권한 없는 뷰어에게만 이미지를 가리고 hover 액션도 숨긴다.
  // adultAllowed = 목록 API viewer.adult(관리자/성인인증 회원). 권한 있으면 일반 상품처럼 이미지·액션 노출.
  const adultCover = o.adult === 1 && !adultAllowed;
  // 접근권한(level_view) 미달 — 성인상품처럼 목록에서 상품을 가리고, 열람 가능 최소 등급명을 안내.
  const viewBlocked = item.benefit?.view_open === 0;
  const levelName = item.benefit?.level_view_name || "";
  const cover = adultCover || viewBlocked;

  return (
    <Link href={`/products/${id}`} className="flex h-full text-text">
      <div className="group flex h-full w-full flex-col overflow-hidden rounded-md border border-line bg-card transition-shadow hover:shadow-card">
        {/* 이미지 박스 — 쇼핑몰 설정 비율(image_rate) 적용. overflow-hidden 으로 hover 확대 클립. */}
        <div className="relative overflow-hidden" style={{ aspectRatio: IMAGE_ASPECT }}>
          {thumb ? (
            // 1장이면 hover 시 확대(scale), 2장 이상이면 두 번째 이미지로 전환(아래 오버레이).
            <LazyImg src={thumb} alt="" priority={priority} className={`block h-full w-full object-cover [transition:all_.5s_ease] ${dim ? "opacity-40" : ""} ${!hasSecond && !dim ? "group-hover:scale-[1.3]" : ""}`} />
          ) : (
            <div className="grid h-full w-full place-items-center bg-surface text-xs text-sub">이미지 없음</div>
          )}
          {/* 두 번째 이미지 — hover 시 전환(레거시 thumb2). 첫 이미지와 다른 2장 이상일 때만. */}
          {hasSecond && !dim && (
            <LazyImg src={thumb2} alt="" className="absolute inset-0 block h-full w-full object-cover opacity-0 [transition:all_.5s_ease] group-hover:opacity-100" />
          )}
          {/* hover 액션 레이어(장바구니/바로구매/관심상품) — 옵션 있으면 모달, 없으면 즉시 담기. 성인 커버 시 숨김. */}
          {id && !cover ? <ProductCardActions productsId={id} optionId={optionId} title={o.title} hasOptions={hasOptions} soldout={dim} canOrder={orderOpen} /> : null}
          {/* 접근제한 커버 — 성인(19) 또는 등급 열람제한(자물쇠 + 등급명). 이미지 위 검은 커버. */}
          {cover && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/85 px-3 text-center">
              {adultCover ? (
                <>
                  <span className="grid h-11 w-11 place-items-center rounded-full border-2 border-white text-base font-extrabold text-white">19</span>
                  <span className="text-[12px] font-medium leading-snug text-white/85">성인인증이 필요한<br />상품입니다</span>
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" className="h-8 w-8 text-white" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                  <span className="text-[12px] font-medium leading-snug text-white/85">
                    {levelName ? <><b className="text-white">{levelName}</b> 등급 이상<br />열람 가능한 상품입니다</> : <>열람 권한이 필요한<br />상품입니다</>}
                  </span>
                </>
              )}
            </div>
          )}
          {state && <span className="absolute left-2 top-2 z-20 rounded bg-black/70 px-2 py-0.5 text-[11px] font-bold text-white">{state}</span>}
        </div>
        {/* 콘텐츠: 브랜드·상품명은 위, 가격·배송·통계는 아래로 고정(카드 높이 균등) */}
        <div className="flex flex-1 flex-col p-3">
          {/* 브랜드 */}
          {brand && <p className="mb-1 truncate text-[11px] font-medium text-sub">{brand}</p>}
          {/* 상품명 */}
          <div className="text-sm leading-tight line-clamp-2">{o.title}</div>

          {/* 상단 그룹: 가격 + 배송 (상품명 바로 아래) */}
          <div className="mt-2">
            {priceOpen ? (
              <>
                {/* 가격: (할인율 + 취소선 원가) → 판매가 */}
                {(discount > 0 || base) && (
                  <p className="flex items-center gap-1.5 text-xs">
                    {discount > 0 && <span className="font-bold text-sale">{discount}%</span>}
                    {base ? <span className="text-sub line-through">{won(base)}</span> : null}
                  </p>
                )}
                <span className="mt-0.5 block text-[15px] font-extrabold text-text">{won(price)}</span>
              </>
            ) : (
              // 가격 미공개(open_price 등급 미달) — 레거시 오픈가 정책
              <span className="mt-0.5 block text-[13px] font-bold text-sub">회원 전용가</span>
            )}

            {/* 배송 뱃지 — 무료(초록) / 유료(배송수단·배송료, 회색) */}
            {freeBadge ? (
              <span className="mt-1.5 inline-block rounded bg-success/10 px-1.5 py-0.5 text-[11px] font-bold text-success">{freeBadge}</span>
            ) : paidBadge ? (
              <span className="mt-1.5 inline-block rounded bg-surface px-1.5 py-0.5 text-[11px] font-medium text-sub">{paidBadge}</span>
            ) : null}
          </div>

          {/* 하단 푸터 그룹: 리뷰(좌) + 판매량(우) — mt-auto 로 카드 바닥 고정. 0 이어도 노출 */}
          <div className="mt-auto flex items-center justify-between gap-2 pt-2 text-[12px] text-sub">
            <span className="flex items-center gap-1">
              <span className="text-amber-500">★</span>
              <span className="font-medium text-text">{reviewScore.toFixed(1)}</span>
              <span>리뷰 {reviewCnt.toLocaleString()}</span>
            </span>
            <span className="shrink-0">판매 {saleQty.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
