"use client";

// 비밀번호 클라이언트 암호화(ISMS) — 공개키(SPKI DER, base64)를 받아 Web Crypto 로 RSA-OAEP(sha256) 암호화.
// 결과 base64 를 서버로 보내면 서버가 개인키로 복호화한다. 브라우저 네트워크엔 암호문만 노출.

function b64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}
function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// 매 호출 시 최신 공개키를 받는다(캐시 안 함) — 서버 재시작으로 키페어가 바뀌어도 항상 현재 키와 일치.
// 비밀번호 제출은 드물어 추가 fetch 비용이 무의미하다.
async function getKey(): Promise<CryptoKey> {
  const res = await fetch("/api/pubkey", { cache: "no-store" });
  const { publicKey } = (await res.json()) as { publicKey: string };
  return crypto.subtle.importKey("spki", b64ToBuf(publicKey), { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
}

/** 평문 비밀번호를 RSA-OAEP 암호문(base64)으로. 실패 시 예외를 던지지 않고 빈 문자열 반환(호출부에서 폴백 처리). */
export async function encryptPassword(plain: string): Promise<string> {
  try {
    if (!plain) return "";
    const key = await getKey();
    const cipher = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, new TextEncoder().encode(plain));
    return bufToB64(cipher);
  } catch {
    return "";
  }
}
