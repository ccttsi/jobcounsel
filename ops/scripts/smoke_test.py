#!/usr/bin/env python3
"""실화면 스모크 — CI 게이트의 Playwright 검사 (1순위)

  python3 ops/scripts/smoke_test.py                       # 저장소를 로컬 정적 서버로 띄워 잰다
  python3 ops/scripts/smoke_test.py --base https://ccttsi.github.io/jobcounsel/
  python3 ops/scripts/smoke_test.py --summary-file "$GITHUB_STEP_SUMMARY"

재는 화면: 대문(/), 브리핑(/briefing/), 신산업(/emerging/), 산업 온도계(/thermometer/) — 휴대폰 390·데스크톱 1280
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

PAGES = ["/", "/briefing/", "/emerging/", "/thermometer/"]
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

    return 1 if failed else 0


def main():
    parser = argparse.ArgumentParser(description="자료실 실화면 스모크")
    parser.add_argument("--base", help="검사할 주소(없으면 저장소를 로컬 정적 서버로 띄운다)")
    parser.add_argument("--pages", default=",".join(PAGES), help="쉼표로 구분한 경로")
    parser.add_argument("--settle", type=int, default=2500, help="화면이 그려질 때까지 기다리는 ms")
    parser.add_argument("--shot-dir", help="실패한 화면 그림을 남길 폴더")
    parser.add_argument("--summary-file", help="GitHub Actions Job Summary 파일 경로")
    args = parser.parse_args()
    args.pages = [p.strip() for p in args.pages.split(",") if p.strip()]
    return run(args)


if __name__ == "__main__":
    sys.exit(main())
