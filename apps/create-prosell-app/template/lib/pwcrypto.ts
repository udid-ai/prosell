import crypto from "crypto";
// 주의: 서버 전용 모듈(개인키 취급). 클라이언트 컴포넌트에서 import 금지 — 클라이언트는 pwcryptoClient 사용.

// 비밀번호 전송 보호(ISMS) — 클라이언트가 공개키로 비밀번호를 RSA-OAEP 암호화해 전송하고,
// 서버(Next)가 개인키로 복호화한 뒤 백엔드로 서버-서버 전달한다. 브라우저→서버 요청엔 평문이 남지 않는다.
//
// 키: 운영은 PW_RSA_PRIVATE_KEY(PEM) 를 두어 인스턴스 간 공유(스케일아웃 시 공개키/암호문 인스턴스 불일치 방지).
//     미설정이면 프로세스 기동 시 임시 키페어를 생성(단일 인스턴스 개발/소규모용).

// 키페어는 globalThis 에 보관 → Next dev 의 모듈 hot-reload 로 재생성되지 않게 유지
// (재생성되면 브라우저가 이미 받은 공개키와 개인키가 어긋나 복호화 실패).
const G = globalThis as unknown as { __pwCryptoKeys?: { publicKeyDerB64: string; privateKey: crypto.KeyObject } };

function loadOrGenerate() {
  if (G.__pwCryptoKeys) return G.__pwCryptoKeys;

  const envPem = process.env.PW_RSA_PRIVATE_KEY;
  let privateKey: crypto.KeyObject;
  if (envPem && envPem.includes("PRIVATE KEY")) {
    privateKey = crypto.createPrivateKey({ key: envPem.replace(/\\n/g, "\n"), format: "pem" });
  } else {
    const { privateKey: pk } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    privateKey = pk;
  }
  const publicKey = crypto.createPublicKey(privateKey);
  const publicKeyDerB64 = publicKey.export({ type: "spki", format: "der" }).toString("base64");

  G.__pwCryptoKeys = { publicKeyDerB64, privateKey };
  return G.__pwCryptoKeys;
}

/** 클라이언트로 내려줄 공개키(SPKI DER, base64). Web Crypto 가 그대로 importKey("spki") 가능. */
export function getPublicKeyB64(): string {
  return loadOrGenerate().publicKeyDerB64;
}

/** RSA-OAEP(sha256) base64 암호문을 평문으로 복호화. 실패 시 예외.
 *  Web Crypto(globalThis.crypto.subtle) 사용 — Cloudflare workerd 는 node:crypto 의
 *  privateDecrypt 를 지원하지 않으므로 subtle 로 복호화한다(Node 20+/workerd 양쪽 호환).
 *  키 로딩·export(createPrivateKey/export)는 workerd 에서도 동작하므로 그대로 둔다.
 *  (PW_RSA_PRIVATE_KEY 미설정 시 generateKeyPairSync 임시생성 경로는 Node/dev 전용.) */
export async function decryptPassword(cipherB64: string): Promise<string> {
  const { privateKey } = loadOrGenerate();
  const pkcs8 = privateKey.export({ type: "pkcs8", format: "der" });
  const key = await globalThis.crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["decrypt"]
  );
  const plain = await globalThis.crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    key,
    Buffer.from(cipherB64, "base64")
  );
  return new TextDecoder().decode(plain);
}

/** 암호문이면 복호화, 아니면(구버전/평문 폴백) 그대로 반환. enc 우선. */
export async function resolvePassword(body: { enc_upw?: unknown; current_upw?: unknown; upw?: unknown }): Promise<string> {
  if (typeof body.enc_upw === "string" && body.enc_upw) {
    try { return await decryptPassword(body.enc_upw); } catch { return ""; }
  }
  if (typeof body.current_upw === "string") return body.current_upw;
  if (typeof body.upw === "string") return body.upw;
  return "";
}
