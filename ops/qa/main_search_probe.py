#!/usr/bin/env python3
"""대문 빠른 검색 → 섹터 딥링크 실측.

대문(index.html)에서 낱말을 치고, 첫 결과를 눌러, 도착한 화면에 그 항목이 열려 있는지 본다.

쓰는 법
    LD_LIBRARY_PATH=/workspace/pwlibs/root/usr/lib/x86_64-linux-gnu python3 ops/qa/main_search_probe.py
    ... --live     # 운영 사이트(https://ccttsi.github.io/jobcounsel/)에 대고 잰다
"""
import json
import os
import subprocess
import sys
import time
import urllib.request
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LIVE = '--live' in sys.argv
BASE = 'https://ccttsi.github.io/jobcounsel/' if LIVE else 'http://127.0.0.1:8787/'

# 회원 전용 게이트(assets/core.js)를 검사에서만 건너뛰는 표시 — 주소 파라미터로는 열리지 않는다.
QA_INIT = "window.__JC_QA__ = 1;"

# (검색어, 도착 주소에 반드시 있어야 하는 조각, 도착 화면에 보여야 하는 글자)
CASES = [
    ('GMP', '/translator/?q=GMP', 'Good Manufacturing'),
    ('HPLC', '/translator/?q=HPLC', 'HPLC'),
    ('스펙충', '/translator/?q=', '스펙충'),
    ('해커스', '/company/', '해커스'),
    ('계명대', '/univ/?q=', '계명대'),
    ('알리오', '/portals/', '알리오'),
    ('홀랜드', '/theory/', '홀랜드'),
    ('소개비', '/law/', '소개비'),
    ('반도체', '/thermometer/?q=', '반도체'),
    ('가스기술사', '/cert/', '가스기술사'),
    ('사람을 나누는', '/labor/#c-', '사람을 나누는'),
    ('이력서', '/', ''),
]


def serve():
    p = subprocess.Popen([sys.executable, '-m', 'http.server', '8787', '--bind', '127.0.0.1'],
                         cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(60):
        try:
            urllib.request.urlopen(BASE, timeout=1)
            return p
        except Exception:
            time.sleep(0.1)
    return p


def main():
    proc = serve() if not LIVE else None
    bad = 0
    try:
        with sync_playwright() as pw:
            b = pw.chromium.launch()
            ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True,
                                has_touch=True, device_scale_factor=2, locale='ko-KR')
            ctx.add_init_script(QA_INIT)          # 회원 전용 게이트를 건너뛰는 검사용 표시
            page = ctx.new_page()
            for q, want_url, want_text in CASES:
                page.goto(BASE, wait_until='load')
                page.wait_for_timeout(900)
                page.click('#btnSearch')
                page.wait_for_timeout(500)
                page.fill('#q', q)
                page.wait_for_timeout(1600)
                first = page.evaluate("""() => {
                  const a = document.querySelector('#res .a-opt');
                  return a ? {href: a.getAttribute('href'), title: (a.innerText||'').replace(/\\n/g,' ').slice(0,60)} : null;
                }""")
                if not first:
                    print(f'FAIL {q:12s} 결과 없음')
                    bad += 1
                    continue
                page.click('#res .a-opt')
                page.wait_for_load_state('load')
                page.wait_for_timeout(1800)
                url = page.url
                body = page.evaluate("() => document.body.innerText")
                ok_url = want_url in url
                ok_txt = (want_text in body) if want_text else True
                good = ok_url and ok_txt
                bad += 0 if good else 1
                print(f"{'OK  ' if good else 'FAIL'} {q:12s} → {url.replace(BASE, '')}  "
                      f"[{first['title']}]  글자={'O' if ok_txt else 'X'}")
            b.close()
    finally:
        if proc:
            proc.terminate()
    print(f"\n{len(CASES) - bad}/{len(CASES)} 통과")


if __name__ == '__main__':
    main()
