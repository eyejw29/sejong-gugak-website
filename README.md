# 배포 폴더 — sejonggugak.com 원본 (v2.8.x)

> ⚠️ **이 폴더가 곧 라이브 사이트의 원본이다.** 부서_02_웹프로토타입은 v2.5 시점에 동결된 역사 자료이며,
> 여기서 프로토타입으로 "재빌드"하는 과거 절차(rm -rf 후 복사)는 **절대 실행 금지** — v2.8 작업 전체가 파괴된다.

## 배포 방법 (Cloudflare Pages 직접 업로드)

```bash
cd 06_웹사이트리뉴얼/배포
bash deploy-cf.sh          # = npx wrangler pages deploy . --project-name sejong-gugak-website
```

- wrangler 로그인 세션 필요 (`npx wrangler login`, OAuth). 만료 시 재로그인.
- 배포 후 1~2분 내 https://sejonggugak.com 반영.
- **배포 전 반드시 git commit** — GitHub 저장소(eyejw29/sejong-gugak-website)가 백업이다.
  (2026-08-12 감사에서 4개월치 미커밋 상태가 발견됨. 재발 금지.)

## 구조 (2026-08-12 기준)

```
배포/
├── *.html                  ← 페이지 14종 (index, about, schedule, notices, ...)
│                              member.html·members.html은 _redirects가 먼저 처리하는 백업 스텁
├── 404.html                ← 커스텀 404 (soft-404 방지, Pages가 자동 인식)
├── favicon.ico             ← /favicon.ico 직접 요청 대응
├── colors_and_type.css     ← 디자인 토큰 (원본: 디자인시스템/, 수정 시 양쪽 동기화)
├── mobile-ux.css, musicians.css
├── manifest.webmanifest
├── robots.txt, sitemap*.xml
├── _headers                ← 보안(HSTS 등)·캐시 헤더
├── _redirects              ← 옛 Gnuboard URL 매핑 + www→apex + legacy 미디어 → api 프록시
├── functions/bbs/board.php.js ← 옛 게시판 URL 301 리다이렉터 (Pages Function)
└── assets/
    ├── css/, js/           ← 페이지 공용 스타일·site-data.js(API 하이드레이션)
    ├── icon-{32,192,512}.png ← 정방형 파비콘 세트
    ├── og-cover.jpg        ← SNS 공유 이미지 (1200x630, og-cover.svg에서 래스터)
    └── photos/             ← 로컬 서빙 사진 (hero, members, performances)
```

## 운영 규칙

1. **캐시 버전**: 로컬 css/js 참조는 전 페이지 동일한 `?v=` 를 쓴다 (현재 2.8.90).
   릴리스 시 아래 한 줄로 일괄 갱신:
   ```bash
   node -e "const fs=require('fs');fs.readdirSync('.').filter(f=>f.endsWith('.html')).forEach(f=>{let s=fs.readFileSync(f,'utf8');s=s.replace(/((?:href|src)=\"(?!https?:)[^\"]+?\.(?:css|js))\?v=[^\"]*(\")/g,'\$1?v=NEW_VERSION\$2');fs.writeFileSync(f,s)})"
   ```
2. **이미지**: 500KB 넘는 원본을 그대로 넣지 않는다. `npx sharp-cli --input in.jpg --output out.jpg --quality 80 resize 1200` 으로 압축.
3. **데이터**: 공연·공지·단원 데이터는 admin(api.sejonggugak.com) 이 원천 — HTML 하드코딩 최소화, site-data.js가 하이드레이션.
4. **외부 CDN 의존**: unpkg(phosphor-icons)·Google Fonts — 향후 셀프호스팅 전환 검토 (CSP 강화 선행 조건).

## 도메인·인프라

- apex `sejonggugak.com` = canonical. www는 _redirects로 301.
- admin.sejonggugak.com (Pages: sejong-admin) / api.sejonggugak.com (Workers) / 소스: 부서_04·05 참조.
