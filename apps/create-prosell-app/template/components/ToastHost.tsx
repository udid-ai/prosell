"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ToastType } from "@/lib/toast";

type Item = { id: number; message: string; type: ToastType };
let seq = 0;

// 전역 토스트 렌더러 — window "app:toast" 이벤트를 받아 하단 중앙에 스택으로 표시(자동 소멸).
export default function ToastHost() {
  const [items, setItems] = useState<Item[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onToast = (e: Event) => {
      const d = (e as CustomEvent).detail as { message: string; type?: ToastType };
      const id = ++seq;
      setItems((cur) => [...cur, { id, message: d.message, type: d.type ?? "info" }]);
      setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), 2400);
    };
    window.addEventListener("app:toast", onToast);
    return () => window.removeEventListener("app:toast", onToast);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[200] flex flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <div key={t.id}
          className={`pointer-events-auto max-w-sm animate-[toastIn_.18s_ease-out] rounded-lg px-4 py-2.5 text-[13px] font-medium text-white shadow-lg ${
            t.type === "error" ? "bg-sale" : t.type === "success" ? "bg-success" : "bg-text"
          }`}>
          {t.message}
        </div>
      ))}
    </div>,
    document.body,
  );
}
