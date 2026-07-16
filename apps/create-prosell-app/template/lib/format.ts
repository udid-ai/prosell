// 클라이언트/서버 공용 포맷 유틸 (next/headers 등 서버 전용 의존성 없음 → 클라이언트 컴포넌트에서 import 가능).

/** 원화 표기. 1000 → "1,000원". null/NaN → "". */
export function won(n?: number | null): string {
  if (n == null || isNaN(Number(n))) return "";
  return Number(n).toLocaleString("ko-KR") + "원";
}

export interface FormatPhoneNumberOptions {
  phoneNumber: string; // 전화번호
  mask?: boolean;      // 마스킹 여부
  country?: string;    // 국가 코드
  isMobile?: boolean;  // 휴대폰
}

/**
 * 전화번호 포맷. 010 휴대폰(3-4-4), 02 서울(2-3or4-4), 그 외 지역번호(2or3-3or4-4),
 * 대표번호 8자리(4-4), 국제번호 등 자리수별로 하이픈을 넣는다. 규칙에 안 맞으면 원본 반환.
 */
export function formatPhoneNumber(options: FormatPhoneNumberOptions): string {
  const { phoneNumber, mask = false, country = "", isMobile = false } = options;

  if (!phoneNumber) return "";
  // 하이픈으로 끝나면 입력 중이다.
  if (phoneNumber.endsWith("-")) return phoneNumber;
  // 숫자/하이픈/공백/+/(). 외의 문자(예: 범위 표기 "02-1234-5678~9", 내선 등)가 있으면 포맷하지 않고 원본 그대로.
  if (/[^0-9\-\s+().]/.test(phoneNumber)) return phoneNumber;

  const onlyNumbers = phoneNumber.replace(/[^0-9]/g, "");

  if (isMobile && country === "KR" && onlyNumbers && !/^\d{11}$/.test(onlyNumbers)) {
    return phoneNumber;
  }

  let formattedNumber = phoneNumber;

  // 한국 휴대폰 번호 (010-0000-0000)
  if (/^010\d{8}$/.test(onlyNumbers)) {
    formattedNumber = onlyNumbers.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3");
  }
  // 02 서울 일반 전화번호
  else if (/^02\d{7,8}$/.test(onlyNumbers)) {
    formattedNumber = onlyNumbers.replace(/(\d{2})(\d{3,4})(\d{4})/, "$1-$2-$3");
  }
  // 한국 일반 전화번호(02 외 지역번호 포함)
  else if (/^0\d{1,2}\d{3,4}\d{4}$/.test(onlyNumbers)) {
    formattedNumber = onlyNumbers.replace(/(\d{2,3})(\d{3,4})(\d{4})/, "$1-$2-$3");
  }
  // 대표번호 8자리 (xxxx-xxxx)
  else if (/^\d{8}$/.test(onlyNumbers)) {
    formattedNumber = onlyNumbers.replace(/(\d{4})(\d{4})/, "$1-$2");
  }
  // 국제 전화번호 형식
  else if (/^\d{1,4}\d{2,4}\d{4,10}$/.test(onlyNumbers)) {
    formattedNumber = onlyNumbers.replace(/(\d{1,4})(\d{2,4})(\d{4,10})/, "$1-$2-$3");
  } else {
    return phoneNumber;
  }

  if (mask) formattedNumber = formattedNumber.replace(/(\d{2})$/, "**");

  return formattedNumber;
}

/** 사업자등록번호 포맷. 10자리 → "000-00-00000". */
export function formatBiznum(biznum?: string | null): string {
  if (!biznum) return "";
  const digits = biznum.replace(/\D/g, "");
  if (digits.length === 10) return digits.replace(/^(\d{3})(\d{2})(\d{5})$/, "$1-$2-$3");
  return digits;
}

/**
 * 날짜/시간 표기. ISO8601("2026-07-09T09:39:04+09:00")·"2026-07-09 09:39:04" 등 다양한 입력을
 * "2026-07-09 09:39" 로 통일(T·타임존·초 제거). withTime=false 면 날짜만. 파싱 실패 시 원본 반환.
 */
export function formatDateTime(v?: string | null, withTime = true): string {
  if (!v) return "";
  const m = String(v).match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (m) return withTime ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}` : `${m[1]}-${m[2]}-${m[3]}`;
  const d = String(v).match(/(\d{4})-(\d{2})-(\d{2})/);
  return d ? `${d[1]}-${d[2]}-${d[3]}` : String(v);
}

/** 초 단위까지 포함하는 일시(YYYY-MM-DD HH:MM:SS). 영수증 등 상세 표기용. */
export function formatDateTimeSec(v?: string | null): string {
  if (!v) return "";
  const m = String(v).match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}`;
  return formatDateTime(v);
}

/**
 * 배송수단 3자리 코드(real_delivery_type) → 배송비 상태 라벨.
 *  · 2번째 자리 = 배송비 유형(1무료 / 2조건부무료 / 3유료)
 *  · 3번째 자리 = 결제(0무료 / 1선불 / 2착불)
 * 착불은 fee=0 이어도 "착불"로, 유료 선불은 실제 배송비 표기. dt=0(미배송)은 빈 문자열(수단명이 대신 표시).
 */
export function deliveryFeeStatus(dt: number, fee: number): string {
  if (!dt) return "";
  const feeDigit = Math.floor((dt % 100) / 10); // 1무료 2조건부무료 3유료
  const payDigit = dt % 10;                      // 0무료 1선불 2착불 3(해외 2차결제)
  if (payDigit === 2) return "착불";
  if (payDigit === 3) return "2차 결제";      // 해외 2차결제(533)
  if (feeDigit === 1) return "무료배송";
  if (feeDigit === 2) return fee > 0 ? `배송비 ${won(fee)}` : "조건부 무료";
  return fee > 0 ? `배송비 ${won(fee)}` : "선불"; // 유료 선불
}

/**
 * 주문(완료·소계) 배송비 표기 — del_type(3자리) + 확정 배송비(del_price). "배송비" 접두 없이 값만.
 *  스키마: [1자리 수단][2자리 배송비유형 1무료/2조건부무료/3유료][3자리 결제 0무료/1선불/2착불/3해외2차결제]
 *  · 착불(3자리=2) → "착불" (del_price=0 이라도)
 *  · 해외 2차결제(3자리=3) → "2차 결제"
 *  · 확정 배송비 있으면 금액
 *  · 유료(2자리=3)·선불(3자리=1)인데 금액 0 → "선불" (퀵/직접 등 별도 결제)
 *  · 그 외 금액 0 → "무료" (무료·조건부무료 달성)
 */
export function orderDeliveryFee(dt: number, fee: number): string {
  const payDigit = dt % 10;
  const feeDigit = Math.floor((dt % 100) / 10);
  if (payDigit === 2) return "착불";
  if (payDigit === 3) return "2차 결제";
  if (fee > 0) return won(fee);
  if (feeDigit === 3 && payDigit === 1) return "선불";
  return "무료";
}

/**
 * 전화번호 하이픈 표기(휴대폰·일반전화 공통).
 *  · 서울(02): 02-XXX-XXXX / 02-XXXX-XXXX
 *  · 대표번호 8자리: 15XX-XXXX
 *  · 지역·휴대폰: 0XX-XXX-XXXX / 0XX-XXXX-XXXX
 * 숫자만 추출해 자릿수로 판별하고, 규칙에 맞지 않으면 원본을 그대로 반환.
 * null/빈값 → "".
 */
export function formatPhone(v?: string | number | null): string {
  if (v == null || v === "") return "";
  const d = String(v).replace(/\D/g, "");
  if (!d) return String(v);
  if (d.length === 8) return d.replace(/(\d{4})(\d{4})/, "$1-$2"); // 15XX-XXXX
  if (d.startsWith("02")) {
    if (d.length === 9) return d.replace(/(\d{2})(\d{3})(\d{4})/, "$1-$2-$3");
    if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, "$1-$2-$3");
  }
  if (d.length === 9) return d.replace(/(\d{3})(\d{2})(\d{4})/, "$1-$2-$3");
  if (d.length === 10) return d.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
  if (d.length === 11) return d.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3");
  return String(v);
}

// 저장된 안내/메모 텍스트를 평문으로 — <br> 계열은 개행으로, 나머지 태그는 제거, HTML 엔티티 일부 복원.
// (HTML 로 렌더하지 않고 whitespace-pre-wrap 로 표시. XSS 방지)
export function htmlToText(v?: string | null): string {
  if (!v) return "";
  return String(v)
    // 1) HTML 엔티티 먼저 디코드 — content 가 &lt;br/&gt; 처럼 이스케이프되어 오기 때문(디코드를 나중에 하면 <br> 이 되살아나 그대로 보임).
    .replace(/&nbsp;/gi, " ").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#0?39;/g, "'").replace(/&amp;/gi, "&")
    // 2) <br>·블록 종료 태그 → 개행, 나머지 태그 제거
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
