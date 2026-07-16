import { getOrderToken, fetchProductTracking } from "@/lib/prosell";
import TrackingView, { TrackingUnavailable } from "@/components/TrackingView";

export const dynamic = "force-dynamic";

// 상품 배송조회 팝업 — 상품별 운송장(pro_parcel_num)으로 조회(분할배송 대응). 레거시 tracking/product/{prno}.
// 회원(AT) 우선, 없으면 비회원 주문조회 guest 토큰으로 조회(백엔드 order/tracking 이 guest 스코프 허용).
export default async function ProductTrackingPage({ params }: { params: Promise<{ prno: string }> }) {
  const token = await getOrderToken();
  const { prno } = await params;
  const data = token ? await fetchProductTracking(token, prno.replace(/[^0-9]/g, "")) : null;
  if (!data) return <TrackingUnavailable message="배송 정보를 불러올 수 없습니다. (송장 등록 여부 또는 권한을 확인해 주세요.)" />;
  return <TrackingView data={data} />;
}
