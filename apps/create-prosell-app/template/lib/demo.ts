import type { ProductItem } from "./prosell";

// never-empty 폴백용 샘플 상품. 쇼핑몰에 상품이 없을 때만 화면을 채워 이탈을 막는다.
// (실데이터가 있으면 절대 쓰이지 않는다.)
export const DEMO_PRODUCTS: ProductItem[] = [
  {
    origin: { id: 9001, title: "데모 — 베이직 티셔츠", category: null, soldout: 0 },
    benefit: { price: 29000, discount_price: 19900, low_price: 19900 },
    images_thumb: [{ thumb: null, url: null }],
    product_first: { id: 1, title: "Free", price: 19900 },
  },
  {
    origin: { id: 9002, title: "데모 — 캔버스 토트백", category: null, soldout: 0 },
    benefit: { price: 39000, discount_price: 39000, low_price: 39000 },
    images_thumb: [{ thumb: null, url: null }],
    product_first: { id: 2, title: "기본", price: 39000 },
  },
  {
    origin: { id: 9003, title: "데모 — 스테인리스 텀블러", category: null, soldout: 0 },
    benefit: { price: 24000, discount_price: 18000, low_price: 18000 },
    images_thumb: [{ thumb: null, url: null }],
    product_first: { id: 3, title: "500ml", price: 18000 },
  },
  {
    origin: { id: 9004, title: "데모 — 코튼 양말 3팩", category: null, soldout: 0 },
    benefit: { price: 12000, discount_price: 9900, low_price: 9900 },
    images_thumb: [{ thumb: null, url: null }],
    product_first: { id: 4, title: "3팩", price: 9900 },
  },
];

export const DEMO_DETAIL: ProductItem = {
  origin: { id: 9001, title: "데모 — 베이직 티셔츠", category: null, soldout: 0 },
  benefit: { price: 29000, discount_price: 19900, low_price: 19900 },
  images: [{ thumb: null, url: null }],
  content: { detail: "<p>이것은 데모 상품입니다. 쇼핑몰에 실제 상품을 등록하면 이 자리에 실제 데이터가 표시됩니다.</p>" },
  product: [{ id: 1, title: "Free", price: 19900 }],
};

/** 목록: 실데이터 없으면 데모로 폴백. [items, isDemo] */
export function withDemoList(items: ProductItem[]): [ProductItem[], boolean] {
  return items.length > 0 ? [items, false] : [DEMO_PRODUCTS, true];
}
