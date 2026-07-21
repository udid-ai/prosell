import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import GuestOrderForm from "@/components/GuestOrderForm";
import OrderList from "@/components/OrderList";
import { fetchGuestOrders, guestHpVerifyRequired, GUEST_TOKEN_COOKIE } from "@/lib/prosell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "비회원 주문조회", robots: { index: false } };

const outerCls = "mx-auto my-8 w-full max-w-content px-4 py-8 sm:px-4";

export default async function GuestOrderPage() {
  const gt = (await cookies()).get(GUEST_TOKEN_COOKIE)?.value || "";
  if (!gt) return <GuestOrderForm hpVerify={await guestHpVerifyRequired()} />;

  const list = await fetchGuestOrders(gt);
  const hasOrders = list.orders.some((o) => (o.items || []).length > 0);

  return (
    <div className={outerCls}>
      <div className="mx-auto w-full max-w-[860px] space-y-4">
        <div className="flex min-h-10 flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-xl font-bold text-text">
            비회원 주문조회
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-1.5 text-[12px] font-bold text-accent-foreground">{list.total_count}</span>
          </h1>
          <form action="/order/guest/exit" method="post" className="m-0">
            <button type="submit" className="cursor-pointer rounded-md border border-line bg-card px-3 py-1.5 text-[13px] text-sub hover:text-accent">
              다른 주문 조회
            </button>
          </form>
        </div>

        {!hasOrders ? (
          <div className="rounded-md border border-line bg-card p-12 text-center text-sub">
            최근 90일 이내 조회 가능한 주문이 없습니다.
            <form action="/order/guest/exit" method="post" className="mt-4">
              <button type="submit" className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">다시 조회</button>
            </form>
          </div>
        ) : (
          <OrderList orders={list.orders} detailBase="/order/guest/orders" guest />
        )}

        <p className="pt-2 text-center text-[13px] text-sub">
          회원이신가요? <Link href="/auth/login" className="text-accent">로그인</Link>
        </p>
      </div>
    </div>
  );
}
