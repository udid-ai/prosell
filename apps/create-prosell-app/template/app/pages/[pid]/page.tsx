import { notFound } from "next/navigation";
import { fetchPage } from "@/lib/prosell";
import PageContent from "@/components/PageContent";

export const dynamic = "force-dynamic";

// /pages/[pid] — 관리자 디자인 페이지(이용약관=policy, 개인정보=privacy 등) 읽기 전용 렌더.
// 본문은 에디터에서 "흰 배경" 기준으로 작성된 인라인 스타일을 포함하므로,
// 사이트 테마(특히 다크모드)와 충돌해 가독성이 떨어진다.
// → 본문을 항상 밝은 "문서 용지"에 담아(어떤 테마에서도) 읽기 좋게 한다.
export default async function ContentPage({ params }: { params: Promise<{ pid: string }> }) {
  const { pid } = await params;
  const page = await fetchPage(pid);
  if (!page) notFound();

  return (
    <main className="mx-auto my-8 max-w-content px-4">
      {/* 제목(사이트 테마) */}
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-text">{page.title}</h1>
        {page.slogan ? <p className="mt-1.5 text-sm text-sub">{page.slogan}</p> : null}
      </header>

      {/* 문서 용지 — 항상 밝은 배경 + 어두운 본문(테마 무관). 에디터 인라인 색이 그대로 읽힘 */}
      <div className="overflow-hidden rounded-xl border border-line bg-white text-[#2b2f36] shadow-card">
        {page.content ? (
          <PageContent
            html={page.content}
            className="doc-content px-5 py-7 text-[14px] leading-7 sm:px-9 sm:py-10
                       [&_a]:text-[#1a55d6] [&_a]:underline
                       [&_h1]:mb-3 [&_h1]:mt-6 [&_h1]:text-xl [&_h1]:font-bold
                       [&_h2]:mb-2.5 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-bold
                       [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:font-bold
                       [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-1
                       [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse
                       [&_td]:border [&_td]:border-[#e2e5ea] [&_td]:p-2
                       [&_th]:border [&_th]:border-[#e2e5ea] [&_th]:p-2
                       [&_img]:my-2 [&_img]:max-w-full"
          />
        ) : (
          <p className="px-9 py-10 text-center text-sub">내용이 없습니다.</p>
        )}
      </div>
    </main>
  );
}
