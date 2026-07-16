import { NextRequest, NextResponse } from "next/server";
import { getToken, saveAddress, deleteAddress, saveCountryAddress, deleteCountryAddress, type AddressInput, type CountryAddressInput } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 배송지 저장(추가/수정) — 회원 토큰으로 백엔드 중계. type=country 면 해외 배송지 upsert.
export async function POST(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as (AddressInput & CountryAddressInput & { type?: string });
  const r = b.type === "country"
    ? await saveCountryAddress(token, { name: b.name, hp: b.hp, country: b.country, postcode: b.postcode, state: b.state, city: b.city, detail: b.detail })
    : await saveAddress(token, b);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}

// 배송지 삭제. type=country 면 해외 배송지 삭제.
export async function DELETE(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { id?: number; type?: string };
  const r = b.type === "country" ? await deleteCountryAddress(token) : await deleteAddress(token, Number(b.id || 0));
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
