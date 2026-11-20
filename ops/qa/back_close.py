#!/usr/bin/env python3
"""세부 팝업 뒤로가기 닫기 — 실화면 검사

  python3 ops/qa/back_close.py                  # 저장소를 로컬 정적 서버로 띄워 잰다
  python3 ops/qa/back_close.py taxonomy library # 이름을 주면 그 사례만

무엇을 재나
  자료 안에서 세부 자료(모달·드로어·상세 시트)를 열고 브라우저 뒤로가기를 누르면
  ① 이전 화면으로 나가지 않고 ② 열려 있던 팝업만 닫히고 ③ 주소(title·?q=·#hash)는 그대로인가.
  이어서 ④ 다시 열어 상태가 깨지지 않는가, ⑤ X로 먼저 닫은 뒤에는 뒤로가기 한 번에 페이지를 떠나는가.

왜 이 검사가 필요한가
  팝업은 히스토리에 흔적을 남기지 않아, 뒤로가기를 습관처럼 누르는 사람은 팝업이 닫히는 대신
  이전 화면으로 튕겨 나간다(태화님 지시 2026-11-20). 공통 장치는 assets/core.js §7(JCBackStack)이 맡는다.

종료 코드 0 = 통과, 1 = 실패.
"""
import json
import sys
import threading
import functools
import http.server
import socketserver
import os
import pathlib

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
PORT = 0

# 사례 — 섹터마다 «팝업을 여는 동작»과 «열렸는지 보는 식», «X 단추»를 적는다.
CASES = [
    dict(name='taxonomy', path='taxonomy/', ready=1800, close='#det [data-close]',
         open="() => { document.querySelector('.row[data-s]').click(); setTimeout(()=>{const b=document.querySelector('[data-open]'); b&&b.click();},120); }",
         probe="() => document.getElementById('detWrap').classList.contains('on')"),
    dict(name='translator', path='translator/', close='#detBack',
         open="() => { const r=document.querySelector('#rows [data-id]'); r&&r.click(); }",
         probe="() => document.body.classList.contains('detail')"),
    dict(name='library', path='library/', close='#btnClose',
         open="() => document.querySelector('.book').click()",
         probe="() => document.getElementById('drawer').classList.contains('open')"),
    dict(name='hud', path='hud/', close='#gClose',
         open="() => document.getElementById('btnGloss').click()",
         probe="() => document.getElementById('drawer').classList.contains('on')"),
    dict(name='parsons', path='parsons/', close='#sheetClose',
         open="() => document.getElementById('btnToc').click()",
         probe="() => !document.getElementById('sheet').hidden"),
    dict(name='portals', path='portals/', close='#fSheet .sh-x button',
         open="() => document.getElementById('fbtn').click()",
         probe="() => document.getElementById('fSheet').classList.contains('on')"),
    dict(name='fin-lab', path='fin-lab/', close='#tutX',
         open="() => document.getElementById('guideBtn').click()",
         probe="() => !document.getElementById('tutVeil').hidden"),
    dict(name='portfolio', path='portfolio/', close='#tutX',
         open="() => document.getElementById('tutBtn').click()",
         probe="() => { const e=document.getElementById('tut'); const c=getComputedStyle(e); return !e.hidden && c.display!=='none' && c.visibility!=='hidden' && +c.opacity>0.05 && e.getBoundingClientRect().height>50 }"),
    dict(name='company', path='company/', ready=3000, close='#flX',
         open="() => { const b=document.getElementById('flOpen'); b&&b.click(); }",
         probe="() => { const f=document.querySelector('.fl'); return f? f.classList.contains('open') : false }"),
    dict(name='cert', path='cert/', ready=2200, close='#flX',
         open="() => { const b=document.getElementById('flOpen'); b&&b.click(); }",
         probe="() => { const f=document.querySelector('.fl'); return f? f.classList.contains('open') : false }"),
    dict(name='work-filter', path='work-filter/', close='#sheetClose',
         open="() => document.getElementById('openFilters').click()",
         probe="() => { const s=document.getElementById('sheet'); return !s.hidden && s.classList.contains('open') }"),
    dict(name='emerging', path='emerging/', close='.sheet [data-close], .sheet .x, .sheet button[aria-label*=닫기]',
         open="() => document.getElementById('calBtn').click()",
         probe="() => { const s=document.querySelector('.sheet'); return !!s && !s.hidden && getComputedStyle(s).visibility!=='hidden' }"),
    dict(name='flow', path='flow/', close='#sheetX',
         open="() => { const b=document.getElementById('makeBtn'); b&&b.click(); }",
         probe="() => !document.getElementById('sheet').hidden"),
    dict(name='mydeck', path='mydeck/', close='#sheetX', seed='mydeck',
         open="() => { const b=document.querySelector('.d-b.go'); b&&b.click(); }",
         probe="() => !document.getElementById('sheet').hidden"),
    dict(name='theory', path='theory/', close='#shClose',
         open="() => document.querySelector('[data-act=\"open\"]').click()",
         probe="() => document.getElementById('ov').classList.contains('open')"),
    dict(name='interview', path='interview/', close="js:() => { const s=document.querySelector('.scrim'); if(s) s.click(); }",
         open="() => { const b=document.querySelector('[data-lst]'); b&&b.click(); }",
         probe="() => document.getElementById('lp').classList.contains('open')"),
    dict(name='law', path='law/', ready=2500, close='#sheetX',
         open="() => { const toc=document.getElementById('bkToc'); if(toc){toc.click();return;} const b=document.getElementById('bookBtn'); if(b){b.click(); setTimeout(()=>{const t=document.getElementById('bkToc'); t&&t.click();},500);} }",
         probe="() => { const s=document.getElementById('sheet'); return !s.hidden && s.classList.contains('on') }"),
    dict(name='dacum', path='dacum/', close="js:() => { const b=document.querySelector('#drawer [data-act=closedrawer]'); if(b) b.click(); }",
         open="() => { const m=[...document.querySelectorAll('[data-act=go]')].find(x=>x.textContent.includes('M3')); m&&m.click(); setTimeout(()=>{const b=document.querySelector('[data-to^=\"task:\"]'); b&&b.click();},400); }",
         probe="() => document.getElementById('drawer').classList.contains('open')"),
]

MYDECK_SEED = ("localStorage.setItem('jc-mydeck-local', JSON.stringify({v:1,prefs:{},decks:["
               "{id:'l-test',name:'검사 덱',steps:[{id:'reality',title:'현실 점검',no:'9'}],"
               "created_at:'2026-01-01T00:00:00.000Z'}]}))")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def log_message(self, *a):
        pass


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


def serve():
    srv = Server(('127.0.0.1', PORT), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, 'http://127.0.0.1:%d/' % srv.server_address[1]


def run(names=None):
    srv, base = serve()
    rows = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
        for c in CASES:
            if names and c['name'] not in names:
                continue
            pg = ctx.new_page()
            errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)[:120]))
            pg.on('console', lambda m: errs.append('console:' + m.text[:120]) if m.type == 'error' else None)
            r = dict(name=c['name'], errs=errs)

            def step(label, ok):
                r[label] = bool(ok)

            try:
                pg.goto(base + c['path'], wait_until='load')
                pg.wait_for_timeout(c.get('ready', 1200))
                if c.get('seed') == 'mydeck':
                    pg.evaluate('() => ' + MYDECK_SEED)
                    pg.reload(wait_until='load')
                    pg.wait_for_timeout(1500)
                pg.evaluate("() => { window.__probe = 1 }")
                url0 = pg.url

                pg.evaluate(c['open'])
                pg.wait_for_timeout(900)
                step('open', pg.evaluate(c['probe']))
                if r['open']:
                    r['entries'] = pg.evaluate("() => JCBackStack.depth()")
                    pg.go_back()
                    pg.wait_for_timeout(900)
                    same = pg.evaluate("() => window.__probe === 1")
                    step('back_closes', same and not pg.evaluate(c['probe']))
                    step('url_kept', pg.url == url0)

                    pg.evaluate(c['open'])
                    pg.wait_for_timeout(900)
                    step('reopen', pg.evaluate(c['probe']))
                    if r['reopen']:
                        try:
                            if c['close'].startswith('js:'):
                                pg.evaluate(c['close'][3:])
                            else:
                                pg.click(c['close'], timeout=3000)
                        except Exception as e:
                            errs.append('close-click ' + str(e)[:60])
                        pg.wait_for_timeout(1000)
                        step('x_closes', not pg.evaluate(c['probe']))
                        pg.go_back()
                        pg.wait_for_timeout(900)
                        step('one_back_leaves', not pg.evaluate("() => window.__probe === 1"))
            except Exception as e:
                errs.append('exc ' + str(e)[:100])

            r['PASS'] = all(r.get(k) for k in ('open', 'back_closes', 'url_kept', 'reopen', 'x_closes', 'one_back_leaves')) and not errs
            rows.append(r)
            print(('✓' if r['PASS'] else '✗') + ' %-12s 열기 %s · 뒤로가기닫기 %s · 주소유지 %s · 재열기 %s · X닫기 %s · 한번뒤로이탈 %s%s'
                  % (r['name'], yn(r.get('open')), yn(r.get('back_closes')), yn(r.get('url_kept')),
                     yn(r.get('reopen')), yn(r.get('x_closes')), yn(r.get('one_back_leaves')),
                     ('  ← ' + ' / '.join(errs[:2])) if errs else ''))
            pg.close()
        b.close()
    srv.shutdown()
    bad = [r for r in rows if not r['PASS']]
    print('-' * 72)
    print(('✓ %d개 사례 모두 통과' % len(rows)) if not bad else ('✗ 기준을 넘은 사례 %d곳 — %s' % (len(bad), ', '.join(r['name'] for r in bad))))
    return 0 if not bad else 1


def yn(v):
    return '✓' if v else '✗'


if __name__ == '__main__':
    sys.exit(run(set(sys.argv[1:]) or None))
