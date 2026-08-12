/* ========================================================================
   v2.8.28 — 모바일 추가 보강 통합
   - 페이지네이션 (공지 10건/기타 5건)
   - 우측 플로팅 rail 자동 주입 (모든 페이지)
   - 필터·검색 핸들러 안정화 (delegation)
   ======================================================================== */
(function () {
  'use strict';

  // ───── 1) 우측 플로팅 rail 자동 주입 (없는 페이지 대상) ─────
  function ensureRail() {
    if (document.querySelector('.rail')) return;
    var rail = document.createElement('div');
    rail.className = 'rail';
    rail.innerHTML =
      '<button onclick="location.href=\'tickets.html\'"><i class="ph ph-ticket"></i><span>예매안내</span></button>' +
      '<button onclick="location.href=\'inquiry.html\'"><i class="ph ph-chat-circle"></i><span>문의</span></button>' +
      '<button onclick="window.scrollTo({top:0,behavior:\'smooth\'})"><i class="ph ph-caret-up"></i><span>TOP</span></button>';
    document.body.appendChild(rail);
  }

  // ───── 2) 페이지네이션 ─────
  // 사용: 컨테이너에 data-paginate-size="N" data-paginate-item="셀렉터" 설정
  // 자동 적용: notices(10), archive(5), schedule(5), performance(5)
  function setupPagination(container, opts) {
    var size = opts.size || parseInt(container.dataset.paginateSize || '0', 10);
    var itemSel = opts.itemSel || container.dataset.paginateItem || ':scope > *';
    if (!size) return;
    // 멱등성: 이미 페이지네이션 적용된 컨테이너는 스킵
    if (container.dataset.pagiApplied === '1') return;

    var allItems = Array.from(container.querySelectorAll(itemSel)).filter(function (el) {
      return !el.classList.contains('pagi-bar') && !el.classList.contains('archive-empty')
          && el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE';
    });
    if (allItems.length <= size) return; // 페이지네이션 불필요
    container.dataset.pagiApplied = '1';

    var totalPages = Math.ceil(allItems.length / size);
    var page = 1;

    // 컨트롤 바 생성 — column-count 컨테이너(.gallery 등)에 영향 안 받도록 sibling 으로 삽입
    var bar = document.createElement('div');
    bar.className = 'pagi-bar';
    bar.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:6px;padding:32px 12px 8px;flex-wrap:wrap;width:100%;max-width:100%;';
    if (container.parentNode) {
      container.parentNode.insertBefore(bar, container.nextSibling);
    } else {
      container.appendChild(bar);
    }

    function btn(label, isActive, isArrow, disabled) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.className = 'pagi-btn' + (isActive ? ' on' : '') + (isArrow ? ' arrow' : '');
      if (disabled) { b.disabled = true; b.style.opacity = '0.35'; }
      b.style.cssText += 'min-width:34px;height:34px;padding:0 8px;border:1px solid var(--border-strong,rgba(26,22,20,0.3));background:' +
        (isActive ? 'var(--ink,#1A1614)' : 'transparent') + ';color:' +
        (isActive ? 'var(--hanji,#F6F1E8)' : 'var(--ink,#1A1614)') +
        ';font-family:var(--font-mono,monospace);font-size:12px;font-weight:700;cursor:pointer;flex-shrink:0;';
      return b;
    }

    function render() {
      // 보이는 아이템 결정
      var visibleItems = allItems.filter(function (el) { return el.style.display !== 'none' || el.dataset.filteredOut !== '1'; });
      // 아이템 표시 토글
      allItems.forEach(function (el, i) {
        // 필터로 숨겨진 건 그대로 둠
        if (el.dataset.filteredOut === '1') { return; }
        var inRange = i >= (page - 1) * size && i < page * size;
        // 페이지 범위 안일 때만 표시
        el.style.display = inRange ? '' : 'none';
        el.dataset.paginated = inRange ? 'show' : 'hide';
      });
      // 컨트롤 다시 그리기
      bar.innerHTML = '';
      bar.appendChild(btn('‹', false, true, page === 1));
      bar.lastChild.onclick = function () { if (page > 1) { page--; render(); scrollTopOf(container); } };

      // 1, ..., 끝 형태 (현재 페이지 ±1, 첫·끝 페이지 항상)
      var pagesToShow = pagesAround(page, totalPages);
      var prev = 0;
      pagesToShow.forEach(function (n) {
        if (prev && n - prev > 1) {
          var dots = document.createElement('span');
          dots.textContent = '⋯';
          dots.style.cssText = 'padding:0 4px;font-family:var(--font-mono);font-size:12px;color:var(--fg2,#5A544B);';
          bar.appendChild(dots);
        }
        var pg = btn(String(n), n === page, false, false);
        pg.onclick = function () { page = n; render(); scrollTopOf(container); };
        bar.appendChild(pg);
        prev = n;
      });

      bar.appendChild(btn('›', false, true, page === totalPages));
      bar.lastChild.onclick = function () { if (page < totalPages) { page++; render(); scrollTopOf(container); } };
    }

    function pagesAround(cur, total) {
      var pages = new Set([1, total, cur, cur - 1, cur + 1]);
      var out = [];
      pages.forEach(function (p) { if (p >= 1 && p <= total) out.push(p); });
      return out.sort(function (a, b) { return a - b; });
    }

    function scrollTopOf(el) {
      var rect = el.getBoundingClientRect();
      window.scrollTo({ top: window.scrollY + rect.top - 100, behavior: 'smooth' });
    }

    // 외부에서 필터 후 page=1로 리셋할 수 있게 expose
    container._pagiReset = function () { page = 1; render(); };
    render();
  }

  // ───── 3) 페이지별 페이지네이션 자동 적용 ─────
  function autoApplyPagination() {
    var path = location.pathname;

    // notices: 10건
    if (/notices/i.test(path)) {
      var nrows = document.querySelector('[data-db="notices-rows"]');
      if (nrows) setupPagination(nrows, { size: 10, itemSel: ':scope > *:not(.pagi-bar)' });
    }
    // archive: 5건 (gallery)
    if (/archive/i.test(path)) {
      var gal = document.querySelector('.gallery');
      if (gal) setupPagination(gal, { size: 5, itemSel: '.card' });
    }
    // schedule: 5건 (evt-rows, month-header 단위는 무시 — 단순 행 페이지네이션)
    if (/schedule/i.test(path)) {
      var listView = document.getElementById('listView');
      if (listView && listView.dataset.pagiApplied !== '1') {
        listView.dataset.pagiApplied = '1';
        // evt-row만 페이지네이션 (월 헤더는 visibility 자동)
        var rows = Array.from(listView.querySelectorAll('.evt-row'));
        if (rows.length > 5) {
          var page = 1, size = 5;
          var totalPages = Math.ceil(rows.length / size);
          var bar = document.createElement('div');
          bar.className = 'pagi-bar';
          bar.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:6px;padding:32px 12px 8px;flex-wrap:wrap;width:100%;';
          listView.appendChild(bar);

          function renderSched() {
            rows.forEach(function (r, i) {
              if (r.dataset.filteredOut === '1') return;
              var inRange = i >= (page - 1) * size && i < page * size;
              r.style.display = inRange ? '' : 'none';
            });
            // 빈 월 헤더 숨김
            document.querySelectorAll('.month-header').forEach(function (mh) {
              var next = mh.nextElementSibling;
              var hasVisible = false;
              while (next && !next.classList.contains('month-header')) {
                if (next.classList.contains('evt-row') && next.style.display !== 'none') { hasVisible = true; break; }
                next = next.nextElementSibling;
              }
              mh.style.display = hasVisible ? '' : 'none';
            });
            bar.innerHTML = '';
            var prevBtn = document.createElement('button');
            prevBtn.textContent = '‹';
            prevBtn.style.cssText = 'min-width:34px;height:34px;border:1px solid var(--border-strong);background:transparent;color:var(--ink);cursor:pointer;font-weight:700;';
            prevBtn.disabled = page === 1;
            if (page === 1) prevBtn.style.opacity = '0.35';
            prevBtn.onclick = function () { if (page > 1) { page--; renderSched(); scrollToList(); } };
            bar.appendChild(prevBtn);

            var pages = new Set([1, totalPages, page, page - 1, page + 1]);
            var arr = [];
            pages.forEach(function (p) { if (p >= 1 && p <= totalPages) arr.push(p); });
            arr.sort(function (a, b) { return a - b; });
            var prev = 0;
            arr.forEach(function (n) {
              if (prev && n - prev > 1) {
                var dots = document.createElement('span');
                dots.textContent = '⋯';
                dots.style.cssText = 'padding:0 4px;color:var(--fg2);';
                bar.appendChild(dots);
              }
              var b = document.createElement('button');
              b.textContent = String(n);
              b.style.cssText = 'min-width:34px;height:34px;border:1px solid var(--border-strong);background:' + (n === page ? 'var(--ink)' : 'transparent') + ';color:' + (n === page ? 'var(--hanji)' : 'var(--ink)') + ';font-weight:700;cursor:pointer;';
              b.onclick = function () { page = n; renderSched(); scrollToList(); };
              bar.appendChild(b);
              prev = n;
            });

            var nextBtn = document.createElement('button');
            nextBtn.textContent = '›';
            nextBtn.style.cssText = 'min-width:34px;height:34px;border:1px solid var(--border-strong);background:transparent;color:var(--ink);cursor:pointer;font-weight:700;';
            nextBtn.disabled = page === totalPages;
            if (page === totalPages) nextBtn.style.opacity = '0.35';
            nextBtn.onclick = function () { if (page < totalPages) { page++; renderSched(); scrollToList(); } };
            bar.appendChild(nextBtn);
          }
          function scrollToList() {
            var rect = listView.getBoundingClientRect();
            window.scrollTo({ top: window.scrollY + rect.top - 100, behavior: 'smooth' });
          }
          renderSched();
        }
      }
    }
  }

  // ───── 4) 필터 핸들러 안정화 (event delegation) ─────
  function ensureFilterHandlers() {
    // 이미 attach된 페이지에는 영향 없음 — delegation으로 한번 더 보장
    document.addEventListener('click', function (e) {
      var target = e.target.closest('.chip, .filters-row button, .cat-chips .chip, .year-tabs button');
      if (!target) return;
      // 기존 핸들러가 attach된 경우 자체적으로 동작
      // 하지만 active 클래스만 토글되는 경우 (필터 미작동) — 우리가 한 번 더 처리
      // 단, 필터 UI 그룹별로 active 토글
      var group = target.parentElement;
      if (!group) return;
      Array.from(group.children).forEach(function (s) {
        s.classList.remove('active');
        s.classList.remove('on');
      });
      target.classList.add(target.parentElement.classList.contains('year-tabs') ? 'on' : 'active');
    }, true); // capture phase
  }

  // ───── 부트스트랩 ─────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    try { ensureRail(); } catch (e) { console.warn('[mobile-extras] rail', e); }
    try { ensureFilterHandlers(); } catch (e) { console.warn('[mobile-extras] filter', e); }
    // 페이지네이션은 동적 로드된 데이터 이후 실행 — 1초 후 적용
    setTimeout(function () {
      try { autoApplyPagination(); } catch (e) { console.warn('[mobile-extras] pagi', e); }
    }, 1500);
    // DB 비동기 로드 완료 후 추가 시도 (3초 안전망)
    setTimeout(function () {
      try { autoApplyPagination(); } catch (e) {}
    }, 4000);
  }
})();
