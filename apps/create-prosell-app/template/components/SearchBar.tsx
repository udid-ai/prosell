import { SearchIcon } from "./icons";

// 검색 — 순수 form(GET) 으로 /search?q= 이동. 클라이언트 JS 불필요.
export default function SearchBar({ defaultValue = "", className = "" }: { defaultValue?: string; className?: string }) {
  return (
    <form action="/search" className={`relative ${className}`} role="search">
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sub" />
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder="상품 검색"
        aria-label="상품 검색"
        className="h-10 w-full rounded-full border border-line bg-bg pl-9 pr-4 text-sm text-text outline-none transition-colors placeholder:text-sub focus:border-accent focus:bg-card"
      />
    </form>
  );
}
