import { Suspense, cache } from "react";
import Link from "next/link";
import { getToken, fetchCategories, fetchAccount, fetchFooter } from "@/lib/prosell";
import { SITE_NAME } from "@/lib/seo";
import ThemeToggle from "./ThemeToggle";
import CategoryNav from "./CategoryNav";
import SearchBar from "./SearchBar";
import CartBadge from "./CartBadge";
import { CartIcon, UserIcon } from "./icons";

// 반응형 헤더 — 데스크탑: 로고 | 검색 | 액션 + 카테고리바.  모바일: 로고 | 액션 / 검색줄.
// 셸(로고·검색·카테고리·장바구니·테마)은 즉시 렌더하고, «계정 이름/인증 버튼»만 <Suspense> 로 분리해 스트리밍한다.
//  → 회원 fetchAccount(no-store) 왕복이 헤더(=모든 페이지 셸)를 블로킹하지 않게 해 회원 페이지 지연을 제거.
//  → 로그인 판정은 여전히 «계정 조회 성공» 기준(스트리밍 영역 안) → 만료·무효 토큰의 «가짜 로그인» 방지 유지.

// 한 요청 안에서 두 스트리밍 컴포넌트가 같은 토큰으로 계정을 각각 부르지 않도록 dedupe.
const getAccountCached = cache(async (t: string) => fetchAccount(t));

// «홍길동 님» — 계정 조회 성공(유효 토큰) 시에만. 실패/무효면 아무것도 안 보임.
async function HeaderMemberName({ token }: { token: string }) {
  const account = await getAccountCached(token);
  const name = account ? String(account.origin.name || account.origin.nick || account.origin.uid || "").trim() : "";
  if (!name) return null;
  return (
    <Link href="/account" className="mr-1 hidden max-w-[140px] truncate text-sm text-text hover:text-accent sm:block">
      <b className="font-semibold">{name}</b> 님
    </Link>
  );
}

// 인증 버튼 영역 — 회원(유효 토큰): 로그아웃 / 비회원·무효 토큰: 로그인·회원가입.
function GuestAuth() {
  return (
    <>
      <span className="mx-1 hidden h-5 w-px bg-line md:block" />
      <div className="hidden items-center gap-1 md:flex">
        <Link href="/order/guest" className="rounded-full px-2 py-1 text-sm text-sub hover:text-accent">비회원 주문조회</Link>
        <Link href="/auth/login" className="rounded-full px-2 py-1 text-sm text-sub hover:text-accent">로그인</Link>
        <Link href="/auth/join" className="rounded-full bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:opacity-90">회원가입</Link>
      </div>
    </>
  );
}

async function HeaderAuthArea({ token }: { token: string }) {
  const account = await getAccountCached(token);
  if (!account) return <GuestAuth />; // 무효/만료 토큰 → 비회원 UI
  return (
    <>
      <span className="mx-1 hidden h-5 w-px bg-line md:block" />
      <form action="/auth/logout" method="post" className="m-0 hidden md:block">
        <button type="submit" className="cursor-pointer rounded-full border-0 bg-transparent px-2 py-1 text-sm text-sub hover:text-accent">
          로그아웃
        </button>
      </form>
    </>
  );
}

export default async function Header() {
  // 셸에 필요한 값만 대기(모두 캐시·쿠키라 가벼움). 무거운 fetchAccount 는 아래 Suspense 로 분리.
  const [token, tree, footer] = await Promise.all([getToken(), fetchCategories(), fetchFooter()]);
  const shopName = footer?.service || SITE_NAME; // 로고(상호) — 없으면 사이트 기본명.

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
          {/* 회원 이름 — 계정 조회를 기다리지 않고 스트리밍(도착 전엔 미표시) */}
          {token ? (
            <Suspense fallback={null}>
              <HeaderMemberName token={token} />
            </Suspense>
          ) : null}

          {/* 내정보 — 토큰 유무로 즉시 링크(무효 토큰이면 /account 가 로그인으로 유도) */}
          <Link
            href={token ? "/account" : "/auth/login?redirect=%2Faccount"}
            aria-label="내정보" title="내정보" className={iconBtn}
          >
            <UserIcon className="h-5 w-5" />
          </Link>
          <Link href="/cart" aria-label="장바구니" title="장바구니" className={`relative ${iconBtn}`}>
            <CartIcon className="h-5 w-5" />
            <CartBadge />
          </Link>
          <ThemeToggle />

          {/* 인증 버튼 — 비회원은 즉시, 회원(토큰)은 계정 확인 후 스트리밍(도착 전엔 미표시) */}
          {token ? (
            <Suspense fallback={null}>
              <HeaderAuthArea token={token} />
            </Suspense>
          ) : (
            <GuestAuth />
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
