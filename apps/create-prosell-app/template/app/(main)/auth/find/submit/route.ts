import { NextRequest, NextResponse } from "next/server";
import {
  clientIpFromHeaders,
  findMemberId,
  sendFullMemberId,
  pwFindSend,
  pwFindConfirm,
  pwFindReset,
} from "@/lib/prosell";
import { resolvePassword } from "@/lib/pwcrypto";

export const dynamic = "force-dynamic";

type Channel = "hp" | "email";

// 아이디/비밀번호 찾기 프록시 — 클라이언트가 action 별로 호출.
// 비밀번호 재설정의 새 비밀번호는 클라이언트가 RSA 암호화(enc_upw)해 전송 → 여기서 복호화 후 백엔드로 전달(ISMS).
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(b.action || "");
  const clientIp = clientIpFromHeaders(req.headers);
  const channel: Channel = b.channel === "email" ? "email" : "hp";
  const contact = String(b.contact || "").trim();

  switch (action) {
    case "find_id": {
      const name = String(b.name || "").trim();
      if (!name || !contact) return NextResponse.json({ ok: false, error: "이름과 연락처를 입력해 주세요." }, { status: 400 });
      const r = await findMemberId({ name, channel, contact, clientIp });
      return NextResponse.json(r, { status: r.ok ? 200 : 400 });
    }
    case "id_send": {
      const mid = Number(b.mid || 0);
      const name = String(b.name || "").trim();
      if (!mid || !name || !contact) return NextResponse.json({ ok: false, error: "요청 정보를 확인해 주세요." }, { status: 400 });
      const r = await sendFullMemberId({ mid, channel, name, contact, clientIp });
      return NextResponse.json(r, { status: r.ok ? 200 : 400 });
    }
    case "pw_send": {
      const uid = String(b.uid || "").trim();
      if (!uid || !contact) return NextResponse.json({ ok: false, error: "아이디와 연락처를 입력해 주세요." }, { status: 400 });
      const r = await pwFindSend({ uid, channel, contact, clientIp });
      return NextResponse.json(r, { status: r.ok ? 200 : 400 });
    }
    case "pw_confirm": {
      const uid = String(b.uid || "").trim();
      const sendId = Number(b.send_id || 0);
      const code = String(b.code || "").trim();
      if (!uid || !contact || !sendId || !code) return NextResponse.json({ ok: false, error: "인증번호를 확인해 주세요." }, { status: 400 });
      const r = await pwFindConfirm({ uid, channel, contact, sendId, code, clientIp });
      return NextResponse.json(r, { status: r.ok ? 200 : 400 });
    }
    case "pw_reset": {
      const uid = String(b.uid || "").trim();
      const sendId = Number(b.send_id || 0);
      const code = String(b.code || "").trim();
      const upw = resolvePassword(b as { enc_upw?: unknown; upw?: unknown });
      if (b.enc_upw && !upw) return NextResponse.json({ ok: false, error: "보안 처리 중 오류가 발생했습니다. 다시 시도해 주세요." }, { status: 400 });
      if (!uid || !contact || !sendId || !code || !upw) return NextResponse.json({ ok: false, error: "필수 정보를 확인해 주세요." }, { status: 400 });
      const r = await pwFindReset({ uid, channel, contact, sendId, code, upw, clientIp });
      return NextResponse.json(r, { status: r.ok ? 200 : 400 });
    }
    default:
      return NextResponse.json({ ok: false, error: "알 수 없는 요청입니다." }, { status: 400 });
  }
}
