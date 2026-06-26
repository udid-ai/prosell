"use client";

import { useEffect, useState } from "react";
import { cartCount } from "@/lib/cart";

// 헤더 장바구니 아이콘의 수량 배지. 서버 장바구니 변경("cart-change") 구독.
export default function CartBadge() {
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    const sync = () => { cartCount().then((c) => { if (alive) setN(c); }); };
    sync();
    window.addEventListener("cart-change", sync);
    window.addEventListener("focus", sync); // 탭 복귀 시 동기화
    return () => {
      alive = false;
      window.removeEventListener("cart-change", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  if (n <= 0) return null;
  return (
    <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-sale px-1 text-[10px] font-bold leading-none text-white">
      {n > 99 ? "99+" : n}
    </span>
  );
}
