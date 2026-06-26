import { NextRequest, NextResponse } from "next/server";
import { checkUid } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 아이디 중복확인 프록시 — client_id 를 서버에만 두고 중복확인을 중계.
export async function GET(req: NextRequest) {
  const uid = (req.nextUrl.searchParams.get("uid") || "").trim();
  return NextResponse.json(await checkUid(uid));
}
