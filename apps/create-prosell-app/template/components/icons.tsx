import type { SVGProps } from "react";

// 라인 아이콘 세트 (lucide 스타일). stroke=currentColor 라 text-* 색을 따른다.
function Base({ children, ...p }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...p}
    >
      {children}
    </svg>
  );
}

export const HomeIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></Base>
);
export const GridIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></Base>
);
export const CartIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><path d="M3 4h2l2.2 11.2a1.5 1.5 0 0 0 1.5 1.2h8.2a1.5 1.5 0 0 0 1.5-1.2L21 7H6" /><circle cx="9.5" cy="20" r="1.3" /><circle cx="18" cy="20" r="1.3" /></Base>
);
export const UserIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" /></Base>
);
export const SearchIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></Base>
);
export const MenuIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><path d="M4 6h16M4 12h16M4 18h16" /></Base>
);
