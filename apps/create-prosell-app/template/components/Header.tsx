import { Suspense, cache } from "react";
import Link from "next/link";
import { getToken, getMemberName, fetchCategories, fetchAccount, fetchFooter } from "@/lib/prosell";
import { SITE_NAME } from "@/lib/seo";
import ThemeToggle from "./ThemeToggle";
import CategoryNav from "./CategoryNav";
import SearchBar from "./SearchBar";
import CartBadge from "./CartBadge";
import { CartIcon, UserIcon } from "./icons";

// 반응형 헤더 — 데스크탑: 로고 | 검색 | 액션 + 카테고리바.  모바일: 로고 | 액션 / 검색줄.
// 회원 «N님»은 로그인·갱신 시 심어둔 pa_name 쿠키에서 즉시 읽는다(매 페이지 fetchAccount 왕복 제거).
//  → 쿠키가 없는 «구(舊) 세션» 등에서만 fetchAccount 를 <Suspense> 로 스트리밍(논블로킹) 폴백.
//  → 로그인 판정도 이 흐름을 따르므로 만료·무효 토큰의 «가짜 로그인» 은 상품 조회 폴백으로 이미 방어됨.

// 폴백 경로에서 두 스트리밍 컴포넌트가 같은 토큰으로 계정을 각각 부르지 않도록 dedupe.
const getAccountCached = cache(async (t: string) => fetchAccount(t));

async function HeaderMemberName({ token }: { token: string }) {
  const account = await getAccountCached(token);
  const name = account ? String(account.origin.name || account.origin.nick || account.origin.uid || "").trim() : "";
  if (!name) return null;
  return <MemberNameLink name={name} />;
}

function MemberNameLink({ name }: { name: string }) {
  return (
    <Link href="/account" className="mr-1 hidden max-w-[140px] truncate text-sm text-text hover:text-accent sm:block">
      <b className="font-semibold">{name}</b> 님
    </Link>
  );
}

function LogoutArea() {
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

// pa_name 쿠키가 없는 세션의 인증 버튼 폴백 — 계정 조회 성공 시 로그아웃, 실패(무효 토큰) 시 비회원.
async function HeaderAuthArea({ token }: { token: string }) {
  const account = await getAccountCached(token);
  return account ? <LogoutArea /> : <GuestAuth />;
}

export default async function Header() {
  // 셸에 필요한 값만 대기(모두 캐시·쿠키라 가벼움). 회원 이름은 pa_name 쿠키에서 즉시.
  const [token, name, tree, footer] = await Promise.all([getToken(), getMemberName(), fetchCategories(), fetchFooter()]);
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
          {/* 회원 이름 — pa_name 쿠키 있으면 즉시, 없고 토큰만 있으면 스트리밍 폴백 */}
          {name ? (
            <MemberNameLink name={name} />
          ) : token ? (
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

          {/* 인증 버튼 — 이름 쿠키 있으면 로그아웃 즉시, 토큰만 있으면 스트리밍 폴백, 비회원은 즉시 */}
          {name ? (
            <LogoutArea />
          ) : token ? (
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
