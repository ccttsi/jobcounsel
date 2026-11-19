#!/usr/bin/env python3
"""자료실 비서 검색 회귀 검사 — 약어·쓰다 만 줄임말·선참조 지도

CI(`ci-gate` 의 smoke-tests)와 로컬에서 같은 방식으로 돈다.
저장소 루트를 정적 서버로 띄우고, 실제 Chromium 안에서 `assistant/search.js` 를 불러
질문 하나하나에 대해 ① 약어가 정식 용어로 펼쳐지는지 ② 관련 섹터 자료가 위에 오는지
③ 선참조 지도(rag-preface.json)가 섹터를 집는지 ④ 콘솔 오류가 없는지를 잰다.

    python3 ops/scripts/assistant_search_test.py
    python3 ops/scripts/assistant_search_test.py --summary-file "$GITHUB_STEP_SUMMARY"

종료 코드 0 = 통과, 1 = 실패(실패 항목을 전부 모아 보여 준다).
"""
import argparse
import functools
import http.server
import json
import os
import sys
import threading

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CASES = os.path.join(ROOT, 'assistant', 'test', 'search-cases.json')
PREFACE = os.path.join(ROOT, 'assistant', 'data', 'rag-preface.json')
INDEX = os.path.join(ROOT, 'assistant', 'data', 'index.json')
PREFACE_MAX = 60 * 1024        # 선참조 지도는 가벼워야 한다(원문 60KB 이하)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve():
    handler = functools.partial(Quiet, directory=ROOT)
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def check_files():
    """브라우저 없이 잴 수 있는 것부터 — 파일 크기·약어 사전이 색인과 이어지는지."""
    bad = []
    for path, label in ((PREFACE, 'rag-preface.json'), (INDEX, 'index.json')):
        if not os.path.exists(path):
            bad.append('%s 이 없습니다. `python3 assistant/build_index.py` 로 만드세요.' % label)
    if bad:
        return bad
    size = os.path.getsize(PREFACE)
    if size > PREFACE_MAX:
        bad.append('rag-preface.json 이 %.0fKB — 선참조 지도는 %dKB 이하여야 합니다.'
                   % (size / 1024, PREFACE_MAX // 1024))
    pref = json.load(open(PREFACE, encoding='utf-8'))
    index = json.load(open(INDEX, encoding='utf-8'))
    sectors = {s['id'] for s in pref.get('sectors') or []}
    if not sectors:
        bad.append('rag-preface.json 에 섹터가 없습니다.')
    for e in pref.get('dict') or []:
        if not e.get('s'):
            bad.append('약어 「%s」에 먼저 볼 섹터가 없습니다.' % e.get('c'))
        for sid in e.get('s') or []:
            if sid not in sectors:
                bad.append('약어 「%s」의 섹터 「%s」가 지도에 없습니다.' % (e.get('c'), sid))
    # 약어 사전의 정식 용어가 색인 어딘가에 실제로 있어야 한다(사전이 유령이 되지 않게).
    blob = ' '.join((d.get('t', '') + ' ' + d.get('k', '') + ' ' + d.get('x', '')) for d in index.get('docs') or [])
    sig = ' '.join(e.get('c', '') for e in pref.get('dict') or [])
    missing = [e['c'] for e in pref.get('dict') or [] if e.get('c') and e['c'] not in blob]
    if len(missing) == len(sig.split()) and missing:
        bad.append('약어 사전의 정식 용어가 색인에 하나도 없습니다: %s' % ', '.join(missing[:5]))
    return bad


def run_cases():
    from playwright.sync_api import sync_playwright

    cases = json.load(open(CASES, encoding='utf-8'))
    srv = serve()
    base = 'http://127.0.0.1:%d/' % srv.server_address[1]
    fails = []
    rows = []
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            pg = b.new_page(viewport={'width': 390, 'height': 844})
            errs = []
            pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(base + 'index.html', wait_until='networkidle')
            pg.add_script_tag(url=base + 'assistant/search.js')
            pg.evaluate('() => window.JCAssistSearch.load()')
            pg.wait_for_function('window.JCAssistSearch && window.JCAssistSearch.ready()', timeout=30000)
            for c in cases['cases']:
                r = pg.evaluate("""(q) => {
                    const S = window.JCAssistSearch;
                    const a = S.analyze(q);
                    const res = S.search(q, {limit: 6});
                    const rt = S.route(q, {limit: 3});
                    return {added: a.added.map(x => x.word), tokens: a.tokens,
                            top: res.map(x => ({sector: x.sector, title: x.title})),
                            route: rt.map(x => x.id)};
                }""", c['q'])
                want = c.get('terms') or []
                got = set(r['added']) | set(r['tokens'])
                if want and not (set(want) & got):
                    fails.append('「%s」: 약어가 정식 용어로 펼쳐지지 않음 (기대 %s / 실제 %s)'
                                 % (c['q'], ', '.join(want), ', '.join(sorted(got))))
                secs = c.get('sectors') or []
                if secs:
                    ok = [x for x in r['top'] if x['sector'] in secs]
                    if not ok:
                        fails.append('「%s」: 상위 6건에 %s 섹터 자료가 없음 (%s)'
                                     % (c['q'], '/'.join(secs), ', '.join(x['sector'] for x in r['top'])))
                # 선참조 지도가 집은 섹터 (기대가 적혀 있을 때만)
                rwant = c.get('route') or []
                if rwant and not (set(rwant) & set(r['route'])):
                    fails.append('「%s」: 선참조 후보 섹터가 %s 가 아님 (%s)'
                                 % (c['q'], '/'.join(rwant), ', '.join(r['route']) or '없음'))
                rows.append((c['q'], ', '.join(r['route']) or '-',
                             (r['top'][0]['sector'] + ' · ' + r['top'][0]['title'][:24]) if r['top'] else '결과 없음'))
            if errs:
                fails.append('콘솔 오류 %d건: %s' % (len(errs), ' | '.join(errs[:3])))
            b.close()
    finally:
        srv.shutdown()
    return fails, rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--summary-file', default='')
    a = ap.parse_args()

    fails = check_files()
    rows = []
    if not fails:
        try:
            cf, rows = run_cases()
        except Exception as e:                     # 브라우저·서버를 못 띄운 경우도 실패로 남긴다
            cf, rows = ['검사를 돌리지 못했습니다: %s' % e], []
        fails += cf

    out = ['# 비서 검색 회귀 — 약어·선참조', '']
    out.append('| 질문 | 선참조 후보 섹터 | 첫 결과 |')
    out.append('|---|---|---|')
    for q, route, top in rows:
        out.append('| %s | %s | %s |' % (q, route, top))
    out.append('')
    out.append('**%s** — %d건 확인 · 실패 %d건' % ('통과' if not fails else '실패', len(rows), len(fails)))
    for f in fails:
        out.append('- ✗ ' + f)
    text = '\n'.join(out)
    print(text)
    if a.summary_file:
        with open(a.summary_file, 'a', encoding='utf-8') as f:
            f.write(text + '\n')
    return 0 if not fails else 1


if __name__ == '__main__':
    sys.exit(main())
