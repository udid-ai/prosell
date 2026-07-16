import { getToken, fetchTracking } from "@/lib/prosell";
import TrackingView, { TrackingUnavailable } from "@/components/TrackingView";

export const dynamic = "force-dynamic";

// 자체 배송추적 팝업(주문 배송) — 공통 TrackingView 로 렌더. /tracking/{dno}
export default async function TrackingPage({ params }: { params: Promise<{ dno: string }> }) {
  const token = await getToken();
  const { dno } = await params;
  const data = token ? await fetchTracking(token, dno) : null;
  if (!data) return <TrackingUnavailable />;
  return <TrackingView data={data} />;
}
