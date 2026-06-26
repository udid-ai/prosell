// 장바구니: 서버(레거시 cart) 연동. 동일 오리진 라우트(/api/cart)를 통해 호출하며
// 게스트 소유자(cart_id)는 HttpOnly 쿠키로 관리된다(클라이언트는 owner 를 다루지 않음).
// 변경 시 "cart-change" 이벤트 발생 → 헤더 배지/장바구니 페이지가 구독해 재조회.
// 관심상품(위시리스트)은 서버 미연동 — localStorage 유지.

export type CartItem = {
  key: string;        // line_key (productsId:optionKey)
  productId: number;  // 상세 링크용(products_id)
  title: string;
  label: string;      // 옵션명
  price: number;      // 단가
  qty: number;
  thumb?: string;
};

// 담기 페이로드(상품상세에서 생성). 이미지는 저장 안 함 — 조회 시 서버가 live 산출.
export type AddItem = {
  line_key: string;
  products_id: number;
  product_id: number;
  kind: "opt" | "addo";
  title?: string;
  label?: string;
  price?: number;
  quantity: number;
};

type ServerItem = {
  line_key: string; products_id: number; product_id: number; ct: number;
  title: string; option_label: string; price: number; quantity: number;
};
type ServerCart = { item_cnt: number; total_qty: number; total_price: number; items: ServerItem[] };

function emit() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("cart-change"));
}
function mapItem(s: ServerItem): CartItem {
  return {
    key: s.line_key, productId: s.products_id, title: s.title,
    label: s.option_label, price: s.price, qty: s.quantity,
  };
}

// ── 장바구니(서버) ──
export async function getCart(): Promise<CartItem[]> {
  if (typeof window === "undefined") return [];
  try {
    const res = await fetch("/api/cart", { cache: "no-store" });
    const j = (await res.json()) as ServerCart;
    return (j.items ?? []).map(mapItem);
  } catch { return []; }
}

// ── 배송 그룹 구조(레거시 재현) — 그룹 → 품목(item) → 추가옵션(addoptions) 중첩 ──
// 품목별로 배송그룹이 다를 수 있어 products_id 로 병합하지 않고 품목 단위로 분리.
export type CartAddo = {
  line_key: string; title: string; option_label: string;
  unit: number; qty: number; line_total: number;
};
export type CartGroupItem = {
  line_key: string; products_id: number; product_id: number;
  title: string; thumb: string; option_label: string;
  unit: number; qty: number; line_total: number;
  bulk_discount?: number; soldout?: number; state?: number; addoption?: number;
  addoptions: CartAddo[]; item_total: number;
};
export type CartGroup = {
  key: string; orderable: number;
  supplier: { id: number; title: string };
  delivery: { method: number; method_label: string; fee: number; free_price: number; is_free: number };
  items: CartGroupItem[]; subtotal: number; discount: number; shipping_fee: number;
};
export type CartGrouped = {
  groups: CartGroup[];
  summary: { group_cnt: number; item_cnt: number; item_price: number; bulk_discount: number; goods_price: number; delivery_price: number; total_price: number };
};

export async function getCartGrouped(): Promise<CartGrouped | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch("/api/cart?group=1", { cache: "no-store" });
    return (await res.json()) as CartGrouped;
  } catch { return null; }
}

export async function cartCount(): Promise<number> {
  if (typeof window === "undefined") return 0;
  try {
    const res = await fetch("/api/cart", { cache: "no-store" });
    const j = (await res.json()) as ServerCart;
    return j.total_qty ?? 0;
  } catch { return 0; }
}

export async function addToCart(items: AddItem[]): Promise<boolean> {
  try {
    const res = await fetch("/api/cart", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }),
    });
    const ok = res.ok;
    if (ok) emit();
    return ok;
  } catch { return false; }
}

export async function setCartQty(key: string, qty: number): Promise<void> {
  try {
    await fetch("/api/cart", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ line_key: key, quantity: Math.max(1, qty) }),
    });
    emit();
  } catch {}
}

export async function removeFromCart(key: string): Promise<void> {
  try {
    await fetch("/api/cart", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ line_key: key }),
    });
    emit();
  } catch {}
}

export async function clearCart(): Promise<void> {
  try {
    await fetch("/api/cart", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: "{}" });
    emit();
  } catch {}
}

// ── 관심상품(위시리스트) — productId 목록(localStorage 유지) ──
const WISH_KEY = "prosell-wish";
function readWish(): number[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(WISH_KEY) || "[]") as number[]; } catch { return []; }
}
function writeWish(val: number[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(WISH_KEY, JSON.stringify(val)); } catch {}
  window.dispatchEvent(new Event("wish-change"));
}
export function getWish(): number[] { return readWish(); }
export function isWished(id: number): boolean { return readWish().includes(id); }
export function toggleWish(id: number): boolean {
  const cur = readWish();
  const i = cur.indexOf(id);
  let on: boolean;
  if (i >= 0) { cur.splice(i, 1); on = false; } else { cur.push(id); on = true; }
  writeWish(cur);
  return on;
}
