#!/usr/bin/env python3
"""상담 은어·동의어 사전 채점 — 사연 학습셋(168건)으로 검색 엔진의 1순위·3순위 적중률을 잰다.

    python3 ops/scripts/synonym_eval.py                        # 표만 본다
    python3 ops/scripts/synonym_eval.py --floor-top1 0.60      # 60% 아래로 떨어지면 실패(회귀 방지)
    python3 ops/scripts/synonym_eval.py --summary-file "$GITHUB_STEP_SUMMARY"

무엇을 재나
  · 사연 하나를 `assistant/search.js` 에 그대로 넣고, 상위 결과의 섹터를 정답(primary)과 견준다.
      top1 — 첫 결과의 섹터가 정답 섹터에 있는가
      top3 — 상위 3건 안에 정답 섹터가 있는가
      route1/route3 — 선참조 지도(`rag-preface.json`)가 집은 후보 섹터로 같은 것을 잰다(마이덱 추천이 쓰는 길)
  · 정답은 사연 파일의 `expected.primary`(그 질문에 답하는 섹터)다. 사연은 전부 자체 작성(합성)이며
    실제 내담자 정보·대화 원문이 없다(각 줄의 `source`·`license` 참고).

사전을 고친 뒤 이 숫자가 내려가면, 그 항목(`assistant/data/synonym-map.json`)의 말·섹터·세기(p)를
되짚는다. 이 검사는 숫자를 «보고» 판단하는 도구이고, CI 상시 검사에는 넣지 않았다(2분쯤 걸린다).
"""
import argparse
import functools
import http.server
import json
import os
import sys
import threading

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
INTENTS = os.path.join(ROOT, 'assistant', 'test', 'witw-counseling-intents.jsonl')
CAT_NAME = {'youth': '청년', 'mid': '중장년', 'wage': '임금·노동', 'career_break': '경력단절',
            'transition': '전직', 'crisis': '위기·긴급', 'docs': '서류·면접', 'slang': '은어',
            'counselor_study': '상담사 학습'}


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve():
    handler = functools.partial(Quiet, directory=ROOT)
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--intents', default=INTENTS, help='사연 학습셋(jsonl)')
    ap.add_argument('--floor-top1', type=float, default=0, help='1순위 적중률 하한(0~1). 정하면 그 아래에서 실패')
    ap.add_argument('--floor-top3', type=float, default=0, help='3순위 적중률 하한(0~1)')
    ap.add_argument('--summary-file', default='')
    ap.add_argument('--show', type=int, default=12, help='빗나간 사연을 몇 건 보여 줄지')
    a = ap.parse_args()

    from playwright.sync_api import sync_playwright

    rows = [json.loads(line) for line in open(a.intents, encoding='utf-8') if line.strip()]
    if not os.path.exists(os.path.join(ROOT, 'assistant', 'data', 'synonym-map.json')):
        print('· 동의어 사전이 없습니다 — 사전 없이(약어 사전만으로) 잽니다.', file=sys.stderr)

    srv = serve()
    base = 'http://127.0.0.1:%d/' % srv.server_address[1]
    got = []
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
            pg.wait_for_function('window.JCAssistSearch.ready()', timeout=60000)
            for r in rows:
                g = pg.evaluate("""(q) => {
                    const S = window.JCAssistSearch;
                    const res = S.search(q, {limit: 10});
                    const rt = S.route(q, {limit: 5});
                    return {top: res.map(x => x.sector), route: rt.map(x => x.id),
                            added: S.analyze(q).added.map(x => x.word)};
                }""", r['utterance'])
                prim = set(r['expected']['primary'])
                got.append({'id': r.get('id', ''), 'cat': r.get('cat', ''), 'q': r['utterance'], 'primary': sorted(prim),
                            'top': g['top'], 'route': g['route'], 'added': g['added'],
                            'top1': bool(g['top']) and g['top'][0] in prim,
                            'top3': any(s in prim for s in g['top'][:3]),
                            'route1': bool(g['route']) and g['route'][0] in prim,
                            'route3': any(s in prim for s in g['route'][:3])})
            if errs:
                print('✗ 콘솔 오류 %d건: %s' % (len(errs), ' | '.join(errs[:3])), file=sys.stderr)
            b.close()
    finally:
        srv.shutdown()

    n = len(got)
    def count(k): return sum(1 for x in got if x[k])
    def pct(k): return 100.0 * count(k) / n if n else 0.0
    cats = {}
    for x in got:
        c = cats.setdefault(x['cat'], [0, 0])
        c[0] += 1
        c[1] += 1 if x['top1'] else 0

    out = ['# 상담 은어·동의어 사전 — 사연 %d건 채점' % n, '',
           '| 잰 것 | 적중 | 비율 |', '|---|---|---|',
           '| 1순위(첫 결과 섹터) | %d | **%.1f%%** |' % (count('top1'), pct('top1')),
           '| 3순위 안 | %d | **%.1f%%** |' % (count('top3'), pct('top3')),
           '| 선참조 1순위 | %d | %.1f%% |' % (count('route1'), pct('route1')),
           '| 선참조 3순위 안 | %d | %.1f%% |' % (count('route3'), pct('route3')),
           '', '## 갈래별 1순위', '', '| 갈래 | 사연 | 1순위 적중 |', '|---|---|---|']
    for k, (m, hit) in sorted(cats.items(), key=lambda kv: -kv[1][0]):
        out.append('| %s | %d | %d (%.0f%%) |' % (CAT_NAME.get(k, k), m, hit, 100.0 * hit / m))
    miss = [x for x in got if not x['top1']]
    if miss and a.show:
        out += ['', '## 빗나간 사연 %d건 중 %d건' % (len(miss), min(a.show, len(miss))), '',
                '| 사연 | 정답 섹터 | 첫 결과 |', '|---|---|---|']
        for x in miss[:a.show]:
            out.append('| %s | %s | %s |' % (x['q'][:46].replace('|', '/'), '/'.join(x['primary']),
                                            x['top'][0] if x['top'] else '결과 없음'))
    text = '\n'.join(out)
    print(text)
    if a.summary_file:
        with open(a.summary_file, 'a', encoding='utf-8') as f:
            f.write(text + '\n')

    bad = []
    if a.floor_top1 and pct('top1') / 100.0 < a.floor_top1:
        bad.append('1순위 %.1f%% < 하한 %.1f%%' % (pct('top1'), a.floor_top1 * 100))
    if a.floor_top3 and pct('top3') / 100.0 < a.floor_top3:
        bad.append('3순위 %.1f%% < 하한 %.1f%%' % (pct('top3'), a.floor_top3 * 100))
    for m in bad:
        print('✗ ' + m, file=sys.stderr)
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
