import { redirect } from "next/navigation";
import { getToken, fetchShopPolicy } from "@/lib/prosell";
import OrderClient from "./OrderClient";

export const dynamic = "force-dynamic";

/**
 * 주문서 — 비회원 주문 정책(order_guest) 게이트를 «서버에서» 통과시킨 뒤 주문서를 렌더한다.
 * 클라이언트에서 판정하면 주문서가 한 번 그려졌다가 로그인으로 튕겨 화면이 깜빡인다.
 *
 *  0 = 비회원 주문 불가 → 로그인 필요
 *  1 = 바로 가능
 *  2 = 로그인 경유 → 로그인 화면에서 «비회원으로 구매» 를 고르면 guest=1 로 되돌아온다
 *
 * 정책 자체는 /api/order 에서도 다시 확인한다(주소창 직접 진입·API 직접 호출 대비).
 */
export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ oid: string }>;
  searchParams: Promise<{ guest?: string }>;
}) {
  const { oid } = await params;
  const { guest } = await searchParams;

  const token = await getToken();
  if (!token) {
    const policy = await fetchShopPolicy();
    const orderGuest = policy?.order_guest ?? 1;
    if (orderGuest === 0 || (orderGuest === 2 && guest !== "1")) {
      redirect(`/auth/login?redirect=${encodeURIComponent(`/order/${oid}`)}`);
    }
  }

  return <OrderClient />;
}
