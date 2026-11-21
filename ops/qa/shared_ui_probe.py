#!/usr/bin/env python3
"""공통 UI·모션 실증 — «한 지면에서만 확인하고 끝내는» 결함을 화면에서 재는 도구 (2026-11-22).

  python3 ops/qa/shared_ui_probe.py                      # 저장소를 로컬 서버로 띄워 모든 사례
  python3 ops/qa/shared_ui_probe.py --only anchor        # 한 종류만(anchor · idle · shell)
  python3 ops/qa/shared_ui_probe.py --base https://witw.pages.dev/
  python3 ops/qa/shared_ui_probe.py --strict             # known_gap까지 실패로 본다(고친 뒤 확인용)
  python3 ops/qa/shared_ui_probe.py --summary-file "$GITHUB_STEP_SUMMARY"

무엇을 재나 (제5조 5-7·5-8 · 사례 장부는 ops/qa/shared_ui_cases.json)
  idle   — 대문의 세 보기(기본·시드·매치)에서 방치 유도 트리거(JC_HINT.run)가 실제로 걸리고,
           공통 로고(마름모)가 그 때문에 «실제로 움직이는가». 스크립트가 있다는 것만으로 통과시키지 않는다.
  shell  — 시드·매치 대표 섹터에서 공통 셸이 실제 DOM에서 사는가(테마 단추 클릭 → data-theme 변화,
           카드덱 단추·도구함이 붙어 있는가).
  anchor — 카드·패널의 보조 액션이 항목·탭을 바꿔도 같은 좌표에 있는가(폭 390·1280에서 Δx·Δy).

판정
  ✓ 통과 / ✗ 실패(게이트) / – 보고만(known_gap). 게이트는 사례의 "gate"가 true이거나 목록에 적은 보기다.
  좌표는 0.5px까지 허용한다(브라우저의 소수점 반올림). 헌법의 목표값은 0.00px이다.

종료 코드 0 = 통과, 1 = 게이트가 선 사례가 있다.
"""
import argparse
import functools
import http.server
import json
import os
import socketserver
import sys
import threading

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CASES_PATH = os.path.join(ROOT, "ops", "qa", "shared_ui_cases.json")
TOLERANCE = 0.5          # px — 소수점 반올림만 봐준다(목표값은 0.00px)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve():
    handler = functools.partial(Quiet, directory=ROOT)
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f"http://127.0.0.1:{httpd.server_address[1]}/"


def load_cases(path=CASES_PATH):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh).get("cases", [])


# ---------------------------------------------------------------- idle — 로고 방치 모션
IDLE_JS = r"""
async () => {
  const mark = document.querySelector('.cctt-mark');
  const groups = ['.cctt-dg-o', '.cctt-dg-i'].map(s => document.querySelector(s)).filter(Boolean);
  if (!mark || !groups.length) return {ok: false, why: '공통 로고(.cctt-mark·마름모 겹)가 이 보기에 없다'};
  const box = mark.getBoundingClientRect();
  if (box.width < 2 || box.height < 2) return {ok: false, why: '로고가 그려지지 않았다(' + Math.round(box.width) + 'x' + Math.round(box.height) + ')'};
  if (!(window.JC_HINT && window.JC_HINT.run)) return {ok: false, why: '방치 유도 트리거(JC_HINT.run)가 없다'};
  let ran = false;
  try { ran = !!window.JC_HINT.run(); } catch (e) { return {ok: false, why: '방치 유도가 오류로 멈췄다: ' + e.message}; }
  const frames = new Set();
  const names = new Set();
  let logoAnims = 0;
  for (let i = 0; i < 8; i++) {
    await new Promise(r => setTimeout(r, 90));
    frames.add([getComputedStyle(mark).transform].concat(groups.map(g => getComputedStyle(g).transform)).join('|'));
    /* 마름모 열 가지 패턴 중 «획 그리기»는 transform을 안 쓰고 stroke-dashoffset만 민다.
       그래서 움직였는지는 합성 변환 변화 «또는» 로고 안에서 도는 애니메이션이 있는지로 본다. */
    const lock = document.querySelector('.cctt-lockup');
    const live = (document.getAnimations ? document.getAnimations() : []).filter(a => {
      const t = a.effect && a.effect.target;
      return t && lock && lock.contains(t) && (a.currentTime || 0) > 0;
    });
    if (live.length > logoAnims) logoAnims = live.length;
    if (window.JC_LOGO && window.JC_LOGO.state) { const st = window.JC_LOGO.state(); if (st && st.name) names.add(st.name); }
  }
  const moved = frames.size > 1 || logoAnims > 0;
  const pattern = [...names].join(',');
  if (!ran) return {ok: false, ran: false, moved, pattern, why: '방치 유도가 이 보기에서 걸리지 않았다(트리거 false) — 공통 모션이 보기 때문에 꺼져 있다'};
  if (!moved) return {ok: false, ran: true, moved, pattern, why: '방치 유도는 걸렸는데 로고가 움직이지 않았다(합성 변환 8프레임 그대로 · 로고 안 애니메이션 0)'};
  return {ok: true, ran, moved, pattern, why: (pattern || '모션') + ' · 합성 변환 ' + frames.size + '가지 · 로고 애니메이션 ' + logoAnims + '개'};
}
"""

# ---------------------------------------------------------------- shell — 대표 섹터의 공통 셸
SHELL_JS = r"""
async () => {
  const problems = [];
  const seen = {};
  const slot = document.querySelector('[data-jc-prefs]');
  if (!slot) problems.push('화면 설정 자리([data-jc-prefs])가 없다');
  else {
    const root = slot.shadowRoot;
    const t = root && root.querySelector('.t');
    if (!t) problems.push('화면 설정의 테마 단추가 없다(공통 prefs.js가 그리지 않았다)');
    else {
      /* 자동(7시~19시는 밝게) → 밝게는 화면이 같다. 그래서 «한 번만» 보지 않고 세 번 돌려
         나온 상태(테마·종이색·저장값)가 두 가지 이상인지를 본다 — 자동→밝게처럼 겉으로 같은
         단계가 있어도 단추가 실제로 도는지 잃지 않는다. */
      const read = () => [document.documentElement.getAttribute('data-theme'),
                          document.documentElement.getAttribute('data-jc-tone'),
                          (() => { try { return localStorage.getItem('jc-theme'); } catch (e) { return ''; } })()].join('/');
      const seenStates = [read()];
      for (let i = 0; i < 3; i++) {
        t.click();
        await new Promise(r => setTimeout(r, 280));
        seenStates.push(read());
      }
      seen.theme = seenStates.join(' → ');
      if (new Set(seenStates).size < 2) problems.push('테마 단추를 세 번 눌렀는데 화면 테마가 한 번도 바뀌지 않았다(' + seenStates[0] + ')');
    }
  }
  const fab = document.querySelector('.jcf-launch');
  seen.deckFab = !!fab;
  if (!fab) problems.push('공통 카드덱 단추(.jcf-launch)가 붙지 않았다 — core.js/deckfab.js가 돌지 않았다');
  const marker = document.querySelector('#jc-marker-ui');
  seen.marker = !!marker;
  if (!marker) problems.push('공통 도구함(#jc-marker-ui)이 붙지 않았다 — marker.js가 돌지 않았다');
  const back = [...document.querySelectorAll('a[href]')].some(a => /^(\/|\.\.\/?$|\.\.\/index\.html)/.test(a.getAttribute('href')) && a.textContent.trim());
  seen.homeLink = back;
  return {ok: problems.length === 0, why: problems.join(' · ') || ('테마 ' + seen.theme + ' · 카드덱·도구함 붙음'), seen};
}
"""
# ---------------------------------------------------------------- anchor — 보조 액션 좌표
ANCHOR_BOX_JS = r"""
(sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const s = getComputedStyle(el);
  if (s.display === 'none' || s.visibility === 'hidden' || !r.width || !r.height) return null;
  return {x: +r.left.toFixed(2), y: +r.top.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2)};
}
"""


def _gated(case, sub):
    gate = case.get("gate", False)
    if gate is True:
        return True
    if isinstance(gate, list):
        return sub in gate
    return False


def run_idle(browser, base, case, args):
    rows = []
    for view in case.get("views", ["default"]):
        for width in case.get("widths", [1280]):
            context = browser.new_context(viewport={"width": width, "height": 820})
            page = context.new_page()
            try:
                page.goto(base + case["page"].lstrip("/"), wait_until="domcontentloaded", timeout=45000)
                if view != "default":
                    page.evaluate("m => localStorage.setItem('jc-mode', m)", view)
                    page.reload(wait_until="domcontentloaded", timeout=45000)
                page.wait_for_timeout(args.settle)
                out = page.evaluate(IDLE_JS)
            except Exception as exc:                      # noqa: BLE001 — 실패 사유를 그대로 보여 준다
                out = {"ok": False, "why": f"화면을 열지 못했다: {str(exc).splitlines()[0][:120]}"}
            rows.append({"sub": view, "width": width, "ok": bool(out.get("ok")),
                         "detail": out.get("why", ""), "gated": _gated(case, view)})
            context.close()
    return rows


def run_shell(browser, base, case, args):
    rows = []
    for page_path in case.get("pages", []):
        for width in case.get("widths", [1280]):
            context = browser.new_context(viewport={"width": width, "height": 820})
            page = context.new_page()
            errors = []
            page.on("pageerror", lambda err: errors.append(f"페이지 오류: {str(err)[:120]}"))
            try:
                page.goto(base + page_path.lstrip("/"), wait_until="domcontentloaded", timeout=45000)
                page.wait_for_timeout(args.settle)
                out = page.evaluate(SHELL_JS)
                if errors:
                    out = {"ok": False, "why": " · ".join(errors[:2])}
            except Exception as exc:                      # noqa: BLE001
                out = {"ok": False, "why": f"화면을 열지 못했다: {str(exc).splitlines()[0][:120]}"}
            rows.append({"sub": page_path, "width": width, "ok": bool(out.get("ok")),
                         "detail": out.get("why", ""), "gated": _gated(case, page_path)})
            context.close()
    return rows


def run_anchor(browser, base, case, args):
    rows = []
    for width in case.get("widths", [1280]):
        context = browser.new_context(viewport={"width": width, "height": 820})
        page = context.new_page()
        boxes = []
        try:
            page.goto(base + case["page"].lstrip("/"), wait_until="domcontentloaded", timeout=45000)
            page.wait_for_timeout(args.settle)
            for step, sel in enumerate(case.get("switchers", [])):
                page.click(sel, timeout=6000)
                page.wait_for_timeout(args.step_settle)
                box = page.evaluate(ANCHOR_BOX_JS, case["control"])
                if box:
                    boxes.append((step, box))
            if len(boxes) < 2:
                rows.append({"sub": "좌표", "width": width, "ok": False,
                             "detail": f"보조 액션({case['control']})을 두 번 이상 재지 못했다 — 화면 구조를 확인한다",
                             "gated": _gated(case, "좌표")})
                context.close()
                continue
            dx = round(max(b["x"] for _s, b in boxes) - min(b["x"] for _s, b in boxes), 2)
            dy = round(max(b["y"] for _s, b in boxes) - min(b["y"] for _s, b in boxes), 2)
            ok = dx <= TOLERANCE and dy <= TOLERANCE
            span = f"x {min(b['x'] for _s, b in boxes)}~{max(b['x'] for _s, b in boxes)}"
            rows.append({"sub": "좌표", "width": width, "ok": ok,
                         "detail": f"{len(boxes)}개 항목에서 Δx {dx}px · Δy {dy}px ({span})",
                         "gated": _gated(case, "좌표")})
        except Exception as exc:                          # noqa: BLE001
            rows.append({"sub": "좌표", "width": width, "ok": False,
                         "detail": f"재지 못했다: {str(exc).splitlines()[0][:120]}",
                         "gated": _gated(case, "좌표")})
        context.close()
    return rows


RUNNERS = {"idle": run_idle, "shell": run_shell, "anchor": run_anchor}


def run(args):
    from playwright.sync_api import sync_playwright  # 게이트에서만 쓰는 의존성

    cases = load_cases(args.cases)
    if args.only:
        wanted = {name.strip() for name in args.only.split(",") if name.strip()}
        cases = [case for case in cases if case.get("kind") in wanted or case.get("id") in wanted]
    if not cases:
        print("검사할 사례가 없다 — ops/qa/shared_ui_cases.json을 확인한다")
        return 1

    httpd = None
    if args.base:
        base = args.base if args.base.endswith("/") else args.base + "/"
    else:
        httpd, base = serve()

    results = []          # (case, rows)
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            for case in cases:
                runner = RUNNERS.get(case.get("kind"))
                if not runner:
                    print(f"✗ {case.get('id')}: 알 수 없는 kind «{case.get('kind')}»")
                    results.append((case, []))
                    continue
                results.append((case, runner(browser, base, case, args)))
            browser.close()
    finally:
        if httpd:
            httpd.shutdown()

    print("=" * 78)
    failed_gated = 0
    report = []
    for case, rows in results:
        gated_any = any(row["gated"] for row in rows)
        title = f"{case.get('id')} — {case.get('why', '')}"
        print(f"· {title}")
        for row in rows:
            if row["ok"]:
                mark = "✓"
            elif row["gated"] or args.strict:
                mark = "✗"
            else:
                mark = "–"
            if mark == "✗" or (mark == "–" and not row["ok"]):
                if row["gated"] or args.strict:
                    failed_gated += 1
            label = f"{row['sub']} {row['width']}px"
            print(f"    {mark} {label}  {row['detail']}")
            if mark == "–" and not row["ok"]:
                gap = (case.get("known_gap") or {})
                reason = gap.get(row["sub"]) if isinstance(gap, dict) else gap
                if reason:
                    print(f"        (아직 고치는 중 — {reason})")
            report.append((case.get("id"), label, mark, row["detail"]))
        if not gated_any and not args.strict:
            print("    (이 사례는 아직 게이트가 아니다 — 고친 뒤 ops/qa/shared_ui_cases.json의 gate를 올린다)")
    print("-" * 78)
    print("✓ 공통 UI·모션 실증 통과" if not failed_gated else f"✗ 게이트가 선 항목 {failed_gated}개 — 위 숫자를 고친 뒤 다시 잰다")

    if args.summary_file:
        lines = ["## 공통 UI·모션 실증 (제5조 5-7·5-8)", "", "| 사례 | 잰 곳 | 결과 | 잰 값 |", "|---|---|---|---|"]
        for cid, label, mark, detail in report:
            lines.append(f"| {cid} | {label} | {mark} | {detail} |")
        lines.append("")
        lines.append("**통과**" if not failed_gated else f"**게이트가 선 항목 {failed_gated}개**")
        with open(args.summary_file, "a", encoding="utf-8") as fh:
            fh.write("\n".join(lines) + "\n")

    return 0 if not failed_gated else 1


def main():
    parser = argparse.ArgumentParser(description="공통 UI·모션 실증(방치 모션·공통 셸·보조 액션 좌표)")
    parser.add_argument("--base", help="검사할 주소(없으면 저장소를 로컬 정적 서버로 띄운다)")
    parser.add_argument("--only", help="사례 종류(idle·shell·anchor) 또는 사례 id")
    parser.add_argument("--cases", default=CASES_PATH, help="사례 장부 경로")
    parser.add_argument("--strict", action="store_true", help="known_gap(아직 고치는 중)까지 실패로 본다")
    parser.add_argument("--settle", type=int, default=2200, help="화면이 그려질 때까지 기다리는 ms")
    parser.add_argument("--step-settle", type=int, default=260, help="탭·항목을 바꾼 뒤 기다리는 ms")
    parser.add_argument("--summary-file", help="GitHub Actions Job Summary 파일 경로")
    return run(parser.parse_args())


if __name__ == "__main__":
    sys.exit(main())
