import Link from "next/link";
import { getToken, fetchCategories, fetchAccount, fetchFooter } from "@/lib/prosell";
import { SITE_NAME } from "@/lib/seo";
import ThemeToggle from "./ThemeToggle";
import CategoryNav from "./CategoryNav";
import SearchBar from "./SearchBar";
import CartBadge from "./CartBadge";
import { CartIcon, UserIcon } from "./icons";

// 반응형 헤더 — 데스크탑: 로고 | 검색 | 액션 + 카테고리바.  모바일: 로고 | 액션 / 검색줄.
// 초기 렌더에서 토큰·카테고리를 병렬 1회 조회(카테고리는 ISR 5분 캐시).
export default async function Header() {
  const [token, tree, footer] = await Promise.all([getToken(), fetchCategories(), fetchFooter()]);
  // 로고(상호) — 쇼핑몰 연결 시 shop/footer 의 service(상호명)로 표기, 없으면 사이트 기본명.
  const shopName = footer?.service || SITE_NAME;
  // 로그인 판정은 «토큰 쿠키 존재»가 아니라 «계정 조회 성공(유효 토큰)» 기준.
  //  → 만료·무효 토큰(예: 백엔드 재설치/다른 앱 잔여 쿠키)으로 «가짜 로그인» 표시되어
  //    회원 Bearer 로 상품 조회가 실패하던 문제 방지. 무효면 비회원 UI로 표시.
  const account = token ? await fetchAccount(token) : null;
  const loggedIn = !!account;
  const memberName = account
    ? String(account.origin.name || account.origin.nick || account.origin.uid || "").trim()
    : "";

  const iconBtn =
    "grid h-9 w-9 place-items-center rounded-full text-text transition-colors hover:bg-line";

  return (
    <header className="site-header sticky top-0 z-40 border-b border-line bg-card/90 backdrop-blur-md">
      {/* 상단 바 */}
      <div className="mx-auto flex max-w-content items-center gap-3 px-4 py-3 md:gap-6">
        <Link href="/" className="shrink-0 text-[18px] font-extrabold tracking-tight text-text">
          {shopName}
        </Link>

        {/* 데스크탑 검색 (가운데) */}
        <div className="hidden flex-1 md:block">
          <SearchBar className="mx-auto max-w-sm" />
        </div>

        {/* 액션 */}
        <nav className="ml-auto flex items-center gap-1">
          {loggedIn && memberName && (
            <Link href="/account" className="mr-1 hidden max-w-[140px] truncate text-sm text-text hover:text-accent sm:block">
              <b className="font-semibold">{memberName}</b> 님
            </Link>
          )}
          <Link
            href={loggedIn ? "/account" : "/auth/login?redirect=%2Faccount"}
            aria-label="내정보" title="내정보" className={iconBtn}
          >
            <UserIcon className="h-5 w-5" />
          </Link>
          <Link href="/cart" aria-label="장바구니" title="장바구니" className={`relative ${iconBtn}`}>
            <CartIcon className="h-5 w-5" />
            <CartBadge />
          </Link>
          <ThemeToggle />
          <span className="mx-1 hidden h-5 w-px bg-line md:block" />
          {loggedIn ? (
            <form action="/auth/logout" method="post" className="m-0 hidden md:block">
              <button type="submit" className="cursor-pointer rounded-full border-0 bg-transparent px-2 py-1 text-sm text-sub hover:text-accent">
                로그아웃
              </button>
            </form>
          ) : (
            <div className="hidden items-center gap-1 md:flex">
              <Link href="/order/guest" className="rounded-full px-2 py-1 text-sm text-sub hover:text-accent">비회원 주문조회</Link>
              <Link href="/auth/login" className="rounded-full px-2 py-1 text-sm text-sub hover:text-accent">로그인</Link>
              <Link href="/auth/join" className="rounded-full bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:opacity-90">회원가입</Link>
            </div>
          )}
        </nav>
      </div>

      {/* 모바일 검색 줄 */}
      <div className="px-4 pb-3 md:hidden">
        <SearchBar />
      </div>

      {/* 카테고리 바 (데스크탑) */}
      <div className="hidden md:block">
        <CategoryNav tree={tree} />
      </div>
    </header>
  );
}
