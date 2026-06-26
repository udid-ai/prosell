import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchTerms } from "@/lib/prosell";

export const dynamic = "force-dynamic";

const TITLE: Record<string, string> = { service: "이용약관", privacy: "개인정보 수집·이용" };

export default async function TermsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id !== "service" && id !== "privacy") notFound();
  const content = await fetchTerms(id);

  return (
    <main className="mx-auto my-6 max-w-[760px] rounded-md border border-line bg-card p-6">
      <Link href="/auth/join" className="text-sm text-accent">← 가입으로</Link>
      <h1 className="mt-2 text-xl">{TITLE[id]}</h1>
      {content ? (
        <article className="mt-4 text-[13px] leading-7 text-text [&_img]:max-w-full" dangerouslySetInnerHTML={{ __html: content }} />
      ) : (
        <p className="mt-4 text-sub">약관 내용을 불러올 수 없습니다.</p>
      )}
    </main>
  );
}
