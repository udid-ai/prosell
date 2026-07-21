import { NextRequest, NextResponse } from "next/server";
import { getToken, voteBbs } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 게시물/댓글 추천·반대 — POST /api/bbs/good { bbs_id, article_id, mode(1|2)[, reply_id] }
export async function POST(req: NextRequest) {
  const token = await getToken();   // 비회원이면 undefined(client-id)
  const b = (await req.json().catch(() => ({}))) as { bbs_id?: string; article_id?: number; reply_id?: number; mode?: number };
  const bbs_id = String(b.bbs_id ?? "");
  const article_id = Number(b.article_id);
  const mode = Number(b.mode);
  const reply_id = b.reply_id != null ? Number(b.reply_id) : undefined;
  if (!/^[a-zA-Z0-9_-]+$/.test(bbs_id) || !Number.isInteger(article_id) || article_id <= 0)
    return NextResponse.json({ ok: false, error: "게시물을 확인해 주세요." }, { status: 400 });
  if (mode !== 1 && mode !== 2)
    return NextResponse.json({ ok: false, error: "추천/반대 구분을 확인해 주세요." }, { status: 400 });

  const r = await voteBbs(token, bbs_id, article_id, mode as 1 | 2, reply_id);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, good: r.data?.good ?? 0, nogood: r.data?.nogood ?? 0 });
}
