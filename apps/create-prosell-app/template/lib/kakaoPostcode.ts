// 카카오(다음) 우편번호 서비스 로더 + 타입.
// 스크립트는 클라이언트에서 1회만 로드되며, window.kakao.Postcode / window.daum.Postcode 로 노출된다.

export type PostcodeData = {
  zonecode: string;       // 우편번호(5자리)
  address: string;        // 기본 주소
  addressType: "R" | "J"; // R=도로명, J=지번
  bname?: string;         // 법정동/리 이름
  buildingName?: string;  // 건물명
  bcode?: string;         // 법정동 코드(10자리) — 쇼핑몰 admcode 로 저장
};

type PostcodeInstance = { embed: (el: HTMLElement) => void };
type PostcodeCtor = new (opts: {
  oncomplete: (data: PostcodeData) => void;
  onclose?: () => void;
  width?: string | number;
  height?: string | number;
}) => PostcodeInstance;

declare global {
  interface Window {
    kakao?: { Postcode?: PostcodeCtor };
    daum?: { Postcode?: PostcodeCtor };
  }
}

const SCRIPT_URL = "//t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";

/** 우편번호 생성자(카카오 우선, 없으면 다음) */
export function getPostcodeCtor(): PostcodeCtor | undefined {
  if (typeof window === "undefined") return undefined;
  return window.kakao?.Postcode ?? window.daum?.Postcode;
}

/** 우편번호 스크립트 로드 (이미 있으면 즉시 resolve) */
export function kakaoPostcodeScript(url = SCRIPT_URL): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return resolve();
    if (getPostcodeCtor()) return resolve();

    const exist = document.querySelector<HTMLScriptElement>(`script[src="${url}"]`);
    if (exist) {
      exist.addEventListener("load", () => resolve());
      exist.addEventListener("error", () => reject(new Error("우편번호 스크립트 로드 실패")));
      return;
    }

    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("우편번호 스크립트 로드 실패"));
    document.body.appendChild(script);
  });
}

// 쇼핑몰 join 의 kakao.Postcode oncomplete 매핑과 동일:
//  zipcode=zonecode, admcode=bcode(법정동코드), place=buildingName(건물명),
//  address=도로명일 때 (동, 건물명) 부가.
export type PostcodeResult = { zipcode: string; address: string; admcode: string; place: string };

export function formatPostcode(data: PostcodeData): PostcodeResult {
  let address = data.address;
  if (data.addressType === "R") {
    let extra = "";
    if (data.bname) extra += data.bname;
    if (data.buildingName) extra += extra ? `, ${data.buildingName}` : data.buildingName;
    if (extra) address += ` (${extra})`;
  }
  return {
    zipcode: data.zonecode,
    address,
    admcode: data.bcode || "",
    place: data.buildingName || "",
  };
}
