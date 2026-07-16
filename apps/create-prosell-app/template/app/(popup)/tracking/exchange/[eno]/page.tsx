import { getToken, fetchExchangeTracking } from "@/lib/prosell";
import TrackingView, { TrackingUnavailable } from "@/components/TrackingView";

export const dynamic = "force-dynamic";

// 교환 회수/재배송 배송추적 팝업 — 주문 배송조회와 동일 UI(공통 TrackingView). /tracking/exchange/{eno}
export default async function ExchangeTrackingPage({ params }: { params: Promise<{ eno: string }> }) {
  const token = await getToken();
  const { eno } = await params;
  const data = token ? await fetchExchangeTracking(token, eno) : null;
  if (!data) return <TrackingUnavailable message="교환 배송 정보를 불러올 수 없습니다. (송장 등록 여부 또는 권한을 확인해 주세요.)" />;
  return <TrackingView data={data} />;
}
