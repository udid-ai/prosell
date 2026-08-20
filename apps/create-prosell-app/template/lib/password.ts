// 쇼핑몰 비밀번호 생성 규칙 — 백엔드 account.req_upw(= MemberConfig.fields.upw)와 동일.
//  0: 규칙 없음(스타터 최소 4자) / 1: 6자↑ / 2: 8자↑ / 3: 8자↑+특수 3개↑ / 4: 10자↑+특수 2개↑
//  5: ISMS 권장 — 영대/영소/숫자/특수 중 3종 조합 8자↑ 또는 2종 조합 10자↑,
//     연속·반복 문자와 아이디·이메일·성명·생년월일·전화번호 유추 차단
// (백엔드 lib/Utility/Password.php 의 checkPassword 와 동일 판정)

export type PasswordCtx = {
  uid?: string;
  email?: string;
  name?: string;
  birth?: string;
  hp?: string;
  tel?: string;
};

// hint = 폼에 상시 노출하는 전체 안내, error = 길이·조합 위반 시 보여줄 짧은 문구
type Rule = { minLen: number; minLen2: number; minSpecial: number; isms: boolean; hint: string; error: string };

export function passwordRule(reqUpw?: number): Rule {
  switch (Number(reqUpw)) {
    case 1: return { minLen: 6, minLen2: 0, minSpecial: 0, isms: false, hint: "6자 이상", error: "6자 이상" };
    case 2: return { minLen: 8, minLen2: 0, minSpecial: 0, isms: false, hint: "8자 이상", error: "8자 이상" };
    case 3: return { minLen: 8, minLen2: 0, minSpecial: 3, isms: false, hint: "8자 이상, 특수문자 3개 이상 포함", error: "8자 이상, 특수문자 3개 이상 포함" };
    case 4: return { minLen: 10, minLen2: 0, minSpecial: 2, isms: false, hint: "10자 이상, 특수문자 2개 이상 포함", error: "10자 이상, 특수문자 2개 이상 포함" };
    case 5: return {
      minLen: 8, minLen2: 10, minSpecial: 0, isms: true,
      hint: "영문 대문자·소문자·숫자·특수문자 중 3종 조합 8자 이상 또는 2종 조합 10자 이상",
      error: "영문 대/소문자·숫자·특수문자 중 3종 조합 8자 이상 또는 2종 조합 10자 이상",
    };
    default: return { minLen: 4, minLen2: 0, minSpecial: 0, isms: false, hint: "4자 이상", error: "4자 이상" };
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

// 사용된 문자 종류 수 : 영대 / 영소 / 숫자 / 특수
function kindCount(pw: string): number {
  let n = 0;
  if (/[A-Z]/.test(pw)) n++;
  if (/[a-z]/.test(pw)) n++;
  if (/[0-9]/.test(pw)) n++;
  if (/[^A-Za-z0-9]/.test(pw)) n++;
  return n;
}

// 키보드 인접열 — 백엔드 $pw_keyboard 와 동일
const KEYBOARD = ["qwertyuiop", "asdfghjkl", "zxcvbnm", "1234567890", "!@#$%^&*()"];

// 사전 금칙어 — 백엔드 $pw_dictionary 와 동일
const DICTIONARY = [
  "password", "passwd", "pass1234", "qwerty", "qwer1234", "asdf",
  "zxcv", "iloveyou", "letmein", "welcome", "admin", "administrator",
  "master", "manager", "root", "guest", "test1234", "abc123",
  "1q2w3e", "1qaz2wsx", "shopping", "prosell",
];

// 동일 문자 n회 이상 연속
function hasRepeat(pw: string, n: number): boolean {
  let run = 1;
  for (let i = 1; i < pw.length; i++) {
    if (pw[i] === pw[i - 1]) { if (++run >= n) return true; }
    else run = 1;
  }
  return false;
}

// 아스키 코드 +1 / -1 로 n자 이상 연속 (abc, cba, 123, 321)
function hasSequence(pw: string, n: number): boolean {
  let up = 1, down = 1;
  for (let i = 1; i < pw.length; i++) {
    const diff = pw.charCodeAt(i) - pw.charCodeAt(i - 1);
    up = diff === 1 ? up + 1 : 1;
    down = diff === -1 ? down + 1 : 1;
    if (up >= n || down >= n) return true;
  }
  return false;
}

// 키보드 인접열 n자 이상 (정/역방향)
function hasKeyboard(pw: string, n: number): boolean {
  const low = pw.toLowerCase();
  for (const row of KEYBOARD) {
    const rev = [...row].reverse().join("");
    for (let i = 0; i <= row.length - n; i++) {
      if (low.includes(row.substr(i, n))) return true;
      if (low.includes(rev.substr(i, n))) return true;
    }
  }
  return false;
}

// 개인정보 유추 차단 목록. 백엔드 getPasswordDenyList 와 동일 기준(4자 미만 제외).
export function passwordDenyList(ctx?: PasswordCtx): string[] {
  const list: string[] = [];
  if (!ctx) return list;

  const add = (v?: string) => {
    const s = String(v ?? "").trim();
    if (s.length >= 4) list.push(s);
  };

  add(ctx.uid);

  if (ctx.email) {
    add(ctx.email);
    add(ctx.email.split("@")[0]);
  }

  if (ctx.name && /^[A-Za-z\s]+$/.test(ctx.name)) add(ctx.name.replace(/\s/g, ""));

  const birth = String(ctx.birth ?? "").replace(/[^0-9]/g, "");
  if (birth.length === 8) { add(birth); add(birth.slice(2)); }
  else if (birth.length === 6) add(birth);

  for (const raw of [ctx.hp, ctx.tel]) {
    const num = String(raw ?? "").replace(/[^0-9]/g, "");
    if (num.length >= 9) { add(num); add(num.slice(-8)); add(num.slice(-4)); }
  }

  return Array.from(new Set(list));
}

// 규칙 위반 시 안내 메시지, 통과 시 빈 문자열.
// ctx 는 ISMS 규칙(5)의 개인정보 유추 차단에만 쓰이며, 폼에 없는 값은 서버가 최종 확인한다.
export function validatePassword(pw: string, reqUpw?: number, ctx?: PasswordCtx): string {
  const rule = passwordRule(reqUpw);

  if (!rule.isms) {
    if (pw.length < rule.minLen) return `비밀번호는 ${rule.error} 이어야 합니다.`;
    if (rule.minSpecial > 0 && specialCount(pw) < rule.minSpecial) return `비밀번호는 ${rule.error} 이어야 합니다.`;
    return "";
  }

  if (/\s/.test(pw)) return "비밀번호에 공백은 사용할 수 없습니다.";

  const kinds = kindCount(pw);
  if (kinds >= 3) { if (pw.length < rule.minLen) return `비밀번호는 ${rule.error} 이어야 합니다.`; }
  else if (kinds === 2) { if (pw.length < rule.minLen2) return `비밀번호는 ${rule.error} 이어야 합니다.`; }
  else return `비밀번호는 ${rule.error} 이어야 합니다.`;

  if (hasRepeat(pw, 3)) return "같은 문자를 3자 이상 반복해 사용할 수 없습니다.";
  if (hasSequence(pw, 3) || hasKeyboard(pw, 3)) return "연속된 문자·숫자(abc, 123, qwe 등)는 사용할 수 없습니다.";

  const low = pw.toLowerCase();
  if (DICTIONARY.some((w) => low.includes(w))) return "쉽게 유추할 수 있는 비밀번호입니다. 다른 비밀번호를 입력하세요.";

  if (passwordDenyList(ctx).some((d) => low.includes(d.toLowerCase()))) {
    return "아이디·이메일·성명·생년월일·전화번호는 비밀번호에 사용할 수 없습니다.";
  }

  return "";
}
