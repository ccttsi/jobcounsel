#!/usr/bin/env python3
"""22번 포트폴리오 편집실 실화면 검수 (ops/qa/audit.js와 같은 기준).

- 6 해상도 × 밝게/어둡게 × 4단계 + 상담사·강사 모드
- 콘솔·페이지 오류 0 · 가로 넘침 0 · 44px 미달 0 · 화면 분량(큰 화면 ≤1.5, 휴대폰 ≤2.5)
- 스크린샷: 390×844 · 1280×800 (단계별)
"""
import asyncio, http.server, socketserver, threading, functools, os, sys
from playwright.async_api import async_playwright

ROOT = os.path.abspath('/workspace/work-portfolio22')
PORT = 8731
SIZES = [(390, 844, 'phone'), (360, 780, 'phone'), (820, 1180, 'tablet'),
         (1024, 768, 'tablet'), (1280, 800, 'desktop'), (1600, 900, 'desktop')]
LIMIT = {'phone': 2.5, 'tablet': 1.6, 'desktop': 1.5}
SHOTS = '/workspace/downloads/portfolio-22-2026-11-17'

MEASURE = """() => {
  const small=[];
  document.querySelectorAll('a,button,select,input,textarea,summary,[role=button],[role=tab],[role=slider]').forEach(el=>{
    if (el.closest('#jc-marker-ui,#jc-imm-dock')) return;
    const q=el.getBoundingClientRect(); if(!q.width||!q.height) return;
    const inline = el.tagName==='A' && getComputedStyle(el).display==='inline';
    if(!inline && (q.width<43.5 || q.height<43.5)) small.push((el.id||String(el.className).split(' ')[0]||el.tagName)+' '+Math.round(q.width)+'x'+Math.round(q.height));
  });
  return {screens:+(document.documentElement.scrollHeight/innerHeight).toFixed(2),
          overflow: document.documentElement.scrollWidth-innerWidth,
          small: small, smallCount: small.length};
}"""


def serve():
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.TCPServer(('127.0.0.1', PORT), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()


async def main():
    serve()
    base = f'http://127.0.0.1:{PORT}'
    os.makedirs(SHOTS, exist_ok=True)
    fail = 0
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        for w, h, kind in SIZES:
            for theme in ('light', 'dark'):
                c = await b.new_context(viewport={'width': w, 'height': h})
                await c.add_init_script(f"try{{localStorage.setItem('jc-theme','{theme}')}}catch(e){{}}")
                await c.route('**cdn.jsdelivr.net**', lambda r: r.abort())
                p = await c.new_page()
                errs = []
                p.on('pageerror', lambda e: errs.append(str(e)[:200]))
                p.on('console', lambda m: errs.append(m.text[:200]) if m.type == 'error' and 'jsdelivr' not in (m.location or {}).get('url', '') else None)
                await p.goto(base + '/portfolio/', wait_until='domcontentloaded')
                await p.wait_for_timeout(700)
                screens = 0.0
                overflow = 0
                small = []
                for mod in ('scan', 'cut', 'story', 'gate'):
                    await p.click(f'#mods button[data-mod="{mod}"]')
                    await p.wait_for_timeout(700)
                    r = await p.evaluate(MEASURE)
                    screens = max(screens, r['screens'])
                    overflow = max(overflow, r['overflow'])
                    for x in r['small']:
                        if x not in small:
                            small.append(x)
                await p.click('#modeCoach')
                await p.wait_for_timeout(700)
                r = await p.evaluate(MEASURE)
                screens = max(screens, r['screens'])
                overflow = max(overflow, r['overflow'])
                for x in r['small']:
                    if x not in small:
                        small.append(x)
                bad = bool(errs) or overflow > 0 or small or screens > LIMIT[kind]
                if bad:
                    fail += 1
                print(f"{'FAIL' if bad else ' ok '} {w}x{h} {theme:5} 분량 {screens} 넘침 {overflow} 작음 {len(small)} 오류 {len(errs)}")
                if small:
                    print('      작은 대상:', ', '.join(small[:10]))
                if errs:
                    print('      오류:', ' | '.join(errs[:3]))
                await c.close()

        # 스크린샷(밝게)
        for w, h, name, dsf in [(390, 844, 'mobile', 2), (1280, 800, 'desktop', 1)]:
            c = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=dsf)
            await c.add_init_script("try{localStorage.setItem('jc-theme','light')}catch(e){}")
            p = await c.new_page()
            await p.goto(base + '/portfolio/', wait_until='domcontentloaded')
            await p.wait_for_timeout(900)
            for mod in ('scan', 'cut', 'story', 'gate'):
                await p.click(f'#mods button[data-mod="{mod}"]')
                await p.wait_for_timeout(420)
                await p.screenshot(path=f'{SHOTS}/{name}-{w}-{mod}.png')
            await c.close()
        await b.close()
    print('실패 조합:', fail)
    return fail


if __name__ == '__main__':
    sys.exit(1 if asyncio.run(main()) else 0)
