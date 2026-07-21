import { NextRequest, NextResponse } from "next/server";
import { getToken, reportBbs } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 게시물/댓글 신고 — POST /api/bbs/report { bbs_id, article_id, ct[, reply_id] } (로그인 필요)
export async function POST(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ ok: false, error: "신고는 로그인 후 이용할 수 있습니다." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { bbs_id?: string; article_id?: number; reply_id?: number; ct?: string };
  const bbs_id = String(b.bbs_id ?? "");
  const article_id = Number(b.article_id);
  const ct = String(b.ct ?? "").trim().slice(0, 50);
  const reply_id = b.reply_id != null ? Number(b.reply_id) : undefined;
  if (!/^[a-zA-Z0-9_-]+$/.test(bbs_id) || !Number.isInteger(article_id) || article_id <= 0)
    return NextResponse.json({ ok: false, error: "게시물을 확인해 주세요." }, { status: 400 });
  if (!ct) return NextResponse.json({ ok: false, error: "신고 사유를 선택해 주세요." }, { status: 400 });

  const r = await reportBbs(token, bbs_id, article_id, ct, reply_id);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
