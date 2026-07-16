import { NextResponse } from "next/server";
import { getPublicKeyB64 } from "@/lib/pwcrypto";

export const dynamic = "force-dynamic";

// 비밀번호 암호화용 공개키(SPKI DER, base64) 제공. 클라이언트가 RSA-OAEP 암호화에 사용.
export async function GET() {
  return NextResponse.json({ publicKey: getPublicKeyB64() });
}
