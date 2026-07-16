import { getToken, fetchRefundTracking } from "@/lib/prosell";
import TrackingView, { TrackingUnavailable } from "@/components/TrackingView";

export const dynamic = "force-dynamic";

// 반품 회수 배송추적 팝업 — 주문 배송조회와 동일 UI(공통 TrackingView). /tracking/refund/{rno}
export default async function RefundTrackingPage({ params }: { params: Promise<{ rno: string }> }) {
  const token = await getToken();
  const { rno } = await params;
  const data = token ? await fetchRefundTracking(token, rno) : null;
  if (!data) return <TrackingUnavailable message="회수 배송 정보를 불러올 수 없습니다. (회수 송장 등록 여부 또는 권한을 확인해 주세요.)" />;
  return <TrackingView data={data} />;
}
