"use client";

import { useState } from "react";

// 상세 하단 탭: 상세정보 / 배송·교환·반품 / 리뷰 / Q&A.
// 리뷰·문의 목록은 Phase 2(해당 API 연동)에서 채운다. 현재는 건수만 표시.
export default function ProductTabs({
  detailHtml,
  information,
  shipping,
  reviewCnt,
  inquiryCnt,
}: {
  detailHtml: string | null;
  information: { name: string; content: string }[];
  shipping: { delivery: string | null; exchange: string | null; as: string | null };
  reviewCnt: number;
  inquiryCnt: number;
}) {
  const hasShip = !!(shipping.delivery || shipping.exchange || shipping.as);
  const tabs = [
    { key: "detail", label: "상세정보" },
    { key: "ship", label: "배송·교환·반품" },
    { key: "review", label: `리뷰 ${reviewCnt}` },
    { key: "qna", label: `Q&A ${inquiryCnt}` },
  ] as const;
  const [tab, setTab] = useState<(typeof tabs)[number]["key"]>("detail");

  return (
    <section className="mt-12">
      <div className="sticky top-[57px] z-10 flex border-b border-line bg-bg/95 backdrop-blur">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px flex-1 cursor-pointer border-b-2 px-2 py-3 text-sm transition-colors ${
              tab === t.key ? "border-accent font-bold text-text" : "border-transparent text-sub hover:text-text"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="py-8">
        {tab === "detail" && (
          <div>
            {detailHtml ? (
              <article className="[&_img]:my-0 [&_img]:block [&_img]:w-full [&_img]:max-w-full" dangerouslySetInnerHTML={{ __html: detailHtml }} />
            ) : null}

            {/* 상품정보 · 고시정보 — 서식 (모바일: 라벨 띠+값 스택 / 데스크탑: 2열) */}
            {information.length > 0 && (
              <section className={detailHtml ? "mt-12" : ""}>
                <div className="overflow-hidden rounded-2xl border border-line bg-card">
                  {/* 헤더 (액센트 바 + 제목) */}
                  <div className="flex items-center gap-2.5 border-b border-line px-5 py-4">
                    <span className="inline-block h-4 w-1.5 rounded-full bg-accent" />
                    <h3 className="text-[15px] font-bold text-text">상품정보 · 고시정보</h3>
                  </div>
                  <dl>
                    {information.map((row, i) => (
                      <div key={i} className="flex flex-col border-b border-line last:border-b-0 sm:flex-row">
                        <dt className="break-keep bg-line px-5 py-2.5 text-[13px] font-semibold text-sub sm:w-56 sm:shrink-0 sm:py-3.5">
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

            {!detailHtml && information.length === 0 && (
              <p className="py-10 text-center text-sub">등록된 상세설명이 없습니다.</p>
            )}
          </div>
        )}

        {tab === "ship" &&
          (hasShip ? (
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
          ))}

        {tab === "review" && (
          <p className="py-10 text-center text-sub">
            {reviewCnt > 0 ? `리뷰 ${reviewCnt}건이 있습니다. (목록 연동 예정)` : "아직 등록된 리뷰가 없습니다."}
          </p>
        )}

        {tab === "qna" && (
          <p className="py-10 text-center text-sub">
            {inquiryCnt > 0 ? `문의 ${inquiryCnt}건이 있습니다. (목록 연동 예정)` : "등록된 상품 문의가 없습니다."}
          </p>
        )}
      </div>
    </section>
  );
}
