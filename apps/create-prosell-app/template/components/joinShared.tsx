"use client";

// ── 공유 스타일 (Tailwind 클래스) ────────────────────────────
// AI 재디자인 시 className 을 자유롭게 바꿔도 된다. 색은 globals.css 의 토큰을 따른다.
export const fieldCls = "mt-2 w-full rounded-sm border border-line bg-card px-3 py-3 text-[15px] text-text outline-none focus:border-accent read-only:bg-readonly";
export const labelCls = "mt-3 block text-[13px] text-sub";
export const smallBtnCls = "cursor-pointer whitespace-nowrap rounded-sm border-0 bg-accent px-3 py-2 text-[13px] text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60";
// 입력칸과 동일한 높이의 인라인 버튼(발송/확인/주소검색)
export const inlineBtnCls = "cursor-pointer shrink-0 whitespace-nowrap rounded-sm border border-transparent bg-accent px-4 py-3 text-[15px] leading-[1.5] text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60";
export const shellCls = "mx-auto my-8 max-w-[560px] rounded-md border border-line bg-card p-6";

// 큰 버튼: 활성/비활성 클래스
export function bigBtnCls(on: boolean) {
  return `mt-5 w-full rounded-sm border-0 py-3 text-[15px] ${on ? "cursor-pointer bg-accent text-accent-foreground" : "cursor-not-allowed bg-muted text-accent-foreground"}`;
}

// ── 단계 표시기 ──────────────────────────────────────────────
export function Steps({ step }: { step: 1 | 2 | 3 }) {
  const items = ["약관·본인확인", "정보 입력", "가입 완료"];
  return (
    <div className="mb-4 flex gap-2">
      {items.map((s, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const active = n === step, done = n < step;
        const tone = active ? "text-accent" : done ? "text-success" : "text-sub";
        const bar = active ? "bg-accent" : done ? "bg-success" : "bg-line";
        return (
          <div key={s} className={`flex-1 text-center text-xs ${tone}`}>
            <div className={`mb-1.5 h-1 rounded-full ${bar}`} />
            {done ? "✓ " : `${n}. `}{s}
          </div>
        );
      })}
    </div>
  );
}

// ── 단계 간 진행상태 (sessionStorage) ────────────────────────
// 비밀번호(upw)는 보안상 저장하지 않는다.
export type JoinState = {
  agreeService?: boolean; agreePrivacy?: boolean; agreeAge?: boolean;
  emailReceive?: boolean; hpReceive?: boolean;
  certifyDone?: boolean; certifyId?: string;
  hpDone?: boolean; hpSendId?: number | null; hpCode?: string; hp?: string;
  emailDone?: boolean; emailSendId?: number | null; emailCode?: string;
  uid?: string; name?: string; email?: string;
};

const KEY = "prosell-join";

export function loadJoin(): JoinState {
  try { return JSON.parse(sessionStorage.getItem(KEY) || "{}") as JoinState; } catch { return {}; }
}
export function saveJoin(patch: JoinState) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ ...loadJoin(), ...patch })); } catch {}
}
export function clearJoin() {
  try { sessionStorage.removeItem(KEY); } catch {}
}

// Step2(정보 입력폼)가 소유하는 키 — Step1 데이터(약관·수신동의·본인확인)와 분리.
const STEP2_KEYS: (keyof JoinState)[] = ["uid", "name", "email", "hp", "hpDone", "hpSendId", "hpCode", "emailDone", "emailSendId", "emailCode"];

// 전진(Step1→Step2) 시 Step2 입력값/인증진행만 초기화한다(약관·본인확인은 보존).
// → 정보 입력폼은 항상 깨끗한 상태로 시작되어, 반복 가입 시 이전 입력이 남지 않는다.
export function clearStep2() {
  const s = loadJoin();
  for (const k of STEP2_KEYS) delete s[k];
  try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}
