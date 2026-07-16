// 전역 Toast — 어디서나 toast("메시지") 호출 → ToastHost 가 렌더((main) 레이아웃에 상주).
export type ToastType = "success" | "error" | "info";

export function toast(message: string, type: ToastType = "info"): void {
  if (typeof window === "undefined" || !message) return;
  window.dispatchEvent(new CustomEvent("app:toast", { detail: { message, type } }));
}
