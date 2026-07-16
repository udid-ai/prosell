// 쇼핑몰 비밀번호 생성 규칙 — 백엔드 account.req_upw(= MemberConfig.fields.upw)와 동일.
//  0: 규칙 없음(스타터 최소 4자) / 1: 6자↑ / 2: 8자↑ / 3: 8자↑+특수 3개↑ / 4: 10자↑+특수 2개↑
// (레거시 Join.php / Update/Upw.php 검증과 일치)
export function passwordRule(reqUpw?: number): { minLen: number; minSpecial: number; hint: string } {
  switch (Number(reqUpw)) {
    case 1: return { minLen: 6, minSpecial: 0, hint: "6자 이상" };
    case 2: return { minLen: 8, minSpecial: 0, hint: "8자 이상" };
    case 3: return { minLen: 8, minSpecial: 3, hint: "8자 이상, 특수문자 3개 이상 포함" };
    case 4: return { minLen: 10, minSpecial: 2, hint: "10자 이상, 특수문자 2개 이상 포함" };
    default: return { minLen: 4, minSpecial: 0, hint: "4자 이상" };
  }
}

// 특수문자 개수 = 영문/숫자 제외한 ASCII(charCode<128) 문자 수. 백엔드와 동일 계산
// (preg_replace("/[a-zA-Z0-9]/i","") 후 ord<128 카운트).
function specialCount(pw: string): number {
  const stripped = pw.replace(/[a-zA-Z0-9]/g, "");
  let n = 0;
  for (let i = 0; i < stripped.length; i++) if (stripped.charCodeAt(i) < 128) n++;
  return n;
}

// 규칙 위반 시 안내 메시지, 통과 시 빈 문자열.
export function validatePassword(pw: string, reqUpw?: number): string {
  const { minLen, minSpecial, hint } = passwordRule(reqUpw);
  if (pw.length < minLen) return `비밀번호는 ${hint} 이어야 합니다.`;
  if (minSpecial > 0 && specialCount(pw) < minSpecial) return `비밀번호는 ${hint} 이어야 합니다.`;
  return "";
}
