# 배포 폴더 (dist)

정적 호스팅(GitHub Pages / Netlify / Vercel)에 **이 폴더 내용을 그대로** 업로드하면 된다.

## 구조
```
배포/
├── index.html              ← 홈 (부서_02_웹프로토타입/renewal.html 승격본)
├── about.html              ← 악단소개
├── schedule.html           ← 공연일정
├── performance.html        ← 공연 상세
├── notices.html            ← 공지사항
├── member.html             ← 상임지휘자 소개
├── tickets.html            ← 예매안내
├── inquiry.html            ← 문의 (폼)
├── outreach.html           ← 교육·아웃리치
├── archive.html            ← 아카이브
├── colors_and_type.css     ← 디자인 토큰
└── assets/                 ← 로고·모티프·텍스처·플레이스홀더 8종
```

## 로컬 미리보기
```
cd 06_웹사이트리뉴얼/배포
python -m http.server 8000
# → http://localhost:8000
```
또는 `index.html` 더블클릭. 인터넷 연결 필요 (Google Fonts / Phosphor Icons CDN).

## 갱신 방법
1. 원본 수정: `부서_02_웹프로토타입/*.html` (또는 토큰: `디자인시스템/colors_and_type.css`)
2. 재빌드 커맨드 (수동):
   ```bash
   cd 06_웹사이트리뉴얼
   rm -rf 배포 && mkdir -p 배포/assets
   cp 부서_02_웹프로토타입/*.html 배포/
   cp 디자인시스템/colors_and_type.css 배포/
   cp 부서_03_자산관리/assets/* 배포/assets/
   rm 배포/README.md  # 혹은 건드리지 말 것
   # 경로 평탄화
   cd 배포
   for f in *.html; do
     sed -i 's|href="\.\./디자인시스템/colors_and_type\.css"|href="colors_and_type.css"|g; s|src="\.\./부서_03_자산관리/assets/|src="assets/|g' "$f"
   done
   ```
3. 호스팅 repo에 push

## 외부 의존성 (CDN)
- `fonts.googleapis.com` — Nanum Myeongjo, Noto Sans KR 등
- `unpkg.com/@phosphor-icons/web@2.1.1` — UI 아이콘
- `http://www.sejonggugak.com/data/file/member/*` — 단원 사진 (hotlink, 차단 가능성 있음)

## 알려진 이슈
- **단원 사진 hotlink**: `about.html`, `member.html`이 현 공식 사이트 이미지를 직접 참조. 호스팅 측에서 CORS/hotlink 차단 시 깨질 수 있음. 대응: 이미지 다운로드 후 `assets/members/`로 이전.
- **공식 로고·서체 미수령**: SVG 임시 로고 + Google Fonts 사용 중. 교체 대기.
- **공연 사진 부재**: 히어로·갤러리가 그라데이션/한자 glyph placeholder 상태.
