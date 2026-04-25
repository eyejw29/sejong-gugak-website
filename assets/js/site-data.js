/* =========================================================================
   site-data.js — 공개 사이트 동적 데이터 바인딩 (v2.6.1 · 2026-04-24)

   사용법: 각 페이지 </body> 직전에 <script src="assets/js/site-data.js"></script>

   Progressive Enhancement:
   - 기본 HTML(하드코딩)은 그대로 표시됨
   - API 응답이 오면 해당 섹션을 자동 교체
   - API 실패/데이터 없음 → 하드코딩 유지
   - 관리자가 공연/공지/아카이브 입력 전에도 사이트는 정상 동작

   데이터 소스: https://sejong-admin-api.eyejw29.workers.dev/public/*
   ========================================================================= */
(function () {
  'use strict';

  const API_BASE = 'https://sejong-admin-api.eyejw29.workers.dev';

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
    /^\d{4}\/\d{2}\/[a-z0-9]{20,}\.(?:jpg|jpeg|png|webp|svg|pdf)$/i,
    /^legacy\/[a-z0-9]+\/[\w\-.]+\.(?:jpg|jpeg|png|webp|svg|pdf|gif|hwp|hwpx)$/i,
    /^partners\/[\w\-.]+\.(?:jpg|jpeg|png|webp|svg)$/i,
  ];
  function mediaUrl(key) {
    if (!key) return null;
    // 구 Gnuboard 백업의 http:// 외부 URL은 mixed content + 호스트 사망 가능성 → null
    if (key.startsWith('http://')) return null;
    if (key.startsWith('https://')) return key;
    const cleaned = key.replace(/^\/+/, '');
    if (R2_KEY_RES.some(re => re.test(cleaned))) {
      return API_BASE + '/public/media/' + cleaned;
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
      safeFetch('/public/performances?region=main_banner&limit=5'),
      safeFetch('/public/performances?region=upcoming&limit=3'),
    ]);
    const bannerItems = (bannerData?.items || []).filter((p) => p.visibility !== 'private');
    const upcomingItems = (upcomingData?.items || []).filter((p) => p.visibility !== 'private');
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

    // 자동 롤링
    if (items.length > 1) {
      let idx = 0;
      const slides = host.querySelectorAll('.hero-slide');
      const dots = host.querySelectorAll('.hero-dot');
      const interval = 6000;
      function show(i) {
        slides.forEach((s, n) => { s.style.display = n === i ? 'flex' : 'none'; });
        dots.forEach((d, n) => { d.style.background = n === i ? 'var(--hanji)' : 'transparent'; });
        idx = i;
      }
      const timer = setInterval(() => show((idx + 1) % items.length), interval);
      dots.forEach((d) => d.addEventListener('click', () => {
        clearInterval(timer);
        show(Number(d.dataset.dot));
      }));
    }
  }

  // -----------------------------------------------------------------------
  // 2) 다가오는 무대 카드 그리드 (index.html — .season-grid)
  // -----------------------------------------------------------------------
  async function hydrateUpcomingGrid() {
    const host = document.querySelector('[data-db="upcoming-grid"]');
    if (!host) return;

    const data = await safeFetch('/public/performances?region=upcoming&upcoming=1&limit=6');
    const items = data?.items || [];
    if (items.length === 0) return;

    host.innerHTML = items.map((p, i) => {
      const n = String(i + 1).padStart(2, '0');
      // poster > hero > placeholder
      const poster = mediaUrl(p.poster_key) || mediaUrl(p.hero_image_key) || placeholderUrl('performance');
      const bookable = p.ticket_url && bookingAvailable(p.booking_status);
      return `
        <a class="perf" href="${bookable ? escAttr(p.ticket_url) : 'schedule.html'}" ${bookable ? 'target="_blank" rel="noopener"' : ''} style="text-decoration: none; color: inherit; display: block;">
          <div class="perf-n">N° ${n}</div>
          <div class="perf-thumb" data-ch="樂" style="background-image:url('${escAttr(poster)}')"></div>
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

    const [notices, press] = await Promise.all([
      safeFetch('/public/posts?category=notice&limit=10'),
      safeFetch('/public/posts?category=press&limit=10'),
    ]);

    const noticeItems = notices?.items || [];
    const pressItems = press?.items || [];

    // 3-1) 피처 (is_pinned 우선 / 없으면 최신 1건)
    if (featureHost) {
      const pinned = noticeItems.find((p) => p.is_pinned) || noticeItems[0];
      if (pinned) {
        featureHost.innerHTML = `
          <div class="eb">ANNOUNCEMENT · PRIMARY</div>
          <h3>${escHtml(pinned.title)}</h3>
          <div class="dates" style="margin-top:16px;">
            <span>${fmtKrDate(pinned.published_at)}</span>
            <a href="notices.html?slug=${encodeURIComponent(pinned.slug)}" style="text-decoration:none;color:var(--dancheong-red);">상세 보기 →</a>
          </div>
        `;
      }
    }

    // 3-2) 공지 컬럼
    if (colHost && noticeItems.length > 0) {
      colHost.innerHTML = noticeItems.slice(0, 5).map((p) => `
        <li><a href="notices.html?slug=${encodeURIComponent(p.slug)}" style="display:flex;gap:14px;text-decoration:none;color:inherit;"><span class="d">${fmtKrDate(p.published_at).slice(5)}</span><div class="tt">${p.is_pinned ? '<span class="tag r">PIN</span>' : '<span class="tag">NOTICE</span>'}${escHtml(p.title)}</div></a></li>
      `).join('');
    }

    // 3-3) 보도 컬럼
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

    let currentCat = 'all';

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

    load('all');
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
            return `<li><a href="${escAttr(href)}" target="_blank" rel="noopener" style="display:inline-flex;gap:8px;align-items:center;padding:8px 12px;background:var(--hanji);border:1px solid var(--border-hairline);text-decoration:none;color:var(--fg1);font-size:14px;"><i class="ph ph-download-simple" style="color:var(--dancheong-red);"></i>${escHtml(name)}${size}</a></li>`;
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
    host.innerHTML = '<div style="padding:60px;text-align:center;color:var(--fg2);">불러오는 중…</div>';
    const item = await safeFetch(`/public/archive/${encodeURIComponent(slug)}`);
    if (!item) {
      host.innerHTML = `
        <div style="padding:60px 20px;text-align:center;">
          <p style="color:var(--fg2);margin-bottom:24px;">아카이브 항목을 찾을 수 없습니다.</p>
          <a href="archive.html" style="font-family:var(--font-mono);font-size:11px;letter-spacing:.1em;color:var(--dancheong-red);">← 아카이브로</a>
        </div>
      `;
      return;
    }
    const cover = mediaUrl(item.cover_image_key);
    const gallery = item.gallery_keys || [];
    const videoEmbed = buildVideoEmbed(item.video_url);

    host.innerHTML = `
      <article class="archive-detail" style="max-width:1200px;margin:0 auto;padding:40px 20px 80px;">
        <a href="archive.html" style="display:inline-block;margin-bottom:32px;font-family:var(--font-mono);font-size:11px;letter-spacing:.1em;color:var(--dancheong-red);text-decoration:none;">← 아카이브로</a>

        <header style="display:grid;grid-template-columns:1fr auto;gap:40px;align-items:end;padding-bottom:28px;border-bottom:1px solid var(--border-strong);margin-bottom:40px;">
          <div>
            <div style="font-family:var(--font-mono);font-size:11px;letter-spacing:.18em;color:var(--dancheong-red);text-transform:uppercase;margin-bottom:12px;">${archiveCategoryLabel(item.category)}</div>
            <h1 style="font-family:var(--font-serif-kr);font-weight:800;font-size:clamp(32px,5vw,56px);line-height:1.15;letter-spacing:-.025em;margin:0;">${escHtml(item.title)}</h1>
          </div>
          <div style="font-family:var(--font-mono);font-size:11px;letter-spacing:.08em;color:var(--fg2);text-align:right;line-height:1.9;">
            <div>${fmtKrDate(item.performed_at)}</div>
            ${item.venue ? `<div>${escHtml(item.venue)}</div>` : ''}
          </div>
        </header>

        ${cover ? `<img src="${escAttr(cover)}" alt="${escAttr(item.title)}" style="width:100%;max-height:600px;object-fit:cover;margin-bottom:40px;">` : ''}

        ${item.summary ? `<p style="font-family:var(--font-serif-kr);font-weight:300;font-size:20px;line-height:1.7;color:var(--fg1);margin:0 0 40px;letter-spacing:-.005em;word-break:keep-all;">${escHtml(item.summary)}</p>` : ''}

        ${item.body_html ? `<div class="archive-body" style="font-size:16px;line-height:1.9;color:var(--fg1);max-width:800px;margin:0 auto 40px;">${safeBodyHtml(item.body_html)}</div>` : ''}

        ${videoEmbed}

        ${gallery.length > 0 ? `
          <section class="archive-gallery" style="margin-top:60px;">
            <h2 style="font-family:var(--font-serif-kr);font-weight:800;font-size:28px;letter-spacing:-.015em;margin:0 0 24px;">갤러리</h2>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;">
              ${gallery.map((k) => `
                <img src="${escAttr(mediaUrl(k))}" alt="" loading="lazy" style="width:100%;aspect-ratio:4/3;object-fit:cover;cursor:zoom-in;">
              `).join('')}
            </div>
          </section>
        ` : ''}
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

  // 8-A) 협력체 로고 띠 (v2.6.4)
  async function hydratePartners() {
    const host = document.querySelector('[data-db="partners-strip"]');
    if (!host) return;
    const data = await safeFetch('/public/partners');
    const items = data?.items || [];
    if (items.length === 0) return;
    host.innerHTML = items.map((p) => {
      const logo = mediaUrl(p.logo_key);
      const inner = logo
        ? `<img src="${escAttr(logo)}" alt="${escAttr(p.name)}" loading="lazy" style="height:48px;max-width:160px;object-fit:contain;filter:grayscale(0.2) opacity(0.85);transition:filter 0.3s;">`
        : `<span style="font-family:var(--font-serif-kr);font-weight:700;font-size:14px;color:var(--fg2);padding:14px 20px;border:1px solid var(--border-hairline);">${escHtml(p.name)}</span>`;
      const wrap = (content) => p.url
        ? `<a href="${escAttr(p.url)}" target="_blank" rel="noopener" title="${escAttr(p.name)}" class="partner-logo">${content}</a>`
        : `<span title="${escAttr(p.name)}" class="partner-logo">${content}</span>`;
      return wrap(inner);
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

  // -----------------------------------------------------------------------
  // 초기화 — DOM ready 시 자동 실행
  // -----------------------------------------------------------------------
  function init() {
    hydrateHeroRotator();
    hydrateUpcomingGrid();
    hydrateNoticesPreview();
    hydrateScheduleList();
    hydrateNoticesList();
    hydrateArchive();
    hydrateArchiveCounter();
    hydrateMemberCount();
    hydratePartners();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 디버그용 전역 노출
  window.siteData = { API_BASE, safeFetch, hydrateHeroRotator, hydrateUpcomingGrid, hydrateNoticesPreview, hydrateScheduleList, hydrateNoticesList, hydrateArchive };
})();
