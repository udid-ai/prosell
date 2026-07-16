// 상품 목록 검색필터 — URL 검색파라미터를 API 필터(fetchProducts)와 페이징 보존 query 로 매핑.
// color→standard_color, size→standard_size, instock=1→soldout=0. 숫자/CSV만 통과(잘못된 값 무시).
const csv = (v?: string) => (v && /^[0-9,]+$/.test(v) ? v : undefined);
const num = (v?: string) => (v && /^[0-9]+$/.test(v) ? v : undefined);

export type FilterSearchParams = {
  brand?: string; color?: string; size?: string; icon?: string;
  price_min?: string; price_max?: string; instock?: string;
  filter?: string; // 필터 패널 펼침 상태(UI 전용, API 필터 아님) — 정렬/페이징/공유 URL 에 보존
};

export function filterState(sp: FilterSearchParams): { api: Record<string, string>; query: Record<string, string> } {
  const api: Record<string, string> = {};
  const query: Record<string, string> = {};
  const brand = csv(sp.brand); if (brand) { api.brand = brand; query.brand = brand; }
  const color = csv(sp.color); if (color) { api.standard_color = color; query.color = color; }
  const size = csv(sp.size); if (size) { api.standard_size = size; query.size = size; }
  const icon = csv(sp.icon); if (icon) { api.icon = icon; query.icon = icon; }
  const pmin = num(sp.price_min); if (pmin) { api.price_min = pmin; query.price_min = pmin; }
  const pmax = num(sp.price_max); if (pmax) { api.price_max = pmax; query.price_max = pmax; }
  if (sp.instock === "1") { api.soldout = "0"; query.instock = "1"; }
  if (sp.filter === "1") query.filter = "1"; // 펼침 상태만 보존(api 미반영)
  return { api, query };
}
