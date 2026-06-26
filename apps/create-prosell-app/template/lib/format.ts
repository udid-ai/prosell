// 클라이언트/서버 공용 포맷 유틸 (next/headers 등 서버 전용 의존성 없음 → 클라이언트 컴포넌트에서 import 가능).

/** 원화 표기. 1000 → "1,000원". null/NaN → "". */
export function won(n?: number | null): string {
  if (n == null || isNaN(Number(n))) return "";
  return Number(n).toLocaleString("ko-KR") + "원";
}
