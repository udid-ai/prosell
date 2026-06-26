import Link from "next/link";
import { cookies } from "next/headers";
import { won } from "@/lib/format";
import { getToken, getOrderResult, type CheckoutAuth } from "@/lib/prosell";

export const dynamic = "force-dynamic";

export default async function OrderCompletePage({ params }: { params: Promise<{ pno: string }> }) {
  const { pno } = await params;
  // 회원(pa_at) 또는 비회원(cart_id) 인증
  const token = await getToken();
  let auth: CheckoutAuth | null = token ? { token } : null;
  if (!auth) {
    const guest = (await cookies()).get("cart_id")?.value;
    if (guest && /^[\w-]{8,64}$/.test(guest)) auth = { guest };
  }
  const order = auth ? await getOrderResult(auth, pno) : null;

  if (!order) {
    return (
      <main className="mx-auto max-w-content p-6">
        <div className="rounded-2xl border border-line bg-card p-12 text-center">
          <p className="text-sub">주문 정보를 찾을 수 없습니다.</p>
          <Link href="/" className="mt-4 inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">홈으로</Link>
        </div>
      </main>
    );
  }

  const p = order.payment;
  const bank = p.bank;

  return (
    <main className="mx-auto max-w-content p-4 sm:p-6">
      {/* 헤더 */}
      <section className="rounded-2xl border border-line bg-card p-8 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-accent/15 text-2xl text-accent">✓</div>
        <h1 className="mt-3 text-2xl font-bold text-text">주문이 완료되었습니다</h1>
        <p className="mt-1 text-sm text-sub">주문번호 <b className="text-text">{order.oid}</b></p>
        <p className="mt-0.5 text-[13px] text-sub">{order.dt}</p>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_340px] lg:items-start">
        <div className="space-y-5">
          {/* 무통장 입금 안내 */}
          {bank && (
            <section className="rounded-2xl border border-accent/40 bg-accent/5 p-5">
              <h2 className="text-base font-bold text-text">입금 계좌 안내</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <Row k="입금 은행" v={`${bank.title} ${bank.num}`} />
                <Row k="예금주" v={bank.holder} />
                <Row k="입금자명" v={bank.sender} />
                <Row k="입금 금액" v={won(p.pay_price)} strong />
                {bank.deadline && <Row k="입금 기한" v={bank.deadline} />}
              </dl>
              <p className="mt-3 text-[12px] text-sub">기한 내 미입금 시 주문이 자동 취소될 수 있습니다.</p>
            </section>
          )}

          {/* 주문 상품 */}
          <section className="rounded-2xl border border-line bg-card p-5">
            <h2 className="mb-3 text-base font-bold text-text">주문 상품</h2>
            <ul className="divide-y divide-line">
              {order.items.filter((it) => it.is_option === 0).map((it) => (
                <li key={it.prno} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="line-clamp-1 text-sm font-semibold text-text">{it.title}</p>
                    {it.option_label && <p className="text-[13px] text-sub">{it.option_label}</p>}
                    <p className="text-[13px] text-sub">{it.quantity}개</p>
                  </div>
                  <span className="text-sm font-bold text-text">{won(it.amount_price)}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* 배송지 */}
          <section className="rounded-2xl border border-line bg-card p-5">
            <h2 className="mb-3 text-base font-bold text-text">배송지</h2>
            <dl className="space-y-2 text-sm">
              <Row k="받는분" v={order.receiver.name} />
              <Row k="연락처" v={order.receiver.hp} />
              <Row k="주소" v={`(${order.receiver.zipcode}) ${order.receiver.addr1} ${order.receiver.addr2}`} />
              {order.receiver.message && <Row k="요청사항" v={order.receiver.message} />}
            </dl>
          </section>
        </div>

        {/* 결제 요약 */}
        <aside className="rounded-2xl border border-line bg-card p-5 lg:sticky lg:top-20">
          <h2 className="text-base font-bold text-text">결제 정보</h2>
          <dl className="mt-4 space-y-2.5 text-sm">
            <Row k="결제수단" v={p.method_label} />
            <Row k="결제상태" v={p.state_label} />
            <Row k="상품금액" v={won(p.item_price)} />
            <Row k="배송비" v={p.delivery_price === 0 ? "무료" : won(p.delivery_price)} />
          </dl>
          <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
            <span className="text-sub">결제 금액</span>
            <span className="text-2xl font-extrabold text-text">{won(p.pay_price)}</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link href="/mypage/orders" className="grid h-11 place-items-center rounded-md border border-line text-sm font-medium text-text hover:bg-bg">주문내역</Link>
            <Link href="/" className="grid h-11 place-items-center rounded-md bg-accent text-sm font-bold text-accent-foreground hover:opacity-90">쇼핑 계속</Link>
          </div>
        </aside>
      </div>
    </main>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-sub">{k}</dt>
      <dd className={`text-right ${strong ? "text-base font-bold text-accent" : "text-text"}`}>{v}</dd>
    </div>
  );
}
