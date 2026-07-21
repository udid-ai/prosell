"use client";

import { useState } from "react";
import { formatDateTime } from "@/lib/format";
import type { ProductReview } from "@/lib/prosell";
import ReviewDetailModal from "./ReviewDetailModal";
import LazyImg from "./LazyImg";

// 세로형 리뷰 카드(이미지 위 + 내용 아래) 그리드. 스와이프 없이 정적 배치.
// 카드 클릭 시 ReviewDetailModal(좌우 이동)로 상세를 크게 본다. 홈 요약·전체보기(/reviews) 공통 사용.
function Stars({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`별점 ${score}점`}>
      {[1, 2, 3, 4, 5].map((k) => (
        <svg key={k} width={12} height={12} viewBox="0 0 20 20" className={k <= score ? "text-[#ffb020]" : "text-line"} fill="currentColor" aria-hidden="true">
          <path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.51L10 14.6l-4.95 2.6.94-5.5-4-3.9 5.53-.8L10 1.5z" />
        </svg>
      ))}
    </span>
  );
}

export default function ReviewGrid({ items }: { items: ProductReview[] }) {
  const [detail, setDetail] = useState<number | null>(null); // 클릭 시 상세 모달 인덱스

  if (!items.length) return null;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {items.map((r, i) => {
          const photo = r.files.find((f) => f.src);
          return (
            <button key={r.id} type="button" onClick={() => setDetail(i)}
              className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-line bg-card text-left transition-colors hover:border-accent">
              <div className="aspect-square w-full overflow-hidden bg-surface">
                {photo ? (
                  <LazyImg src={photo.thumb || photo.src!} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[12px] text-sub">사진 없음</div>
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col p-3">
                <Stars score={r.score} />
                <p className="mt-1 truncate text-[12px] text-sub">
                  <span className="font-medium text-text">{r.name || "구매자"}</span>
                  {r.dt ? <> · {formatDateTime(r.dt, false)}</> : null}
                </p>
                {r.title ? <p className="mt-1 truncate text-[13px] font-bold text-text">{r.title}</p> : null}
                {r.content ? <p className="mt-1 line-clamp-2 whitespace-pre-line text-[13px] leading-relaxed text-text">{r.content}</p> : null}
              </div>
            </button>
          );
        })}
      </div>

      {detail !== null && (
        <ReviewDetailModal
          items={items}
          index={detail}
          showProductLink
          onClose={() => setDetail(null)}
          onNav={(dir) => setDetail((cur) => {
            if (cur === null) return cur;
            const n = cur + dir;
            return n >= 0 && n < items.length ? n : cur;
          })}
        />
      )}
    </>
  );
}
