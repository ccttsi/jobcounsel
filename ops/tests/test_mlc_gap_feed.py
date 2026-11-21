#!/usr/bin/env python3
"""미매칭 질의 급식 시험 — `ops/scripts/mlc_gap_feed.py` 의 불량 입력 차단과 판정.

CI(`static-checks` → `validate_repo.py` 의 수집 게이트 단위 검사)가 `ops/tests/test_*.py` 를 모두 돌린다.
    python3 -m unittest discover -s ops/tests -p 'test_*.py' -v
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCRIPTS = os.path.join(ROOT, 'ops', 'scripts')
if SCRIPTS not in sys.path:
    sys.path.insert(0, SCRIPTS)

import mlc_gap_feed as feed  # noqa: E402

SAMPLE = os.path.join(ROOT, 'ops', 'tests', 'data', 'witw-mlc-unmatched-sample.jsonl')
NOW = datetime(2026, 11, 22, 3, 0, tzinfo=feed.KST)


def vault():
    with open(feed.PREFACE, encoding='utf-8') as handle:
        return feed.Vault(json.load(handle))


class GuardTests(unittest.TestCase):
    """정크·개인정보 거르기 — 이 게이트의 본체다(여기서 새면 기기와 보고서에 남는다)."""

    def test_junk_removed(self):
        for text in ['asdf', 'qwer', 'ㅁㄴㅇㄹ', 'ㅂㅈㄷㄱ', 'ㅋㅋㅋㅋㅋ', '아아아아', 'ㅇ', '',
                     '1234', '2024 2025 2026', 'https://example.com/x', 'aaaa', '   ']:
            ok, reason, _ = feed.guard(text)
            self.assertFalse(ok, f'{text!r} 는 걸러야 한다')
            self.assertTrue(reason, f'{text!r} 에는 이유가 붙어야 한다')

    def test_pii_removed(self):
        for text in ['010-1234-5678 문의', '01012345678', '02-123-4567',
                     '주민등록번호 900101-1234567', 'a@b.co.kr 로 연락', '계좌번호 알려줘',
                     '김씨 상담 문의', '사번 1234567', '1985 0312']:
            ok, reason, _ = feed.guard(text)
            self.assertFalse(ok, f'{text!r} 는 개인정보라 걸러야 한다')
            self.assertTrue(reason.startswith('pii'), f'{text!r} 이유: {reason}')

    def test_real_queries_kept(self):
        for text in ['산재 신청', '2026년 최저임금', '3.3% 퇴직금', '국비로 배울 수 있는 거 뭐 있어',
                     '경력단절 5년 뒤 재취업', 'MES 생산관리']:
            ok, reason, cleaned = feed.guard(text)
            self.assertTrue(ok, f'{text!r} 는 통과해야 한다(이유 {reason})')
            self.assertEqual(cleaned, text.strip())

    def test_long_query_trimmed(self):
        ok, _, cleaned = feed.guard('가' * 200)
        self.assertFalse(ok)
        ok, _, cleaned = feed.guard('산재 신청 절차 ' * 3)
        self.assertTrue(ok)
        self.assertLessEqual(len(cleaned), 80)


class TextTests(unittest.TestCase):
    def test_norm_keeps_jamo_and_number_punctuation(self):
        self.assertEqual(feed.norm('ㅁㄴㅇㄹ'), 'ㅁㄴㅇㄹ')
        self.assertEqual(feed.norm('3.3%'), '33')
        self.assertEqual(feed.norm('10,320원'), '10320원')
        self.assertEqual(feed.norm('  산재   신청  '), '산재 신청')

    def test_tokens_strip_josa_and_stopwords(self):
        self.assertEqual(feed.tokens('경력단절여성은 어떻게 하나요'), ['경력단절여성'])
        self.assertEqual(feed.tokens('퇴직금이 안 들어왔는데'), ['퇴직금', '들어왔'])
        self.assertEqual(feed.tokens('무엇입니까'), [])


class VaultTests(unittest.TestCase):
    """자료실이 이미 가진 낱말과 대조 — 「판정」이 여기서 갈린다."""

    @classmethod
    def setUpClass(cls):
        cls.vault = vault()

    def test_specific_word_is_owned(self):
        self.assertGreaterEqual(self.vault.word_score('경력단절'), 0.8)
        self.assertIn('translator', self.vault.owners(['경력단절']) or ['translator'])

    def test_common_word_scores_lower(self):
        self.assertLess(self.vault.word_score('취업'), self.vault.word_score('경력단절여성'))

    def test_unknown_word_scores_zero(self):
        for word in ['노무사', '소방공무원', '애가']:
            self.assertEqual(self.vault.word_score(word), 0.0, word)

    def test_nearest_returns_titles(self):
        rows = self.vault.nearest('퇴직금 계산', limit=2)
        self.assertTrue(rows)
        self.assertTrue(all(row.get('title') for row in rows))


class GroupTests(unittest.TestCase):
    def test_merge_by_same_and_similar(self):
        events = [{'q': '집단 프로그램 회기 설계', 'at': '2026-11-21T10:00:00+09:00', 'signal': 'dim',
                   'n': 5, 'top': 12.0, 'unk': 0, 'count': 1, 'src': '', 'picked': False, 'left': True},
                  {'q': '집단프로그램 회기 설계', 'at': '2026-11-21T11:00:00+09:00', 'signal': 'dim',
                   'n': 5, 'top': 12.0, 'unk': 0, 'count': 1, 'src': '', 'picked': False, 'left': True},
                  {'q': '집단 프로그램 회기 설계', 'at': '2026-11-21T12:00:00+09:00', 'signal': 'weak',
                   'n': 3, 'top': 9.0, 'unk': 0, 'count': 2, 'src': '', 'picked': False, 'left': False}]
        groups = feed.merge_groups(events)
        self.assertEqual(len(groups), 1)
        self.assertEqual(groups[0]['count'], 4)
        self.assertEqual(groups[0]['last'], '2026-11-21T12:00:00+09:00')

    def test_classify_statuses(self):
        self.vault = vault()
        statuses = {}
        for query in ['퇴직금 계산', '노무사 시험 일정', '소방공무원 체력시험']:
            group = {'q': query, 'count': 1, 'variants': [query], 'last': '', 'events': [
                {'q': query, 'at': '', 'signal': 'weak', 'n': 3, 'top': 5.0, 'count': 1,
                 'picked': False, 'left': True, 'sectors': []}]}
            statuses[query] = feed.classify(group, self.vault)['status']
        self.assertIn(statuses['퇴직금 계산'], ('wording', 'answered'))
        self.assertEqual(statuses['소방공무원 체력시험'], 'gap')


class BuildTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.vault = vault()
        cls.events, cls.broken = feed.read_events(SAMPLE)

    def test_read_events_skips_broken_and_unknown_schema(self):
        self.assertEqual(self.broken, 0)
        with tempfile.NamedTemporaryFile('w', suffix='.jsonl', delete=False, encoding='utf-8') as handle:
            handle.write('{"schema":"witw-mlc-unmatched/1.0.0","q":"산재 신청","at":"2026-11-21T09:00:00+09:00"}\n')
            handle.write('깨진 줄\n')
            handle.write('{"schema":"다른것/1.0.0","q":"무시"}\n')
            handle.write('{"schema":"witw-mlc-unmatched/1.0.0","q":""}\n')
            path = handle.name
        try:
            events, bad = feed.read_events(path)
        finally:
            os.unlink(path)
        self.assertEqual(len(events), 1)
        self.assertEqual(bad, 3)

    def test_sample_run_shape(self):
        kept = []
        for event in self.events:
            ok, _, query = feed.guard(event['q'])
            if ok:
                event['q'] = query
                kept.append(event)
        result, questions = feed.build(kept, self.vault, NOW, limit=20)
        self.assertGreaterEqual(len(result['candidates']), 8)
        self.assertEqual(result['schema'], feed.SCHEMA_FEED)
        self.assertEqual(len(questions), len(result['candidates']))
        for row in result['candidates']:
            self.assertIn(row['status'], ('gap', 'thin', 'wording'))
            self.assertGreaterEqual(row['score'], 0)
            self.assertTrue(row['why'])
        self.assertEqual({q['id'] for q in questions}, {row['id'] for row in result['candidates']})
        statuses = {row['status'] for row in result['candidates']}
        self.assertIn('gap', statuses)
        self.assertIn('wording', statuses)

    def test_picked_and_answered_are_not_fed(self):
        result, _ = feed.build([e for e in self.events if feed.guard(e['q'])[0]], self.vault, NOW, limit=50)
        queries = [row['q'] for row in result['candidates']]
        self.assertNotIn('메타버스 직업', queries)      # 눌러서 들어간 질의
        self.assertGreaterEqual(result['inputs']['skipped']['picked'], 1)

    def test_deterministic(self):
        kept = [e for e in self.events if feed.guard(e['q'])[0]]
        first, _ = feed.build([dict(e) for e in kept], self.vault, NOW, limit=20)
        second, _ = feed.build([dict(e) for e in kept], self.vault, NOW, limit=20)
        self.assertEqual(json.dumps(first, ensure_ascii=False), json.dumps(second, ensure_ascii=False))


class OutputTests(unittest.TestCase):
    def test_files_written_without_pii(self):
        out = tempfile.mkdtemp(prefix='gap-feed-')
        try:
            feed.main(['--out-dir', out, '--limit', '20', '--now', NOW.isoformat(), '--quiet'])
            names = sorted(os.listdir(out))
            self.assertEqual(names, ['gap-candidates.json', 'report.md', 'selfqa-feed.json'])
            joined = ''
            for name in names:
                with open(os.path.join(out, name), encoding='utf-8') as handle:
                    joined += handle.read()
            for leaked in ['010-1234-5678', '01012345678', '900101-1234567', 'a@b.co.kr', '김씨']:
                self.assertNotIn(leaked, joined, f'{leaked} 가 산출물에 남았다')
            for junk in ['asdf', 'ㅁㄴㅇㄹ']:
                self.assertNotIn(junk, joined)
            with open(os.path.join(out, 'gap-candidates.json'), encoding='utf-8') as handle:
                data = json.load(handle)
            self.assertEqual(data['schema'], feed.SCHEMA_FEED)
            self.assertGreaterEqual(data['inputs']['dropped'].get('pii:phone', 0), 1)
        finally:
            shutil.rmtree(out, ignore_errors=True)

    def test_intents_mode_runs(self):
        out = tempfile.mkdtemp(prefix='gap-intents-')
        try:
            feed.main(['--intents', '--out-dir', out, '--limit', '5', '--now', NOW.isoformat(), '--quiet'])
            with open(os.path.join(out, 'gap-candidates.json'), encoding='utf-8') as handle:
                data = json.load(handle)
            self.assertLessEqual(len(data['candidates']), 5)
            for row in data['candidates']:
                self.assertIn(row['status'], ('thin', 'wording'))
        finally:
            shutil.rmtree(out, ignore_errors=True)


class CrossCheckTests(unittest.TestCase):
    """브라우저(search.js)와 배치(python)의 거르기 규칙이 같은가 — 한쪽만 고쳐지는 것을 막는다."""

    def test_js_filter_agrees_with_python(self):
        node = os.environ.get('NODE') or shutil.which('node')
        if not node:
            self.skipTest('node 가 없어 브라우저 쪽 거르기를 맞대어 보지 못했다')
        script = r"""
const fs = require('fs');
global.window = {};
global.navigator = { doNotTrack: '1' };
global.document = { addEventListener: function () {}, visibilityState: 'visible' };
global.localStorage = { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} };
global.sessionStorage = global.localStorage;
global.fetch = function () { return Promise.resolve({ ok: false, json: function () { return Promise.resolve({}); } }); };
eval(fs.readFileSync(process.argv[2], 'utf8'));
const cases = JSON.parse(process.argv[3]);
const out = cases.map(function (q) { return window.JCAssistSearch.gap.check(q); });
console.log(JSON.stringify(out));
"""
        cases = ['asdf', 'ㅁㄴㅇㄹ', 'ㅋㅋㅋㅋㅋ', '아아아아', '1234', 'https://example.com/x',
                 '010-1234-5678 문의', '주민등록번호 900101-1234567', 'a@b.co.kr', '김씨 상담 문의',
                 '산재 신청', '2026년 최저임금', '3.3% 퇴직금', '국비로 배울 수 있는 거 뭐 있어',
                 'ㅇ', '']
        with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as handle:
            handle.write(script)
            path = handle.name
        try:
            done = subprocess.run([node, path, os.path.join(ROOT, 'assistant', 'search.js'),
                                   json.dumps(cases, ensure_ascii=False)],
                                  capture_output=True, text=True, timeout=120)
        finally:
            os.unlink(path)
        self.assertEqual(done.returncode, 0, done.stderr[-600:])
        rows = json.loads(done.stdout)
        for query, row in zip(cases, rows):
            ok, reason, _ = feed.guard(query)
            self.assertEqual(bool(row['ok']), ok, f'{query!r}: JS {row} / Python {ok} ({reason})')
            if not ok:
                self.assertEqual(row['why'], 'pii' if reason.startswith('pii') else reason,
                                 f'{query!r}: 이유가 다르다 — JS {row["why"]} / Python {reason}')


if __name__ == '__main__':
    unittest.main(verbosity=2)
