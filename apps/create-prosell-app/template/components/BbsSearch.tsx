"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// 게시판 검색 — 제목+내용(c=3). 카테고리 필터(ct)는 유지.
export default function BbsSearch({ bbsId, ct, defaultValue = "" }: { bbsId: string; ct?: string; defaultValue?: string }) {
  const router = useRouter();
  const [q, setQ] = useState(defaultValue);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = new URLSearchParams();
    if (ct) p.set("ct", ct);
    if (q.trim()) p.set("q", q.trim());
    router.push(`/board/${bbsId}${p.toString() ? `?${p.toString()}` : ""}`);
  };

  return (
    <form onSubmit={submit} className="flex w-full max-w-sm items-center gap-2">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="제목·내용 검색"
        className="min-w-0 flex-1 rounded-md border border-line bg-card px-3 py-2 text-sm text-text outline-none focus:border-accent"
      />
      <button type="submit" className="shrink-0 rounded-md border border-line px-4 py-2 text-sm font-medium text-text hover:border-accent hover:text-accent">
        검색
      </button>
    </form>
  );
}
