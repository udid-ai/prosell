import Link from "next/link";
import { notFound } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import { getToken, fetchBbsList, fetchBbsArticle } from "@/lib/prosell";
import BbsWriteForm from "@/components/BbsWriteForm";

export const dynamic = "force-dynamic";

export const metadata = buildMetadata({ title: "글쓰기", noindex: true });

// 저장된 동영상 값(iframe HTML, 백슬래시 이스케이프 포함 가능)에서 깨끗한 src URL 을 추출.
// 이미 URL 이면 그대로. 수정 폼에 iframe 소스가 그대로 노출되던 문제 해결.
function videoToUrl(v: string): string {
  const m = v.match(/src\s*=\s*\\?["']([^"'\\]+)/i);
  return (m ? m[1] : v).trim();
}

export default async function BbsWritePage({
  params, searchParams,
}: {
  params: Promise<{ bbs_id: string }>;
  searchParams: Promise<{ id?: string }>;
}) {
  const { bbs_id } = await params;
  const { id } = await searchParams;
  const token = await getToken();

  // 게시판 메타(카테고리/비밀글/첨부/링크 설정)
  const list = await fetchBbsList(bbs_id, { page: 1 }, token);
  if (!list.board) notFound();
  const board = list.board;
  const listHref = `/board/${bbs_id}`;

  // 작성 권한 — 게시판 설정(bbs_level_write)에 따라 비회원도 허용될 수 있다.
  // can_write=0(등급 필요) 이고 비회원이면 로그인 안내.
  if (board.can_write !== 1) {
    return (
      <div className="mx-auto my-10 max-w-content px-4">
        <div className="mx-auto max-w-sm rounded-md border border-line bg-card p-8 text-center">
          <h1 className="text-lg font-bold text-text">글쓰기 권한이 없습니다</h1>
          <p className="mt-1 text-[13px] text-sub">이 게시판은 로그인(또는 일정 등급) 후 작성할 수 있습니다.</p>
          {!token && <Link href="/auth/login" className="mt-5 inline-block rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground">로그인</Link>}
        </div>
      </div>
    );
  }

  // 수정 모드 — 본인/관리자만. 잠겨있거나 권한 없으면 차단.
  let initial: {
    id: number; category: string | null; title: string; content: string;
    secret: number; adult: number; notice: number; url: string | null;
    hashtag: string; videos: string[];
    attachments: { id: number; mode: string; name: string; is_image: number }[];
  } | null = null;
  if (id) {
    const v = await fetchBbsArticle(bbs_id, id, {}, token);
    const a = v?.article;
    if (!a || a.locked || a.can_edit !== 1) {
      return (
        <div className="mx-auto my-10 max-w-content px-4">
          <div className="rounded-md border border-line bg-card p-10 text-center">
            <p className="text-text">수정 권한이 없습니다.</p>
            <Link href={listHref} className="mt-4 inline-block rounded-md border border-line px-4 py-2 text-sm text-text">목록</Link>
          </div>
        </div>
      );
    }
    initial = {
      id: a.id, category: a.category, title: a.title, content: a.content ?? "",
      secret: a.secret, adult: a.adult, notice: a.notice, url: a.url,
      hashtag: a.hashtags.map((t) => `#${t}`).join(" "), videos: a.videos.map(videoToUrl),
      attachments: a.attachments ?? [],
    };
  }

  return (
    <div className="mx-auto my-10 max-w-content px-4">
      <h1 className="text-center text-2xl font-bold text-text">{board.title} {id ? "수정" : "글쓰기"}</h1>
      <div className="mt-6">
        <BbsWriteForm bbsId={bbs_id} board={board} listHref={listHref} initial={initial} loggedIn={!!token} />
      </div>
    </div>
  );
}
