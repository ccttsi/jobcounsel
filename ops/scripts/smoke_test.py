#!/usr/bin/env python3
"""실화면 스모크 — CI 게이트의 Playwright 검사 (1순위)

  python3 ops/scripts/smoke_test.py                       # 저장소를 로컬 정적 서버로 띄워 잰다
  python3 ops/scripts/smoke_test.py --base https://ccttsi.github.io/jobcounsel/
  python3 ops/scripts/smoke_test.py --summary-file "$GITHUB_STEP_SUMMARY"

재는 화면: 대문(/), 브리핑(/briefing/), 신산업(/emerging/), 산업 온도계(/thermometer/), 내담자 언어 번역기(/translator/), 채용 사이트 안내판(/portals/ · ?q= 검색) — 휴대폰 390·데스크톱 1280
재는 것
  · 콘솔·페이지 오류 0 (외부 CDN에서 온 오류는 제외 — 그쪽 사정으로 게이트가 흔들리지 않게)
  · 같은 사이트 안의 404 응답 0 (깨진 상대경로를 잡는다)
  · 문서 가로 넘침 0px
  · 44px 터치 미달 0개 (글 안의 인라인 링크는 제외)
  · 화면이 실제로 그려졌는가(섹터 장부·카드·기사) — JS가 죽으면 0이 되어 잡힌다

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

PAGES = ["/", "/briefing/", "/emerging/", "/thermometer/", "/translator/", "/portals/", "/portals/?q=gosi"]
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
    "/emerging/": """() => {
        const art = (document.querySelector('#art') || {innerText: ''}).innerText.trim().length;
        const chips = document.querySelectorAll('[data-sector]').length;
        const broken = /불러오지 못했습니다|이 날의 지면이 없습니다/.test(document.body.innerText);
        return {ok: art >= 100 && chips >= 1 && !broken, detail: `기사 본문 ${art}자 · 분류 칩 ${chips}${broken ? ' · 지면 없음' : ''}`};
    }""",
}

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

# ④ 3테마 명암 대비 — 텍스트 색과 (조상 배경을 차례로 합성한) 실제 배경의 WCAG 대비율.
#    큰 글씨(24px 이상 또는 굵은 18.66px 이상)는 3:1, 보통 글씨는 4.5:1.
#    11px 미만의 아주 작은 주석은 4:1까지 허용한다(표·그림 안의 미세 표기).
CONTRAST_JS = r"""
() => {
  const vis = el => { const s = getComputedStyle(el); if (s.display==='none'||s.visibility==='hidden') return false; const r = el.getBoundingClientRect(); return r.width>0 && r.height>0; };
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


def run(args):
    from playwright.sync_api import sync_playwright  # 게이트에서만 쓰는 의존성

    httpd = None
    if args.base:
        base = args.base if args.base.endswith("/") else args.base + "/"
    else:
        httpd, base = serve()

    results = []   # (page, viewport, 문제 목록, 참고 상세)
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
                    probe = page.evaluate(PROBES.get(page_path, "() => ({ok: true, detail: ''})"))

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

                    # ---- ⑤ 시트 잘림 · ⑦ 비서 3탭 클릭 검수 (비서가 있는 대문에서) ----
                    if page_path == "/":
                        issues.extend(check_panels(page))

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
            browser.close()
    finally:
        if httpd:
            httpd.shutdown()

    print("=" * 72)
    failed = 0
    for page_path, viewport, issues, detail in results:
        state = "✗" if issues else "✓"
        if issues:
            failed += 1
        print(f"{state} {page_path} {viewport}  {detail}")
        for issue in issues:
            print(f"    - {issue}")
    print("-" * 72)
    print("✓ 실화면 스모크 통과" if not failed else f"✗ 기준을 넘은 조합 {failed}곳 — 위 항목을 고친 뒤 다시 잰다")

    if args.summary_file:
        lines = ["## 실화면 스모크 (대문·브리핑·신산업)", "",
                 "| 화면 | 화면 폭 | 결과 | 잰 것 |", "|---|---|---|---|"]
        for page_path, viewport, issues, detail in results:
            verdict = "✗ " + issues[0] if issues else "✓ 통과"
            lines.append(f"| `{page_path}` | {viewport} | {verdict} | {detail} |")
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
    args = parser.parse_args()
    args.pages = [p.strip() for p in args.pages.split(",") if p.strip()]
    return run(args)


if __name__ == "__main__":
    sys.exit(main())
