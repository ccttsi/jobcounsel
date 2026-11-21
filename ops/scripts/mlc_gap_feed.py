#!/usr/bin/env python3
"""미매칭 질의 → MLC 자가질문 급식 (MLC 보완 5순위 · 2026-11-22)

사람들이 자료실 검색창에서 **찾았는데 결과가 비거나 약했던 질의**를 모아, MLC 자가질문
파이프라인이 바로 물을 수 있는 «빈틈 후보 질문»으로 바꾼다. 자료실의 닫힌 고리
(수집 → 색인 → 자가질문 → 섹터 → 사용자 반응 → 다시 자가질문)에서 마지막 «사용자 반응»을
자가질문 쪽으로 되돌리는 관문이다.

    python3 ops/scripts/mlc_gap_feed.py                       # 저장소 시험 자료로 한 바퀴
    python3 ops/scripts/mlc_gap_feed.py --events 질의.jsonl   # 브라우저가 남긴 기록으로
    python3 ops/scripts/mlc_gap_feed.py --intents             # 사연 학습셋의 저득점 건으로
    python3 ops/scripts/mlc_gap_feed.py --out-dir /tmp/gap --limit 20 --json

들어오는 것
  · 브라우저 기록(jsonl, `witw-mlc-unmatched/1.0.0`) — `assistant/search.js`의 「미매칭 의심 질의」
    절이 이 기기(localStorage)에만 남긴 줄이다. 네트워크로 나간 적이 없고, 개인정보로 보이는
    입력은 애초에 담기지 않는다.
  · 사연 학습셋(`assistant/test/witw-counseling-intents.jsonl`) — 실제 기록이 아직 없을 때 쓰는
    대체 입력. 합성 사연이라 개인정보가 없고, 엔진이 낮게 본 건만 골라 쓴다.

나가는 것 (--out-dir, 기본 `ops/reports/mlc-gap/`)
  · `gap-candidates.json`  — 순위가 매겨진 빈틈 후보(판정·근거·가까운 섹터·없는 말)
  · `selfqa-feed.json`     — MLC 자가질문 파이프라인의 `questions.json` 에 그대로 합칠 수 있는 모양
  · `report.md`            — 사람이 읽는 표와 다음 단계

판정 네 갈래 (사전 `assistant/data/rag-preface.json` 과 대조)
  · answered — 그 주제를 자기 낱말로 가진 섹터가 있다(급식하지 않는다)
  · wording  — 섹터는 있는데 사용자가 쓴 말이 사전에 없다(말 잇기 후보)
  · thin     — 걸치기만 한다(그 주제의 주인이 없다)
  · gap      — 낱말 절반 이상이 어느 섹터에도 없다(자료가 아예 없다)

지키는 선
  · 개인정보는 담지도 내보내지도 않는다 — 걸러진 줄은 내용을 버리고 이유와 건수만 센다.
  · 저작권 — 이 스크립트는 «사용자가 쓴 검색어»와 «자료실이 이미 가진 낱말»만 본다. 외부 자료를
    가져오지 않으므로 새 라이선스 문제가 생기지 않는다.
  · 정크·개인정보 규칙은 `assistant/search.js` 의 같은 규칙과 짝이다(시험 `ops/tests/`가 둘을 맞대어 본다).
"""
import argparse
import json
import math
import os
import re
import sys
import unicodedata
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PREFACE = os.path.join(ROOT, 'assistant', 'data', 'rag-preface.json')
INTENTS = os.path.join(ROOT, 'assistant', 'test', 'witw-counseling-intents.jsonl')
SAMPLE_EVENTS = os.path.join(ROOT, 'ops', 'tests', 'data', 'witw-mlc-unmatched-sample.jsonl')
DEFAULT_OUT = os.path.join(ROOT, 'ops', 'reports', 'mlc-gap')

KST = timezone(timedelta(hours=9))
SCHEMA_EVENT = 'witw-mlc-unmatched/1.0.0'
SCHEMA_FEED = 'witw-mlc-gap-feed/1.0.0'
SCHEMA_QUESTION = 'witw-mlc-selfqa-question/1.0.0'

# 브라우저가 매기는 신호의 경계 — `assistant/search.js` 의 GAP.weak · GAP.unsure 와 같은 값.
WEAK_TOP = 8.0
DIM_TOP = 14.0
# 판정 경계 — 검색어 낱말이 자료실 낱말과 얼마나 닿는가
COVER_ANSWER = 0.66
COVER_THIN = 0.34

STOP = {
    '알려줘', '알려', '알려주세요', '궁금', '궁금해', '궁금해요', '있나요', '있어요', '있어', '있는', '있는데',
    '뭐', '뭔가', '뭐가', '무엇', '어떤', '어떻게', '어떡', '좀', '그', '이', '저', '및', '그리고',
    '경우', '때', '것', '게', '더', '잘', '제발', '검색', '찾아', '찾아줘', '추천', '추천해',
    '할까', '해야', '하나요', '싶어요', '싶다', '거야', '건가요', '인가요', '하는데', '한데',
    '받았어요', '받았는데', '해요', '입니다', '싶습니다', '싶은데', '알고', '보고', '한번', '정도',
    '어디', '어느', '얼마', '언제', '누가', '가장', '너무', '아주', '진짜', '정말', '계속', '그냥',
    '이런', '그런', '저런', '여기', '거기', '저기', '우리', '제가', '저는', '저희', '본인', '사람',
}

# 문장 끝맺음 — 사연처럼 긴 문장이 들어올 때 낱말 끝에 붙는다(두 번까지 벗긴다)
ENDS = ('입니까', '습니다', '됩니다', '까요', '나요', '어요', '아요', '네요', '지요', '니까', '이라고', '이라는')

# 조사·어미 — `assistant/search.js` 의 TAIL 과 같은 목록(낱말 끝에서만 뗀다)
JOSA = (
    '에서는', '에게서', '이라고', '이라고는', '으로서', '으로써', '이랑은', '한테서',
    '에서', '에게', '한테', '으로', '라고', '라는', '이라', '이며', '이고', '이랑', '부터', '까지',
    '보다', '처럼', '만큼', '조차', '마저', '밖에', '하고', '이나', '라도', '라서',
    '은', '는', '이', '가', '을', '를', '의', '에', '와', '과', '도', '만', '로', '랑', '나', '든',
    '했다', '한다', '하면', '해서', '하는', '할', '된', '된다', '되는', '되어', '인데', '인',
    '이야', '이에요', '예요', '이죠', '는데', '지만', '으면', '으니', '아서', '어서',
)

# 도배·무의미 입력 — `assistant/search.js` 의 GAP_JUNK 와 같은 목록
JUNK_WORDS = (
    'asdf', 'qwer', 'zxcv', 'test', 'asdfasdf', 'qwerty', '1234', '12345', 'abcd', 'aaaa',
    'ㅁㄴㅇㄹ', 'ㅂㅈㄷㄱ', 'ㅋㅋㅋ', 'ㅎㅎㅎ', 'ㅇㅇㅇ', 'ㄱㄱㄱ', '...', 'ㅡㅡ',
)
BAD_WORDS = ('씨발', '시발', 'ㅅㅂ', '개새끼', '병신', '좆', '야동', '카지노', '바카라', '도박', '대출광고')

# 어느 섹터에나 쓰이는 행정·일상어 — 답의 근거가 되지 못하므로 점수를 낮춘다(자주 나오는 말은 "섹터 문서 빈도"로도 잡는다).
GENERIC = {
    '신청', '절차', '방법', '사례', '문의', '안내', '준비', '확인', '지원', '제도', '종류', '기준', '조건',
    '관련', '필요', '가능', '문제', '내용', '사람', '회사', '시간', '처음', '시작', '이유', '상황', '정보',
    '자료', '서비스', '대해', '대한', '관해', '경우', '정도', '때문', '어디', '어떤', '얼마', '비용', '금액',
}

# 개인정보 — 이름·연락처·주민등록번호·계좌처럼 «개인을 가리키는» 모양. 하나라도 걸리면 줄을 버린다.
PII_PATTERNS = (
    ('resident', re.compile(r'\d{6}\s?-?\s?\d{7}')),
    ('phone', re.compile(r'\b0\d{1,2}\s?-?\s?\d{3,4}\s?-?\s?\d{4}\b')),
    ('email', re.compile(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}')),
    ('long_number', re.compile(r'\d{5,}')),
    ('id_number', re.compile(r'\b(?!(?:19|20)\d{2}\b)\d{4}\b')),
    ('id_word', re.compile(r'(계좌|카드번호|비밀번호|주민등록|여권번호|인적사항)')),
    ('name_address', re.compile(r'[가-힣](?:씨|님)(?![가-힣])')),
)


# ---------------------------------------------------------------- 글자 다루기
def norm(text):
    """소문자 · 따옴표 제거 · 숫자 사이 구두점 유지 · 글자만 남긴다(검색 엔진과 같은 규칙).

    NFKC 는 글자마다 건다 — 문자열째 걸면 낱자(ㅁ·ㅋ, U+3131~318F)가 조합용 낱자로 바뀌어
    「ㅁㄴㅇㄹ」이 빈 문자열이 된다.
    """
    text = ''.join(ch if '\u3130' <= ch <= '\u318f' else unicodedata.normalize('NFKC', ch)
                   for ch in str(text or '')).lower()
    text = re.sub(r'[\u2018\u2019\u201c\u201d]', '', text)
    text = re.sub(r'(\d)[.,](\d)', r'\1\2', text)
    text = re.sub(r'[^0-9a-z가-힣ㄱ-ㅎ]+', ' ', text)
    return re.sub(r'\s+', ' ', text).strip()


def compact(text):
    return norm(text).replace(' ', '')


def strip_josa(word):
    for tail in JOSA + ENDS:
        if len(word) > len(tail) + 1 and word.endswith(tail):
            return word[:-len(tail)]
    return word


def tokens(text):
    """검색어를 낱말로 — 조사·물음말을 떼고 두 글자 이상만 남긴다."""
    out = []
    for raw in norm(text).split(' '):
        if not raw or raw in STOP:
            continue
        word = strip_josa(strip_josa(raw))
        if len(word) >= 2 and word not in STOP and word not in out:
            out.append(word)
    return out


def bigrams(text):
    flat = compact(text)
    return {flat[i:i + 2] for i in range(len(flat) - 1) if flat[i:i + 2].strip()}


# ---------------------------------------------------------------- 정크·개인정보 거르기
def junk_reason(text):
    """도배·무의미 입력이면 이유를 돌려준다(빈 문자열이면 통과)."""
    raw = str(text or '').strip()
    if len(raw) < 2:
        return 'short'
    if len(raw) > 120:
        return 'long'
    if not re.search(r'[가-힣a-zA-Z0-9]{2}', raw):
        return 'junk'
    flat = compact(raw)
    if not flat:
        return 'blank'
    if re.fullmatch(r'(.)\1+', flat):
        return 'repeat'
    if flat in JUNK_WORDS:
        return 'junk'
    if re.fullmatch(r'[\d\s\-+().]+', raw):
        return 'digits'
    if re.match(r'^(https?:|www\.)', raw, re.I):
        return 'url'
    words = norm(raw).split(' ')
    if len(words) >= 3 and len(set(words)) == 1:
        return 'repeat'
    low = norm(raw)
    for bad in BAD_WORDS:
        if bad in low:
            return 'spam'
    return ''


def pii_reason(text):
    """개인정보로 보이는 입력이면 이유를 돌려준다. 걸리면 내용은 어디에도 남기지 않는다."""
    raw = str(text or '')
    for name, pattern in PII_PATTERNS:
        if pattern.search(raw):
            return name
    return ''


def guard(text):
    """(통과 여부, 이유, 다듬은 질의) — 브라우저 쪽 `JCAssistSearch.gap.check` 와 같은 판단.

    개인정보를 도배 검사보다 먼저 본다 — 숫자만 늘어놓은 전화번호도 «도배»가 아니라 «개인정보»로 남겨야
    이유별 건수를 셀 때 사람이 뜻을 안다(브라우저 쪽도 같은 차례다).
    """
    reason = pii_reason(text)
    if reason:
        return False, 'pii:' + reason, ''
    reason = junk_reason(text)
    if reason:
        return False, reason, ''
    return True, '', str(text).strip()[:80]


# ---------------------------------------------------------------- 자료실 지식
class Vault:
    """자료실이 이미 가진 낱말 — 섹터의 찾기 낱말(k)·선참조 사전(dict)·용어 지도(terms)."""

    def __init__(self, preface):
        self.sectors = [s for s in (preface.get('sectors') or []) if s.get('id')]
        self.entries = preface.get('dict') or []
        self.terms = preface.get('terms') or {}
        self.owned = {}          # 낱말 → 그 낱말을 자기 찾기 낱말로 가진 섹터들
        self.routed = {}         # 낱말 → 그 낱말을 이어 주는 섹터들(선참조 사전)
        for sector in self.sectors:
            for word in self._sector_words(sector):
                self.owned.setdefault(word, set()).add(sector['id'])
                for piece in tokens(word):
                    self.owned.setdefault(piece, set()).add(sector['id'])
        for entry in self.entries:
            ids = set(entry.get('s') or [])
            for form in [entry.get('c')] + list(entry.get('a') or []) + list(entry.get('t') or []):
                for word in tokens(form):
                    self.routed.setdefault(word, set()).update(ids)
        for key, ids in self.terms.items():
            for word in tokens(key):
                self.routed.setdefault(word, set()).update(ids or [])
        self._texts = [compact(' '.join([str(s.get('title') or ''), str(s.get('b') or ''),
                                         str(s.get('d') or ''), str(s.get('k') or '')]))
                       for s in self.sectors]
        self._df_cache = {}
        self._vectors = self._build_vectors()

    def df(self, word):
        """낱말이 몇 개 섹터의 제목·소개·찾기 낱말 안에 나오는가 — «어디에나 쓰이는 말»을 가려낸다."""
        if not word:
            return 0
        if word not in self._df_cache:
            self._df_cache[word] = sum(1 for text in self._texts if word in text)
        return self._df_cache[word]

    @staticmethod
    def _sector_words(sector):
        words = []
        for part in str(sector.get('k') or '').split(','):
            part = norm(part)
            if part:
                words.append(part)
        words.extend(tokens(sector.get('title') or ''))
        return words

    def _build_vectors(self):
        """섹터마다 2-gram TF-IDF — 「이 질의가 어느 섹터와 가까운가」를 재는 데만 쓴다."""
        docs = []
        for sector in self.sectors:
            text = ' '.join([str(sector.get('title') or ''), str(sector.get('b') or ''),
                             str(sector.get('k') or ''), str(sector.get('d') or '')])
            docs.append(bigrams(text))
        df = {}
        for grams in docs:
            for gram in grams:
                df[gram] = df.get(gram, 0) + 1
        self._docs = docs
        self._df = df
        total = max(1, len(docs))
        vectors = []
        for grams in docs:
            vec = {g: (1 + math.log(1 + total / (1 + df.get(g, 0)))) for g in grams}
            length = math.sqrt(sum(v * v for v in vec.values())) or 1.0
            vectors.append((vec, length))
        return vectors

    def sim(self, text, index):
        grams = bigrams(text)
        vec, length = self._vectors[index]
        if not grams or not vec:
            return 0.0
        total = max(1, len(self._vectors))
        df = {g: self._df.get(g, 0) for g in grams}
        q = {g: (1 + math.log(1 + total / (1 + df.get(g, 0)))) for g in grams}
        qlen = math.sqrt(sum(v * v for v in q.values())) or 1.0
        dot = sum(v * vec.get(g, 0.0) for g, v in q.items())
        return round(dot / (qlen * length), 4)

    def nearest(self, text, limit=3, floor=0.05):
        out = []
        for i, sector in enumerate(self.sectors):
            score = self.sim(text, i)
            if score < floor:
                continue
            out.append({'id': sector.get('id'), 'title': sector.get('title') or sector.get('id'),
                        'no': sector.get('no') or '', 'sim': score})
        out.sort(key=lambda row: (-row['sim'], row['id']))
        return out[:limit]

    def title_of(self, sector_id):
        for sector in self.sectors:
            if sector.get('id') == sector_id:
                return sector.get('title') or sector_id
        return sector_id

    def word_score(self, word):
        """이 낱말이 자료실에 닿는 정도 — 1.0 자기 낱말 · 0.6 흔한 낱말 · 0.8 사전에 있음 · 0.5 걸침 · 0 없음.

        「상담」·「취업」처럼 여러 섹터·소개글에 두루 쓰이는 말은 그 자체로 답이 되지 않으므로
        섹터 문서 빈도(df)와 행정·일상어 목록(GENERIC)으로 점수를 깎는다(한 낱말이 판을 다 덮지 않게).
        """
        owners = self.owned.get(word)
        if owners:
            base = 1.0 if len(owners) <= 6 else 0.6
        elif word in self.routed or word in self.terms:
            base = 0.8
        elif len(word) >= 2 and any(len(k) >= 3 and (word in k or k in word) and abs(len(word) - len(k)) <= 1
                                    for k in self.routed):
            base = 0.5
        elif len(word) >= 2 and any(len(k) >= 3 and word in k and len(k) - len(word) <= 2 for k in self.owned):
            base = 0.4
        else:
            return 0.0
        common = word in GENERIC or self.df(word) >= 8
        return round(base * (0.55 if common else 1.0), 2)

    def owners(self, words):
        """이 질의의 «주인»이 될 섹터 — 가장 긴 낱말을 자기 낱말로 가진 곳(두 낱말이면 둘 다)."""
        strong = [w for w in sorted(words, key=len, reverse=True)
                  if self.owned.get(w) and len(self.owned[w]) <= 6][:2]
        if not strong:
            return []
        found = set(self.owned.get(strong[0], set()))
        if len(strong) > 1:
            both = found & set(self.owned.get(strong[1], set()))
            if both:
                found = both
        return sorted(found)


# ---------------------------------------------------------------- 입력 읽기
def read_events(path):
    """브라우저 기록(jsonl) — 깨진 줄과 모르는 schema 는 건너뛴다."""
    events, bad = [], 0
    with open(path, encoding='utf-8') as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                bad += 1
                continue
            if not isinstance(row, dict):
                bad += 1
                continue
            schema = str(row.get('schema') or '')
            if schema and schema != SCHEMA_EVENT:
                bad += 1
                continue
            query = row.get('q')
            if not isinstance(query, str) or not query.strip():
                bad += 1
                continue
            events.append({
                'q': query,
                'at': str(row.get('at') or ''),
                'signal': str(row.get('signal') or ''),
                'n': int(row.get('n') or 0),
                'top': float(row.get('top') or 0),
                'unk': int(row.get('unk') or 0),
                'count': max(1, int(row.get('count') or 1)),
                'src': str(row.get('src') or ''),
                'picked': bool(row.get('picked')),
                'left': bool(row.get('left')),
            })
    return events, bad


def read_intents(path, vault, limit=0):
    """사연 학습셋 — 실제 기록이 없을 때 쓰는 대체 입력. 엔진이 낮게 본 건만 남긴다."""
    rows = []
    with open(path, encoding='utf-8') as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            query = str(row.get('utterance') or '').strip()
            if not query:
                continue
            words = tokens(query)
            coverage = sum(vault.word_score(w) for w in words) / len(words) if words else 0.0
            signal = 'weak' if coverage < COVER_ANSWER else 'dim'
            expected = [str(s) for s in (row.get('expected') or {}).get('primary') or [] if s]
            known = [s for s in expected if s in {x.get('id') for x in vault.sectors}]
            rows.append({'q': query, 'at': str(row.get('built_at') or ''), 'signal': signal,
                         'n': 0, 'top': round(coverage * 100, 1), 'unk': 0, 'count': 1,
                         'src': 'intents', 'picked': False, 'left': False,
                         'expected_owned': bool(known)})
            if limit and len(rows) >= limit:
                break
    return rows


# ---------------------------------------------------------------- 묶기·판정
def merge_groups(events):
    """같은 질의·비슷한 질의를 한 줄로 묶는다(2-gram 자카드 0.75 이상)."""
    groups = []
    for event in events:
        placed = False
        for group in groups:
            if compact(group['q']) == compact(event['q']):
                placed = True
            else:
                a, b = bigrams(group['q']), bigrams(event['q'])
                if a and b and len(a & b) / len(a | b) >= 0.75:
                    placed = True
            if placed:
                group['count'] += event['count']
                group['variants'].append(event['q'])
                group['events'].append(event)
                group['last'] = max(group['last'], event['at'])
                break
        if not placed:
            groups.append({'q': event['q'], 'count': event['count'], 'variants': [event['q']],
                           'events': [event], 'last': event['at']})
    return groups


def classify(group, vault):
    """한 묶음을 자료실 지식과 대조해 판정·근거·질문으로 바꾼다."""
    query = max(group['variants'], key=lambda q: (len(tokens(q)), len(q)))
    words = tokens(query)
    if not words:
        return None
    scores = {w: vault.word_score(w) for w in words}
    coverage = round(sum(scores.values()) / len(words), 3)
    missing = [w for w in sorted(words, key=len, reverse=True) if scores[w] == 0][:3]
    owners = vault.owners(words)
    nearest = []
    for event in group['events']:            # 엔진이 실제로 보여 준 섹터 — 「가까운 곳」의 1차 근거
        for sector_id in event.get('sectors') or []:
            if sector_id and all(n['id'] != sector_id for n in nearest):
                nearest.append({'id': sector_id, 'title': vault.title_of(sector_id), 'no': '', 'sim': 0.0})
    nearest = nearest[:3]
    if not nearest:                          # 기록에 섹터가 없으면(사연셋) 낱말 대조로 가까운 곳을 찾는다
        nearest = vault.nearest(query, floor=0.02)
    best = vault.nearest(query, limit=1, floor=0.0)
    best = best[0]['sim'] if best else 0.0
    weak = any(e['signal'] in ('zero', 'weak') or (e['signal'] == 'dim' and e['left'])
               for e in group['events'])
    labeled = any(e.get('expected_owned') for e in group['events'])
    if labeled:
        # 사연 학습셋의 질문에는 «정답 섹터»가 붙어 있다. 그 섹터가 살아 있으면 내용 빈틈이 아니라 말의 빈틈이다.
        status = 'wording'
    elif coverage >= COVER_ANSWER and owners and not weak:
        status = 'answered'
    elif coverage >= COVER_ANSWER:
        status = 'wording'
    elif coverage >= COVER_THIN:
        status = 'thin'
    else:
        status = 'gap'
    signal_bonus = 0.8 if not weak else 1.0
    return {'q': query, 'words': words, 'coverage': coverage, 'missing': missing,
            'owners': owners, 'nearest': nearest, 'sim': best, 'status': status,
            'signal_bonus': signal_bonus}


def rank(candidate, now):
    """점수 = 자주 나온 정도(45%) + 자료실에 없는 정도(55%), 판정·신선도로 보정."""
    freq = min(1.0, math.log1p(candidate['count']) / math.log1p(5))
    gapness = 1.0 - candidate['coverage']
    weight = {'gap': 1.0, 'thin': 0.75, 'wording': 0.45, 'answered': 0.0}[candidate['status']]
    fresh = 1.0
    if candidate.get('last'):
        try:
            seen = datetime.fromisoformat(candidate['last'].replace('Z', '+00:00'))
            if seen.tzinfo is None:
                seen = seen.replace(tzinfo=KST)
            days = max(0.0, (now - seen).total_seconds() / 86400)
            fresh = 1.0 if days <= 14 else (0.8 if days <= 60 else 0.6)
        except ValueError:
            fresh = 0.9
    score = 100 * (0.45 * freq + 0.55 * gapness) * weight * candidate['signal_bonus'] * fresh
    return round(score, 1), {'freq': round(freq, 3), 'gapness': round(gapness, 3), 'weight': weight,
                             'signal': candidate['signal_bonus'], 'fresh': fresh}


def form_of(query):
    return 'apply' if re.search(r'(어떻게|방법|절차|계산|준비|신청|받으|하려면|되는|따면|배우)', query) else 'explain'


def question_of(candidate, vault):
    """MLC 자가질문 한 줄 — 사람이 쓴 검색어를 그대로 되묻는다(자료가 답을 못 한 자리)."""
    query = candidate['q']
    owner = vault.title_of(candidate['owners'][0]) if candidate['owners'] else ''
    near = candidate['nearest'][0]['title'] if candidate['nearest'] else ''
    missing = ', '.join(candidate['missing']) if candidate['missing'] else ''
    if candidate['status'] == 'gap':
        return (f'「{query}」 — 이런 검색이 답을 받지 못했습니다(자료에 없는 말: {missing or "없음"}). '
                f'이 물음에 답하려면 어떤 섹터가 있어야 하나요?')
    if candidate['status'] == 'thin':
        return (f'「{query}」 — 「{near or "가까운 곳 없음"}」가 걸치기만 합니다(없는 말: {missing or "없음"}). '
                f'이 물음의 주인이 될 섹터는 어디여야 하나요?')
    if candidate['status'] == 'wording':
        return (f'「{query}」 — 「{owner or near}」가 답하는 자리인데 검색이 약했습니다. '
                f'어떤 말을 사전에 이어야 하나요?')
    return ''


def why_of(candidate):
    near = candidate['nearest'][0]['title'] if candidate['nearest'] else '없음'
    missing = ', '.join(candidate['missing']) if candidate['missing'] else '없음'
    reason = {'gap': '낱말 절반 이상이 어느 섹터에도 걸리지 않는다',
              'thin': '걸치기만 하고 그 주제를 가진 섹터가 없다',
              'wording': '섹터는 있으나 사전에 없는 말로 들어왔다',
              'answered': '이미 답하는 섹터가 있다'}[candidate['status']]
    return f'{reason} — 가까운 곳 「{near}」, 없는 말 「{missing}」'


# ---------------------------------------------------------------- 출력
def build(events, vault, now, limit=40, min_count=1, dropped=None):
    groups = merge_groups(events)
    candidates, skipped = [], {'answered': 0, 'picked': 0, 'few': 0}
    for group in groups:
        candidate = classify(group, vault)
        if candidate is None:
            continue
        if all(e['picked'] for e in group['events']):
            skipped['picked'] += 1          # 눌러서 들어간 질의는 빈틈이 아니다
            continue
        if candidate['status'] == 'answered':
            skipped['answered'] += 1
            continue
        if group['count'] < min_count:
            skipped['few'] += 1
            continue
        candidate['count'] = group['count']
        candidate['variants'] = sorted(set(group['variants']))[:4]
        candidate['last'] = group['last']
        candidate['top'] = min([e['top'] for e in group['events']] or [0])
        candidate['score'], candidate['parts'] = rank(candidate, now)
        candidates.append(candidate)
    candidates.sort(key=lambda c: (-c['score'], c['top'], -c['count'], c['q']))
    candidates = candidates[:limit]
    questions = []
    for index, candidate in enumerate(candidates, 1):
        question = question_of(candidate, vault)
        if not question:
            continue
        questions.append({
            'id': f'gap-{index:03d}',
            'schema': SCHEMA_QUESTION,
            'axis': 'gap',
            'form': form_of(candidate['q']),
            'domain': (candidate['owners'][0] if candidate['status'] == 'wording' and candidate['owners']
                       else (candidate['nearest'][0]['id'] if candidate['status'] == 'thin' and candidate['nearest']
                             else 'new')),
            'weight': 3 if candidate['status'] == 'gap' or candidate['count'] >= 3 else (2 if candidate['status'] == 'thin' else 1),
            'q': question,
            'concept': max(candidate['missing'], key=len) if candidate['missing'] else candidate['q'][:20],
            'kw': candidate['words'][:5],
            'source': 'usergap',
            'evidence': {'query': candidate['q'], 'count': candidate['count'], 'status': candidate['status'],
                         'coverage': candidate['coverage'], 'sim': candidate['sim'],
                         'nearest': [n['id'] for n in candidate['nearest']],
                         'platform': 'assistant/search.js 로컬 기록(익명)'},
        })
    feed = {
        'schema': SCHEMA_FEED,
        'built': now.isoformat(timespec='seconds'),
        'inputs': {'events': len(events), 'groups': len(groups),
                   'dropped': dropped or {}, 'skipped': skipped},
        'thresholds': {'weak_top': WEAK_TOP, 'dim_top': DIM_TOP,
                       'cover_answer': COVER_ANSWER, 'cover_thin': COVER_THIN},
        'candidates': [{
            'id': f'gap-{i:03d}',
            'q': c['q'],
            'variants': c['variants'],
            'count': c['count'],
            'last': c['last'],
            'top': c['top'],
            'status': c['status'],
            'coverage': c['coverage'],
            'sim': c['sim'],
            'nearest': c['nearest'],
            'owners': c['owners'],
            'missing': c['missing'],
            'score': c['score'],
            'parts': c['parts'],
            'why': why_of(c),
        } for i, c in enumerate(candidates, 1)],
    }
    return feed, questions


def report_md(feed, questions, source):
    lines = ['# 미매칭 질의 → MLC 자가질문 급식', '',
             f'- 만든 때: {feed["built"]}',
             f'- 입력: {source} (줄 {feed["inputs"]["events"]}개 → 묶음 {feed["inputs"]["groups"]}개)',
             '- 거른 줄: ' + (', '.join(f'{k} {v}' for k, v in sorted(feed['inputs']['dropped'].items())) or '없음'),
             f'- 급식 후보: {len(feed["candidates"])}개 · 이미 답이 있는 질의: {feed["inputs"]["skipped"]["answered"]}개'
             f' · 누르고 들어간 질의: {feed["inputs"]["skipped"]["picked"]}개', '',
             '## 순위', '',
             '| # | 질의 | 건수 | 판정 | 없는 말 | 가까운 섹터 | 점수 |',
             '|---|---|---|---|---|---|---|']
    for row in feed['candidates']:
        near = row['nearest'][0]['title'] if row['nearest'] else '—'
        missing = ', '.join(row['missing']) if row['missing'] else '—'
        lines.append(f'| {row["id"].split("-")[-1]} | {row["q"][:40]} | {row["count"]} | {row["status"]} '
                     f'| {missing} | {near} | {row["score"]} |')
    lines += ['', '## MLC 에 넘길 질문 (selfqa-feed.json)', '']
    for question in questions[:12]:
        lines.append(f'- {question["id"]} [{question["form"]}·무게 {question["weight"]}] {question["q"]}')
    lines += ['', '## 다음 단계', '',
              '1. `selfqa-feed.json` 의 질문을 MLC 자가질문 파이프라인의 `questions.json` 에 합친다.',
              '2. 그 파이프라인이 답 후보(섹터·사전·법령)와 대조해 빈틈 점수를 낸다(점수는 파이프라인이 다시 매긴다).',
              '3. 나온 후보는 「새 섹터」가 아니라 먼저 「사전에 말 잇기」로 처리할 수 있는지 본다(wording).',
              '', '## 한계', '',
              '- 점수 문턱(8·14)은 사연 학습셋 168건의 분포(p5 11.5)와 실제 문장 시험으로 잡았다. 자료가 늘면 다시 잰다.',
              '- 누른 여부는 결과가 `<a>` 링크일 때만 잡힌다. 마이덱의 단추 이동은 잡히지 않아 «이탈»로 남을 수 있다.',
              '- 기록은 기기 안에만 있어, 사람이 꺼내 오지 않으면 이 배치는 시험 자료로만 돈다.', '']
    return '\n'.join(lines)


def write_outputs(feed, questions, out_dir, source):
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, 'gap-candidates.json'), 'w', encoding='utf-8') as handle:
        json.dump(feed, handle, ensure_ascii=False, indent=1)
        handle.write('\n')
    with open(os.path.join(out_dir, 'selfqa-feed.json'), 'w', encoding='utf-8') as handle:
        json.dump({'schema': SCHEMA_FEED, 'built': feed['built'], 'questions': questions},
                  handle, ensure_ascii=False, indent=1)
        handle.write('\n')
    with open(os.path.join(out_dir, 'report.md'), 'w', encoding='utf-8') as handle:
        handle.write(report_md(feed, questions, source))
    return [os.path.join(out_dir, name) for name in ('gap-candidates.json', 'selfqa-feed.json', 'report.md')]


def main(argv=None):
    parser = argparse.ArgumentParser(description='미매칭 질의를 MLC 자가질문 후보로 급식한다')
    parser.add_argument('--events', help='브라우저 기록 jsonl 경로(없으면 저장소 시험 자료)')
    parser.add_argument('--intents', action='store_true', help='사연 학습셋의 저득점 건으로 돌린다')
    parser.add_argument('--intents-path', default=INTENTS, help='사연 학습셋 경로')
    parser.add_argument('--out-dir', default=DEFAULT_OUT, help='보고서를 쓸 폴더')
    parser.add_argument('--limit', type=int, default=20, help='후보를 몇 개까지 남길지')
    parser.add_argument('--min-count', type=int, default=1, help='이 횟수 이상 나온 질의만')
    parser.add_argument('--now', help='기준 시각(ISO). 시험에서 같은 결과를 얻으려고 쓴다')
    parser.add_argument('--json', action='store_true', help='요약을 표준출력으로도 낸다')
    parser.add_argument('--quiet', action='store_true')
    args = parser.parse_args(argv)

    now = datetime.fromisoformat(args.now).replace(tzinfo=KST) if args.now else datetime.now(KST)
    with open(PREFACE, encoding='utf-8') as handle:
        preface = json.load(handle)
    vault = Vault(preface)

    dropped = {}
    if args.intents:
        events = read_intents(args.intents_path, vault)
        source = f'사연 학습셋 {os.path.relpath(args.intents_path, ROOT)}'
    else:
        path = args.events or SAMPLE_EVENTS
        events, bad = read_events(path)
        source = f'브라우저 기록 {os.path.relpath(path, ROOT) if path.startswith(ROOT) else path}'
        if bad:
            dropped['broken'] = bad
        kept = []
        for event in events:
            ok, reason, query = guard(event['q'])
            if not ok:
                dropped[reason] = dropped.get(reason, 0) + 1
                continue
            event['q'] = query
            kept.append(event)
        events = kept

    feed, questions = build(events, vault, now, limit=args.limit, min_count=args.min_count, dropped=dropped)
    paths = write_outputs(feed, questions, args.out_dir, source)

    summary = {'schema': SCHEMA_FEED, 'built': feed['built'], 'events': feed['inputs']['events'],
               'groups': feed['inputs']['groups'], 'dropped': dropped,
               'candidates': len(feed['candidates']), 'questions': len(questions),
               'top': [{'q': c['q'], 'status': c['status'], 'score': c['score']} for c in feed['candidates'][:5]],
               'files': paths}
    if args.json:
        print(json.dumps(summary, ensure_ascii=False, indent=1))
    elif not args.quiet:
        print(f'· 입력 {feed["inputs"]["events"]}줄 → 묶음 {feed["inputs"]["groups"]}개 '
              f'(거른 줄 {sum(dropped.values())}개: {", ".join(f"{k} {v}" for k, v in sorted(dropped.items())) or "없음"})')
        print(f'· 급식 후보 {len(feed["candidates"])}개 · 자가질문 {len(questions)}줄')
        for row in feed['candidates'][:8]:
            print(f'  {row["id"]} [{row["status"]:7}] {row["score"]:5.1f}  {row["q"][:42]}')
        print('· 쓴 파일: ' + ', '.join(os.path.relpath(p, ROOT) if p.startswith(ROOT) else p for p in paths))
    return 0


if __name__ == '__main__':
    sys.exit(main())
