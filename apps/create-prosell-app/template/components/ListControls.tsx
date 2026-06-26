"use client";

import { useRouter } from "next/navigation";

// 상단 정렬/개수 컨트롤. select 변경 시 쿼리(order/limit)만 바꿔 이동(page 는 1로 리셋).
// 데이터는 서버에서 현재 order/limit 을 props 로 받아 선택값 표시.
const SORTS = [
  { v: "1", label: "기본순" },
  { v: "2", label: "인기순" },
  { v: "8", label: "신상품순" },
  { v: "5", label: "낮은가격순" },
  { v: "4", label: "높은가격순" },
];
// PC 그리드가 한 줄 5개 → 5의 배수로 행이 꽉 차게.
const COUNTS = ["20", "40", "60"];

const selectCls =
  "h-9 cursor-pointer rounded-md border border-line bg-card px-2.5 text-sm text-text outline-none hover:border-accent focus:border-accent";

export default function ListControls({
  total,
  order,
  limit,
  basePath,
  query = {},
}: {
  total: number;
  order: string;
  limit: string;
  basePath: string;
  query?: Record<string, string>;
}) {
  const router = useRouter();

  const go = (next: Record<string, string>) => {
    const p = new URLSearchParams({ ...query, order, limit, ...next });
    p.delete("page"); // 정렬/개수 변경 → 1페이지부터
    router.push(`${basePath}?${p.toString()}`);
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-sub">
        총 <b className="text-text">{total.toLocaleString("ko-KR")}</b>개
      </p>
      <div className="flex items-center gap-2">
        <select aria-label="정렬" value={order} onChange={(e) => go({ order: e.target.value })} className={selectCls}>
          {SORTS.map((s) => (
            <option key={s.v} value={s.v}>{s.label}</option>
          ))}
        </select>
        <select aria-label="개수" value={limit} onChange={(e) => go({ limit: e.target.value })} className={selectCls}>
          {COUNTS.map((c) => (
            <option key={c} value={c}>{c}개씩</option>
          ))}
        </select>
      </div>
    </div>
  );
}
