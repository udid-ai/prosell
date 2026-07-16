import Link from "next/link";

// 페이징 — 한 번에 5페이지씩(블록) 보여준다. 순수 Link(서버 컴포넌트), 클라이언트 JS 불필요.
// total: 전체 상품 수, page: 현재 페이지(1-base), perPage: 페이지당 개수.
// basePath: "/category/1" 등, query: 유지할 기타 쿼리(category 경로는 path에 있으니 보통 q 등).
const WINDOW = 5;

export default function Pagination({
  total,
  page,
  perPage,
  basePath,
  query = {},
}: {
  total: number;
  page: number;
  perPage: number;
  basePath: string;
  query?: Record<string, string>;
}) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  if (totalPages <= 1) return null;

  const cur = Math.min(Math.max(1, page), totalPages);
  const block = Math.ceil(cur / WINDOW);
  const start = (block - 1) * WINDOW + 1;
  const end = Math.min(block * WINDOW, totalPages);
  const nums = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  const href = (n: number) =>
    `${basePath}?${new URLSearchParams({ ...query, page: String(n) }).toString()}`;

  const base = "grid h-9 min-w-9 place-items-center rounded-md px-2 text-sm transition-colors";
  const arrow = (enabled: boolean) =>
    `${base} ${enabled ? "border border-line text-text hover:border-accent hover:text-accent" : "cursor-default text-sub/40"}`;

  const Arrow = ({ to, show, label, children }: { to: number; show: boolean; label: string; children: React.ReactNode }) =>
    show ? (
      <Link href={href(to)} aria-label={label} className={arrow(true)}>{children}</Link>
    ) : (
      <span aria-hidden className={arrow(false)}>{children}</span>
    );

  return (
    <nav aria-label="페이지" className="mb-8 mt-8 flex items-center justify-center gap-1.5">
      <Arrow to={1} show={cur > 1} label="첫 페이지">«</Arrow>
      <Arrow to={start - 1} show={start > 1} label="이전 5페이지">‹</Arrow>

      {nums.map((n) => (
        <Link
          key={n}
          href={href(n)}
          aria-current={n === cur ? "page" : undefined}
          className={`${base} ${
            n === cur
              ? "bg-accent font-bold text-accent-foreground"
              : "border border-line text-text hover:border-accent hover:text-accent"
          }`}
        >
          {n}
        </Link>
      ))}

      <Arrow to={end + 1} show={end < totalPages} label="다음 5페이지">›</Arrow>
      <Arrow to={totalPages} show={cur < totalPages} label="마지막 페이지">»</Arrow>
    </nav>
  );
}
