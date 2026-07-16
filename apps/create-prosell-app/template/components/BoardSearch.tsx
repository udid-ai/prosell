"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * 게시판 제목 검색 — 공지사항·FAQ 공용(백엔드 title LIKE).
 * 검색어는 URL(?q=)에 담아 서버 컴포넌트가 다시 조회하게 한다(새로고침·공유·뒤로가기에서 그대로 유지).
 * basePath: "/notice" | "/faq"
 */
export default function BoardSearch({
  basePath,
  initialQuery = "",
  category = "",
  placeholder = "제목으로 검색",
  label = "제목 검색",
}: {
  basePath: string;
  initialQuery?: string;
  category?: string;
  placeholder?: string;
  label?: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const sp = new URLSearchParams();
    // 검색 시 페이지는 1로 되돌린다(3페이지에서 검색하면 결과가 없어 보이는 문제 방지).
    if (category) sp.set("category", category);
    const kw = q.trim();
    if (kw) sp.set("q", kw);
    const qs = sp.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  };

  const clear = () => {
    setQ("");
    const qs = category ? `?category=${encodeURIComponent(category)}` : "";
    router.push(`${basePath}${qs}`);
  };

  return (
    <form onSubmit={submit} className="flex shrink-0 gap-1.5" role="search">
      <div className="relative w-40 sm:w-64">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          aria-label={label}
          className="search-noclear w-full rounded-lg border border-line bg-surface py-2 pl-3 pr-8 text-sm text-text outline-none focus:border-accent"
        />
        {q && (
          <button type="button" onClick={clear} aria-label="검색어 지우기"
            className="absolute right-2 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full text-sub hover:bg-line hover:text-text">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        )}
      </div>
      <button type="submit"
        className="shrink-0 rounded-lg border border-accent bg-accent px-4 py-2 text-[13px] font-semibold text-accent-foreground hover:opacity-90">
        검색
      </button>
    </form>
  );
}
