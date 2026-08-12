/**
 * v2.8.16 — Gnuboard 레거시 URL 301 리다이렉트
 * 옛 URL: /bbs/board.php?bo_table=<table>&wr_id=<id>
 * 신규 URL: 카테고리별 신규 페이지 (개별 글 매핑은 v2.7 마이그레이션에서 legacy_url 컬럼으로 처리)
 *
 * 검색엔진(구글봇·네이버봇)이 옛 URL을 크롤할 때 301을 받으면
 * 해당 URL의 랭킹 신호가 신규 URL로 이전됩니다.
 */

const TABLE_TO_PATH = {
  // 공연
  schedule: '/schedule',
  monthly: '/schedule',
  // 공지/언론
  notice: '/notices?cat=notice',
  press: '/notices?cat=press',
  press2: '/notices?cat=press',
  basic: '/notices',
  // 단원·문의·갤러리
  member: '/members',
  inquiry: '/inquiry',
  gallery: '/archive',
  // 기타
  recruit: '/notices?cat=recruit',
  outreach: '/outreach',
};

export function onRequest({ request }) {
  const url = new URL(request.url);
  const bo_table = url.searchParams.get('bo_table') || '';
  const wr_id = url.searchParams.get('wr_id') || '';

  let target = TABLE_TO_PATH[bo_table] || '/';
  // 개별 글 ID는 쿼리스트링으로 전달 (신규 사이트에서 ?legacyId 처리 가능)
  if (wr_id) {
    target += (target.includes('?') ? '&' : '?') + 'legacyId=' + encodeURIComponent(wr_id);
  }

  // 검색엔진/사용자가 절대 URL 받도록 origin 포함
  return Response.redirect(url.origin + target, 301);
}
