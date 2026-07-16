import { redirect } from "next/navigation";

// /mypage → /account 로 이관(라우트 경로를 account 로 통일). 기존 링크/북마크 호환용 리다이렉트.
export default function MypageRedirect() {
  redirect("/account");
}
