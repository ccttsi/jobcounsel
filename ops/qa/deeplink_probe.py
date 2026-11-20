#!/usr/bin/env python3
"""딥링크 실측 — 메인 검색이 넘기는 주소가 «그 항목이 열린 화면»으로 도착하는지 확인한다.

쓰는 법
    LD_LIBRARY_PATH=/workspace/pwlibs/root/usr/lib/x86_64-linux-gnu \
      python3 ops/qa/deeplink_probe.py            # 로컬(127.0.0.1:8787)에서 서버를 띄워 잰다
      JC_BASE_URL=https://ccttsi.github.io/jobcounsel/ python3 ops/qa/deeplink_probe.py --live

판정
    OK   — 본문(main) 안에 그 항목의 글자가 보이고, 검색창이 있으면 그 낱말이 채워져 있다
    FAIL — 둘 중 하나가 어긋난다
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
BASE = os.environ.get('JC_BASE_URL') or ('https://ccttsi.github.io/jobcounsel/' if LIVE else 'http://127.0.0.1:8787/')
CASES = json.load(open(os.path.join(ROOT, 'ops', 'qa', 'deeplink_cases.json'), encoding='utf-8'))

READ = """() => {
  const box = document.querySelector('main') || document.getElementById('main') ||
              document.getElementById('view') || document.querySelector('.wrap') || document.body;
  const inputs = [...document.querySelectorAll('input[type=search],input[type=text]')]
    .filter(e => e.offsetParent !== null && e.type !== 'checkbox' && e.type !== 'range');
  return {
    main: (box.innerText || '').slice(0, 30000),
    body: (document.body.innerText || '').slice(0, 30000),
    inputs: inputs.map(e => [e.id || e.name || '', e.value]),
    url: location.href,
    hashes: [...document.querySelectorAll('[aria-current="page"],[aria-selected="true"],[aria-current="true"]')]
      .map(e => (e.className || '') + ':' + (e.innerText || '').slice(0, 40)).slice(0, 6)
  };
}"""


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
    ok = 0
    try:
        with sync_playwright() as pw:
            b = pw.chromium.launch()
            ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True,
                                has_touch=True, device_scale_factor=2, locale='ko-KR')
            page = ctx.new_page()
            for c in CASES:
                sec, url, want = c['sector'], c['url'], c['want']
                try:
                    page.goto('about:blank')
                    page.goto(BASE + url.lstrip('./'), wait_until='load', timeout=30000)
                    page.wait_for_timeout(c.get('wait', 2400))
                    info = page.evaluate(READ)
                except Exception as e:
                    print(f"FAIL {sec:14s} {url:46s} ERR {type(e).__name__} {str(e)[:60]}")
                    continue
                hit = want in info['body']
                qv = c.get('q')
                qok = True
                if qv:
                    qok = any(qv in (v or '') for _, v in info['inputs'])
                good = hit and qok
                ok += 1 if good else 0
                first = info['main'].strip().replace('\n', ' ')[:70]
                print(f"{'OK  ' if good else 'FAIL'} {sec:14s} {url:46s} q={qv or '-':8s} "
                      f"inputs={info['inputs']} :: {first}")
                if not good:
                    print(f"      want={want!r} hit={hit} qok={qok}")
            b.close()
    finally:
        if proc:
            proc.terminate()
    print(f"\n{ok}/{len(CASES)} 통과")


if __name__ == '__main__':
    main()
