"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 목록 전체삭제 버튼(관심상품·최근본상품 공용). url=DELETE 대상(?all=1 포함), message=확인문구.
export default function ListClearButton({ url, message }: { url: string; message: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function clear() {
    if (busy) return;
    if (!confirm(message)) return;
    setBusy(true);
    try {
      const res = await fetch(url, { method: "DELETE" });
      const j = await res.json().catch(() => null);
      if (j?.ok) router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <button type="button" onClick={clear} disabled={busy}
      className="rounded-md border border-line bg-card px-3 py-1.5 text-[13px] font-medium text-sub hover:text-sale disabled:opacity-50">
      {busy ? "삭제 중…" : "전체삭제"}
    </button>
  );
}
