import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchPage } from "@/lib/prosell";
import { buildMetadata } from "@/lib/seo";
import PageContent from "@/components/PageContent";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ pid: string }> }): Promise<Metadata> {
  const { pid } = await params;
  const page = await fetchPage(pid).catch(() => null);
  return buildMetadata({ title: page?.title || "안내", description: page?.slogan });
}

// /pages/[pid] — 관리자 디자인 페이지(이용약관=policy, 개인정보=privacy 등) 읽기 전용 렌더.
// 본문은 에디터에서 "흰 배경" 기준으로 작성된 인라인 스타일을 포함하므로,
// 사이트 테마(특히 다크모드)와 충돌해 가독성이 떨어진다.
// → 본문을 항상 밝은 "문서 용지"에 담아(어떤 테마에서도) 읽기 좋게 한다.
export default async function ContentPage({ params }: { params: Promise<{ pid: string }> }) {
  const { pid } = await params;
  const page = await fetchPage(pid);
  if (!page) notFound();

  return (
    <div className="mx-auto my-8 max-w-content px-4">
      {/* 제목(사이트 테마) */}
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-text">{page.title}</h1>
        {page.slogan ? <p className="mt-1.5 text-sm text-sub">{page.slogan}</p> : null}
      </header>

      {/* 박스·그림자 없이 내용을 너비에 맞춰 표시(테마 색상 사용) */}
      {page.content ? (
        <PageContent
          html={page.content}
          className="doc-content py-2 text-[14px] leading-7 text-text
                     [&_a]:text-accent [&_a]:underline
                     [&_h1]:mb-3 [&_h1]:mt-6 [&_h1]:text-xl [&_h1]:font-bold
                     [&_h2]:mb-2.5 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-bold
                     [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:font-bold
                     [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-1
                     [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse
                     [&_td]:border [&_td]:border-line [&_td]:p-2
                     [&_th]:border [&_th]:border-line [&_th]:p-2
                     [&_img]:my-2 [&_img]:max-w-full"
        />
      ) : (
        <p className="py-10 text-center text-sub">내용이 없습니다.</p>
      )}
    </div>
  );
}
