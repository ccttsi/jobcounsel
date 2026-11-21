#!/usr/bin/env python3
"""실화면 스모크 — CI 게이트의 Playwright 검사 (1순위)

  python3 ops/scripts/smoke_test.py                       # 저장소를 로컬 정적 서버로 띄워 잰다
  python3 ops/scripts/smoke_test.py --base https://witw.pages.dev/
  python3 ops/scripts/smoke_test.py --summary-file "$GITHUB_STEP_SUMMARY"

재는 화면: 개별 지시가 있는 화면(PAGES — 대문·브리핑·신산업·온도계·번역기·포털·플로우·마이덱·현실 필터·국비계산·트리아지·재무 시뮬레이터)은 전부,
           나머지 섹터는 기초 배치 4종만 — 모두 휴대폰 390·데스크톱 1280
재는 것
  · 콘솔·페이지 오류 0 (외부 CDN에서 온 오류는 제외 — 그쪽 사정으로 게이트가 흔들리지 않게)
  · 같은 사이트 안의 404 응답 0 (깨진 상대경로를 잡는다)
  · 문서 가로 넘침 0px
  · 44px 터치 미달 0개 (글 안의 인라인 링크는 제외)
  · 화면이 실제로 그려졌는가(섹터 장부·카드·기사) — JS가 죽으면 0이 되어 잡힌다
  · 기초 배치 4종 — ① 카드 밖으로 밀린 컨트롤·글 ② 표 칸 아래끝 단차 ③ 짧은 뱃지 줄바꿈 ④ 카드 안 좌우 쏠림
  · 어느 섹터도 «재지 않는 화면»으로 남지 않았는가(장부·폴더와 견준다)

종료 코드 0 = 통과, 1 = 실패. 실패하면 화면 그림을 --shot-dir에 남긴다.
"""
import argparse
import functools
import http.server
import os
import socketserver
import sys
import threading

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# 재는 화면 — 두 단계다(섹터를 손으로 세지 않는다).
#   ① PAGES — 콘솔·404·44px·대비·겹침까지 **전부** 잰다(대문 + 개별 지시가 있는 화면 + 동선).
#   ② 전 섹터 기초 배치 스위프 — 위 목록에 없어도 기초 배치 4종(카드 이탈·표 단차·뱃지 줄바꿈·좌우 쏠림)은
#      모든 섹터에서 잰다. 목록은 `sector_pages()`가 assets/tools.js(JC_TOOLS) 장부에서 만든다.
# 어느 쪽에도 없는 섹터가 있으면 check_page_coverage()가 실패한다 — 새 섹터를 만들고 게이트에 안 넣는 일을 막는다.
# /mydeck/은 저장한 덱, /portals/?q=·#p=는 검색·딥링크 동선이라 섹터 밖에서 따로 잰다.
PAGES = ["/", "/briefing/", "/emerging/", "/thermometer/", "/translator/", "/portals/", "/portals/?q=gosi",
         "/portals/#p=work24", "/flow/", "/mydeck/",
         "/work-filter/", "/kdt-calc/", "/triage/", "/fin-lab/", "/valuechain/", "/valuechain/?i=battery&s=3",
         "/intake/", "/policy-match/"]

# 화면이 아닌 폴더(섹터 목록 점검에서 뺀다) — 이유를 함께 적는다.
NON_SCREEN = {
    "admin": "운영용 내부 화면 — 대문·섹터 장부에서 이어지지 않는다",
}
VIEWPORTS = [(390, 844, "휴대폰"), (1280, 800, "데스크톱")]

# 페이지마다 「이게 없으면 화면이 안 그려진 것」을 하나씩 정한다.
PROBES = {
    "/": """() => {
        const tools = (window.JC_TOOLS || []).length;
        const entries = document.querySelectorAll('[data-visit]').length;
        return {ok: tools >= 10 && entries >= 1, detail: `섹터 장부 ${tools} · 대문 항목 ${entries}`};
    }""",
    "/briefing/": """() => {
        // 카드는 하루 1~9장이다(SCHEMA v1.3). 여기서는 'JS가 살아 카드가 그려졌는가'만 본다 —
        // 장수는 수집량에 따라 달라지므로 게이트로 삼지 않는다.
        const cards = document.querySelectorAll('[data-card]').length;
        const tabs = document.querySelectorAll('[data-tab]').length;
        const broken = /불러오지 못했습니다/.test(document.body.innerText);
        return {ok: cards >= 1 && tabs >= 2 && !broken, detail: `카드 ${cards} · 탭 ${tabs}${broken ? ' · 불러오기 실패' : ''}`};
    }""",
    "/thermometer/": """() => {
        // 산업 목록과 두 온도계가 그려졌는가. 온도는 자료에 따라 달라지므로 게이트로 삼지 않는다.
        const rows = document.querySelectorAll('[data-id]').length;
        const thermos = document.querySelectorAll('.thermo svg').length;
        const broken = /불러오지 못했습니다/.test(document.body.innerText);
        return {ok: rows >= 5 && thermos >= 2 && !broken, detail: `산업 ${rows} · 온도계 ${thermos}${broken ? ' · 불러오기 실패' : ''}`};
    }""",
    "/translator/": """() => {
        // 용어 목록과 한 장(큰 화면은 첫 용어를 미리 펼친다)이 그려졌는가.
        const rows = document.querySelectorAll('#rows .row').length;
        const total = Number((document.getElementById('lstN') || {}).textContent || 0);
        const broken = /불러오지 못했습니다/.test(document.body.innerText);
        return {ok: rows >= 1 && total >= 100 && !broken, detail: `목록 ${rows} · 용어 ${total}${broken ? ' · 불러오기 실패' : ''}`};
    }""",
    "/work-filter/": """() => {
        // 조건 칩과 직무 카드가 실제로 그려졌는가(JS가 죽으면 0).
        const chips = document.querySelectorAll('#filters [data-ax], #filters button').length;
        const cards = document.querySelectorAll('#list button[role=option]').length;
        const broken = /불러오지 못했습니다/.test(document.body.innerText);
        return {ok: chips >= 3 && cards >= 5 && !broken, detail: `조건 ${chips} · 직무 ${cards}${broken ? ' · 불러오기 실패' : ''}`};
    }""",
    "/kdt-calc/": """() => {
        // 계산서(자부담·지원액)가 그려졌는가 — 값이 아니라 «자리가 있는지»만 본다.
        const rows = document.querySelectorAll('[data-num], .cnum').length;
        const presets = document.querySelectorAll('#presets button, .pchip').length;
        const broken = /불러오지 못했습니다/.test(document.body.innerText);
        return {ok: rows >= 3 && presets >= 2 && !broken, detail: `계산 줄 ${rows} · 빠른 시나리오 ${presets}${broken ? ' · 불러오기 실패' : ''}`};
    }""",
    "/triage/": """() => {
        // 다섯 축 체크와 등급 표시가 그려졌는가.
        const boxes = document.querySelectorAll('#axes input, #axes button').length;
        const ladder = document.querySelectorAll('#ladder i').length;
        const lv = (document.getElementById('lvName') || {}).textContent || '';
        const broken = /불러오지 못했습니다/.test(document.body.innerText);
        return {ok: boxes >= 5 && ladder === 5 && !broken, detail: `축 ${boxes} · 사다리 ${ladder} · 등급 ${lv.trim().slice(0, 12)}${broken ? ' · 불러오기 실패' : ''}`};
    }""",
    "/policy-match/": """() => {
        // 네 단계 체크(4)와 일곱 제도의 관계 칸(7×6=42)이 그려졌는가 — JS가 죽으면 둘 다 0이 된다.
        const steps = document.querySelectorAll('#steps .st').length;
        const cells = document.querySelectorAll('#mx .mc[data-pair]').length;
        const legend = document.querySelectorAll('#legend .lg').length;
        const broken = /불러오지 못했습니다/.test(document.body.innerText);
        return {ok: steps === 4 && cells === 42 && legend === 5 && !broken,
                detail: `단계 ${steps} · 관계칸 ${cells} · 범례 ${legend}${broken ? ' · 불러오기 실패' : ''}`};
    }""",
    "/portals/": """() => {
        // 카드·「가서 볼 수 있는 것」 칩이 그려지고, 자료를 불러오지 못한 문구가 없는가.
        const cards = document.querySelectorAll('.card:not([hidden])').length;
        const chips = document.querySelectorAll('.card:not([hidden]) .kw span').length;
        const broken = /불러오지 못했습니다/.test(document.body.innerText);
        return {ok: cards >= 20 && chips >= 40 && !broken, detail: `카드 ${cards} · 설명 칩 ${chips}${broken ? ' · 불러오기 실패' : ''}`};
    }""",
    "/portals/?q=gosi": """() => {
        // ?q= 로 들어온 검색어가 실제로 먹는가 — gosi 로 좁혀지고 공무원 채용 사이트가 남아야 한다.
        const names = [...document.querySelectorAll('.card:not([hidden]) .nm')].map(x => x.textContent);
        const q = (document.getElementById('q') || {}).value || '';
        const ok = q === 'gosi' && names.length > 0 && names.length <= 4 &&
                   names.some(n => /사이버국가고시센터|국가공무원채용시스템/.test(n));
        return {ok, detail: `?q=${q} · 결과 ${names.length}곳`};
    }""",
    "/portals/#p=work24": """() => {
        // 메인 검색에서 「고용24」를 누르면 오는 주소 — 그 카드가 목록 맨 위에 강조되어 있는가.
        const card = document.querySelector('.card[data-p=work24]');
        const sc = document.getElementById('scroller');
        const q = (document.getElementById('q') || {}).value || '';
        const names = [...document.querySelectorAll('.card:not([hidden]) .nm')].map(x => x.textContent);
        const box = card ? card.getBoundingClientRect() : null;
        const sbox = sc.getBoundingClientRect();
        const gap = box ? Math.round(box.top - sbox.top) : -999;
        const ok = !!card && !card.hidden && card.getAttribute('aria-current') === 'true' &&
                   card.classList.contains('dl') && q === '' && names.length > 10 && gap >= -2 && gap <= 24;
        return {ok, detail: `카드 ${names.length} · 도착 ${gap}px · 강조 ${card ? card.classList.contains('dl') : '없음'}`};
    }""",
    "/flow/": """() => {
        // 27번 상담 플로우 — 키워드 칩과 첫 자료 카드, 시너지 지도가 그려졌는가.
        const kws = document.querySelectorAll('#kws .kw').length;
        const ready = document.documentElement.getAttribute('data-jc-flow') === 'ready';
        const broken = /불러오지 못했습니다/.test(document.body.innerText);
        return {ok: kws >= 6 && ready && !broken, detail: `키워드 ${kws} · 지도 ${ready ? '준비' : '없음'}${broken ? ' · 불러오기 실패' : ''}`};
    }""",
    "/mydeck/": """() => {
        // 마이덱 — 지금 로그인 상태에 맞는 한 면만 보이는가.
        //   비로그인: 로그인 안내 카드(로그인 단추·홈 단추)만, 마이덱 본문·덱 짜기·라이브·설명은 감춤
        //   로그인:   본문(덱 공간 + 공간 꾸미기 6요소 × 6조건)만, 게이트는 감춤
        const gate = document.getElementById('deckGate');
        const main = document.getElementById('deckMain');
        const auth = document.documentElement.getAttribute('data-jc-auth');
        const shown = el => !!el && !el.hidden && getComputedStyle(el).display !== 'none';
        const gateOn = shown(gate), mainOn = shown(main);
        const groups = document.querySelectorAll('#diyBody .diy-grp').length;
        const opts = document.querySelectorAll('#diyBody .opt').length;
        const hasLogin = !!gate && !!gate.querySelector('[data-jc-login]');
        const hasHome = !!gate && !!gate.querySelector('a[href="../"]');
        const ok = auth === 'in'
            ? (mainOn && !gateOn && groups === 6 && opts === 36)
            : (gateOn && !mainOn && hasLogin && hasHome);
        return {ok, detail: `상태 ${auth || '없음'} · 게이트 ${gateOn ? '보임' : '숨김'} · 본문 ${mainOn ? '보임' : '숨김'} · 요소 ${groups} · 조건 ${opts}`};
    }""",
    "/fin-lab/": """() => {
        // 24번 재무제표 해석 시뮬레이터 — 오각형·3표(3개년)·4규모 카드가 그려졌는가.
        const poly = (document.getElementById('rPoly') || {getAttribute: () => ''}).getAttribute('d') || '';
        const bars = document.querySelectorAll('#cfBars .cfTrack').length;
        const scales = document.querySelectorAll('#mtx .mc').length;
        const stRows = ['stBS', 'stIS', 'stCF'].map(id => (document.getElementById(id) || {querySelectorAll: () => []}).querySelectorAll('.sv').length);
        const trend = document.querySelectorAll('#stTrend .trdRow').length;
        return {ok: poly.length > 10 && bars === 3 && scales === 4 && stRows[0] === 24 && stRows[1] === 24 && stRows[2] === 18 && trend === 4,
                detail: `오각형 ${poly ? '그림' : '없음'} · 막대 ${bars} · 규모 카드 ${scales} · 3표 ${stRows.join('/')} · 추이 ${trend}`};
    }""",
    "/valuechain/": """() => {
        // 산업 색인·단계 레일·상세가 그려지고, 기업·직무 딥링크가 실제로 붙었는가.
        const inds = document.querySelectorAll('#inds [data-ind]').length;
        const steps = document.querySelectorAll('#rail [data-step]').length;
        const cos = document.querySelectorAll('#det a[href*="../company/#"]').length;
        const jobs = document.querySelectorAll('#det a[href*="../taxonomy/?q="]').length;
        const broken = /불러오지 못했습니다/.test(document.body.innerText);
        return {ok: inds >= 10 && steps >= 4 && cos >= 1 && jobs >= 1 && !broken,
                detail: `산업 ${inds} · 단계 ${steps} · 기업링크 ${cos} · 직무링크 ${jobs}${broken ? ' · 불러오기 실패' : ''}`};
    }""",
    "/valuechain/?i=battery&s=3": """() => {
        // ?i=&s= 로 들어온 딥링크가 그 산업·그 단계를 실제로 열었는가.
        const name = (document.getElementById('iName') || {}).textContent || '';
        const head = (document.querySelector('#det h3') || {}).textContent || '';
        const pos = (document.querySelector('#det .pos') || {}).textContent || '';
        const tight = pos.split(' ').join('');
        return {ok: name.trim() === '이차전지' && head.trim() === '음극재·분리막·전해액' && tight === '3/6',
                detail: `산업 ${name.trim()} · 단계 ${head.trim()} · ${pos.trim()}`};
    }""",
    "/intake/": """() => {
        // 32번 초기상담 접수·구조화 시트 — 네 유형 탭·네 단계 탭이 서고, 첫 단계(오프닝)가 그려졌는가.
        // 질문 단계로 바꿔 7~8개 질문과 답변 신호가 실제로 만들어지는지까지 본다(탭이 죽어 있으면 잡힌다).
        const types = document.querySelectorAll('#types .type').length;
        const steps = document.querySelectorAll('#steps .step').length;
        const say = (document.querySelector('.say') || {}).innerText || '';
        const memo = !!document.getElementById('memo');
        document.getElementById('st-1').click();
        const qs = document.querySelectorAll('#qlist .q').length;
        const opts = document.querySelectorAll('#qlist .opt').length;
        document.getElementById('st-0').click();
        return {ok: types === 4 && steps === 4 && say.trim().length >= 30 && memo && qs >= 7 && opts >= 21,
                detail: `유형 ${types} · 단계 ${steps} · 오프닝 ${say.trim().length}자 · 질문 ${qs} · 답변 신호 ${opts} · 메모 ${memo ? '있음' : '없음'}`};
    }""",
    "/emerging/": """() => {
        const art = (document.querySelector('#art') || {innerText: ''}).innerText.trim().length;
        const chips = document.querySelectorAll('[data-sector]').length;
        const broken = /불러오지 못했습니다|이 날의 지면이 없습니다/.test(document.body.innerText);
        return {ok: art >= 100 && chips >= 1 && !broken, detail: `기사 본문 ${art}자 · 분류 칩 ${chips}${broken ? ' · 지면 없음' : ''}`};
    }""",
}

# 섹터마다 화면이 «실제로 그려졌는가»를 재는 개별 지시가 없을 때 쓰는 공통 지시.
#   빈 화면·자료 불러오기 실패를 잡고, 지면마다 다른 내용은 보지 않는다.
GENERIC_PROBE = """() => {
    const text = (document.body.innerText || '').replace(/\\s+/g, ' ').trim();
    const broken = /불러오지 못했습니다/.test(text);
    return {ok: text.length >= 120 && !broken, detail: `본문 ${text.length}자${broken ? ' · 불러오기 실패' : ''}`};
}"""

MEASURE = """() => {
    const small = [];
    document.querySelectorAll('a,button,select,input,summary,[role=button],[role=tab]').forEach(el => {
        if (el.closest('#jc-marker-ui,#jc-imm-dock')) return;
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return;
        const box = el.getBoundingClientRect();
        if (!box.width || !box.height) return;
        const inline = el.tagName === 'A' && style.display === 'inline';
        if (!inline && (box.width < 43.5 || box.height < 43.5)) {
            small.push((el.id || String(el.className).split(' ')[0] || el.tagName) + ' ' + Math.round(box.width) + 'x' + Math.round(box.height));
        }
    });
    return {overflow: document.documentElement.scrollWidth - window.innerWidth,
            smallCount: small.length, small: small.slice(0, 6)};
}"""


# ---------------------------------------------------------------- 7종 기초 결함 게이트 (2026-11-19)
#   반복되는 디자인·UI 결함을 배포 전에 잡는다. 브라우저 안에서 실제 좌표·색을 재므로
#   CSS만 읽어서는 알 수 없는 겹침·잘림·정렬 어긋남을 잡아낸다.
#   ① CSS 문법은 validate_repo.py가 본다(여기서는 화면 쪽 6가지를 잰다).
#   ② 단추·배지 글자 정중앙 ③ 한 줄 형제 단추 크기 ④ 3테마 명암 대비
#   ⑤ 시트·모달 잘림 ⑥ 요소 겹침·밀착 ⑦ 비서 3탭 실제 클릭 검수
UI_JS = r"""
() => {
  const out = {center: [], size: [], overlap: [], overflow: []};
  const vis = el => { const s = getComputedStyle(el); if (s.display==='none'||s.visibility==='hidden'||parseFloat(s.opacity)<0.05) return false; const r = el.getBoundingClientRect(); return r.width>0 && r.height>0; };
  const txt = el => Array.from(el.childNodes).some(n => n.nodeType===3 && n.textContent.trim().length>0);

  /* ② 단추·배지 글자가 상자 한가운데인가 — 글자 잉크 상자와 안쪽 여백 상자의 중심을 견준다. */
  document.querySelectorAll('button, .btn, [role="button"], .cnt, .badge').forEach(el => {
    if (!vis(el) || !txt(el)) return;
    const s = getComputedStyle(el);
    const centered = s.textAlign === 'center' || (s.display.indexOf('flex') >= 0 && s.justifyContent === 'center' && s.alignItems === 'center');
    if (!centered) return;
    const box = el.getBoundingClientRect();
    /* 글자가 단추의 **보이는 상자(테두리 상자) 한가운데**에 있는가.
       안쪽 여백이 한쪽으로 치우쳐 글자가 구석으로 밀린 경우를 잡는다(2026-11-19 지적). */
    const cx = box.left + box.width/2;
    const cy = box.top + box.height/2;
    const range = document.createRange(); range.selectNodeContents(el);
    const tr = range.getBoundingClientRect();
    if (!tr.width || !tr.height) return;
    const dx = Math.abs((tr.left+tr.right)/2 - cx), dy = Math.abs((tr.top+tr.bottom)/2 - cy);
    if (dx > 3 || dy > 3) out.center.push({el:(el.id||el.className||el.tagName).toString().slice(0,40), dx:+dx.toFixed(1), dy:+dy.toFixed(1), text:el.textContent.trim().slice(0,18)});
  });

  /* ③ 한 줄에 나란한 형제 단추의 높이·패딩이 같은가. */
  const rows = new Set();
  document.querySelectorAll('button, a.btn, .btn').forEach(b => { if (vis(b) && b.parentElement) rows.add(b.parentElement); });
  rows.forEach(par => {
    const kids = Array.from(par.children).filter(k => vis(k) && (k.tagName==='BUTTON' || k.tagName==='A' || k.classList.contains('btn')));
    if (kids.length < 2) return;
    const rects = kids.map(k => k.getBoundingClientRect());
    if (Math.max(...rects.map(r=>Math.round(r.top))) - Math.min(...rects.map(r=>Math.round(r.top))) > 4) return;
    const hs = rects.map(r => +r.height.toFixed(1));
    const pads = kids.map(k => { const s=getComputedStyle(k); return +(parseFloat(s.paddingTop)+parseFloat(s.paddingBottom)).toFixed(1); });
    if (Math.max(...hs) - Math.min(...hs) > 1.5 || Math.max(...pads) - Math.min(...pads) > 1.5) {
      out.size.push({parent:(par.id||par.className||par.tagName).toString().slice(0,36), heights:hs, pads:pads, texts:kids.map(k=>k.textContent.trim().slice(0,10))});
    }
  });

  /* ⑥ 겹침(음수 간격)과 밀착(0 간격). 형제 요소끼리만 잰다. */
  rows.forEach(par => {
    const styled = getComputedStyle(par);
    const isRow = styled.display.indexOf('flex') >= 0 || styled.display.indexOf('grid') >= 0;
    const kids = Array.from(par.children).filter(k => {
      if (!vis(k)) return false;
      const pos = getComputedStyle(k).position;          /* 떠 있는 층(겹침이 설계인 곳)은 뺀다 */
      return pos !== 'absolute' && pos !== 'fixed' && pos !== 'sticky';
    }).map(k => ({k, r: k.getBoundingClientRect()}));
    for (let i=0;i<kids.length;i++) for (let j=i+1;j<kids.length;j++) {
      const a=kids[i].r, b=kids[j].r;
      const ox = Math.min(a.right,b.right)-Math.max(a.left,b.left);
      const oy = Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
      if (ox > .5 && oy > 2) {
        out.overlap.push({kind:'겹침', parent:(par.id||par.className||par.tagName).toString().slice(0,36), a:(kids[i].k.id||kids[i].k.className||kids[i].k.tagName).toString().slice(0,24), b:(kids[j].k.id||kids[j].k.className||kids[j].k.tagName).toString().slice(0,24), ox:+ox.toFixed(1), oy:+oy.toFixed(1)});
        continue;
      }
      if (i !== j-1) continue;                    /* 밀착은 바로 옆자리끼리만 */
      const gap = isRow ? b.left - a.right : b.top - a.bottom;
      const cross = isRow ? Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top) : Math.min(a.right,b.right)-Math.max(a.left,b.left);
      if (Math.abs(gap) <= .5 && cross > 2) {
        const sa=getComputedStyle(kids[i].k), sb=getComputedStyle(kids[j].k);
        const framed = sa.borderTopWidth!=='0px'||sb.borderTopWidth!=='0px'||sa.boxShadow!=='none'||sb.boxShadow!=='none';
        if (framed) out.overlap.push({kind:'밀착', parent:(par.id||par.className||par.tagName).toString().slice(0,36), a:(kids[i].k.id||kids[i].k.className||kids[i].k.tagName).toString().slice(0,24), b:(kids[j].k.id||kids[j].k.className||kids[j].k.tagName).toString().slice(0,24), gap:+gap.toFixed(1)});
      }
    }
  });
  return out;
}
"""

# ---------------------------------------------------------------- 기초 배치 4종 게이트 (2026-11-20)
#   `overflow-x: clip`이 잘라 먹어서 눈에 안 보이던 결함까지 잡는다. 좌표를 직접 재므로
#   CSS만 읽어서는 알 수 없는 «카드 밖으로 밀림·표 단차·뱃지 줄바꿈·좌우 쏠림»을 배포 전에 막는다.
#   오탐 0건을 확인하며 기준을 좁힌 이유를 검사마다 적어 둔다.
LAYOUT_JS = r"""
() => {
  const out = {contain: [], table: [], badge: [], skew: []};
  const IGN = '#jc-marker-ui, #jc-imm-dock, .jca-panel';   /* 화면이 아니라 도구 상자·비서 시트 */
  const vis = el => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) < .05) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const tag = el => {
    const cn = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cn ? '.' + cn : '');
  };
  const px = v => parseFloat(v) || 0;

  /* ── ① 카드·섹션 안쪽에서 밀려난 입력칸·단추·글 — 컨테이너 경계 검사 ──────────────
     카드(배경·테두리 + 둥근 모서리 또는 card/panel/sheet/modal/box/tile 이름)를 찾아
     그 테두리 상자 밖으로 나간 것을 잡는다. 가로 스크롤 상자(overflow-x: auto|scroll)는
     설계상 밖으로 넘칠 수 있으므로 뺀다 — clip·hidden은 «가려서 안 보이는» 결함이라 반드시 잡는다. */
  const frameOf = el => {
    let n = el.parentElement, hop = 0;
    while (n && hop++ < 8) {
      if (n === document.body || n === document.documentElement) return null;
      const s = getComputedStyle(n);
      const hasBg = s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent';
      const hasBorder = px(s.borderTopWidth) > 0 || px(s.borderLeftWidth) > 0 || px(s.borderRightWidth) > 0;
      const radius = px(s.borderTopLeftRadius) > 0;
      const named = /(^|[-_])(card|panel|sheet|modal|dialog|tile|box)([-_]|$)/i.test((n.className || '') + ' ' + (n.id || ''));
      if ((hasBg || hasBorder) && (radius || named)) return n;
      n = n.parentElement;
    }
    return null;
  };
  const scrolled = (el, stop) => {
    let n = el.parentElement;
    while (n && n !== stop) {
      if (/(auto|scroll)/.test(getComputedStyle(n).overflowX)) return true;
      n = n.parentElement;
    }
    return false;
  };
  const CTRL = 'input:not([type=hidden]), select, textarea, button, .inp, .sel, [role=button]';
  const TEXT = 'p, h1, h2, h3, h4, li, dd, blockquote, .lead, .desc';
  document.querySelectorAll(CTRL + ',' + TEXT).forEach(el => {
    if (el.closest(IGN) || !vis(el)) return;
    const s = getComputedStyle(el);
    if (s.position === 'absolute' || s.position === 'fixed') return;
    const frame = frameOf(el);
    if (!frame) return;
    if (scrolled(el, frame)) return;
    if (/(auto|scroll)/.test(getComputedStyle(frame).overflowX)) return;
    const fr = frame.getBoundingClientRect(), r = el.getBoundingClientRect();
    const over = Math.max(r.right - fr.right, fr.left - r.left);
    if (over > 1.5) {
      out.contain.push({el: tag(el), frame: tag(frame), over: +over.toFixed(1),
                        text: (el.value || el.textContent || '').trim().slice(0, 20)});
    }
  });

  /* ── ② 표의 수평선·헤더 단차 ───────────────────────────────────────────────
     (가) 칸에 테두리를 그리는데 border-collapse가 collapse가 아니면 선이 두 겹이 되어 1px 단차가 난다.
     (나) 같은 줄(th/td)의 아래 끝이 1px 넘게 어긋나면 잡는다(rowspan이 섞인 줄은 높이가 다른 게 정상).
     (다) 나란히 놓인 표(3표)의 같은 번째 줄 수평선이 1px 넘게 어긋나면 잡는다 — 줄 수가 같을 때만.
     div로 만든 표(role=table)도 (다)로 함께 본다(fin-lab 3표처럼 <table>을 쓰지 않는 표). */
  document.querySelectorAll('table').forEach(t => {
    if (!vis(t) || t.closest(IGN)) return;
    const cs = getComputedStyle(t);
    const bordered = [...t.querySelectorAll('th,td')].some(c => {
      const s = getComputedStyle(c);
      return px(s.borderTopWidth) > 0 || px(s.borderBottomWidth) > 0;
    });
    if (bordered && cs.borderCollapse !== 'collapse') {
      out.table.push({kind: 'collapse 아님', table: tag(t)});
    }
    [...t.rows].forEach((row, ri) => {
      const cells = [...row.cells].filter(c => vis(c) && c.rowSpan === 1);
      if (cells.length < 2) return;
      if ([...row.cells].some(c => c.rowSpan > 1)) return;
      const bots = cells.map(c => c.getBoundingClientRect().bottom);
      const gap = Math.max(...bots) - Math.min(...bots);
      if (gap > 1) {
        out.table.push({kind: '칸 아래끝 단차', table: tag(t), row: ri, gap: +gap.toFixed(1),
                        cells: cells.map(c => c.textContent.trim().slice(0, 8)).slice(0, 5)});
      }
    });
  });

  /* (다) 나란한 표 — 같은 부모 아래 나란히 놓인 표끼리 같은 번째 줄의 아래끝을 견준다. */
  const rowLines = tb => (tb.tagName === 'TABLE'
    ? [...tb.rows].map(r => r.getBoundingClientRect().bottom)
    : [...tb.querySelectorAll('[role=row]')].map(r => r.getBoundingClientRect().bottom));
  const isTable = el => el.tagName === 'TABLE' || el.getAttribute('role') === 'table';
  document.querySelectorAll('table, [role=table]').forEach(t => {
    if (!vis(t) || t.closest(IGN)) return;
    const sibs = [...(t.parentElement ? t.parentElement.children : [])].filter(k => isTable(k) && vis(k));
    if (sibs.length < 2 || sibs[0] !== t) return;
    const base = rowLines(sibs[0]).map(y => Math.round(y));
    sibs.slice(1).forEach(other => {
      const rs = rowLines(other).map(y => Math.round(y));
      if (!base.length || rs.length !== base.length) return;
      const gap = Math.max(...rs.map((y, i) => Math.abs(y - base[i])));
      if (gap > 1) out.table.push({kind: '나란한 표의 줄 어긋남', table: tag(other), gap});
    });
  });

  /* ── ③ 짧은 뱃지·단계 번호 강제 줄바꿈 ────────────────────────────────────
     `1 / 4`·`2 / 4` 같은 짧은 표시가 두 줄로 쪼개지는 것을 잡는다. 요소의 높이가 아니라
     «이어진 글 한 덩어리»가 몇 줄로 그려졌는지로 잰다 — 44px 칩처럼 여백이 큰 상자도
     오탐이 없고, 단계 번호 <b>1</b>과 이름표가 위아래로 놓인 설계도 줄바꿈으로 보지 않는다. */
  document.querySelectorAll('.badge, .chip, .tag, .pill, .cnt, .step, .stage, [class*=badge], [class*=chip], [class*=tag], [class*=pill]').forEach(el => {
    if (el.closest(IGN) || !vis(el)) return;
    const text = (el.textContent || '').trim();
    if (!text || text.length > 8) return;
    const lh = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.3;
    let wrapped = 0;
    const walk = node => {
      node.childNodes.forEach(n => {
        if (n.nodeType === 3) {
          if (!n.textContent.trim()) return;
          const r = document.createRange(); r.selectNodeContents(n);
          const tops = [...r.getClientRects()].filter(q => q.width > 1 && q.height > 1).map(q => q.top).sort((a, b) => a - b);
          const lines = [];
          tops.forEach(t => { if (!lines.length || t - lines[lines.length - 1] > Math.max(4, lh * .6)) lines.push(t); });
          if (lines.length > wrapped) wrapped = lines.length;
        } else if (n.nodeType === 1 && !/^(block|flex|grid|table|list-item)/.test(getComputedStyle(n).display)) {
          walk(n);                              /* 인라인 자식만 따라 들어간다(블록 자식은 줄이 갈리는 게 정상) */
        }
      });
    };
    walk(el);
    if (wrapped > 1) out.badge.push({el: tag(el), text, lines: wrapped, h: Math.round(el.getBoundingClientRect().height)});
  });

  /* ── ④ 카드·모달 안 블록의 좌우 쏠림 ──────────────────────────────────────
     한 카드 안에서 **세로로 쌓인** 형제 블록의 좌·우 끝이 8px 넘게 어긋나면 잡는다.
     뺀 것(기준을 분명히):
       · 나란히 놓인 형제(위가 겹치는 줄)  · 가운데/오른쪽 정렬  · ul·ol(목록 들여쓰기는 정상)
       · 가로 스크롤 상자  · 음수 여백으로 일부러 내민 조각(전폭 띠)  · 카드 폭의 85% 미만인 좁은 조각
     */
  document.querySelectorAll('section, div, article, form, aside').forEach(frame => {
    if (frame.closest(IGN) || !vis(frame)) return;
    const fs = getComputedStyle(frame);
    const hasBg = fs.backgroundColor && fs.backgroundColor !== 'rgba(0, 0, 0, 0)' && fs.backgroundColor !== 'transparent';
    const hasBorder = px(fs.borderTopWidth) > 0 || px(fs.borderLeftWidth) > 0;
    const named = /(^|[-_])(card|panel|sheet|modal|tile|box)([-_]|$)/i.test((frame.className || '') + ' ' + (frame.id || ''));
    if (!(named || ((hasBg || hasBorder) && px(fs.borderTopLeftRadius) > 0))) return;
    if (/(auto|scroll)/.test(fs.overflowX)) return;
    const fr = frame.getBoundingClientRect();
    const rows = [];
    let prevBottom = -1e9;
    [...frame.children].forEach(k => {
      if (!vis(k)) return;
      const s = getComputedStyle(k);
      if (s.position === 'absolute' || s.position === 'fixed' || s.position === 'sticky') return;
      if (/(center|right|end)/.test(s.textAlign) || /(center|end|space-)/.test(s.justifyContent || '')) return;
      if (/^(UL|OL|TABLE|SVG|CANVAS|IMG|HR|BR|BUTTON|INPUT|SELECT|TEXTAREA|LABEL)$/.test(k.tagName)) return;
      if (/(auto|scroll)/.test(s.overflowX)) return;
      if (px(s.marginLeft) < 0 || px(s.marginRight) < 0) return;
      if (!(k.textContent || '').trim() && !k.querySelector('input,select,button')) return;
      const r = k.getBoundingClientRect();
      if (r.top < prevBottom - 2) return;
      prevBottom = r.bottom;
      if (r.width < fr.width * .85) return;
      rows.push({k, left: r.left, right: r.right});
    });
    if (rows.length < 2) return;
    const L = rows.map(x => x.left), R = rows.map(x => x.right);
    const dl = Math.max(...L) - Math.min(...L), dr = Math.max(...R) - Math.min(...R);
    if (dl > 8 || dr > 8) {
      out.skew.push({frame: tag(frame), dl: +dl.toFixed(1), dr: +dr.toFixed(1),
                     kids: rows.map(x => tag(x.k) + '@' + Math.round(x.left) + '/' + Math.round(x.right)).slice(0, 6)});
    }
  });
  return out;
}
"""

# ④ 3테마 명암 대비 — 텍스트 색과 (조상 배경을 차례로 합성한) 실제 배경의 WCAG 대비율.
#    큰 글씨(24px 이상 또는 굵은 18.66px 이상)는 3:1, 보통 글씨는 4.5:1.
#    11px 미만의 아주 작은 주석은 4:1까지 허용한다(표·그림 안의 미세 표기).
CONTRAST_JS = r"""
() => {
  /* 눈에 보이지 않는 글자는 재지 않는다.
     · 화면낭독기 전용(.sr·.sr-only 등)은 1px로 잘라 두므로 대비를 논할 수 없다(색이 배경과 같아 1:1로 잡힌다).
     · clip·clip-path로 잘라 둔 글자, 1px 이하로 접힌 글자, 화면 밖으로 밀어 둔 글자도 같은 이유로 뺀다. */
  const srOnly = el => {
    const cn = typeof el.className === 'string' ? el.className : '';
    if (/(^|\s)(sr|sr-only|screen-reader|visually-hidden)(\s|$)/.test(cn)) return true;
    const s = getComputedStyle(el);
    if ((s.clip || '').replace(/\s/g, '').match(/^rect\(0(px)?,0(px)?,0(px)?,0(px)?\)$/)) return true;
    if (/inset\(50%/.test(s.clipPath || '')) return true;
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) return true;
    if (r.right <= 1 || r.bottom <= 1 || r.left >= innerWidth - 1 || r.top >= innerHeight - 1) return true;
    return false;
  };
  const vis = el => { const s = getComputedStyle(el); if (s.display==='none'||s.visibility==='hidden') return false; if (srOnly(el)) return false; const r = el.getBoundingClientRect(); return r.width>0 && r.height>0; };
  const txt = el => Array.from(el.childNodes).some(n => n.nodeType===3 && n.textContent.trim().length>0);
  /* 계산된 색은 rgb()/rgba() 말고도 color(srgb r g b / a) 꼴로 올 수 있다(color-mix 결과). 둘 다 읽는다. */
  const parse = c => {
    let m = c.match(/rgba?\(([^)]+)\)/);
    if (m) { const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number); return {r:p[0], g:p[1], b:p[2], a:p.length>3?p[3]:1}; }
    m = c.match(/color\(srgb\s+([^)]+)\)/);
    if (m) { const p = m[1].split(/[\s\/]+/).filter(Boolean).map(Number); return {r:p[0]*255, g:p[1]*255, b:p[2]*255, a:p.length>3?p[3]:1}; }
    return null;
  };
  const L = c => { const f=v=>{v/=255; return v<=.03928? v/12.92 : Math.pow((v+.055)/1.055,2.4)}; return .2126*f(c.r)+.7152*f(c.g)+.0722*f(c.b); };
  const over = (f,b) => ({r:f.r*f.a+b.r*(1-f.a), g:f.g*f.a+b.g*(1-f.a), b:f.b*f.a+b.b*(1-f.a), a:1});
  const bgOf = el => {
    let n = el, acc = null;
    while (n && n.nodeType===1) {
      const s = getComputedStyle(n);
      const c = parse(s.backgroundColor);
      if (c && c.a > 0) { acc = acc ? over(acc, c) : c; if (acc.a >= .999) return acc; }
      /* 바탕색이 전혀 없는 채로 그림·그라데이션만 깔린 자리(사진 위 글자)는 잴 수 없다 */
      if (!acc && s.backgroundImage && s.backgroundImage !== 'none') return null;
      n = n.parentElement;
    }
    return acc || {r:255,g:255,b:255,a:1};
  };
  const out = [];
  let n = 0;
  for (const el of document.querySelectorAll('h1,h2,h3,h4,p,li,a,button,label,th,td,dt,dd,small,span,strong,em')) {
    if (n++ > 900) break;
    if (!vis(el) || !txt(el) || el.closest('[aria-hidden="true"], [hidden]')) continue;
    const s = getComputedStyle(el);
    if (parseFloat(s.opacity) < .55) continue;
    if (s.textDecorationLine.indexOf('line-through') >= 0) continue;
    /* 다른 층(가림막·덮개)에 덮여 실제로는 안 보이는 글자는 재지 않는다 */
    const rr = el.getBoundingClientRect();
    const hit = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, (rr.left + rr.right) / 2)), Math.min(innerHeight - 1, Math.max(0, (rr.top + rr.bottom) / 2)));
    if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) continue;
    const fg = parse(s.color); if (!fg) continue;
    const bg = bgOf(el); if (!bg) continue;
    const c = over(fg, bg), l1 = L(c), l2 = L(bg);
    const ratio = (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);
    const size = parseFloat(s.fontSize), bold = parseInt(s.fontWeight,10) >= 700;
    let need = (size >= 24 || (bold && size >= 18.66)) ? 3 : 4.5;
    if (size < 11) need = 4;
    if (ratio < need - .3) out.push({el:(el.id||el.className||el.tagName).toString().slice(0,36), ratio:+ratio.toFixed(2), need, size:+size.toFixed(1), text:el.textContent.trim().slice(0,16)});
  }
  return out;
}
"""

THEMES = [("밝게", "light", ""), ("세피아", "light", "sepia"), ("어둡게", "dark", "")]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve():
    handler = functools.partial(QuietHandler, directory=ROOT)
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f"http://127.0.0.1:{httpd.server_address[1]}/"


def external(url, base):
    return bool(url) and not url.startswith(base)


# ⑦ 비서 3탭 — 지금 보이는 탭 내용의 넘침·삐져나옴·조작부 크기·탭 정렬을 잰다.
TAB_JS = r"""
() => {
  const probs = [];
  const panel = document.querySelector('.jca-panel');
  if (!panel) return ['비서 시트가 없다'];
  const pr = panel.getBoundingClientRect();
  const panes = ['.jca-chat', '.jca-find', '.jca-keys-pane']
    .map(s => document.querySelector(s)).filter(p => p && !p.hidden && p.offsetParent !== null);
  if (!panes.length) return ['보이는 탭 내용이 없다'];
  panes.forEach(p => {
    if (p.scrollWidth > p.clientWidth + 1) probs.push('가로 넘침 ' + (p.scrollWidth - p.clientWidth) + 'px');
    p.querySelectorAll('button, textarea, input[type="text"], input[type="search"], input[type="password"], input:not([type]), a.jca-btn, .jca-chip').forEach(el => {
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') return;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      if (r.right > pr.right + .5) probs.push('시트 오른쪽 밖으로 삐져나옴: ' + (el.className || el.tagName));
      if (r.left < pr.left - .5) probs.push('시트 왼쪽 밖으로 삐져나옴: ' + (el.className || el.tagName));
      if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && r.height < 43.5) probs.push('입력칸 높이 ' + Math.round(r.height) + 'px ' + (el.className || el.tagName));
    });
  });
  const tabs = [...document.querySelectorAll('.jca-tab')];
  const hs = tabs.map(t => t.getBoundingClientRect().height);
  if (hs.length !== 3) probs.push('탭이 3개가 아니다: ' + hs.length);
  if (hs.length && (Math.max(...hs) - Math.min(...hs) > 1.5 || Math.min(...hs) < 43.5)) probs.push('탭 높이 ' + hs.map(h => Math.round(h)).join('/'));
  tabs.forEach(t => {
    const r = t.getBoundingClientRect();
    const range = document.createRange(); range.selectNodeContents(t);
    const tr = range.getBoundingClientRect();
    if (tr.width && Math.abs((tr.left + tr.right) / 2 - (r.left + r.right) / 2) > 2.5) probs.push('탭 글자 가로 어긋남: ' + t.textContent.trim());
  });
  return probs;
}
"""


def check_flow(page):
    """27번 — 첫 자료를 고르고 가지를 두 번 이어, 흐름·후보·제한 안내가 실제로 도는지 잰다."""
    issues = []
    try:
        page.locator("#kws .kw").first.click(timeout=4000)
        page.wait_for_timeout(200)
        if page.locator("#starts .pick").count() < 1:
            issues.append("27번 — 키워드를 골랐는데 첫 자료 카드가 없다")
            return issues
        page.locator("#starts .pick-go").first.click(timeout=4000)
        page.wait_for_timeout(300)
        if page.locator("#chain .node").count() != 1:
            issues.append("27번 — 첫 자료를 골랐는데 흐름이 시작되지 않았다")
        for _ in range(2):
            page.locator("#cands .cand .c-add").first.click(timeout=4000)
            page.wait_for_timeout(220)
        nodes = page.locator("#chain .node").count()
        if nodes != 3:
            issues.append(f"27번 — 가지를 두 번 이었는데 흐름이 {nodes}개다(3개여야 한다)")
        if page.locator("#cands .cand").count() < 1:
            issues.append("27번 — 다음 가지(후보)가 하나도 없다")
        if not page.locator("#cover").inner_text().strip():
            issues.append("27번 — 흐름 요약(덮는 범위)이 비어 있다")
        page.locator("#makeBtn").click(timeout=4000)
        page.wait_for_timeout(260)
        if not page.locator("#sheet").is_visible():
            issues.append("27번 — 「이대로 만들어볼래요」를 눌렀는데 덱 시트가 열리지 않았다")
        else:
            page.locator("#sheetX").click()
            page.wait_for_timeout(180)
    except Exception as exc:                        # noqa: BLE001 — 실패 사유를 그대로 보여 준다
        issues.append(f"27번 조작 검수 실패: {str(exc).splitlines()[0][:110]}")
    return issues


def check_mydeck(page):
    """마이덱 — 비로그인은 로그인 게이트만, 로그인은 공간 꾸미기 6요소×6조건과 즉시 반영을 잰다."""
    issues = []
    try:
        auth = page.evaluate("() => document.documentElement.getAttribute('data-jc-auth')")
        gate_on = page.evaluate("() => { const g = document.getElementById('deckGate');"
                                " return !!g && !g.hidden && getComputedStyle(g).display !== 'none'; }")
        if auth != 'in' or gate_on:
            # 비로그인 — 마이덱 기능이 하나도 닿지 않아야 하고, 게이트의 두 단추는 실제로 눌려야 한다.
            if not gate_on:
                issues.append("마이덱 — 비로그인인데 로그인 게이트가 보이지 않는다")
                return issues
            for sel, what in (("#deckGate [data-jc-login]", "로그인"), ("#deckGate a[href='../']", "홈으로 돌아가기")):
                box = page.locator(sel).first.bounding_box()
                if not box or box["height"] < 43.5 or box["width"] < 43.5:
                    issues.append(f"마이덱 — 게이트의 「{what}」 단추가 44px보다 작다({box})")
            for sel, what in (("#deckMain", "마이덱 본문"), ("#diy", "공간 꾸미기"), ("#live", "마이덱 라이브")):
                if page.locator(sel).first.is_visible():
                    issues.append(f"마이덱 — 비로그인인데 「{what}」가 보인다")
            if page.locator("#diyBtn").is_visible():
                issues.append("마이덱 — 비로그인인데 「공간 꾸미기」 단추가 보인다")
            if page.locator("#sheet").is_visible():
                issues.append("마이덱 — 비로그인인데 설명 시트가 열려 있다")
            return issues

        page.locator("#diyBtn").click(timeout=4000)
        page.wait_for_timeout(260)
        if not page.locator("#diy").is_visible():
            issues.append("마이덱 — 「공간 꾸미기」가 열리지 않았다")
            return issues
        groups = page.locator("#diyBody .diy-grp")
        if groups.count() != 6:
            issues.append(f"마이덱 — 꾸밀 요소가 6가지가 아니다({groups.count()})")
        for i in range(min(6, groups.count())):
            n = groups.nth(i).locator(".opt").count()
            if n != 6:
                issues.append(f"마이덱 — {i + 1}번째 요소의 조건이 6가지가 아니다({n})")
        before = page.evaluate("() => document.getElementById('space').getAttribute('data-diy-bg')")
        groups.nth(0).locator(".opt").nth(4).click(timeout=4000)
        page.wait_for_timeout(220)
        after = page.evaluate("() => document.getElementById('space').getAttribute('data-diy-bg')")
        if before == after:
            issues.append(f"마이덱 — 배경을 골랐는데 공간이 바뀌지 않았다({before})")
        if page.locator("#diyTabs button").count() != 3:
            issues.append("마이덱 — 테마 탭이 3개(밝게·세피아·어둡게)가 아니다")
    except Exception as exc:                        # noqa: BLE001
        issues.append(f"마이덱 조작 검수 실패: {str(exc).splitlines()[0][:110]}")
    return issues


def check_panels(page):
    """⑤ 시트 잘림 · ⑦ 비서 3탭 실제 클릭 검수.

    비서 시트를 정말로 열어 「대화」「찾기」「내 키」를 차례로 눌러 보고,
    보이는 내용의 가로 넘침·시트 밖 삐져나옴·탭 높이/글자 정렬을 잰다.
    도구함(형광펜·포스트잇) 시트도 열어 화면 밖으로 잘리지 않는지 잰다.
    로그인 뒤 화면은 시험 계정이 없으면 잴 수 없으므로, 로그인 전 화면을 잰다.
    """
    issues = []
    vw, vh = page.evaluate("() => [innerWidth, innerHeight]")

    def inside(rect, what):
        if not rect:
            return
        left, top, right, bottom = rect[:4]
        if right > vw + .5 or bottom > vh + .5 or left < -.5 or top < -.5:
            over_w, over_h = max(0, right - vw), max(0, bottom - vh)
            issues.append(f"{what}가 화면 밖으로 잘린다(오른쪽 {over_w:.0f}px · 아래 {over_h:.0f}px)")

    launch = page.locator(".jca-launch")
    if launch.count():
        try:
            launch.click(timeout=5000)
            page.wait_for_timeout(420)
            panel = page.evaluate(
                "() => { const p = document.querySelector('.jca-panel'); if (!p) return null;"
                " const r = p.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom, p.clientWidth, p.scrollWidth]; }")
            if not panel:
                issues.append("비서 시트가 열리지 않았다")
            else:
                inside(panel, "비서 시트")
                if panel[5] > panel[4] + 1:
                    issues.append(f"비서 시트 가로 넘침 {panel[5] - panel[4]}px")
                for tab in ("대화", "찾기", "내 키"):
                    page.click(f'.jca-tab:has-text("{tab}")', timeout=4000)
                    page.wait_for_timeout(260)
                    for problem in page.evaluate(TAB_JS):
                        issues.append(f"비서 «{tab}» — {problem}")
                page.keyboard.press("Escape")
                page.wait_for_timeout(260)
        except Exception as exc:                     # noqa: BLE001 — 실패 사유를 그대로 보여 준다
            issues.append(f"비서 시트 검수 실패: {str(exc).splitlines()[0][:110]}")

    try:
        page.evaluate("() => { const h = document.querySelector('#jc-marker-ui');"
                      " const f = h && h.shadowRoot && h.shadowRoot.getElementById('fab'); if (f) f.click(); }")
        page.wait_for_timeout(320)
        rect = page.evaluate(
            "() => { const h = document.querySelector('#jc-marker-ui'); const s = h && h.shadowRoot;"
            " const p = s && s.getElementById('panel'); if (!p || p.hidden) return null;"
            " const r = p.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }")
        inside(rect, "도구함 시트")
        page.evaluate("() => { const h = document.querySelector('#jc-marker-ui');"
                      " const f = h && h.shadowRoot && h.shadowRoot.getElementById('fab'); if (f) f.click(); }")
        page.wait_for_timeout(200)
    except Exception:                                # 도구함이 없는 화면도 있다
        pass
    return issues


def sector_pages():
    """`assets/tools.js`(JC_TOOLS) 장부 + `폴더/index.html`에서 섹터 화면 목록을 만든다.

    섹터를 손으로 세지 않는다 — 새 섹터를 장부에 올리면 다음 실행부터 자동으로 재진다.
    화면이 아닌 폴더(NON_SCREEN)는 이유와 함께 빼고, 장부에 있는데 폴더가 없으면 그건 결함이다.
    """
    import re
    ledger = os.path.join(ROOT, "assets", "tools.js")
    listed = []
    if os.path.exists(ledger):
        with open(ledger, encoding="utf-8") as fh:
            listed = sorted(set(re.findall(r"path:'\./([a-z0-9-]+)/'", fh.read())))
    founded = sorted(name for name in os.listdir(ROOT)
                     if not name.startswith(".") and name not in NON_SCREEN
                     and os.path.isdir(os.path.join(ROOT, name))
                     and os.path.exists(os.path.join(ROOT, name, "index.html")))
    return listed, founded


def check_page_coverage(pages, sweep):
    """어느 섹터도 «재지 않는 화면»으로 남지 않았는가.

    화면마다 두 단계가 있다.
      · PAGES — 콘솔·404·44px·대비·겹침까지 전부 잰다
      · 기초 배치 스위프(SWEEP) — 기초 배치 4종(카드 이탈·표 단차·뱃지 줄바꿈·좌우 쏠림)만 잰다
    둘 중 어디에도 없는 섹터가 있으면 실패한다(새 섹터를 만들고 게이트에 안 넣는 일을 막는다).
    장부에 있는 섹터의 폴더·index.html이 없으면 그것도 실패다(대문에서 눌러도 열리지 않는 화면).
    """
    issues = []
    covered = set()
    for path in list(pages) + list(sweep):
        covered.add(path.split("?")[0].split("#")[0].rstrip("/") + "/")
    listed, founded = sector_pages()
    if not listed:
        issues.append("assets/tools.js에서 섹터 장부를 읽지 못했다 — 목록 점검을 조용히 건너뛰지 않는다")
    for name in listed:
        if name not in founded:
            issues.append(f"섹터 «{name}»가 장부에 있는데 화면(/{name}/index.html)이 없다")
        if f"/{name}/" not in covered:
            issues.append(f"섹터 «{name}»를 재는 목록(PAGES·스위프)에 넣지 않았다")
    for name in founded:
        if f"/{name}/" not in covered:
            issues.append(f"화면 «/{name}/»가 어느 목록에도 없다 — 재지 않는 화면이 생기지 않게 넣는다")
    return issues


def layout_issues(lay):
    """LAYOUT_JS가 돌려준 네 가지 결함을 사람이 읽을 문장으로 바꾼다."""
    issues = []
    for item in lay["contain"][:3]:
        issues.append(f"카드 밖으로 밀림 {item['over']}px: {item['el']} (카드 {item['frame']}, «{item['text']}»)")
    if len(lay["contain"]) > 3:
        issues.append(f"카드 밖으로 밀린 요소 {len(lay['contain'])}곳")
    for item in lay["table"][:3]:
        if item.get("kind") == "collapse 아님":
            issues.append(f"표 테두리 겹침 — border-collapse: collapse가 아니다: {item['table']}")
        elif item.get("kind") == "나란한 표의 줄 어긋남":
            issues.append(f"나란히 놓인 표의 같은 줄이 {item['gap']}px 어긋남: {item['table']}")
        else:
            issues.append(f"표 칸 아래끝 단차 {item['gap']}px({item['row'] + 1}번째 줄): {item['table']} — {' / '.join(item['cells'])}")
    if len(lay["table"]) > 3:
        issues.append(f"표 단차 {len(lay['table'])}곳")
    for item in lay["badge"][:3]:
        issues.append(f"짧은 뱃지가 {item['lines']}줄로 쪼개짐(«{item['text']}», {item['h']}px): {item['el']}")
    if len(lay["badge"]) > 3:
        issues.append(f"뱃지 줄바꿈 {len(lay['badge'])}곳")
    for item in lay["skew"][:3]:
        issues.append(f"카드 안 좌우 쏠림 {item['dl']}px/{item['dr']}px: {item['frame']} — {' | '.join(item['kids'])}")
    if len(lay["skew"]) > 3:
        issues.append(f"좌우 쏠림 {len(lay['skew'])}곳")
    return issues


def run_sweep(browser, base, pages, args, results):
    """전 섹터 기초 배치 스위프 — 이번에 새로 넣은 기초 배치 4종만 전 섹터에 건다.

    PAGES의 화면은 본 검사에서 이미 네 가지를 다 쟀으므로 뺀다. 오래된 섹터에는 44px 미달·대비
    같은 «이번 변경과 무관한» 결함이 남아 있어(2026-11-20 실측) 그것까지 한꺼번에 켜면 CI가
    이유 없이 서므로, 새 게이트만 넓게 걸어 숨은 기초 결함을 찾는다. 넷 다 전 섹터 오탐 0건을
    확인하고 켰다(카드 밖 밀림·표 단차·뱃지 줄바꿈·좌우 쏠림).
    """
    caught = 0
    for page_path in pages:
        for width, height, _kind in VIEWPORTS:
            context = browser.new_context(viewport={"width": width, "height": height})
            page = context.new_page()
            try:
                page.goto(base + page_path.lstrip("/"), wait_until="domcontentloaded", timeout=45000)
                page.wait_for_timeout(args.sweep_settle)
                issues = layout_issues(page.evaluate(LAYOUT_JS))
            except Exception as exc:                      # noqa: BLE001 — 실패 사유를 그대로 보여 준다
                issues = [f"화면 열기 실패: {str(exc).splitlines()[0][:120]}"]
            if issues:
                caught += 1
                if args.shot_dir:
                    os.makedirs(args.shot_dir, exist_ok=True)
                    name = page_path.strip("/").replace("/", "-") or "home"
                    try:
                        page.screenshot(path=os.path.join(args.shot_dir, f"{name}-{width}-layout.png"))
                    except Exception:                     # noqa: BLE001
                        pass
            results.append((page_path, f"{width}×{height} · 배치", issues, "기초 배치 스위프"))
            context.close()
    return caught


def run(args):
    from playwright.sync_api import sync_playwright  # 게이트에서만 쓰는 의존성

    httpd = None
    if args.base:
        base = args.base if args.base.endswith("/") else args.base + "/"
    else:
        httpd, base = serve()

    listed, founded = sector_pages()
    sweep = [] if args.sweep is False else [f"/{name}/" for name in sorted(set(listed) | set(founded))]
    sweep = [p for p in sweep if p not in set(args.pages)]

    results = []   # (page, viewport, 문제 목록, 참고 상세)
    if args.coverage:
        missing = check_page_coverage(args.pages, sweep)
        results.append(("(섹터 목록)", "-", missing, "" if not missing else f"{len(missing)}개 빠짐"))
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            for page_path in args.pages:
                for width, height, kind in VIEWPORTS:
                    context = browser.new_context(viewport={"width": width, "height": height})
                    page = context.new_page()
                    issues, console_errors, broken_assets = [], [], []

                    page.on("pageerror", lambda err: console_errors.append(f"페이지 오류: {str(err)[:160]}"))

                    def on_console(message, _page=page):
                        if message.type != "error":
                            return
                        location = (message.location or {}).get("url", "")
                        if external(location, base):
                            return          # 외부 CDN·글꼴 사정은 사이트 회귀로 보지 않는다
                        console_errors.append(f"콘솔 오류: {message.text[:160]}")

                    page.on("console", on_console)

                    def on_response(response):
                        # 브라우저가 저절로 찾는 favicon은 사이트 회귀가 아니므로 뺀다.
                        if response.url.rstrip('/').endswith('/favicon.ico'):
                            return
                        if response.url.startswith(base) and response.status >= 400:
                            broken_assets.append(f"{response.status} {response.url[len(base) - 1:][:80]}")

                    page.on("response", on_response)

                    url = base + page_path.lstrip("/")
                    try:
                        page.goto(url, wait_until="domcontentloaded", timeout=45000)
                    except Exception as exc:                       # noqa: BLE001 — 실패 사유를 그대로 보여 준다
                        issues.append(f"화면 열기 실패: {str(exc).splitlines()[0][:120]}")
                        results.append((page_path, f"{width}×{height}", issues, ""))
                        context.close()
                        continue

                    page.wait_for_timeout(args.settle)
                    measured = page.evaluate(MEASURE)
                    probe = page.evaluate(PROBES.get(page_path, GENERIC_PROBE))

                    if console_errors:
                        issues.extend(console_errors[:4])
                    if broken_assets:
                        issues.append("404: " + ", ".join(sorted(set(broken_assets))[:4]))
                    if measured["overflow"] > 1:
                        issues.append(f"가로 넘침 {measured['overflow']}px")
                    if measured["smallCount"]:
                        issues.append(f"44px 미달 {measured['smallCount']}개 — " + " | ".join(measured["small"][:4]))
                    if not probe["ok"]:
                        issues.append(f"화면이 그려지지 않았다 — {probe['detail']}")

                    # ---- 7종 기초 결함 게이트 (②③⑥ + ④ 3테마) ----
                    ui = page.evaluate(UI_JS)
                    for item in ui["center"][:3]:
                        issues.append(f"단추 글자가 정중앙이 아니다({item['dx']}px·{item['dy']}px): {item['text']}")
                    if len(ui["center"]) > 3:
                        issues.append(f"단추 글자 정렬 어긋남 {len(ui['center'])}곳")
                    for item in ui["size"][:3]:
                        issues.append(f"한 줄 단추 높이/패딩 불일치 {item['heights']} {item['pads']}: {' / '.join(item['texts'])}")
                    if len(ui["size"]) > 3:
                        issues.append(f"형제 단추 크기 불일치 {len(ui['size'])}줄")
                    for item in ui["overlap"][:3]:
                        issues.append(f"요소 {item['kind']}({item.get('ox', item.get('gap'))}px): {item['a']} ↔ {item['b']}")
                    if len(ui["overlap"]) > 3:
                        issues.append(f"겹침·밀착 {len(ui['overlap'])}곳")

                    # ---- 기초 배치 4종 (카드 이탈 · 표 단차 · 뱃지 줄바꿈 · 좌우 쏠림) ----
                    issues.extend(layout_issues(page.evaluate(LAYOUT_JS)))

                    # ---- ⑤ 시트 잘림 · ⑦ 비서 3탭 클릭 검수 (비서가 있는 대문에서) ----
                    if page_path == "/":
                        issues.extend(check_panels(page))
                    if page_path == "/flow/":
                        issues.extend(check_flow(page))
                    if page_path == "/mydeck/":
                        issues.extend(check_mydeck(page))

                    # ---- ④ 3테마 대비: 테마는 저장값으로 바꿔 **다시 열어** 잰다 ----
                    #   요소의 data-theme만 바꾸면 페이지 쪽 코드가 곧 되돌려 실제 화면과 다르게 잰다.
                    #   사용자가 테마를 고를 때와 같은 길(localStorage)로 바꾸고 새로 연다.
                    saved_theme = page.evaluate(
                        "() => [localStorage.getItem('jc-theme'), localStorage.getItem('jc-tone')]")
                    for label, theme, tone in THEMES:
                        page.evaluate(
                            "([t, n]) => { localStorage.setItem('jc-theme', t);"
                            " if (n) localStorage.setItem('jc-tone', n); else localStorage.removeItem('jc-tone'); }",
                            [theme, tone])
                        try:
                            page.reload(wait_until="domcontentloaded", timeout=45000)
                        except Exception:                       # noqa: BLE001
                            issues.append(f"{label} 테마로 다시 열지 못했다")
                            continue
                        page.wait_for_timeout(1600)
                        bad = page.evaluate(CONTRAST_JS)
                        for item in bad[:2]:
                            issues.append(f"{label} 테마 대비 {item['ratio']}:1 (기준 {item['need']}:1, {item['size']}px) — {item['text']}")
                        if len(bad) > 2:
                            issues.append(f"{label} 테마 대비 미달 {len(bad)}곳")
                    page.evaluate(
                        "([t, n]) => { if (t) localStorage.setItem('jc-theme', t); else localStorage.removeItem('jc-theme');"
                        " if (n) localStorage.setItem('jc-tone', n); else localStorage.removeItem('jc-tone'); }", saved_theme)

                    if issues and args.shot_dir:
                        os.makedirs(args.shot_dir, exist_ok=True)
                        name = page_path.strip("/").replace("/", "-") or "home"
                        page.screenshot(path=os.path.join(args.shot_dir, f"{name}-{width}.png"), full_page=False)

                    results.append((page_path, f"{width}×{height}", issues, probe["detail"]))
                    context.close()
            if sweep:
                run_sweep(browser, base, sweep, args, results)
            browser.close()
    finally:
        if httpd:
            httpd.shutdown()

    print("=" * 72)
    failed = 0
    swept = []
    for page_path, viewport, issues, detail in results:
        if viewport.endswith("· 배치"):
            swept.append((page_path, viewport, issues))
            if issues:
                failed += 1
            continue
        state = "✗" if issues else "✓"
        if issues:
            failed += 1
        print(f"{state} {page_path} {viewport}  {detail}")
        for issue in issues:
            print(f"    - {issue}")
    if swept:
        bad = [row for row in swept if row[2]]
        print(f"{'✗' if bad else '✓'} 기초 배치 스위프(전 섹터) — {len(swept)}회(화면×폭) · 걸린 곳 {len(bad)}")
        for page_path, viewport, issues in bad[:12]:
            print(f"  ✗ {page_path} {viewport}")
            for issue in issues[:4]:
                print(f"      - {issue}")
    print("-" * 72)
    print("✓ 실화면 스모크 통과" if not failed else f"✗ 기준을 넘은 조합 {failed}곳 — 위 항목을 고친 뒤 다시 잰다")

    if args.summary_file:
        lines = ["## 실화면 스모크 (대문·브리핑·신산업)", "",
                 "| 화면 | 화면 폭 | 결과 | 잰 것 |", "|---|---|---|---|"]
        swept = [(p, v, i) for p, v, i, _d in results if v.endswith("· 배치")]
        for page_path, viewport, issues, detail in results:
            if viewport.endswith("· 배치"):
                continue
            verdict = "✗ " + issues[0] if issues else "✓ 통과"
            lines.append(f"| `{page_path}` | {viewport} | {verdict} | {detail} |")
        if swept:
            bad = [row for row in swept if row[2]]
            lines.append(f"| (전 섹터 기초 배치 스위프) | {len(swept)}회 | "
                         f"{'✗ 걸린 곳 ' + str(len(bad)) if bad else '✓ 통과'} | 카드 이탈·표 단차·뱃지 줄바꿈·좌우 쏠림 |")
        lines.append("")
        lines.append("**모두 통과**" if not failed else f"**기준 초과 {failed}곳**")
        with open(args.summary_file, "a", encoding="utf-8") as fh:
            fh.write("\n".join(lines) + "\n")

    # 비서 검색 회귀 — 같은 게이트에서 같이 돈다(약어·쓰다 만 앞부분·선참조 지도).
    # 별도 워크플로 단계를 둘 수 없는 환경(워크플로 수정 권한 없음)에서도 매번 검사되게 여기에 붙였다.
    if args.assistant:
        failed += run_assistant_checks(args)
        print("✓ 비서 검색 회귀 통과" if not failed else "✗ 비서 검색 회귀 실패 — 위 항목을 고친 뒤 다시 잰다")

    return 1 if failed else 0


def run_assistant_checks(args):
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    try:
        import assistant_search_test as ast
        fails = ast.check_files()
        rows = []
        if not fails:
            extra, rows = ast.run_cases()
            fails += extra
    except Exception as e:            # 브라우저·모듈을 못 띄우면 실패로 남긴다(조용히 건너뛰지 않는다)
        fails, rows = [f"비서 검색 검사를 돌리지 못했습니다: {e}"], []
    print("-" * 72)
    print(f"비서 검색 회귀 — {len(rows)}질문 · 실패 {len(fails)}건")
    for f in fails:
        print("    - " + f)
    if args.summary_file:
        lines = ["", "## 비서 검색 회귀 (약어·선참조)", "", "| 질문 | 선참조 후보 섹터 | 첫 결과 |", "|---|---|---|"]
        for q, route, top in rows:
            lines.append(f"| {q} | {route} | {top} |")
        lines.append("")
        lines.append("**통과**" if not fails else f"**실패 {len(fails)}건**")
        for f in fails:
            lines.append("- ✗ " + f)
        with open(args.summary_file, "a", encoding="utf-8") as fh:
            fh.write("\n".join(lines) + "\n")
    return len(fails)


def main():
    parser = argparse.ArgumentParser(description="자료실 실화면 스모크")
    parser.add_argument("--base", help="검사할 주소(없으면 저장소를 로컬 정적 서버로 띄운다)")
    parser.add_argument("--pages", default=",".join(PAGES), help="쉼표로 구분한 경로")
    parser.add_argument("--settle", type=int, default=2500, help="화면이 그려질 때까지 기다리는 ms")
    parser.add_argument("--shot-dir", help="실패한 화면 그림을 남길 폴더")
    parser.add_argument("--summary-file", help="GitHub Actions Job Summary 파일 경로")
    parser.add_argument("--assistant", dest="assistant", action="store_true", default=True,
                        help="비서 검색 회귀도 함께 잰다(기본 켜짐)")
    parser.add_argument("--no-assistant", dest="assistant", action="store_false",
                        help="비서 검색 회귀를 건너뛴다")
    parser.add_argument("--no-coverage", dest="coverage", action="store_false", default=True,
                        help="섹터 목록 점검(재지 않는 화면이 남았는지)을 건너뛴다")
    parser.add_argument("--no-sweep", dest="sweep", action="store_false", default=True,
                        help="전 섹터 기초 배치 스위프를 건너뛴다(빠른 확인용)")
    parser.add_argument("--sweep-settle", type=int, default=2200,
                        help="스위프에서 화면이 그려질 때까지 기다리는 ms")
    args = parser.parse_args()
    args.pages = [p.strip() for p in args.pages.split(",") if p.strip()]
    return run(args)


if __name__ == "__main__":
    sys.exit(main())
