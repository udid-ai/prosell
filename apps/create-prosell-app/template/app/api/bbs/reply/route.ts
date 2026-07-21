import { NextRequest, NextResponse } from "next/server";
import {
  getToken, fetchBbsReplies,
  createBbsReply, updateBbsReply, deleteBbsReply,
} from "@/lib/prosell";

export const dynamic = "force-dynamic";

const MAX = 1000;
type Body = { bbs_id?: string; article_id?: number; reply_id?: number; content?: string };

function ids(b: Body) {
  const bbs_id = String(b.bbs_id ?? "");
  const article_id = Number(b.article_id);
  const ok = /^[a-zA-Z0-9_-]+$/.test(bbs_id) && Number.isInteger(article_id) && article_id > 0;
  return { bbs_id, article_id, ok };
}

// 댓글 목록 새로고침(작성/삭제 후).
export async function GET(req: NextRequest) {
  const token = await getToken();
  const sp = req.nextUrl.searchParams;
  const bbs_id = String(sp.get("bbs_id") ?? "");
  const article_id = Number(sp.get("article_id"));
  if (!/^[a-zA-Z0-9_-]+$/.test(bbs_id) || !Number.isInteger(article_id) || article_id <= 0)
    return NextResponse.json({ ok: false, error: "요청을 확인해 주세요." }, { status: 400 });
  const replies = await fetchBbsReplies(bbs_id, article_id, token);
  return NextResponse.json({ ok: true, replies });
}

export async function POST(req: NextRequest) {
  const token = await getToken();   // 비회원이면 undefined(client-id 로 요청)
  const b = (await req.json().catch(() => ({}))) as Body;
  const { bbs_id, article_id, ok } = ids(b);
  const content = String(b.content ?? "").trim().slice(0, MAX);
  const reply_id = Number(b.reply_id) || 0;
  if (!ok) return NextResponse.json({ ok: false, error: "게시물을 확인해 주세요." }, { status: 400 });
  if (!content) return NextResponse.json({ ok: false, error: "댓글 내용을 입력해 주세요." }, { status: 400 });
  const r = await createBbsReply(token, bbs_id, article_id, content, reply_id);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, reply_id: r.data?.reply_id });
}

export async function PUT(req: NextRequest) {
  const token = await getToken();   // 비회원이면 undefined(client-id 로 요청)
  const b = (await req.json().catch(() => ({}))) as Body;
  const { bbs_id, article_id, ok } = ids(b);
  const reply_id = Number(b.reply_id);
  const content = String(b.content ?? "").trim().slice(0, MAX);
  if (!ok || !Number.isInteger(reply_id) || reply_id <= 0) return NextResponse.json({ ok: false, error: "댓글을 확인해 주세요." }, { status: 400 });
  if (!content) return NextResponse.json({ ok: false, error: "댓글 내용을 입력해 주세요." }, { status: 400 });
  const r = await updateBbsReply(token, bbs_id, article_id, reply_id, content);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const token = await getToken();   // 비회원이면 undefined(client-id 로 요청)
  const b = (await req.json().catch(() => ({}))) as Body;
  const { bbs_id, article_id, ok } = ids(b);
  const reply_id = Number(b.reply_id);
  if (!ok || !Number.isInteger(reply_id) || reply_id <= 0) return NextResponse.json({ ok: false, error: "댓글을 확인해 주세요." }, { status: 400 });
  const r = await deleteBbsReply(token, bbs_id, article_id, reply_id);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
