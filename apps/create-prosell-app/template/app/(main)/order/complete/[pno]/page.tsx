import Link from "next/link";
import { cookies } from "next/headers";
import { won, formatDateTime, orderDeliveryFee } from "@/lib/format";
import { getToken, getOrderResult, type CheckoutAuth } from "@/lib/prosell";
import GuestOrderViewButton from "@/components/GuestOrderViewButton";

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
      <div className="mx-auto max-w-content p-6">
        <div className="rounded-2xl border border-line bg-card p-12 text-center">
          <p className="text-sub">주문 정보를 찾을 수 없습니다.</p>
          <Link href="/" className="mt-4 inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">홈으로</Link>
        </div>
      </div>
    );
  }

  const p = order.payment;
  const bank = p.bank;
  const r = order.receiver;
  const items = order.items.filter((it) => it.is_option === 0);
  const addons = order.items.filter((it) => it.is_option === 1);

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      {/* 헤더 */}
      <section className="rounded-2xl border border-line bg-card p-8 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-accent/15 text-2xl text-accent">✓</div>
        <h1 className="mt-3 text-2xl font-bold text-text">주문이 완료되었습니다</h1>
        <p className="mt-1 text-sm text-sub">결제번호 <b className="text-text">{order.pno}</b></p>
        <p className="mt-0.5 text-[13px] text-sub">{formatDateTime(order.dt)}</p>
      </section>

      <div className="mt-5 space-y-5">
        {/* 입금 계좌 안내 — 무통장(300)·가상계좌(130) 공통. 입금자명은 무통장만. */}
        {bank && (
          <section className="rounded-2xl border border-accent/40 bg-accent/5 p-5">
            <h2 className="text-base font-bold text-text">{p.method === 130 ? "가상계좌 입금정보" : "무통장 입금정보"}</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <Row k="입금 은행" v={`${bank.title} ${bank.num}`} />
              <Row k="예금주" v={bank.holder} />
              {p.method === 300 && bank.sender && <Row k="입금자명" v={bank.sender} />}
              <Row k="입금 금액" v={won(p.pay_price)} strong />
              {bank.deadline && <Row k="입금 기한" v={bank.deadline} />}
            </dl>
            <p className="mt-3 text-[12px] text-sub">기한 내 미입금 시 주문이 자동 취소될 수 있습니다.</p>
          </section>
        )}

        {/* 주문 상품 */}
        <section className="rounded-2xl border border-line bg-card p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-base font-bold text-text">주문 상품</h2>
            <span className="text-[13px] text-sub">총 {items.length}개</span>
          </div>
          <ul className="space-y-4">
            {items.map((it) => (
              <li key={it.prno} className="flex gap-4">
                <Link href={`/products/${it.products_id}`} className="shrink-0">
                  {it.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.thumb} alt="" className="h-20 w-20 rounded-xl border border-line object-cover" />
                  ) : (
                    <div className="h-20 w-20 rounded-xl border border-line bg-surface" />
                  )}
                </Link>
                <div className="flex min-w-0 flex-1 flex-col justify-center">
                  <Link href={`/products/${it.products_id}`} className="line-clamp-2 text-sm font-semibold text-text hover:text-accent">{it.title}</Link>
                  {it.option_label && <p className="mt-0.5 text-[13px] text-sub">{it.option_label}</p>}
                  <div className="mt-1.5 flex items-baseline justify-between">
                    <span className="text-[13px] text-sub">수량 {it.quantity}개</span>
                    <span className="text-sm font-bold text-text">{won(it.amount_price)}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {addons.length > 0 && (
            <ul className="mt-4 space-y-1.5 border-t border-line pt-3">
              {addons.map((it) => (
                <li key={it.prno} className="flex items-baseline justify-between text-[13px]">
                  <span className="text-sub">+ {it.title}{it.option_label ? ` ${it.option_label}` : ""} · {it.quantity}개</span>
                  <span className="font-medium text-text">{won(it.amount_price)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 배송지 — 해외배송이면 국가/우편번호/주/도시/상세, 국내면 우편번호/주소 */}
        <section className="rounded-2xl border border-line bg-card p-5">
          <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-text">
            배송지
            {r.is_overseas === 1 && <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[11px] font-bold text-accent">해외배송</span>}
          </h2>
          <dl className="space-y-2 text-sm">
            <Row k="받는분" v={r.name} />
            <Row k="연락처" v={r.hp} />
            {r.is_overseas === 1 ? (
              <>
                <Row k="국가" v={r.country_name || r.country || "-"} />
                {r.postcode ? <Row k="우편번호" v={r.postcode} /> : null}
                <Row k="주소" v={[r.detail, r.city, r.state].filter(Boolean).join(", ") || "-"} />
              </>
            ) : (
              <Row k="주소" v={`(${r.zipcode}) ${r.addr1} ${r.addr2}`.trim()} />
            )}
            {r.message && <Row k="요청사항" v={r.message} />}
          </dl>
        </section>

        {/* 결제 정보 */}
        <section className="rounded-2xl border border-line bg-card p-5">
          <h2 className="text-base font-bold text-text">결제 정보</h2>
          <dl className="mt-4 space-y-2.5 text-sm">
            <Row k="결제수단" v={p.method_label} />
            <Row k="결제상태" v={p.state_label} />
            <Row k="상품금액" v={won(p.item_price)} />
            <Row k="배송비" v={orderDeliveryFee(p.delivery_type ?? 0, p.delivery_price)} />
          </dl>
          <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
            <span className="text-sub">결제 금액</span>
            <span className="text-2xl font-extrabold text-text">{won(p.pay_price)}</span>
          </div>
        </section>

        <div className="mb-8 grid grid-cols-2 gap-2">
          {/* 회원: 주문내역 / 비회원: 재입력 없이 주문조회로 진입(cart_id → guest 토큰 자동발급) */}
          {token ? (
            <Link href="/account/orders" className="grid h-11 place-items-center rounded-md border border-line text-sm font-medium text-text hover:bg-surface">주문내역</Link>
          ) : (
            <GuestOrderViewButton />
          )}
          <Link href="/" className="grid h-11 place-items-center rounded-md bg-accent text-sm font-bold text-accent-foreground hover:opacity-90">쇼핑 계속</Link>
        </div>
      </div>
    </div>
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
