/* =========================================================================
   site-data.js — 공개 사이트 동적 데이터 바인딩 (v2.6.1 · 2026-04-24)

   사용법: 각 페이지 </body> 직전에 <script src="assets/js/site-data.js"></script>

   Progressive Enhancement:
   - 기본 HTML(하드코딩)은 그대로 표시됨
   - API 응답이 오면 해당 섹션을 자동 교체
   - API 실패/데이터 없음 → 하드코딩 유지
   - 관리자가 공연/공지/아카이브 입력 전에도 사이트는 정상 동작

   데이터 소스: https://api.sejonggugak.com/public/*
   ========================================================================= */
(function () {
  'use strict';

  const API_BASE = 'https://api.sejonggugak.com';

  // -----------------------------------------------------------------------
  // API fetchers (JSON, fail-safe)
  // -----------------------------------------------------------------------
  async function safeFetch(path) {
    try {
      // 브라우저·CDN 캐시 우회 (공연/공지 갱신 즉시 반영)
      const sep = path.includes('?') ? '&' : '?';
      const url = API_BASE + path + sep + '_=' + Math.floor(Date.now() / 60000); // 1분 bucket
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        credentials: 'omit',
        cache: 'no-cache',
      });
      if (!res.ok) return null;
      const data = await res.json().catch(() => null);
      return data?.ok ? data.data : null;
    } catch {
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // 유틸
  // -----------------------------------------------------------------------
  function fmtKrDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}.${m}.${dd}`;
  }
  function fmtDay(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return ['SUN','MON','TUE','WED','THU','FRI','SAT'][d.getDay()];
  }
  function fmtTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const h = String(d.getHours()).padStart(2,'0');
    const mm = String(d.getMinutes()).padStart(2,'0');
    return `${h}:${mm}`;
  }
  function escHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
    }[c]));
  }
  function escAttr(s) { return escHtml(s); }

  /**
   * 서버에서 sanitize된 body_html을 한 번 더 방어 (Defense in Depth).
   * <script>, <iframe>, on* 이벤트 속성, javascript: URL을 제거.
   * 서버 sanitize가 우선이지만, 서버 회귀 버그로 새는 악성 태그도 차단.
   */
  function safeBodyHtml(html) {
    if (!html) return '';
    return String(html)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
      .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '')
      .replace(/<embed\b[^>]*>/gi, '')
      .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
      .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
      .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
      .replace(/javascript:/gi, 'blocked:')
      .replace(/data:text\/html/gi, 'blocked:');
  }

  // 포스터/배너 이미지 URL — 키 형식에 따라 자동 라우팅 (v2.6.1)
  //   1) https URL → 그대로
  //   2) http URL (구 호스팅 백업 데이터) → null 반환 (mixed content + 죽은 호스트 회피)
  //   3) 'YYYY/MM/ulid.ext' 형식 (R2 업로드) → Workers 프록시 /public/media/
  //   4) 그 외 상대 경로 (assets/photos/…) → GitHub Pages 'assets/' prefix
  //   TODO (v2.7): cdn.sejonggugak.com 로 통합
  // R2 키로 인식할 패턴들 (모두 /public/media/ 프록시로 라우팅)
  //   - YYYY/MM/<ulid>.<ext>   (admin 업로드)
  //   - legacy/<board>/<file>  (백업 이관)
  //   - partners/<file>        (협력체 로고)
  const R2_KEY_RES = [
    // v2.8.52: HWP/HWPX/DOCX/XLSX/PPTX 첨부파일 다운로드 지원
    /^\d{4}\/\d{2}\/[a-z0-9]{20,}\.(?:jpg|jpeg|png|webp|svg|pdf|hwp|hwpx|docx|xlsx|pptx)$/i,
    /^legacy\/[a-z0-9]+\/[^\/]+\.(?:jpg|jpeg|png|webp|svg|pdf|gif|hwp|hwpx|docx|xlsx|pptx)$/i,
    /^partners\/[^\/]+\.(?:jpg|jpeg|png|webp|svg|gif)$/i,
  ];
  // v2.8.13: CORP 헤더 수정 후 브라우저 캐시 무효화용 cache-bust 토큰
  const MEDIA_CACHE_BUST = 'corp20260426';
  function mediaUrl(key) {
    if (!key) return null;
    // 구 Gnuboard 백업의 http:// 외부 URL은 mixed content + 호스트 사망 가능성 → null
    if (key.startsWith('http://')) return null;
    if (key.startsWith('https://')) return key;
    const cleaned = key.replace(/^\/+/, '');
    if (R2_KEY_RES.some(re => re.test(cleaned))) {
      return API_BASE + '/public/media/' + cleaned + '?v=' + MEDIA_CACHE_BUST;
    }
    return 'assets/' + cleaned;
  }

  // 이미지 누락 시 placeholder (단청 그라디언트 + 한자) — inline SVG data URL
  function placeholderUrl(category) {
    const HAN = { performance: '樂', education: '學', outreach: '行', collab: '合', other: '集' };
    const ch = HAN[category] || '樂';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="%231A1614"/><stop offset="100%" stop-color="%23B8342A"/></linearGradient></defs><rect width="400" height="300" fill="url(%23g)"/><text x="50%" y="58%" text-anchor="middle" font-family="serif" font-size="160" font-weight="800" fill="rgba(246,241,232,0.18)">${ch}</text><text x="50%" y="92%" text-anchor="middle" font-family="monospace" font-size="11" fill="rgba(246,241,232,0.55)" letter-spacing="2">SEJONG GUGAK</text></svg>`;
    return 'data:image/svg+xml;utf8,' + svg;
  }

  // 예매 버튼 라벨/상태
  function bookingLabel(status) {
    return ({
      not_open: '예매 준비중',
      on_sale: '예매 바로가기',
      sold_out: '매진',
      closed: '예매 마감',
      free: '무료 공연',
    }[status] || '공연 정보');
  }
  function bookingAvailable(status) {
    return status === 'on_sale' || status === 'free';
  }

  // -----------------------------------------------------------------------
  // 1) 메인 배너 롤링 (index.html)
  //    대상 DOM: [data-db="hero-rotator"]  = <div class="hero-poster">
  //    host의 innerHTML을 교체 (hero-poster 그 자체는 유지)
  //    slides + dots만 내부에 배치. position:relative는 이미 hero-poster에 있음.
  // -----------------------------------------------------------------------
  async function hydrateHeroRotator() {
    const host = document.querySelector('[data-db="hero-rotator"]');
    if (!host) return;

    // v2.6.2: main_banner 전용이 없으면 upcoming 상위 3건으로 자동 폴백
    const [bannerData, upcomingData] = await Promise.all([
      safeFetch('/public/performances?region=main_banner&limit=8'),
      safeFetch('/public/performances?region=upcoming&limit=6'),
    ]);
    // v2.8.27: 과거 공연 자동 제외 (booking_status에 의존 X, 날짜 기준)
    const now = new Date();
    const isFuture = (p) => { const d = new Date(p.starts_at); return !isNaN(d) && d >= now; };
    const bannerItems = (bannerData?.items || []).filter((p) => p.visibility !== 'private' && isFuture(p));
    const upcomingItems = (upcomingData?.items || []).filter((p) => p.visibility !== 'private' && isFuture(p));
    // 배너로 명시 체크된 것 우선, 모자라면 upcoming 최상위 3건까지 채움
    const seen = new Set(bannerItems.map((p) => p.id));
    const fillers = upcomingItems.filter((p) => !seen.has(p.id));
    const items = [...bannerItems, ...fillers].slice(0, 3);
    if (items.length === 0) return; // 하드코딩 유지

    host.style.position = 'relative';
    host.style.overflow = 'hidden';
    host.innerHTML = `
      ${items.map((p, i) => `
        <div class="hero-slide" data-slide="${i}" style="position: absolute; inset: 0; padding: 36px 36px 32px; display: ${i === 0 ? 'flex' : 'none'}; flex-direction: column; justify-content: space-between;">
          ${(() => {
            // hero_image_key > poster_key > placeholder SVG (단청 한자) — 빈 그라디언트 회피
            const url = mediaUrl(p.hero_image_key) || mediaUrl(p.poster_key) || placeholderUrl('performance');
            return `<img class="hero-photo" src="${escAttr(url)}" alt="${escAttr(p.title)}" onerror="this.onerror=null;this.src='${placeholderUrl('performance').replace(/'/g, '%27')}'">`;
          })()}
          <div class="hanja">樂</div>
          <div class="pmeta">
            <span>FEATURED · NEXT PROGRAM</span>
            <span class="num">№${String(i + 1).padStart(2,'0')}</span>
          </div>
          <div class="ptxt">
            <h3>${escHtml(p.title)}${p.subtitle ? `<br>${escHtml(p.subtitle)}` : ''}</h3>
            <div class="psub">${escHtml(p.program_summary || p.subtitle || '')}</div>
            <div class="prow">
              <div class="date">${fmtKrDate(p.starts_at)} · ${fmtDay(p.starts_at)} ${fmtTime(p.starts_at)}<small>${escHtml(p.venue)}</small></div>
              ${p.ticket_url && bookingAvailable(p.booking_status)
                ? `<a class="plink" href="${escAttr(p.ticket_url)}" target="_blank" rel="noopener">${bookingLabel(p.booking_status)} <i class="ph ph-arrow-up-right"></i></a>`
                : `<a class="plink" href="schedule.html" style="opacity:.7;">${bookingLabel(p.booking_status)} <i class="ph ph-arrow-right"></i></a>`
              }
            </div>
          </div>
        </div>
      `).join('')}
      ${items.length > 1 ? `
        <div class="hero-dots" style="position:absolute; bottom: 20px; left: 50%; transform: translateX(-50%); display: flex; gap: 8px; z-index: 5;">
          ${items.map((_, i) => `<button class="hero-dot" data-dot="${i}" aria-label="슬라이드 ${i+1}" style="width: 10px; height: 10px; border: 1px solid var(--hanji); background: ${i===0 ? 'var(--hanji)' : 'transparent'}; cursor: pointer;"></button>`).join('')}
        </div>
      ` : ''}
    `;

    // 자동 롤링 + 모바일 swipe (v2.8.26)
    if (items.length > 1) {
      let idx = 0;
      const slides = host.querySelectorAll('.hero-slide');
      const dots = host.querySelectorAll('.hero-dot');
      const interval = 6000;
      function show(i) {
        const next = (i + items.length) % items.length;
        slides.forEach((s, n) => { s.style.display = n === next ? 'flex' : 'none'; });
        dots.forEach((d, n) => { d.style.background = n === next ? 'var(--hanji)' : 'transparent'; });
        idx = next;
      }
      let timer = setInterval(() => show(idx + 1), interval);
      function resetTimer() { clearInterval(timer); timer = setInterval(() => show(idx + 1), interval); }
      dots.forEach((d) => d.addEventListener('click', () => { resetTimer(); show(Number(d.dataset.dot)); }));

      // v2.8.26: 모바일 swipe (좌→다음, 우→이전)
      let touchX = null;
      let touchY = null;
      host.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        touchX = e.touches[0].clientX;
        touchY = e.touches[0].clientY;
      }, { passive: true });
      host.addEventListener('touchend', (e) => {
        if (touchX == null) return;
        const dx = (e.changedTouches[0].clientX - touchX);
        const dy = (e.changedTouches[0].clientY - touchY);
        // 가로 이동이 세로보다 크고 30px 이상일 때만 swipe로 인식
        if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)) {
          resetTimer();
          show(idx + (dx < 0 ? 1 : -1));
        }
        touchX = null; touchY = null;
      }, { passive: true });
    }
  }

  // -----------------------------------------------------------------------
  // 2) 다가오는 무대 카드 그리드 (index.html — .season-grid)
  // -----------------------------------------------------------------------
  async function hydrateUpcomingGrid() {
    const host = document.querySelector('[data-db="upcoming-grid"]');
    if (!host) return;

    const data = await safeFetch('/public/performances?region=upcoming&upcoming=1&limit=12');
    // v2.8.27: 클라이언트 측에서 한 번 더 미래 공연만 필터 (관리자가 booking_status 갱신 안 했어도 자동 마감 처리)
    const now = new Date();
    const items = (data?.items || []).filter(p => {
      const d = new Date(p.starts_at);
      return !isNaN(d) && d >= now;
    }).slice(0, 6);
    if (items.length === 0) return;

    const HAN_BY_INDEX = ['樂', '和', '音', '夢', '流', '響'];
    host.innerHTML = items.map((p, i) => {
      const n = String(i + 1).padStart(2, '0');
      // poster > hero > placeholder
      const poster = mediaUrl(p.poster_key) || mediaUrl(p.hero_image_key) || placeholderUrl('performance');
      const bookable = p.ticket_url && bookingAvailable(p.booking_status);
      const han = HAN_BY_INDEX[i % HAN_BY_INDEX.length];
      return `
        <a class="perf card-3d img-zoom fade-up delay-${(i % 3) + 1}" href="${bookable ? escAttr(p.ticket_url) : 'schedule.html'}" ${bookable ? 'target="_blank" rel="noopener"' : ''} style="text-decoration: none; color: inherit; display: block;">
          <div class="perf-n">N° ${n}</div>
          <div class="perf-thumb" data-ch="${han}" style="background-image:url('${escAttr(poster)}')"></div>
          <div class="perf-title">
            <h3>${escHtml(p.title)}</h3>
            <div class="perf-sub">${escHtml(p.program_summary || p.subtitle || '')}</div>
          </div>
          <div class="perf-meta">
            <span class="big">${fmtKrDate(p.starts_at)}</span>
            <span>${fmtDay(p.starts_at)} · ${fmtTime(p.starts_at)} · ${escHtml(p.venue)}</span>
          </div>
          <div class="perf-cta">${bookingLabel(p.booking_status)} <span class="arrow"><i class="ph ph-arrow-up-right"></i></span></div>
        </a>
      `;
    }).join('');
  }

  // -----------------------------------------------------------------------
  // 3) 메인 공지·보도 리스트 (index.html)
  //    - [data-db="notices-col"]  : 공지사항 <ul class="nl"> 내부 교체
  //    - [data-db="press-col"]    : 기사·보도자료 <ul class="nl"> 내부 교체
  //    - [data-db="notice-feature"]: 상단 피처 공지 박스 교체 (is_pinned 1순위)
  // -----------------------------------------------------------------------
  async function hydrateNoticesPreview() {
    const colHost = document.querySelector('[data-db="notices-col"]');
    const pressHost = document.querySelector('[data-db="press-col"]');
    const featureHost = document.querySelector('[data-db="notice-feature"]');

    // v2.8.61: 공지·모집·보도 3개 카테고리를 한 컬럼에 통합 표시
    const [notices, press, recruit] = await Promise.all([
      safeFetch('/public/posts?category=notice&limit=10'),
      safeFetch('/public/posts?category=press&limit=10'),
      safeFetch('/public/posts?category=recruit&limit=10'),
    ]);

    const noticeItems = notices?.items || [];
    const pressItems = press?.items || [];
    const recruitItems = recruit?.items || [];

    // 3개 카테고리 통합 + is_pinned 우선 + 발행일 내림차순
    const allItems = [...noticeItems, ...pressItems, ...recruitItems]
      .sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
        return new Date(b.published_at) - new Date(a.published_at);
      });

    // 카테고리별 태그 (라벨 + CSS 클래스)
    function catTag(c) {
      if (c === 'press') return '<span class="tag g">PRESS</span>';
      if (c === 'recruit') return '<span class="tag" style="background:var(--dancheong-red);color:var(--hanji);">오디션</span>';
      return '<span class="tag">NOTICE</span>';
    }

    // 3-1) 피처 (모든 카테고리 중 pinned 우선 / 없으면 최신 1건)
    if (featureHost) {
      const pinned = allItems.find((p) => p.is_pinned) || allItems[0];
      if (pinned) {
        const featCat = pinned.category === 'press' ? 'PRESS · 보도자료'
                      : pinned.category === 'recruit' ? 'AUDITION · 모집'
                      : 'ANNOUNCEMENT · 공지';
        featureHost.innerHTML = `
          <div class="eb">${featCat}</div>
          <h3>${escHtml(pinned.title)}</h3>
          <div class="dates" style="margin-top:16px;">
            <span>${fmtKrDate(pinned.published_at)}</span>
            <a href="notices.html?slug=${encodeURIComponent(pinned.slug)}" style="text-decoration:none;color:var(--dancheong-red);">상세 보기 →</a>
          </div>
        `;
      }
    }

    // 3-2) 통합 공지 컬럼 (모든 카테고리 5건)
    if (colHost && allItems.length > 0) {
      colHost.innerHTML = allItems.slice(0, 5).map((p) => `
        <li><a href="notices.html?slug=${encodeURIComponent(p.slug)}" style="display:flex;gap:14px;text-decoration:none;color:inherit;"><span class="d">${fmtKrDate(p.published_at).slice(5)}</span><div class="tt">${p.is_pinned ? '<span class="tag r">PIN</span>' : catTag(p.category)}${escHtml(p.title)}</div></a></li>
      `).join('');
    }

    // 3-3) 보도 컬럼 (별도 영역 — 보도자료만)
    if (pressHost && pressItems.length > 0) {
      pressHost.innerHTML = pressItems.slice(0, 5).map((p) => `
        <li><a href="notices.html?slug=${encodeURIComponent(p.slug)}" style="display:flex;gap:14px;text-decoration:none;color:inherit;"><span class="d">${fmtKrDate(p.published_at).slice(5)}</span><div class="tt"><span class="tag g">PRESS</span>${escHtml(p.title)}</div></a></li>
      `).join('');
    }
  }

  // -----------------------------------------------------------------------
  // 4) schedule.html — 전체 공연 리스트 (월별 그룹 + evt-row 스타일 유지)
  // -----------------------------------------------------------------------
  async function hydrateScheduleList() {
    const host = document.querySelector('[data-db="schedule-list"]');
    if (!host) return;

    const data = await safeFetch('/public/performances?limit=200');
    const items = data?.items || [];
    if (items.length === 0) return;

    // 월별 그룹화
    const grouped = {};
    items.forEach((p) => {
      const d = new Date(p.starts_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      (grouped[key] = grouped[key] || []).push(p);
    });

    const HANJA_MONTH = ['','정월','이월','삼월','사월','오월','유월','칠월','팔월','구월','시월','동월','섣달'];

    host.innerHTML = Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, list]) => {
        const [y, m] = ym.split('-');
        return `
          <div class="month-header">
            <div style="display:flex;align-items:end;gap:18px;">
              <span class="y">${y}</span><span class="m">${m}</span><span class="han">${HANJA_MONTH[Number(m)] || ''}</span>
            </div>
            <div></div>
            <div class="ct">${String(list.length).padStart(2, '0')} EVENTS</div>
          </div>
          ${list.map((p) => {
            const d = new Date(p.starts_at);
            const isPast = d < new Date();
            const bookable = p.ticket_url && bookingAvailable(p.booking_status);
            const badgeClass = p.booking_status === 'on_sale' ? 'live'
              : p.booking_status === 'sold_out' ? 'sold'
              : isPast ? 'ended'
              : p.booking_status === 'free' ? 'fest'
              : '';
            const badgeText = isPast ? '공연종료' : bookingLabel(p.booking_status);
            const dayKr = ['일','월','화','수','목','금','토'][d.getDay()];
            return `
              <a class="evt-row ${isPast ? 'ended' : ''}" href="${bookable ? escAttr(p.ticket_url) : '#'}" ${bookable ? 'target="_blank" rel="noopener"' : ''} style="text-decoration:none;color:inherit;">
                <div class="date-block"><span class="d">${String(d.getDate()).padStart(2,'0')}</span><span class="day">${['SUN','MON','TUE','WED','THU','FRI','SAT'][d.getDay()]} · ${dayKr}요일</span></div>
                <div class="info">
                  <h3>${escHtml(p.title)}${p.subtitle ? ` <span style="font-weight:400;color:var(--fg2);font-size:0.85em;">${escHtml(p.subtitle)}</span>` : ''}</h3>
                  <div class="meta">
                    <span><i class="ph ph-clock"></i>${fmtTime(p.starts_at)}${p.duration_min ? ` · ${p.duration_min}분` : ''}</span>
                    ${p.program_summary ? `<span><i class="ph ph-music-notes"></i>${escHtml(p.program_summary)}</span>` : ''}
                  </div>
                </div>
                <div class="venue"><strong>${escHtml(p.venue)}</strong></div>
                <div class="price">${p.price_info ? escHtml(p.price_info) : (p.booking_status === 'free' ? '무료' : '문의')}</div>
                <div class="badge-stack"><span class="b ${badgeClass}">${badgeText}</span><span class="arr">→</span></div>
              </a>
            `;
          }).join('')}
        `;
      }).join('');
  }

  // -----------------------------------------------------------------------
  // 5-A) notices.html 상단 핀 공지 — 최신 notice / recruit / press 1건씩 (v2.8.8)
  // -----------------------------------------------------------------------
  async function hydratePinnedNotices() {
    const host = document.querySelector('[data-db="pinned-notices"]');
    if (!host) return;
    const cards = host.querySelectorAll('.pin');
    if (cards.length < 3) return;

    const [notices, recruits, press] = await Promise.all([
      safeFetch('/public/posts?category=notice&limit=1'),
      safeFetch('/public/posts?category=recruit&limit=1'),
      safeFetch('/public/posts?category=press&limit=1'),
    ]);
    const items = [
      { post: notices?.items?.[0], tag: 'Featured Notice', ty: 'Notice · 공지', icon: 'ph-calendar-blank', cta: '자세히 보기', cls: 'red' },
      { post: recruits?.items?.[0], tag: 'Audition', ty: 'Audition · 단원 모집', icon: 'ph-clock', cta: '공고문 보기', cls: '' },
      { post: press?.items?.[0], tag: 'Press', ty: 'Press · 보도자료', icon: 'ph-newspaper', cta: '기사 원문', cls: 'paper' },
    ];

    items.forEach((it, i) => {
      const card = cards[i];
      if (!it.post) {
        // v2.8.31: 데이터 없을 때 placeholder 안내 (빈 카드 방치 X)
        try {
          card.querySelector('.row .tag').textContent = it.tag;
          card.querySelector('.ty').textContent = it.ty;
          card.querySelector('h3').textContent = '등록된 ' + (i === 1 ? '모집공고' : i === 2 ? '보도자료' : '공지') + '가 아직 없습니다';
          card.querySelector('.dsc').textContent = '관리자 페이지에서 등록해 주세요.';
          card.querySelector('.foot .d').textContent = '—';
          card.querySelector('.foot .more').textContent = '준비 중';
        } catch (e) {}
        return;
      }
      const p = it.post;
      // press는 외부 링크 있으면 새 탭, 아니면 상세
      const isPress = i === 2;
      const useExternal = isPress && p.external_url;
      const href = useExternal ? p.external_url : `notices.html?slug=${encodeURIComponent(p.slug)}`;
      card.setAttribute('href', href);
      if (useExternal) { card.target = '_blank'; card.rel = 'noopener'; }
      // D-day 또는 NEW 배지
      const days = Math.round((Date.now() - new Date(p.published_at).getTime()) / (1000 * 3600 * 24));
      const stampText = days < 7 ? 'NEW' : days < 30 ? `${days}일 전` : '';
      card.querySelector('.row .tag').textContent = it.tag;
      const stampEl = card.querySelector('.row .stamp');
      stampEl.innerHTML = `<i class="ph ${it.icon}"></i>${stampText}`;
      card.querySelector('.ty').textContent = it.ty;
      card.querySelector('h3').textContent = p.title;
      // dsc는 attachment / external 안내
      const dscParts = [];
      if (p.attachment_count > 0) dscParts.push(`📎 첨부 ${p.attachment_count}건`);
      if (p.external_url) dscParts.push('🔗 외부 원문');
      const dscEl = card.querySelector('.dsc');
      if (dscParts.length) {
        dscEl.textContent = dscParts.join(' · ');
      } else {
        dscEl.textContent = '클릭하여 상세 내용을 확인하세요.';
      }
      card.querySelector('.foot .d').textContent = fmtKrDate(p.published_at);
      card.querySelector('.foot .more').innerHTML = `${it.cta} <i class="ph ${useExternal ? 'ph-arrow-up-right' : 'ph-arrow-right'}"></i>`;
    });
  }

  // -----------------------------------------------------------------------
  // 5) notices.html — 카테고리 필터 + 리스트 (기존 .list > .row 스타일 준수)
  //    - [data-db="notices-rows"] : list-head 아래 row들 컨테이너
  //    - 카테고리 칩은 기존 notices.html의 .chips 버튼 사용
  // -----------------------------------------------------------------------
  async function hydrateNoticesList() {
    const host = document.querySelector('[data-db="notices-rows"]');
    if (!host) return;

    // URL에 slug 있으면 상세 페이지 모드
    const params = new URLSearchParams(location.search);
    const slug = params.get('slug');
    if (slug) {
      // list 섹션 전체를 찾아서 상세 뷰로 교체
      const listSection = host.closest('section.list') || host;
      return hydrateNoticeDetail(listSection, slug);
    }

    // ?id=<ULID> — sitemap·외부 링크가 쓰는 id 딥링크를 slug로 해석해 상세로 (v2.8.90)
    const idParam = params.get('id');
    if (idParam) {
      const cats = ['notice', 'press', 'recruit', 'general'];
      const results = await Promise.all(
        cats.map((c) => safeFetch(`/public/posts?category=${c}&limit=100`))
      );
      const hit = results.flatMap((r) => r?.items || []).find((p) => String(p.id) === idParam);
      if (hit && hit.slug) {
        const listSection = host.closest('section.list') || host;
        return hydrateNoticeDetail(listSection, hit.slug);
      }
      // 매칭 실패 시 목록으로 계속 진행
    }

    // ?cat=<category> — 옛 게시판 리다이렉트(board.php)·딥링크의 카테고리 사전 필터 (v2.8.90)
    const catParam = params.get('cat');
    const VALID_CATS = ['notice', 'press', 'recruit', 'general'];
    let currentCat = VALID_CATS.includes(catParam) ? catParam : 'all';

    // 카테고리 칩 이벤트 연결 (기존 notices.html의 .chips button[data-k])
    // 유효 data-k: all | notice | recruit | press | general
    const chipContainer = document.querySelector('.chips');
    if (chipContainer) {
      chipContainer.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', () => {
          chipContainer.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          currentCat = btn.dataset.k || 'all';
          load(currentCat);
        });
      });
    }

    // 검색 연동 (선택)
    const searchInput = document.getElementById('noticeSearch');
    let searchQuery = '';
    if (searchInput) {
      let debounceT;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceT);
        searchQuery = e.target.value.trim().toLowerCase();
        debounceT = setTimeout(() => load(currentCat), 200);
      });
    }

    async function load(cat) {
      host.innerHTML = '<div style="padding:40px;text-align:center;color:var(--fg2);grid-column:1/-1;">불러오는 중…</div>';
      let items = [];
      if (cat === 'all') {
        const [n, p, r, g] = await Promise.all([
          safeFetch('/public/posts?category=notice&limit=100'),
          safeFetch('/public/posts?category=press&limit=100'),
          safeFetch('/public/posts?category=recruit&limit=100'),
          safeFetch('/public/posts?category=general&limit=100'),
        ]);
        items = [
          ...(n?.items || []),
          ...(p?.items || []),
          ...(r?.items || []),
          ...(g?.items || []),
        ].sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
      } else {
        const data = await safeFetch(`/public/posts?category=${cat}&limit=100`);
        items = data?.items || [];
      }

      if (searchQuery) {
        items = items.filter((p) => (p.title || '').toLowerCase().includes(searchQuery));
      }

      if (items.length === 0) {
        host.innerHTML = `<div style="padding:60px 20px;text-align:center;color:var(--fg2);grid-column:1/-1;">등록된 게시물이 없습니다.</div>`;
        return;
      }

      host.innerHTML = items.map((p, i) => {
        const no = String(items.length - i).padStart(3, '0');
        const catClass = p.category === 'recruit' ? 'audition' : p.category;
        const catLabelKr = {
          notice: '공지 · Notice',
          press: '보도 · Press',
          recruit: '오디션 · Audition',
          general: '일반 · General',
        }[p.category] || p.category;
        const isNew = p.published_at && (new Date() - new Date(p.published_at)) < 7 * 24 * 3600 * 1000;
        const isPress = p.category === 'press';
        // press는 외부 링크가 있으면 바로 새 탭으로
        const hrefAttr = isPress && p.external_url
          ? `href="${escAttr(p.external_url)}" target="_blank" rel="noopener"`
          : `href="?slug=${encodeURIComponent(p.slug)}"`;
        const attachBadge = p.attachment_count > 0
          ? `<span class="pdf" title="첨부 ${p.attachment_count}건"><i class="ph ph-paperclip"></i>${p.attachment_count}</span>`
          : '';
        const externalBadge = isPress && p.external_url
          ? `<span class="pdf" style="color:var(--dancheong-blue);" title="외부 링크"><i class="ph ph-arrow-square-out"></i>원문</span>`
          : '';
        return `
          <a class="row ${isNew ? 'new' : ''}" ${hrefAttr} style="text-decoration:none;color:inherit;">
            <div class="no">${no}</div>
            <div class="ti">
              <h4>${escHtml(p.title)}</h4>
              ${isNew ? '<span class="new-badge">NEW</span>' : ''}
              ${p.is_pinned ? '<span class="pdf"><i class="ph ph-push-pin"></i>PIN</span>' : ''}
              ${attachBadge}
              ${externalBadge}
            </div>
            <div class="cat ${catClass}">${catLabelKr}</div>
            <div class="date">${fmtKrDate(p.published_at)}</div>
            <div class="views">—</div>
            <div class="arr">→</div>
          </a>
        `;
      }).join('');
    }

    // 사전 필터가 있으면 해당 칩을 활성화
    if (currentCat !== 'all' && chipContainer) {
      const btn = chipContainer.querySelector(`button[data-k="${currentCat}"]`);
      if (btn) {
        chipContainer.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      }
    }

    load(currentCat);
  }

  async function hydrateNoticeDetail(host, slug) {
    host.innerHTML = '<div style="padding:40px;text-align:center;color:var(--fg2);">불러오는 중…</div>';
    const post = await safeFetch(`/public/posts/${encodeURIComponent(slug)}`);
    if (!post) {
      host.innerHTML = `
        <div style="padding:60px 20px;text-align:center;max-width:800px;margin:0 auto;">
          <p style="color:var(--fg2);margin-bottom:24px;font-size:16px;">게시물을 찾을 수 없습니다.</p>
          <a href="notices.html" style="font-family:var(--font-mono);font-size:12px;letter-spacing:.1em;color:var(--dancheong-red);">← 목록으로</a>
        </div>
      `;
      return;
    }
    const catLabel = post.category === 'notice' ? '공지사항' : post.category === 'press' ? '언론보도' : post.category === 'recruit' ? '오디션·모집' : '일반';
    const attachments = Array.isArray(post.attachments) ? post.attachments : [];

    const attachmentsHtml = attachments.length > 0 ? `
      <section style="margin-top:48px;padding:24px;background:var(--hanji-deep);border-left:3px solid var(--dancheong-red);">
        <h3 style="font-family:var(--font-serif-kr);font-weight:700;font-size:17px;margin:0 0 16px;letter-spacing:-.005em;">📎 첨부파일 (${attachments.length})</h3>
        <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px;">
          ${attachments.map((a, i) => {
            const name = a.filename || `첨부파일 ${i+1}`;
            const href = a.r2_key ? mediaUrl(a.r2_key) : a.original_url;
            const size = a.byte_size ? ` (${(a.byte_size/1024).toFixed(0)}KB)` : '';
            if (!href) return '';
            // download 속성으로 브라우저에 다운로드 의도 명시 (서버 Content-Disposition과 이중 안전망)
            return `<li><a href="${escAttr(href)}" download="${escAttr(name)}" target="_blank" rel="noopener" style="display:inline-flex;gap:8px;align-items:center;padding:10px 14px;background:var(--hanji);border:1px solid var(--border-hairline);text-decoration:none;color:var(--fg1);font-size:14px;transition:all .15s;" onmouseover="this.style.background='var(--hanji-deep)';this.style.borderColor='var(--dancheong-red)';" onmouseout="this.style.background='var(--hanji)';this.style.borderColor='var(--border-hairline)';"><i class="ph ph-download-simple" style="color:var(--dancheong-red);font-size:18px;"></i><span>${escHtml(name)}</span><span style="font-family:var(--font-mono);font-size:11px;color:var(--fg2);margin-left:auto;">${size}</span></a></li>`;
          }).join('')}
        </ul>
        <p style="font-size:12px;color:var(--fg2);margin-top:12px;margin-bottom:0;">※ 원본 파일이 호스팅 이전 시점에 접근 불가일 수 있습니다. 필요 시 대표전화(031-391-8784)로 요청해주세요.</p>
      </section>
    ` : '';

    const externalHtml = post.external_url ? `
      <section style="margin-top:32px;padding:18px 24px;background:var(--hanji);border:1px dashed var(--dancheong-blue);">
        <h3 style="font-family:var(--font-serif-kr);font-weight:700;font-size:15px;margin:0 0 8px;color:var(--dancheong-blue);">🔗 외부 원문</h3>
        <a href="${escAttr(post.external_url)}" target="_blank" rel="noopener" style="color:var(--dancheong-red);font-size:14px;word-break:break-all;">${escHtml(post.external_url)} <i class="ph ph-arrow-up-right"></i></a>
      </section>
    ` : '';

    host.innerHTML = `
      <article class="notice-detail" style="max-width:900px;margin:0 auto;padding:60px 40px;">
        <a href="notices.html" style="display:inline-block;margin-bottom:40px;font-family:var(--font-mono);font-size:12px;letter-spacing:.1em;color:var(--dancheong-red);text-decoration:none;">← 목록으로</a>
        <div style="font-family:var(--font-mono);font-size:12px;letter-spacing:.16em;color:var(--dancheong-red);text-transform:uppercase;margin-bottom:16px;">${catLabel}</div>
        <h1 style="font-family:var(--font-serif-kr);font-weight:800;font-size:clamp(32px,4.5vw,48px);line-height:1.25;letter-spacing:-.02em;margin:0 0 20px;word-break:keep-all;">${escHtml(post.title)}</h1>
        <div style="font-family:var(--font-mono);font-size:13px;color:var(--fg2);padding-bottom:32px;border-bottom:1px solid var(--border-strong);margin-bottom:40px;letter-spacing:.04em;">${fmtKrDate(post.published_at)}</div>
        <div class="notice-body" style="font-size:17px;line-height:1.95;color:var(--fg1);word-break:keep-all;">${safeBodyHtml(post.body_html) || '<p style="color:var(--fg2);">(본문 없음)</p>'}</div>
        ${externalHtml}
        ${attachmentsHtml}
      </article>
    `;
  }

  // -----------------------------------------------------------------------
  // 6) archive.html — 아카이브 갤러리 + 상세 (archive.html의 .card 스타일 준수)
  // -----------------------------------------------------------------------
  async function hydrateArchive() {
    const host = document.querySelector('[data-db="archive-list"]');
    if (!host) return;

    const params = new URLSearchParams(location.search);
    const slug = params.get('slug');
    if (slug) {
      // 갤러리 섹션 전체 또는 host 영역을 상세로 교체
      return hydrateArchiveDetail(host, slug);
    }

    const data = await safeFetch('/public/archive?limit=60');
    const items = data?.items || [];
    if (items.length === 0) {
      // 기존 하드코딩 유지 (fallback)
      return;
    }

    // 아카이브 카테고리별 한자
    const HAN = { performance: '樂', education: '學', outreach: '行', collab: '合', other: '集' };
    // height 변화로 마스너리 느낌 (인덱스에 따라 h-sm / h-md / h-lg 순환)
    const heightCycle = ['h-md', 'h-lg', 'h-sm', 'h-md', 'h-lg', 'h-sm'];

    host.innerHTML = items.map((a, i) => {
      // 이미지 우선순위: cover_image_key (https/R2) → placeholder (단청 그라디언트)
      const cover = mediaUrl(a.cover_image_key) || placeholderUrl(a.category);
      const han = HAN[a.category] || '樂';
      const hClass = heightCycle[i % heightCycle.length];
      const corner = a.is_featured ? '<div class="badge-corner">FEATURED</div>' : (a.video_url ? '<div class="badge-corner gold">FILMED</div>' : '');
      return `
        <a class="card" href="?slug=${encodeURIComponent(a.slug)}" style="text-decoration:none;color:inherit;">
          ${corner}
          <div class="img ${hClass}" style="background-image:url('${escAttr(cover)}');background-size:cover;background-position:center;">
            <span class="han tl">${han}</span>
            <div class="gold-bar"></div>
            <div class="meta"><span class="yr">${fmtKrDate(a.performed_at).replace(/\./g, ' / ')}</span><span class="ttl">${escHtml(a.title)}</span></div>
          </div>
          <div class="bd">
            <div class="row1"><span class="cat">${archiveCategoryLabel(a.category)}</span><span>${escHtml(a.venue || '')}</span></div>
            <h4>${escHtml(a.summary || '')}</h4>
            <div class="stats">
              ${(a.gallery_keys || []).length > 0 ? `<span><i class="ph ph-image"></i>${(a.gallery_keys || []).length}</span>` : ''}
              ${a.video_url ? `<span><i class="ph ph-play-circle"></i>영상</span>` : ''}
            </div>
          </div>
        </a>
      `;
    }).join('');
  }

  function archiveCategoryLabel(c) {
    return ({ performance: '공연', education: '교육', outreach: '아웃리치', collab: '콜라보', other: '기타' }[c] || c);
  }

  async function hydrateArchiveDetail(host, slug) {
    host.innerHTML = '<div style="padding:120px 20px;text-align:center;color:var(--fg2);font-family:var(--font-mono);font-size:12px;letter-spacing:.14em;">LOADING…</div>';
    const item = await safeFetch(`/public/archive/${encodeURIComponent(slug)}`);
    if (!item) {
      host.innerHTML = `
        <div style="padding:120px 20px;text-align:center;max-width:600px;margin:0 auto;">
          <p style="color:var(--fg2);margin-bottom:24px;font-size:15px;">아카이브 항목을 찾을 수 없습니다.</p>
          <a href="archive.html" style="font-family:var(--font-mono);font-size:11px;letter-spacing:.18em;color:var(--dancheong-red);text-decoration:none;">← 아카이브로 돌아가기</a>
        </div>
      `;
      return;
    }

    // 마이그레이션 placeholder 자동 필터
    const isPlaceholder = (s) => {
      if (!s) return true;
      const t = String(s).trim();
      return /^이관 데이터/.test(t) || /추후 업데이트/.test(t) || /^-+$/.test(t) || t === '';
    };
    const cleanVenue = isPlaceholder(item.venue) ? '' : item.venue;
    const cleanSummary = isPlaceholder(item.summary) ? '' : item.summary;
    const cleanBodyHtml = (() => {
      if (!item.body_html) return '';
      // 본문이 placeholder만 들어 있으면 비움
      const stripped = String(item.body_html).replace(/<[^>]+>/g, '').trim();
      return isPlaceholder(stripped) ? '' : item.body_html;
    })();

    const cover = mediaUrl(item.cover_image_key);
    const gallery = (item.gallery_keys || []).filter(Boolean);
    const videoEmbed = buildVideoEmbed(item.video_url);

    // 메타 라인: 날짜 · 장소 · 카테고리 — 모두 같은 라인에 회색 톤
    const metaParts = [];
    if (item.performed_at) metaParts.push(fmtKrDate(item.performed_at));
    if (cleanVenue) metaParts.push(escHtml(cleanVenue));

    host.innerHTML = `
      <article class="archive-detail" style="max-width:880px;margin:0 auto;padding:32px 24px 96px;">
        <a href="archive.html" style="display:inline-flex;align-items:center;gap:8px;margin-bottom:48px;font-family:var(--font-mono);font-size:11px;letter-spacing:.18em;color:var(--dancheong-red);text-decoration:none;text-transform:uppercase;">
          <span style="font-size:14px;">←</span> 아카이브로 돌아가기
        </a>

        <header style="margin-bottom:48px;text-align:center;">
          <div style="font-family:var(--font-mono);font-size:11px;letter-spacing:.22em;color:var(--dancheong-red);text-transform:uppercase;margin-bottom:18px;">
            ${archiveCategoryLabel(item.category)}
          </div>
          <h1 style="font-family:var(--font-serif-kr);font-weight:800;font-size:clamp(28px,4.4vw,46px);line-height:1.3;letter-spacing:-.02em;margin:0 0 22px;word-break:keep-all;color:var(--ink);">
            ${escHtml(item.title)}
          </h1>
          ${metaParts.length > 0 ? `
            <div style="display:flex;justify-content:center;align-items:center;gap:14px;flex-wrap:wrap;font-family:var(--font-mono);font-size:11px;letter-spacing:.12em;color:var(--fg2);text-transform:uppercase;">
              ${metaParts.map((m, i) => `${i > 0 ? '<span style="color:var(--fg3);">·</span>' : ''}<span>${m}</span>`).join('')}
            </div>
          ` : ''}
          <div style="width:48px;height:1px;background:var(--dancheong-red);margin:32px auto 0;"></div>
        </header>

        ${cover ? `
          <figure style="margin:0 0 56px;">
            <img src="${escAttr(cover)}" alt="${escAttr(item.title)}" style="width:100%;height:auto;max-height:680px;object-fit:contain;background:var(--hanji-deep);display:block;">
          </figure>
        ` : ''}

        ${cleanSummary ? `
          <p style="font-family:var(--font-serif-kr);font-weight:400;font-size:clamp(16px,1.6vw,19px);line-height:1.85;color:var(--fg1);margin:0 0 40px;letter-spacing:-.005em;word-break:keep-all;text-align:center;max-width:680px;margin-left:auto;margin-right:auto;">
            ${escHtml(cleanSummary)}
          </p>
        ` : ''}

        ${cleanBodyHtml ? `
          <div class="archive-body" style="font-family:var(--font-sans-kr);font-size:15.5px;line-height:1.9;color:var(--fg1);max-width:680px;margin:0 auto 56px;word-break:keep-all;">
            ${safeBodyHtml(cleanBodyHtml)}
          </div>
        ` : ''}

        ${videoEmbed}

        ${gallery.length > 0 ? `
          <section class="archive-gallery" style="margin-top:72px;padding-top:48px;border-top:1px solid var(--border-hairline);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;">
              <h2 style="font-family:var(--font-serif-kr);font-weight:800;font-size:22px;letter-spacing:-.015em;margin:0;color:var(--ink);">갤러리</h2>
              <span style="font-family:var(--font-mono);font-size:10px;letter-spacing:.18em;color:var(--fg3);text-transform:uppercase;">${gallery.length} Photos</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;">
              ${gallery.map((k) => `
                <a href="${escAttr(mediaUrl(k))}" target="_blank" rel="noopener" style="display:block;overflow:hidden;background:var(--hanji-deep);">
                  <img src="${escAttr(mediaUrl(k))}" alt="" loading="lazy" style="width:100%;aspect-ratio:4/3;object-fit:cover;display:block;transition:transform .4s var(--ease-gentle);" onmouseover="this.style.transform='scale(1.04)'" onmouseout="this.style.transform='scale(1)'">
                </a>
              `).join('')}
            </div>
          </section>
        ` : ''}

        <nav style="margin-top:80px;padding-top:32px;border-top:1px solid var(--border-strong);text-align:center;">
          <a href="archive.html" style="display:inline-flex;align-items:center;gap:10px;padding:14px 28px;background:var(--ink);color:var(--hanji);font-family:var(--font-sans-kr);font-weight:600;font-size:13px;letter-spacing:.04em;text-decoration:none;transition:background .2s var(--ease-gentle);">
            <span style="font-family:var(--font-mono);">←</span> 아카이브 전체 보기
          </a>
        </nav>
      </article>
    `;
  }

  function buildVideoEmbed(url) {
    if (!url) return '';
    // YouTube
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    if (ytMatch) {
      return `<div style="max-width:800px;margin:40px auto;aspect-ratio:16/9;"><iframe src="https://www.youtube.com/embed/${ytMatch[1]}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="width:100%;height:100%;"></iframe></div>`;
    }
    // Vimeo
    const vmMatch = url.match(/vimeo\.com\/(\d+)/);
    if (vmMatch) {
      return `<div style="max-width:800px;margin:40px auto;aspect-ratio:16/9;"><iframe src="https://player.vimeo.com/video/${vmMatch[1]}" frameborder="0" allow="autoplay; fullscreen" allowfullscreen style="width:100%;height:100%;"></iframe></div>`;
    }
    return `<p style="margin:40px 0;text-align:center;"><a href="${escAttr(url)}" target="_blank" rel="noopener" style="color:var(--dancheong-red);">영상 보기 →</a></p>`;
  }

  // -----------------------------------------------------------------------
  // 7) archive.html — counter (v2.6.3): baseline + 신규 누적
  //   /public/stats.counter = { regular_concerts, commissions, overseas, outreach }
  //   각각 { base, new, total, unit, label }
  //   기존 누적값을 baseline으로 고정하고, baseline_at 이후 등록만 +1.
  // -----------------------------------------------------------------------
  async function hydrateArchiveCounter() {
    const counter = document.querySelector('section.counter');
    if (!counter) return;
    const stats = await safeFetch('/public/stats');
    if (!stats || !stats.counter) return;
    const c = stats.counter;
    const items = counter.querySelectorAll(':scope > div');
    if (!items.length) return;

    // counter HTML의 4개 div 순서 = [정기연주회, 위촉초연, 해외무대, 기획·교육]
    const order = [
      { key: 'regular_concerts', enLabel: 'Regular Concerts' },
      { key: 'commissions', enLabel: 'Commissions Premiered' },
      { key: 'overseas', enLabel: 'Countries Toured' },
      { key: 'outreach', enLabel: 'Outreach' },
    ];

    items.forEach((item, i) => {
      const def = order[i];
      if (!def) return;
      const data = c[def.key];
      if (!data) return;
      const nEl = item.querySelector('.n');
      const lbEl = item.querySelector('.lb');
      if (nEl) {
        nEl.textContent = String(data.total);
        if (data.unit) {
          const u = document.createElement('span');
          u.className = 'u';
          u.textContent = data.unit;
          nEl.appendChild(u);
        }
        // 신규 등록이 있으면 작은 +N 배지 추가 (선택적)
        if (data.new > 0) {
          const badge = document.createElement('span');
          badge.style.cssText = 'display:inline-block;margin-left:8px;padding:2px 6px;background:var(--dancheong-red);color:var(--hanji);font-family:var(--font-mono);font-size:11px;letter-spacing:.04em;vertical-align:middle;border-radius:2px;';
          badge.textContent = '+' + data.new;
          badge.title = `최근 ${data.new}건 신규 등록`;
          nEl.appendChild(badge);
        }
      }
      if (lbEl) lbEl.textContent = `${data.label} · ${def.enLabel}`;
    });
  }

  // -----------------------------------------------------------------------
  // 9) 사이트 공지 — Top Bar + Popup (v2.7.0)
  //    cookie 기반 "오늘 그만 보기" + 모바일 친화 floating banner
  // -----------------------------------------------------------------------
  const TOPBAR_COLOR = {
    red: { bg: 'var(--dancheong-red)', fg: 'var(--hanji)' },
    blue: { bg: 'var(--dancheong-blue)', fg: 'var(--hanji)' },
    gold: { bg: 'var(--geumbak-gold)', fg: 'var(--ink)' },
    ink: { bg: 'var(--ink)', fg: 'var(--hanji)' },
  };

  function getCookie(name) {
    const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function setCookie(name, value, hours) {
    const d = new Date();
    d.setTime(d.getTime() + hours * 3600 * 1000);
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${d.toUTCString()}; path=/; SameSite=Lax`;
  }

  async function hydrateAnnouncements() {
    const data = await safeFetch('/public/announcements');
    if (!data) return;
    if (data.topbar) renderTopBar(data.topbar);
    if (data.popup) renderPopup(data.popup);
  }

  // v2.8.20: Top Bar = 가장 가까운 다가오는 공연 1개만 노출 (롤링 제거)
  //   message 비어있으면 자동 모드 (공연 1개 고정 노출)
  //   message 입력시 그 메시지만 노출
  async function renderTopBar(tb) {
    if (!tb || !tb.enabled) return;
    const isAuto = !tb.message || tb.message.trim() === '';

    // dismiss 쿠키 — 24시간 후 자동 만료 (모드 + 메시지 해시 기반)
    const cookieKey = 'topbar_dismiss_' + (isAuto ? 'auto' : simpleHash(tb.message));
    if (getCookie(cookieKey)) return;

    const color = TOPBAR_COLOR[tb.bg_color] || TOPBAR_COLOR.red;

    const bar = document.createElement('div');
    bar.className = 'sejong-topbar';
    // v2.7.7: comfortps + readdy 패턴 — 일반 flow에서 GNB 위에 배치
    //   Top Bar는 페이지 첫 자식 (자연 흐름) → 스크롤 시 자연스럽게 위로 사라짐
    //   헤더는 sticky top:0 → 스크롤 시 viewport 상단에 stick
    bar.style.cssText = `position: relative; z-index: 65; background: ${color.bg}; color: ${color.fg}; padding: 11px 24px; display: flex; justify-content: center; align-items: center; gap: 14px; font-size: 15px; line-height: 1.4; min-height: 46px;`;
    bar.innerHTML = `
      <div class="tb-content" style="flex: 1; display: flex; justify-content: center; align-items: center; gap: 14px; min-width: 0; overflow: hidden; transition: opacity 0.3s var(--ease-gentle);">
        <span class="tb-msg" style="font-family: var(--font-serif-kr); font-weight: 600; letter-spacing: -0.005em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;"></span>
        <a class="tb-link" target="_blank" rel="noopener" style="display:none; color: inherit; text-decoration: underline; font-weight: 700; font-size: 14px; white-space: nowrap; flex-shrink: 0;"></a>
      </div>
      <div class="tb-dots" style="display:none; gap: 5px; flex-shrink: 0;"></div>
      <button class="topbar-close" aria-label="닫기" style="background: transparent; border: 0; color: inherit; font-size: 22px; cursor: pointer; opacity: 0.9; padding: 4px 12px; line-height: 1; flex-shrink: 0;">×</button>
    `;
    document.body.insertBefore(bar, document.body.firstChild);

    // 헤더와 본문이 가려지지 않도록 위치 보정
    // v2.7.7: Top Bar = 일반 flow + 헤더 = sticky → 위치 계산 불필요. 단지 CSS 변수만 갱신.
    function applyOffset() {
      document.documentElement.style.setProperty('--topbar-h', bar.offsetHeight + 'px');
    }
    applyOffset();
    window.addEventListener('resize', applyOffset);

    // 닫기
    bar.querySelector('.topbar-close').addEventListener('click', () => {
      setCookie(cookieKey, '1', 24);
      bar.remove();
      document.documentElement.style.setProperty('--topbar-h', '0px');
    });

    const msgEl = bar.querySelector('.tb-msg');
    const linkEl = bar.querySelector('.tb-link');
    const dotsEl = bar.querySelector('.tb-dots');
    const contentEl = bar.querySelector('.tb-content');

    if (isAuto) {
      // v2.8.20: 가장 가까운 다가오는 공연 1건만 fetch
      const data = await safeFetch('/public/performances?region=upcoming&limit=5');
      // v2.8.27: 과거 공연 자동 제외 (관리자 status 미갱신 대응)
      const _now = new Date();
      const items = (data?.items || []).filter(p => {
        if (p.visibility === 'private') return false;
        const d = new Date(p.starts_at);
        return !isNaN(d) && d >= _now;
      }).slice(0, 1);
      if (items.length === 0) {
        // 노출할 공연 없으면 Top Bar 자체 제거
        bar.remove();
        document.documentElement.style.setProperty('--topbar-h', '0px');
        document.querySelectorAll('.hdr').forEach(hdr => { hdr.style.top = ''; });
        document.body.style.paddingTop = '';
        return;
      }
      // 1건만 노출 — 도트·롤링 제거
      const p = items[0];
      const d = new Date(p.starts_at);
      const yyyy = d.getFullYear();
      const md = String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
      // v2.8.26: 모바일 seamless 마키 위해 메시지 2회 복사
      const inner = `<span style="font-family:var(--font-mono);font-size:11px;letter-spacing:.18em;opacity:.85;margin-right:14px;">UPCOMING ▶</span><strong style="font-family:var(--font-mono);letter-spacing:.04em;margin-right:10px;">${yyyy}.${md}</strong>${escHtml(p.title)}<span style="opacity:.75;margin:0 8px;">—</span>${escHtml(p.venue)}`;
      msgEl.innerHTML = `<span class="tb-once" style="display:inline-block;padding-right:60px;">${inner}</span><span class="tb-once" aria-hidden="true" style="display:inline-block;padding-right:60px;">${inner}</span>`;
      const bookable = p.ticket_url && bookingAvailable(p.booking_status);
      if (bookable) {
        linkEl.href = p.ticket_url;
        linkEl.textContent = '예매하기 →';
        linkEl.style.display = '';
      } else if (p.ticket_url) {
        linkEl.href = p.ticket_url;
        linkEl.textContent = '자세히 →';
        linkEl.style.display = '';
      } else {
        linkEl.style.display = 'none';
      }
      contentEl.style.opacity = '1';
    } else {
      // 수동 메시지
      msgEl.textContent = tb.message;
      if (tb.link_url) {
        linkEl.href = tb.link_url;
        linkEl.textContent = (tb.link_label || '자세히') + ' →';
        linkEl.style.display = '';
      }
    }
  }

  function renderPopup(pp) {
    if (!pp || !pp.enabled || !pp.title) return;
    const cookieKey = 'popup_dismiss_' + simpleHash(pp.title);
    if (getCookie(cookieKey)) return;
    // 메인 페이지에서만 노출 (index.html)
    const path = location.pathname;
    if (!(path === '/' || path.endsWith('/index.html') || path === '')) return;

    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) return renderPopupMobileBanner(pp, cookieKey);

    const overlay = document.createElement('div');
    overlay.className = 'sejong-popup-overlay';
    overlay.style.cssText = 'position: fixed; inset: 0; background: rgba(26,22,20,0.7); backdrop-filter: blur(4px); z-index: 999; display: flex; align-items: center; justify-content: center; padding: 24px; animation: sejongFadeIn 0.3s;';

    const imgUrl = pp.image_key ? mediaUrl(pp.image_key) : null;
    const bodyHtml = (pp.body_md || '').split('\n').map(l => `<p style="margin:0 0 8px;">${escHtml(l)}</p>`).join('');

    overlay.innerHTML = `
      <div class="sejong-popup" style="background: var(--hanji); max-width: 520px; width: 100%; box-shadow: 0 24px 64px rgba(0,0,0,0.3); position: relative; animation: sejongPopupIn 0.4s var(--ease-gentle); max-height: 90vh; overflow-y: auto;">
        <button class="popup-close" aria-label="닫기" style="position: absolute; top: 14px; right: 14px; background: rgba(0,0,0,0.05); border: 0; width: 32px; height: 32px; cursor: pointer; font-size: 18px; color: var(--ink); z-index: 2;">×</button>
        ${imgUrl ? `<img src="${escAttr(imgUrl)}" alt="" style="width: 100%; max-height: 280px; object-fit: cover; display: block;">` : ''}
        <div style="padding: 28px 32px 24px;">
          <div style="font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.18em; color: var(--dancheong-red); text-transform: uppercase; margin-bottom: 12px;">Announcement</div>
          <h3 style="font-family: var(--font-serif-kr); font-weight: 800; font-size: 22px; line-height: 1.3; letter-spacing: -0.015em; margin: 0 0 16px;">${escHtml(pp.title)}</h3>
          <div style="font-size: 14px; line-height: 1.75; color: var(--fg1); word-break: keep-all;">${bodyHtml}</div>
        </div>
        <div style="padding: 16px 32px 24px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-hairline);">
          <label style="font-size: 12px; color: var(--fg2); display: flex; gap: 6px; align-items: center; cursor: pointer;">
            <input type="checkbox" class="popup-dismiss-today"> 오늘 그만 보기
          </label>
          ${pp.link_url ? `<a href="${escAttr(pp.link_url)}" target="_blank" rel="noopener" style="background: var(--ink); color: var(--hanji); padding: 10px 20px; font-family: var(--font-mono); font-size: 12px; letter-spacing: 0.06em; text-decoration: none;">${escHtml(pp.link_label || '자세히 보기')} →</a>` : ''}
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // 애니메이션 keyframe 한 번만 삽입
    if (!document.getElementById('sejong-popup-anim')) {
      const style = document.createElement('style');
      style.id = 'sejong-popup-anim';
      style.textContent = '@keyframes sejongFadeIn{from{opacity:0}to{opacity:1}} @keyframes sejongPopupIn{from{transform:translateY(20px) scale(0.96);opacity:0}to{transform:translateY(0) scale(1);opacity:1}}';
      document.head.appendChild(style);
    }

    function close() {
      const dismissToday = overlay.querySelector('.popup-dismiss-today').checked;
      if (dismissToday) setCookie(cookieKey, '1', 24);
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 250);
    }
    overlay.querySelector('.popup-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });
  }

  // 모바일: 하단 floating banner (전체 화면 안 가림)
  function renderPopupMobileBanner(pp, cookieKey) {
    const banner = document.createElement('div');
    banner.style.cssText = 'position: fixed; bottom: 16px; left: 16px; right: 16px; z-index: 999; background: var(--ink); color: var(--hanji); padding: 14px 16px 14px 18px; box-shadow: 0 8px 24px rgba(0,0,0,0.25); display: flex; gap: 12px; align-items: center; animation: sejongFadeIn 0.3s;';
    banner.innerHTML = `
      <div style="flex:1; min-width:0;">
        <div style="font-family:var(--font-mono);font-size:9px;letter-spacing:.16em;color:var(--geumbak-gold);text-transform:uppercase;margin-bottom:2px;">공지</div>
        <div style="font-family:var(--font-serif-kr);font-weight:700;font-size:14px;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(pp.title)}</div>
      </div>
      ${pp.link_url ? `<a href="${escAttr(pp.link_url)}" target="_blank" rel="noopener" style="color:var(--geumbak-gold);font-family:var(--font-mono);font-size:11px;text-decoration:none;letter-spacing:.06em;white-space:nowrap;">${escHtml(pp.link_label || '보기')} →</a>` : ''}
      <button class="mobile-close" aria-label="닫기" style="background:transparent;border:0;color:var(--hanji);font-size:18px;cursor:pointer;opacity:0.7;padding:4px;">×</button>
    `;
    document.body.appendChild(banner);
    banner.querySelector('.mobile-close').addEventListener('click', () => {
      setCookie(cookieKey, '1', 24);
      banner.remove();
    });
  }

  function simpleHash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
    return Math.abs(h).toString(36).slice(0, 8);
  }

  // 8-A) 협력체 카드 — 로고 + 한글명 + 영문명 (v2.8.9 깔끔한 그리드)
  async function hydratePartners() {
    const host = document.querySelector('[data-db="partners-strip"]');
    if (!host) return;
    const data = await safeFetch('/public/partners');
    const items = data?.items || [];
    if (items.length === 0) return;

    // 그리드로 전환 — 5개 카드 고정 (auto-fit으로 모바일 자동 줄바꿈)
    host.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:1px;background:var(--border-hairline);border:1px solid var(--border-hairline);max-width:1200px;margin:0 auto;';

    // 협력체별 한자/식별 마커 매핑 (브랜드 식별용 단정한 단청 레드 배지)
    const HAN_MARK = {
      '국립국악원': '國', '세종문화회관': '世',
      '군포시': '軍', '군포문화재단': '軍文',
      '경기문화재단': '京', '한국문화예술위원회': '韓',
      '한국문화예술회관연합회': '韓會', '경기문화의전당': '京殿',
    };

    host.innerHTML = items.map((p) => {
      const logo = mediaUrl(p.logo_key);
      const mark = HAN_MARK[p.name] || p.name.charAt(0);
      const markFontSize = mark.length > 1 ? '15px' : '20px';
      const cardInner = `
        <div class="partner-card-inner" style="background:var(--paper);padding:28px 20px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;min-height:160px;text-align:center;transition:all 0.3s var(--ease-gentle);">
          ${logo
            ? `<img src="${escAttr(logo)}" alt="${escAttr(p.name)}" decoding="async" style="height:56px;max-width:180px;object-fit:contain;transition:transform 0.3s var(--ease-gentle);">`
            : `<div class="partner-mark" style="width:52px;height:52px;background:var(--dancheong-red);color:var(--hanji);display:flex;align-items:center;justify-content:center;font-family:var(--font-serif-kr);font-weight:800;font-size:${markFontSize};letter-spacing:-.02em;transition:transform 0.3s var(--ease-gentle);">${escHtml(mark)}</div>`
          }
          <div style="display:flex;flex-direction:column;gap:3px;line-height:1.35;">
            <div style="font-family:var(--font-serif-kr);font-weight:700;font-size:14px;color:var(--ink);letter-spacing:-.005em;word-break:keep-all;">${escHtml(p.name)}</div>
            ${p.name_en ? `<div style="font-family:var(--font-serif-en);font-style:italic;font-size:11px;color:var(--fg2);letter-spacing:.02em;">${escHtml(p.name_en)}</div>` : ''}
          </div>
        </div>
      `;
      return p.url
        ? `<a href="${escAttr(p.url)}" target="_blank" rel="noopener" title="${escAttr(p.name)}" class="partner-card" style="text-decoration:none;color:inherit;">${cardInner}</a>`
        : `<div title="${escAttr(p.name)}" class="partner-card">${cardInner}</div>`;
    }).join('');
  }

  // 8) 단원 수 표기 (about.html #sec-musicians 헤더에 총 단원 수 표시)
  async function hydrateMemberCount() {
    const placeholder = document.querySelector('[data-db="member-count"]');
    if (!placeholder) return;
    const stats = await safeFetch('/public/stats');
    if (!stats) return;
    placeholder.textContent = stats.member_total + '명';
  }

  // 9) 단원 사진·소개·신규 단원 동기화 (admin DB → about.html 자동)
  //    v2.8.60: 신규 단원 추가도 자동 — 매칭 안 되는 DB 단원은 "추가 단원" 섹션에 노출
  async function hydrateMemberPhotos() {
    const cards = document.querySelectorAll('.mcard[data-name]');
    if (!cards.length) return;
    const data = await safeFetch('/public/members?limit=200');
    if (!data?.items) return;

    // 이름 → DB 단원 매핑
    const byName = {};
    data.items.forEach(m => { if (m.name) byName[m.name.trim()] = m; });

    // HTML에 이미 있는 이름 set (대조용)
    const namesInHtml = new Set();
    cards.forEach(card => namesInHtml.add((card.dataset.name || '').trim()));

    // 1단계: 기존 카드의 사진/역할/bio 갱신
    cards.forEach(card => {
      const name = (card.dataset.name || '').trim();
      const dbMember = byName[name];
      if (!dbMember) return;
      if (dbMember.photo_key) {
        const photoUrl = mediaUrl(dbMember.photo_key);
        const img = card.querySelector('img.mphoto');
        if (img && photoUrl) {
          img.src = photoUrl;
          img.alt = (dbMember.name || '') + ' ' + (dbMember.part || '');
        }
      }
      if (dbMember.part) {
        const roleEl = card.querySelector('.mrole');
        if (roleEl) roleEl.textContent = dbMember.part;
        card.dataset.role = dbMember.part;
      }
      if (dbMember.bio_html) {
        const tmp = document.createElement('div');
        tmp.innerHTML = dbMember.bio_html;
        const lines = [];
        tmp.querySelectorAll('li, p').forEach(el => {
          const t = el.textContent.trim();
          if (t) lines.push('- ' + t);
        });
        if (lines.length) card.dataset.bio = lines.join('||');
      }
    });

    // 2단계: 신규 단원 (HTML에 없는 DB 단원) — "신규 추가" 섹션에 자동 렌더링
    const newMembers = data.items.filter(m => m.name && !namesInHtml.has(m.name.trim()));
    if (newMembers.length === 0) return;

    // 추가 섹션이 이미 있으면 갱신, 없으면 about.html 끝에 추가
    let addSection = document.getElementById('sec-newcomers');
    const lastMemberSec = Array.from(document.querySelectorAll('section.sec'))
      .filter(s => s.querySelector('.members-grid'))
      .pop();
    if (!lastMemberSec) return;

    if (!addSection) {
      addSection = document.createElement('section');
      addSection.className = 'sec';
      addSection.id = 'sec-newcomers';
      addSection.innerHTML = `
        <div class="sec-hd">
          <div class="sec-glyph">新</div>
          <div class="sec-titles">
            <div class="sec-eb" data-newcomers-count>NEW · ${newMembers.length}명</div>
            <h2>신규 단원</h2>
          </div>
          <div class="sec-line"></div>
        </div>
        <div class="members-grid" data-newcomers-grid></div>
      `;
      lastMemberSec.parentNode.insertBefore(addSection, lastMemberSec.nextSibling);
    } else {
      const eb = addSection.querySelector('[data-newcomers-count]');
      if (eb) eb.textContent = `NEW · ${newMembers.length}명`;
    }

    const grid = addSection.querySelector('[data-newcomers-grid]');
    if (grid) {
      grid.innerHTML = newMembers.map(m => {
        const photoUrl = m.photo_key ? mediaUrl(m.photo_key) : '';
        const safeName = String(m.name || '').replace(/"/g, '&quot;');
        const safeRole = String(m.part || '').replace(/"/g, '&quot;');
        // bio_html에서 줄별 텍스트 추출
        let bioLines = '';
        if (m.bio_html) {
          const tmp = document.createElement('div');
          tmp.innerHTML = m.bio_html;
          const lines = [];
          tmp.querySelectorAll('li, p').forEach(el => {
            const t = el.textContent.trim();
            if (t) lines.push('- ' + t);
          });
          bioLines = lines.join('||').replace(/"/g, '&quot;');
        }
        const photoHtml = photoUrl
          ? `<img class="mphoto" src="${photoUrl}" alt="${safeName} ${safeRole}" loading="lazy">`
          : `<div class="mphoto noph">${(m.name || '').charAt(0)}</div>`;
        return `
          <div class="mcard" data-name="${safeName}" data-role="${safeRole}" data-bio="${bioLines}">
            ${photoHtml}
            <div class="mname">${escHtml(m.name)}</div>
            <div class="mrole">${escHtml(m.part || '')}</div>
          </div>
        `;
      }).join('');
    }
  }

  // -----------------------------------------------------------------------
  // 초기화 — DOM ready 시 자동 실행
  // -----------------------------------------------------------------------
  // Intersection Observer — 모든 .fade-up 요소가 viewport 진입 시 .in-view 추가 (readdy 스타일)
  function setupFadeUp() {
    // 1) IntersectionObserver 미지원 환경 또는 즉시 가시 요소 즉시 in-view
    function applyInstant() {
      document.querySelectorAll('.fade-up:not(.in-view)').forEach((el) => {
        const r = el.getBoundingClientRect();
        // 이미 viewport 안에 (적어도 일부) 있으면 즉시 적용
        if (r.top < window.innerHeight && r.bottom > 0) {
          el.classList.add('in-view');
        }
      });
    }
    applyInstant();
    if (!('IntersectionObserver' in window)) {
      window.addEventListener('scroll', applyInstant);
      return;
    }
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('in-view');
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.05, rootMargin: '0px 0px 0px 0px' });
    document.querySelectorAll('.fade-up:not(.in-view)').forEach((el) => obs.observe(el));
    // 동적으로 추가되는 요소 (hydrate 결과) 도 자동 관찰 — MutationObserver
    const mo = new MutationObserver(() => {
      document.querySelectorAll('.fade-up:not(.in-view)').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) {
          el.classList.add('in-view');
        } else {
          obs.observe(el);
        }
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  // SCROLL 인디케이터 — 5초 자동 페이드 + 스크롤 시 즉시 페이드 (한 번 사라지면 복귀 X)
  function setupScrollIndicator() {
    const ind = document.getElementById('scroll-ind');
    if (!ind) return;
    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      ind.style.opacity = '0';
      ind.style.pointerEvents = 'none';
    };
    setTimeout(dismiss, 5000);
    window.addEventListener('scroll', () => {
      if (window.scrollY > 40) dismiss();
    }, { passive: true });
  }

  function init() {
    setupScrollIndicator();
    hydrateHeroRotator();
    hydrateUpcomingGrid();
    hydrateNoticesPreview();
    hydrateScheduleList();
    hydrateNoticesList();
    hydratePinnedNotices();
    hydrateArchive();
    hydrateArchiveCounter();
    hydrateMemberCount();
    hydrateMemberPhotos();
    hydratePartners();
    hydrateAnnouncements();
    setupFadeUp();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 디버그용 전역 노출
  window.siteData = { API_BASE, safeFetch, hydrateHeroRotator, hydrateUpcomingGrid, hydrateNoticesPreview, hydrateScheduleList, hydrateNoticesList, hydrateArchive, hydrateArchiveCounter, hydrateMemberCount, hydrateMemberPhotos, hydratePartners, hydrateAnnouncements, setupFadeUp };
})();
