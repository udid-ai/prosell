import Link from "next/link";
import { getToken, fetchAddressBook } from "@/lib/prosell";
import AddressManager from "@/components/AddressManager";

export const dynamic = "force-dynamic";

const cardCls = "rounded-md border border-line bg-card p-6";

export default async function AddressPage() {
  const token = await getToken();
  if (!token) {
    return (
      <div className={cardCls}>
        <h1 className="text-xl">배송지 관리</h1>
        <p className="mt-2 text-sub">로그인이 필요합니다.</p>
        <Link href="/auth/login" className="mt-3 inline-block rounded-sm bg-accent px-4 py-2 text-accent-foreground">로그인</Link>
      </div>
    );
  }
  const book = await fetchAddressBook(token);
  return <AddressManager initial={book.items} countryOnoff={book.country_onoff === 1} country={book.country} countries={book.countries} />;
}
