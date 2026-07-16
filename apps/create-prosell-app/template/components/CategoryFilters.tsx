"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ProductFacets } from "@/lib/prosell";

// 정렬(order)·개수는 목록 상단 ListControls 가 담당. 여기서는 검색 패싯만 다룬다.
const PRICE_BANDS: { label: string; min?: number; max?: number }[] = [
  { label: "~1만원", max: 10000 },
  { label: "1~3만원", min: 10000, max: 30000 },
  { label: "3~5만원", min: 30000, max: 50000 },
  { label: "5~10만원", min: 50000, max: 100000 },
  { label: "10만원~", min: 100000 },
];

// 카테고리/검색 상단 필터바. 선택은 URL 쿼리로 반영(SSR 재조회) → 비회원 목록은 ISR 캐시 유지.
// order·brand·color·size·price_min·price_max·instock 파라미터를 다룬다(page 가 API 필터로 매핑).
// heading = 좌측 제목(카테고리명/검색어), 우측에 필터 아이콘 토글. subnav = 제목 아래 보조 내비(하위 카테고리 칩).
export default function CategoryFilters({ facets, basePath, heading, subnav }: { facets: ProductFacets; basePath: string; heading?: React.ReactNode; subnav?: React.ReactNode }) {
  const router = useRouter();
  const sp = useSearchParams();

  const csv = (k: string) => (sp.get(k) ? sp.get(k)!.split(",").filter(Boolean) : []);
  const brand = csv("brand");
  const color = csv("color");
  const size = csv("size");
  const icon = csv("icon");
  const priceMin = sp.get("price_min") || "";
  const priceMax = sp.get("price_max") || "";
  const instock = sp.get("instock") === "1";

  const [pmin, setPmin] = useState(priceMin);
  const [pmax, setPmax] = useState(priceMax);
  const [openBrand, setOpenBrand] = useState(false);
  // 필터 패널 펼침 — URL 파라미터(filter=1)에 저장. 뒤로가기/재방문은 물론 URL 공유 시 다른 사용자도 펼친 상태로 본다.
  // 초기값은 서버·클라이언트 동일하게 URL 에서 읽어 하이드레이션 불일치가 없다.
  const [open, setOpen] = useState(sp.get("filter") === "1");
  const toggleOpen = () =>
    setOpen((v) => {
      const next = !v;
      // 목록 재조회 없이 주소창만 갱신(공유 가능) — router.push 대신 history.replaceState 로 히스토리 오염 방지.
      const q = new URLSearchParams(sp.toString());
      if (next) q.set("filter", "1"); else q.delete("filter");
      window.history.replaceState(window.history.state, "", `${basePath}${q.toString() ? `?${q.toString()}` : ""}`);
      return next;
    });

  // 파라미터 갱신 → URL 이동(페이지 리셋). 빈 값은 제거.
  function apply(patch: Record<string, string | null>) {
    const q = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") q.delete(k); else q.set(k, v);
    }
    q.delete("page");
    router.push(`${basePath}${q.toString() ? `?${q.toString()}` : ""}`);
  }
  const toggleCsv = (k: string, cur: string[], id: string) =>
    apply({ [k]: (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]).join(",") || null });

  const appliedCount = brand.length + color.length + size.length + icon.length + (priceMin || priceMax ? 1 : 0) + (instock ? 1 : 0);
  const hasFilters = appliedCount > 0;
  const brandsShown = openBrand ? facets.brands : facets.brands.slice(0, 12);

  return (
    <div>
      {/* 제목 행: 좌측 제목 + 우측 필터 아이콘 토글(적용 개수 뱃지) */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">{heading}</div>
        <button type="button" onClick={toggleOpen} aria-expanded={open} aria-label="상품 필터"
          className={`relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-[13px] font-medium transition-colors ${open || appliedCount > 0 ? "border-accent text-accent" : "border-line text-text hover:border-accent hover:text-accent"}`}>
          {/* 깔때기(필터) 아이콘 */}
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h18l-7 8v6l-4-2v-4z" /></svg>
          <span className="hidden sm:inline">필터</span>
          {appliedCount > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-accent-foreground">{appliedCount}</span>
          )}
        </button>
      </div>

      {/* 보조 내비(하위 카테고리 칩 등) */}
      {subnav ? <div className="mt-3">{subnav}</div> : null}

      {!open ? null : (
      <div className="mt-3 rounded-xl border border-line bg-card">
      {/* 패싯: 브랜드 / 색상 / 사이즈 / 가격 / 재고 */}
      <div className="space-y-4 px-4 py-4">
        {facets.brands.length > 0 && (
          <Facet label="브랜드">
            <div className="flex flex-wrap gap-1.5">
              {brandsShown.map((b) => (
                <Chip key={b.id} on={brand.includes(String(b.id))} onClick={() => toggleCsv("brand", brand, String(b.id))}>
                  <span className="inline-flex items-center gap-1">
                    <span>{b.title}</span>
                    {b.count ? <span className="text-[11px] tabular-nums text-sub">{b.count}</span> : null}
                  </span>
                </Chip>
              ))}
              {facets.brands.length > 12 && (
                <button type="button" onClick={() => setOpenBrand((v) => !v)} className="rounded-full border border-line px-3 py-1 text-[13px] text-sub hover:text-text">
                  {openBrand ? "접기" : `+${facets.brands.length - 12}`}
                </button>
              )}
            </div>
          </Facet>
        )}

        {facets.colors.length > 0 && (
          <Facet label="색상">
            <div className="flex flex-wrap gap-2">
              {facets.colors.map((c) => {
                const on = color.includes(String(c.id));
                // 저장된 color 는 # 없는 hex(레거시 background-color:#{color}) → # 보정.
                const bg = c.color ? (/^#/.test(c.color) ? c.color : `#${c.color}`) : "#ffffff";
                return (
                  <button key={c.id} type="button" onClick={() => toggleCsv("color", color, String(c.id))} title={c.title}
                    aria-pressed={on}
                    className={`grid h-7 w-7 place-items-center rounded-full border-2 ${on ? "border-accent" : "border-line"}`}>
                    <span className="h-4 w-4 rounded-full border border-line/60" style={{ backgroundColor: bg }} />
                  </button>
                );
              })}
            </div>
          </Facet>
        )}

        {facets.sizes.length > 0 && (
          <Facet label="사이즈">
            <div className="flex flex-wrap gap-1.5">
              {facets.sizes.map((s) => (
                <Chip key={s.id} on={size.includes(String(s.id))} onClick={() => toggleCsv("size", size, String(s.id))}>{s.title}</Chip>
              ))}
            </div>
          </Facet>
        )}

        {facets.icons.length > 0 && (
          <Facet label="추천·혜택">
            <div className="flex flex-wrap gap-1.5">
              {facets.icons.map((ic) => (
                <Chip key={ic.id} on={icon.includes(String(ic.id))} onClick={() => toggleCsv("icon", icon, String(ic.id))}>{ic.title}</Chip>
              ))}
            </div>
          </Facet>
        )}

        <Facet label="가격대">
          <div className="flex flex-wrap items-center gap-1.5">
            {PRICE_BANDS.map((band) => {
              const on = String(band.min ?? "") === priceMin && String(band.max ?? "") === priceMax;
              return (
                <Chip key={band.label} on={on}
                  onClick={() => apply({ price_min: band.min ? String(band.min) : null, price_max: band.max ? String(band.max) : null })}>
                  {band.label}
                </Chip>
              );
            })}
            <span className="mx-1 hidden text-line sm:inline">|</span>
            <input value={pmin} onChange={(e) => setPmin(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="최소"
              className="w-20 rounded-md border border-line bg-card px-2 py-1 text-[13px] text-text placeholder:text-sub focus:border-accent focus:outline-none" />
            <span className="text-sub">~</span>
            <input value={pmax} onChange={(e) => setPmax(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="최대"
              className="w-20 rounded-md border border-line bg-card px-2 py-1 text-[13px] text-text placeholder:text-sub focus:border-accent focus:outline-none" />
            <button type="button" onClick={() => apply({ price_min: pmin || null, price_max: pmax || null })}
              className="rounded-md border border-line bg-surface px-3 py-1 text-[13px] font-medium text-text hover:bg-line">적용</button>
          </div>
        </Facet>

        {/* 재고: 품절 제외 (기존 헤더에서 패널로 이동) */}
        <Facet label="재고">
          <label className="flex w-fit cursor-pointer items-center gap-1.5 text-[13px] text-text">
            <input type="checkbox" checked={instock} onChange={(e) => apply({ instock: e.target.checked ? "1" : null })} className="h-4 w-4 accent-[var(--accent,#2563eb)]" />
            품절 제외
          </label>
        </Facet>
      </div>

      {/* 선택 요약 + 초기화 */}
      {hasFilters ? (
        <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-4">
          <span className="text-[12px] text-sub">
            필터 {brand.length + color.length + size.length + icon.length + (priceMin || priceMax ? 1 : 0) + (instock ? 1 : 0)}개 적용
          </span>
          <button type="button" onClick={() => { setPmin(""); setPmax(""); apply({ brand: null, color: null, size: null, icon: null, price_min: null, price_max: null, instock: null }); }}
            className="text-[13px] font-medium text-accent hover:underline">필터 초기화</button>
        </div>
      ) : null}
      </div>
      )}
    </div>
  );
}

function Facet({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start">
      <span className="w-16 shrink-0 pt-1 text-[13px] font-semibold text-text">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={`rounded-full border px-3 py-1 text-[13px] ${on ? "border-accent bg-accent/5 font-medium text-accent" : "border-line text-text hover:border-accent hover:text-accent"}`}>
      {children}
    </button>
  );
}
