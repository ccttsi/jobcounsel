#!/usr/bin/env python3
"""손짓 검수 — 재생헤드 · 소재 토글 · 문장 점검 · 비교대 끌기 · 검문 · 미리보기 · 강사 모드."""
import asyncio, http.server, socketserver, threading, functools, os
from playwright.async_api import async_playwright

ROOT = '/workspace/work-portfolio22'
PORT = 8741
SHOTS = '/workspace/downloads/portfolio-22-2026-11-17'
ok = 0
bad = 0


def check(name, cond, extra=''):
    global ok, bad
    if cond:
        ok += 1
        print(' ok ', name, extra, flush=True)
    else:
        bad += 1
        print('FAIL', name, extra, flush=True)


async def main():
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.TCPServer(('127.0.0.1', PORT), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{PORT}/portfolio/'
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        c = await b.new_context(viewport={'width': 390, 'height': 844})
        await c.add_init_script("try{localStorage.setItem('jc-theme','light')}catch(e){}")
        p = await c.new_page()
        errs = []
        p.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await p.goto(base); await p.wait_for_timeout(700)

        # 1. 재생헤드: 값이 바뀌면 장면·시각 표시가 따라오는가
        await p.eval_on_selector('#scrub', "el => { el.value = 40; el.dispatchEvent(new Event('input', {bubbles:true})); }")
        await p.wait_for_timeout(200)
        r = await p.evaluate("""() => ({tc: document.getElementById('tc').textContent,
            mon: document.querySelector('.mon-top').textContent,
            cur: document.querySelector('.tl-row .sc[aria-current="true"] b').textContent,
            ph: getComputedStyle(document.getElementById('ph')).transform})""")
        check('재생헤드 40초 → 프로젝트 1', '00:40' in r['tc'] and '프로젝트 1' in r['mon'] and r['cur'] == '프로젝트 1', str(r))

        # 2. 장면을 눌러 이동
        await p.click('#bin [data-act="scene"][data-i="4"]')
        await p.wait_for_timeout(250)
        r = await p.evaluate("() => [document.getElementById('tc').textContent, document.querySelector('.mon-ask').textContent]")
        check('5번 장면 → 마무리', '01:22' in r[0] and '다음에 무엇을' in r[1], str(r))

        # 3. 소재 토글
        await p.click('#mods button[data-mod="cut"]'); await p.wait_for_timeout(500)
        await p.click('#bin [data-act="keep"][data-id="s04"]'); await p.wait_for_timeout(300)
        await p.click('#bin [data-act="keep"][data-id="s07"]'); await p.wait_for_timeout(300)
        r = await p.evaluate("""() => ({n: document.getElementById('binN').textContent,
            mon: document.querySelector('.mon-top .tcs').textContent,
            kept: document.querySelectorAll('.tl-row .sc.on').length})""")
        check('소재 2개 올림', '2개 올림' in r['n'] and r['kept'] == 2, str(r))
        await p.screenshot(path=f'{SHOTS}/mobile-390-cut-selected.png')

        # 4. 문장 점검
        await p.click('#mods button[data-mod="story"]'); await p.wait_for_timeout(500)
        await p.click('#bin [data-act="track"][data-id="t5"]'); await p.wait_for_timeout(300)
        await p.fill('#ta', '3인 팀에서 결제 화면을 맡아 5단계를 3단계로 줄였습니다. 완료율이 62%에서 79%로 올랐습니다.')
        await p.wait_for_timeout(300)
        r = await p.evaluate("""() => ({lint: [...document.querySelectorAll('#lint .f')].map(x=>x.textContent.trim()),
            count: document.getElementById('taCount').textContent,
            state: document.getElementById('taState').textContent})""")
        check('문장 점검: 숫자·역할 통과', any('숫자' in x and '✓' in x for x in r['lint']) and '적음' in r['state'], str(r))

        # 5. 비교대 팝업
        await p.click('[data-act="openBa"]'); await p.wait_for_timeout(450)
        r = await p.evaluate("() => [document.getElementById('cmpfs').classList.contains('on'), getComputedStyle(document.getElementById('ba')).gridTemplateColumns, getComputedStyle(document.getElementById('baH')).display]")
        check('휴대폰 비교 팝업 · 위아래 쌓임', r[0] and r[2] == 'none', str(r))
        await p.screenshot(path=f'{SHOTS}/mobile-390-compare.png')
        await p.click('[data-act="pair"][data-i="1"]'); await p.wait_for_timeout(300)
        r = await p.evaluate("() => document.querySelector('.ba-p.after p').textContent.slice(0,12)")
        check('예시 바꾸기(AI 티)', '매주 화요일' in r, r)
        await p.click('#cmpX'); await p.wait_for_timeout(350)
        r = await p.evaluate("() => document.getElementById('cmpfs').classList.contains('on')")
        check('비교 팝업 닫힘', r is False, str(r))
        # 6. 검문
        await p.click('#mods button[data-mod="gate"]'); await p.wait_for_timeout(500)
        for eid in ('e1', 'e2', 'e4'):
            await p.click(f'#bin [data-act="eth"][data-id="{eid}"]')
            await p.wait_for_timeout(120)
        r = await p.evaluate("() => [document.getElementById('binN').textContent, document.querySelector('.meter b').textContent, document.querySelector('.editor .badge').textContent]")
        check('검문 3개 통과 → 38%', '3 / 8' in r[0] and r[1] == '38%' and '2개 남음' in r[2], str(r))
        # 발표 재생헤드
        await p.eval_on_selector('#tscrub', "el => { el.value = 120; el.dispatchEvent(new Event('input', {bubbles:true})); }")
        await p.wait_for_timeout(250)
        r = await p.evaluate("() => [document.getElementById('tc').textContent, document.querySelector('[data-talk] .mon-top').textContent.trim()]")
        check('발표 2분 → 결과 구간', '02:00' in r[0] and '결과' in r[1], str(r))
        await p.screenshot(path=f'{SHOTS}/mobile-390-gate-checked.png')

        # 6-1. 인스펙터 시트(휴대폰)
        await p.click('#inspBtn'); await p.wait_for_timeout(500)
        r = await p.evaluate("() => [getComputedStyle(document.getElementById('inspPane')).visibility, document.getElementById('inspBtn').getAttribute('aria-expanded')]")
        check('인스펙터 시트 열림', r[0] == 'visible' and r[1] == 'true', str(r))
        await p.click('#inspX'); await p.wait_for_timeout(450)
        r = await p.evaluate("() => getComputedStyle(document.getElementById('inspPane')).visibility")
        check('인스펙터 시트 닫힘', r == 'hidden', r)

        # 7. 전체 화면 미리보기
        await p.click('#mods button[data-mod="scan"]'); await p.wait_for_timeout(400)
        await p.click('#fsBtn'); await p.wait_for_timeout(400)
        r = await p.evaluate("() => [document.getElementById('fs').classList.contains('on'), getComputedStyle(document.getElementById('fs')).visibility]")
        check('크게 보기 열림', r[0] and r[1] == 'visible', str(r))
        await p.screenshot(path=f'{SHOTS}/mobile-390-preview.png')
        before = await p.evaluate("() => document.getElementById('fsT').textContent")
        await p.click('[data-act="fsNext"]'); await p.wait_for_timeout(300)
        after = await p.evaluate("() => document.getElementById('fsT').textContent")
        check('미리보기 다음 장면', after != before and '미리보기' in after, before + ' → ' + after)
        await p.keyboard.press('Escape'); await p.wait_for_timeout(400)
        r = await p.evaluate("() => [document.getElementById('fs').classList.contains('on'), getComputedStyle(document.getElementById('fs')).visibility]")
        check('Esc로 닫힘', (not r[0]) and r[1] == 'hidden', str(r))

        # 8. 강사 모드 + 탭
        await p.click('#modeCoach'); await p.wait_for_timeout(500)
        r = await p.evaluate("() => [document.getElementById('crs').hidden, document.querySelectorAll('.crs [data-crs].on').length]")
        check('강사 모드 열림', (not r[0]) and r[1] == 1, str(r))
        await p.screenshot(path=f'{SHOTS}/mobile-390-coach.png')
        await p.click('.crs-tabs button[data-t="diff"]'); await p.wait_for_timeout(350)
        r = await p.evaluate("() => document.querySelector('.crs [data-crs].on').getAttribute('data-crs')")
        check('차별화 탭', r == 'diff', r)
        await p.click('#modeCreator'); await p.wait_for_timeout(400)
        r = await p.evaluate("() => document.getElementById('wk').hidden")
        check('만드는 사람으로 복귀', r is False, str(r))

        check('콘솔·페이지 오류 0', not errs, ' | '.join(errs[:2]))
        await c.close()

        # 데스크톱 끌기·키보드
        c2 = await b.new_context(viewport={'width': 1280, 'height': 800})
        await c2.add_init_script("try{localStorage.setItem('jc-theme','dark')}catch(e){}")
        p2 = await c2.new_page()
        await p2.goto(base); await p2.wait_for_timeout(700)
        await p2.click('#mods button[data-mod="story"]'); await p2.wait_for_timeout(600)
        await p2.click('[data-act="openBa"]'); await p2.wait_for_timeout(500)
        box = await p2.eval_on_selector('#ba', "el => {const r=el.getBoundingClientRect(); return [r.left,r.top,r.width,r.height]}")
        await p2.mouse.move(box[0] + box[2] / 2, box[1] + box[3] / 2)
        await p2.mouse.down(); await p2.mouse.move(box[0] + box[2] * 0.3, box[1] + box[3] / 2, steps=6); await p2.mouse.up()
        await p2.wait_for_timeout(200)
        r = await p2.evaluate("() => document.getElementById('baH').getAttribute('aria-valuenow')")
        check('데스크톱 비교대 끌기', 25 <= int(r) <= 35, r)
        await p2.eval_on_selector('#baH', "el => el.focus()")
        await p2.keyboard.press('ArrowRight'); await p2.wait_for_timeout(150)
        r2 = await p2.evaluate("() => document.getElementById('baH').getAttribute('aria-valuenow')")
        check('비교대 키보드 조작', int(r2) > int(r), r + ' → ' + r2)
        await p2.screenshot(path=f'{SHOTS}/desktop-1280-compare-dark.png')
        await p2.keyboard.press('Escape'); await p2.wait_for_timeout(400)
        await p2.click('#mods button[data-mod="gate"]'); await p2.wait_for_timeout(500)
        await p2.screenshot(path=f'{SHOTS}/desktop-1280-gate-dark.png')
        await c2.close()
        await b.close()
    print(f'\n통과 {ok} · 실패 {bad}')
    return bad


if __name__ == '__main__':
    raise SystemExit(1 if asyncio.run(main()) else 0)
