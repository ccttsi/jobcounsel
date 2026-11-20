#!/usr/bin/env python3
"""자료실 검색 인덱스 생성기 — assistant/data/index.json (+ index-dirs.json)

자료실(ccttsi/jobcounsel)의 섹터 데이터에서 **비서가 근거로 쓸 수 있는 경량 색인**을 뽑는다.
- 원본 데이터는 건드리지 않는다. 읽기만 한다.
- 섹터 목록은 `assets/tools.js`(JC_TOOLS) 한 곳에서만 가져온다(개수 하드코딩 없음).
- 값이 확인되지 않은 필드는 지어내지 않고 항목째 생략한다(자료실 저작권·표기 원칙).
- 결과는 수백 KB 안쪽으로 유지한다. 큰 디렉터리(기업·직업분류)는 `index-dirs.json`으로 나눠
  비서를 처음 열 때만 함께 받는다.

쓰는 법
    python3 assistant/build_index.py            # 두 파일 새로 씀
    python3 assistant/build_index.py --check    # 만들지 않고 크기·건수만 확인

index.json
    {
      "v": 1, "built": "2026-11-19T…+09:00",
      "sectors": [{"id","no","title","desc","url","tags"}],
      "docs":    [{"i","s","t","k","x","u","q"?}]
    }
    i=문서 번호, s=섹터 id, t=제목, k=찾기 낱말, x=핵심 한 줄, u=이동 주소,
    u 는 «그 항목이 열리는 자리»를 그대로 담는다 — 섹터마다 쓰는 주소가 다르므로
      ?q=<용어>      (theory·dacum·law 상황·manual·library·vpi·grad …)
      #<아이디>      (cert·company·portals #p=·library #vol-·talk·interview·surgery #m=·id=·decalcomania·briefing·labor #c-·parsons #p<쪽>)
      ?stat=·?station=·?preset= (reality·transit·상담 프리셋)
    을 섞어 쓴다. 받는 쪽은 `assets/core.js` 6) 딥링크가 ?q=를 검색창에 채우고 바로 거른다
    (<html data-jc-deep="off"> 는 섹터가 스스로 받는다는 표시, window.JCDeepLink(q) 는 섹터별 훅).
    주소에 아무 표시가 없는 문서는 search.js 가 «찾은 낱말»을 ?q=로 붙여 보낸다.

index-dirs.json
    {"v":1,"built":"…","company":[],"taxonomy":[[이름,KECO,KSCO],…]}
    company 는 빈 배열로 남겨 둔다(예전 판과 모양을 맞춘다). 기업은 아래 index-companies.json 이 맡는다.

index-companies.json — 기업 명함첩 9,137곳(대문·비서가 «검색할 때만» 받는다)
    {"v":1,"built":"…","fields":"id|name|industry|cat|emp|alias|kw","cats":"E=대기업,…","rows":"…"}
    한 줄에 한 곳: 아이디|이름|업종|분류|직원수|별칭(;로 이음)|찾기 낱말(대표 브랜드·주요 사업)
    아이디는 앞머리를 뺀다(분류 글자 E/M/P/L 이 ENT-/MID-/PUB-/LPI- 를 정한다).

rag-preface.json — 비서가 **맨 먼저** 보는 선참조 지도(작다)
    {"v":1,"built":"…","dict":[…],"sectors":[…],"terms":{…}}
    dict    = [{c:정식 용어, a:[현장말·쓰다 만 앞부분], s:[먼저 볼 섹터], x:한 줄 설명}] —
              원본은 `assistant/aliases.json`. 여기서는 그대로 옮겨 담기만 한다.
    sectors = [{id,no,title,url,b:배지,d:한 줄,c? 없음,k:핵심 낱말(쉼표),n:문서 수}]
    terms   = {낱말: [섹터 id…]} — 낱말 하나로 섹터를 바로 좁히는 길잡이.
    이 파일은 섹터 목록(assets/tools.js)에서 매번 다시 만들어진다. 섹터가 늘면 저절로 따라온다.
"""
import json
import os
import re
import sys
import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(HERE, 'data', 'index.json')
OUT_DIRS = os.path.join(HERE, 'data', 'index-dirs.json')
OUT_PREFACE = os.path.join(HERE, 'data', 'rag-preface.json')
OUT_COMPANIES = os.path.join(HERE, 'data', 'index-companies.json')

COMPANY_KEEP = 1200          # 기업: 직원 수 큰 순으로 이만큼(공공기관은 전부)
COMPANY_MIN = 30             # 직원 수가 이보다 적은 법인은 넣지 않는다
KEY_CAP = 240                 # 문서 낱말(k) 상한 — 약어 펼친 형태까지 들어가게 210에서 올렸다

_ws = re.compile(r'\s+')


def _q(s):
    from urllib.parse import quote
    return quote(str(s or ''), safe='')

# 섹터마다 문서에 함께 붙는 찾기 낱말 — 「자격증」처럼 섹터를 가리키는 말로도 그 섹터 자료가 잡히게.
SECTOR_KW = {
    'theory': '이론,상담이론,진로이론',
    'vpi': '심리검사,L형,흥미,해석',
    'dacum': '데이컴,직무분석,과업,책무',
    'manual': '국민취업지원제도,국취,법령,조문',
    'hud': '국민취업지원제도,국취,판정,수당',
    'law': '법,법령,조문',
    'library': '서재,보고서,책,자료',
    'decalcomania': '학과,전공,직업',
    'univ': '대학,학과,전공',
    'grad': '대학원,진학,전공',
    'talk': '상담대화,상담발문',
    'transit': '노선,절차,준비물',
    'parsons': '파슨스,이북,특성요인',
    'labor': '노동통계,실업률,고용률,통계',
    'cert': '자격증,자격,시험,종목',
    'company': '기업,회사',
    'thermometer': '산업,업황,온도,전망',
    'reality': '통계,착시,현실',
    'briefing': '브리핑,뉴스,오늘',
    'emerging': '신산업,신직무,전망',
    'taxonomy': '직업,직업분류,코드',
    'portals': '채용,구인,포털,사이트',
    'surgery': '공고,이력서,자기소개서,서류',
    'interview': '면접,질문',
    'portfolio': '포트폴리오,작업물',
    'valuechain': '산업,공정,밸류체인,가치사슬,산업구조',
    'flow': '상담플로우,플로우,상담순서,덱,마이덱',
}


def host_of(url):
    """주소에서 도메인만 — `dart.fss.or.kr`처럼 도메인으로 찾는 사람을 받는다."""
    h = re.sub(r'^https?://', '', str(url or '')).split('/')[0].lower()
    return h[4:] if h.startswith('www.') else h


def clip(s, n):
    if not s:
        return ''
    s = _ws.sub(' ', str(s)).strip()
    if len(s) <= n:
        return s
    cut = s[:n]
    if ' ' in cut[max(0, n - max(1, n // 4)):]:
        cut = cut[:cut.rfind(' ')]
    return cut.rstrip(' ,·.…') + '…'


def keys(*vals, cap=200):
    out, seen = [], set()
    for v in vals:
        if not v:
            continue
        items = v if isinstance(v, (list, tuple)) else str(v).split(',')
        for it in items:
            it = _ws.sub(' ', str(it)).strip().strip(',')
            if not it or it in seen:
                continue
            seen.add(it)
            out.append(it)
    s = ','.join(out)
    return s[:cap]


def read_json(*parts):
    p = os.path.join(ROOT, *parts)
    try:
        with open(p, encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print('  · 건너뜀 %s (%s)' % ('/'.join(parts), e), file=sys.stderr)
        return None


def read_text(*parts):
    p = os.path.join(ROOT, *parts)
    try:
        with open(p, encoding='utf-8') as f:
            return f.read()
    except Exception:
        return ''


# ---------------------------------------------------------------- 현장 약어 사전

ALIAS_ENTRIES = []   # [{'c','a','s','x'}]
ALIAS_PAIRS = []     # [(현장말, 정식 용어)] — 색인 낱말에 펼친 형태를 붙일 때 씀


def load_aliases():
    """`assistant/aliases.json` — 직업상담 현장 약어·줄임말 사전(원본)."""
    global ALIAS_ENTRIES, ALIAS_PAIRS
    d = read_json('assistant', 'aliases.json')
    if not isinstance(d, dict):
        print('  · 약어 사전(assistant/aliases.json)을 읽지 못했습니다.', file=sys.stderr)
        return False
    seen_c, pairs, entries = set(), [], []
    for e in d.get('entries') or []:
        c = _ws.sub(' ', str(e.get('c') or '')).strip()
        if not c or c in seen_c:
            continue
        seen_c.add(c)
        forms = []
        for a in e.get('a') or []:
            a = _ws.sub(' ', str(a)).strip()
            if a and a != c and a not in forms:
                forms.append(a)
        entries.append({'c': c, 'a': forms,
                        's': [str(x) for x in (e.get('s') or [])],
                        'x': str(e.get('x') or '')})
        pairs.append((c, c))
        for f in forms:
            pairs.append((f, c))
    ALIAS_ENTRIES, ALIAS_PAIRS = entries, pairs
    return True


def alias_forms(text):
    """문서 본문에 정식 용어가 있으면, 그 문서에 현장말(경단녀·경단·경력단절)을 같이 붙인다.
    「경단」처럼 색인에 없는 말로도 문서를 찾게 하는 첫 번째 장치(두 번째는 search.js 의 확장기)."""
    ct = _ws.sub('', str(text or ''))
    out = []
    for form, canon in ALIAS_PAIRS:
        if canon in ct:
            out.append(form)
    return out


# ---------------------------------------------------------------- 섹터 장부

def _array_body(src, name):
    """`window.<name>=[ … ];` 의 안쪽만 — 다른 장부(JC_LINKS·JC_APPS)를 섞지 않는다."""
    m = re.search(r'window\.' + name + r'\s*=\s*\[', src)
    if not m:
        return ''
    end = src.find('\n];', m.end())
    return src[m.end():end if end > 0 else len(src)]


def _read_book(src, name):
    out = []
    for m in re.finditer(r"\{id:'([a-z0-9_-]+)'", _array_body(src, name)):
        sid = m.group(1)
        body = _array_body(src, name)
        seg = body[m.start():m.start() + 3000]

        def pick(key):
            mm = re.search(r"\b%s:'((?:[^'\\]|\\.)*)'" % key, seg)
            return mm.group(1).replace("\\'", "'") if mm else ''

        tags = re.search(r"\btags:\[((?:[^\]])*)\]", seg)
        meta = re.search(r"\bmeta:\[((?:[^\]])*)\]", seg)
        out.append({
            'id': sid,
            'no': pick('no'),
            'title': pick('title'),
            'desc': pick('desc'),
            'path': pick('path') or './%s/' % sid,
            'badge': pick('badge'),
            'tags': [t.strip().strip("'") for t in (tags.group(1).split(',') if tags else []) if t.strip()],
            'meta': [t.strip().strip("'") for t in (meta.group(1).split(',') if meta else []) if t.strip()],
        })
    return out


def read_tools():
    """`assets/tools.js`의 두 장부를 읽는다(개수 하드코딩 없음).

    JC_TOOLS — 학습·실무 자료(대문 목록·목차·덱 선반). 번호는 여기에만 있다.
    JC_APPS  — 자료가 아닌 «앱»(상담 플로우). 목록에는 없지만 비서 색인·빠른 검색·「이어 보기」에는 있어야 한다.
      그래서 색인에는 «비서 전용 섹터»로 함께 싣는다(아래 build()에서 preset과 같은 방식).
    """
    src = read_text('assets', 'tools.js')
    return _read_book(src, 'JC_TOOLS'), _read_book(src, 'JC_APPS')


# ---------------------------------------------------------------- 섹터별 뽑기

def docs_theory(add):
    src = read_text('theory', 'index.html')
    m = re.search(r'const BASE=\[', src)
    if not m:
        return
    body = src[m.end() - 1:]
    depth, i, instr, esc = 0, 0, False, False
    for i, ch in enumerate(body):
        if instr:
            if esc:
                esc = False
            elif ch == '\\':
                esc = True
            elif ch == '"':
                instr = False
        elif ch == '"':
            instr = True
        elif ch == '[':
            depth += 1
        elif ch == ']':
            depth -= 1
            if depth == 0:
                break
    try:
        items = json.loads(body[:i + 1])
    except Exception as e:
        print('  · 이론 BASE 파싱 실패: %s' % e, file=sys.stderr)
        return
    for it in items:
        add('theory:' + it['id'], 'theory', it.get('title', ''),
            keys(it.get('person'), it.get('keywords')),
            clip(it.get('summary') or it.get('detail'), 135),
            './theory/#t-' + it['id'])


def docs_cert(add):
    d = read_json('cert', 'data', 'certifications.json')
    if not d:
        return
    for it in d.get('items') or []:
        # 요약이 없는 종목도 있다 — 그때는 어느 갈래·등급·시행처인지로 한 줄을 채운다(지어내지 않는다).
        fact = it.get('summary') or ' · '.join(x for x in (it.get('category'), it.get('grade_or_field'),
                                                           it.get('agency')) if x)
        add('cert:' + str(it.get('id')), 'cert', it.get('name', ''),
            keys(it.get('grade_or_field'), it.get('category'), it.get('agency'), it.get('ministry')),
            clip(fact, 60),
            './cert/#' + str(it.get('id')))


def docs_law(add):
    d = read_json('law', 'data', 'laws.json')
    if not d:
        return
    for law in d.get('laws') or []:
        arts = [a if isinstance(a, str) else (a.get('no') or '') for a in (law.get('articles') or [])]
        arts = [a for a in arts if a]
        add('law:' + str(law.get('id')), 'law', law.get('name', ''),
            keys(law.get('short'), law.get('chips'), law.get('keywords'), law.get('why')),
            clip(law.get('one_line'), 130) + (' · 조문 %s' % ', '.join(arts[:6]) if arts else ''),
            './law/#law=' + str(law.get('id')))
    for sit in d.get('situations') or []:
        names = []
        for ref in sit.get('laws') or []:
            nm = ref.get('name') or ref.get('id')
            if nm:
                names.append(str(nm) + ' ' + ', '.join(ref.get('articles') or []))
        add('law:sit:' + str(sit.get('id')), 'law', '상황 — ' + str(sit.get('label', '')),
            keys(sit.get('terms')),
            clip(' · '.join(names), 150), './law/?q=' + _q(sit.get('label', '')))


def docs_thermometer(add):
    d = read_json('thermometer', 'data', 'thermometer.json')
    if not d:
        return
    for it in d.get('industries') or []:
        size = it.get('size') or {}
        fact = it.get('one_line') or ''
        if size.get('value') and size.get('label'):
            fact += ' · %s %s%s' % (size['label'], format(int(size['value']), ','), size.get('unit') or '')
        add('thermometer:' + str(it.get('id')), 'thermometer', it.get('name', ''),
            keys(it.get('en'), it.get('tags'), (it.get('ksic') or {}).get('mid')),
            clip(fact, 150), './thermometer/?q=' + _q(it.get('name', '')))


def docs_valuechain(add):
    """산업별 공정 지도 — 산업 12개와 그 안의 단계 66개.

    주소는 화면이 실제로 받는 `?i=`·`?s=` 딥링크를 그대로 쓴다.
    """
    d = read_json('valuechain', 'data', 'industries.json')
    if not d:
        return
    comps = d.get('companies') or {}
    for it in d.get('industries') or []:
        iid = str(it.get('id') or '')
        if not iid:
            continue
        names = [comps.get(c, {}).get('name', '') for st in it.get('steps') or [] for c in st.get('comps') or []]
        add('valuechain:ind:' + iid, 'valuechain', str(it.get('name', '')) + ' 공정',
            keys(it.get('short'), it.get('en'), [s.get('name') for s in it.get('steps') or []],
                 names[:14], '밸류체인'),
            clip(it.get('tagline') or it.get('structure'), 160), './valuechain/?i=' + _q(iid))
        for st in it.get('steps') or []:
            add('valuechain:step:%s:%s' % (iid, st.get('no')), 'valuechain',
                '%s — %s' % (it.get('name', ''), st.get('name', '')),
                keys(st.get('name'), [comps.get(c, {}).get('name', '') for c in st.get('comps') or []],
                     st.get('jobs') or [], '공정'),
                clip(st.get('what'), 150), './valuechain/?i=' + _q(iid) + '&s=' + str(st.get('no')))


def docs_emerging(add):
    d = read_json('emerging', 'data', 'emerging.json')
    if not d:
        return
    for it in d.get('items') or []:
        add('emerging:item:' + str(it.get('id')), 'emerging', it.get('title', ''),
            keys(it.get('cat'), it.get('kicker')),
            clip(it.get('subtitle') or it.get('summary'), 150), './emerging/?q=' + _q(it.get('title', '')))
    for j in d.get('jobs') or []:
        add('emerging:job:' + str(j.get('id')), 'emerging', j.get('name', ''),
            keys(j.get('en'), j.get('certs'), j.get('study'), '기존 직무' if j.get('kind') == 'old' else '신직무'),
            clip(j.get('role') or j.get('insight'), 145), './emerging/?q=' + _q(j.get('name', '')))
    for c in d.get('categories') or []:
        add('emerging:cat:' + str(c.get('id')), 'emerging', str(c.get('name', '')),
            '분류', '', './emerging/')


def docs_briefing(add):
    d = read_json('briefing', 'data', 'briefing.json')
    if not d:
        return
    for card in d.get('cards') or []:
        three = card.get('three_step') or {}
        nums = ' · '.join('%s %s' % (n.get('label'), n.get('value')) for n in (card.get('key_numbers') or [])[:3] if n.get('label'))
        add('briefing:' + str(card.get('id')), 'briefing', card.get('title', ''),
            keys(card.get('category'), card.get('tags'), card.get('theme_label')),
            clip(' '.join(x for x in [three.get('what'), nums] if x), 165), './briefing/#' + str(card.get('id')))
    for th in d.get('main_themes') or []:
        add('briefing:theme:' + str(th.get('theme_id')), 'briefing', th.get('title', ''),
            keys([i.get('title') for i in (th.get('items') or [])][:4]),
            clip(th.get('summary'), 165), './briefing/#themes')


def docs_interview(add):
    d = read_json('interview', 'data', 'deck.json')
    if not d:
        return
    for e in d.get('encounters') or []:
        add('interview:' + str(e.get('id')), 'interview', clip(e.get('question'), 85),
            keys(e.get('sub_mode'), e.get('interviewer'), '법적 쟁점' if e.get('legal_flag') and e.get('legal_flag') != 'ok' else ''),
            clip(e.get('answer_goal') or e.get('hidden_intent'), 140), './interview/#' + str(e.get('id')))
    for q in d.get('reverse_questions') or []:
        if isinstance(q, dict):
            add('interview:rq:' + str(q.get('id') or clip(q.get('q'), 20)), 'interview', clip(q.get('q') or q.get('question'), 85),
                '역질문', clip(q.get('why') or q.get('goal'), 130), './interview/#rq')


def docs_surgery(add):
    d = read_json('surgery', 'data', 'anatomy.json')
    if d:
        for j in d.get('jd_anatomy') or []:
            add('surgery:jd:' + str(j.get('id')), 'surgery', str(j.get('phrase', '')),
                keys(j.get('cluster'), j.get('signal_type')),
                clip(j.get('hidden_intent'), 140), './surgery/#m=jd&id=' + str(j.get('id')))
        for x in d.get('xray_cases') or []:
            add('surgery:xray:' + str(x.get('id')), 'surgery', clip(x.get('title') or x.get('name'), 85),
                '공고 해부,JD', clip(x.get('summary') or x.get('situation'), 140), './surgery/#m=xr&id=' + str(x.get('id')))
    lex = read_json('surgery', 'data', 'lexicon.json')
    if lex:
        for e in lex.get('entries') or []:
            add('surgery:lex:' + str(e.get('id') or e.get('word')), 'surgery', str(e.get('word') or e.get('term', '')),
                keys(e.get('category')),
                clip(e.get('plain') or e.get('meaning') or e.get('def'), 130),
                './surgery/#m=ly&id=' + _q(str(e.get('id') or e.get('word') or '')))


def docs_reality(add):
    d = read_json('reality', 'data', 'reality_stats.json')
    if not d:
        return
    for c in d.get('illusion_checks') or []:
        add('reality:' + str(c.get('id')), 'reality', str(c.get('category', '')) + ' — ' + clip(c.get('myth_statement'), 60),
            keys(c.get('category'), c.get('unit')),
            clip('실제 %s' % c.get('actual_label'), 140), './reality/?stat=' + str(c.get('id')))


def docs_transit(add):
    d = read_json('transit', 'data', 'transit.json')
    if not d:
        return
    for s in d.get('stations') or []:
        add('transit:' + str(s.get('id')), 'transit', s.get('name', ''),
            keys(s.get('kicker'), s.get('who'), s.get('where')),
            clip(' '.join(s.get('core') or []) or s.get('tip'), 145), './transit/?station=' + str(s.get('id')))
    for a in d.get('assets') or []:
        if isinstance(a, dict):
            add('transit:asset:' + str(a.get('id')), 'transit', clip(a.get('name') or a.get('title'), 75),
                '준비물,서류', clip(a.get('why') or a.get('desc') or a.get('note'), 120), './transit/')


def docs_portals(add):
    d = read_json('portals', 'data', 'portals.json')
    if not d:
        return
    for p in d.get('portals') or []:
        pid = str(p.get('id') or '')
        if not pid:
            continue
        # 별칭·도메인·「가서 볼 수 있는 것」까지 찾기 낱말로 넣는다 — `gosi`·`work24`·`실업급여`로도
        # 그 포털 문서가 잡히게. 그리고 누르면 `#p=아이디`로 그 카드에 바로 도착한다.
        add('portals:' + pid, 'portals', p.get('name', ''),
            keys(p.get('aliases'), host_of(p.get('url')), p.get('shows'),
                 p.get('operator'), p.get('roles'), p.get('eligibility')),
            clip(p.get('strengths'), 130), './portals/#p=' + pid)


def docs_labor(add):
    d = read_json('labor', 'data', 'concepts.json')
    if not d:
        return
    for c in d.get('concepts') or []:
        add('labor:' + str(c.get('id')), 'labor', c.get('title', ''),
            keys(c.get('en'), c.get('group')),
            clip(c.get('one'), 150), './labor/#c-' + str(c.get('id')))
    for u in d.get('unempCases') or []:
        if isinstance(u, dict):
            add('labor:case:' + str(u.get('id') or clip(u.get('title'), 16)), 'labor', clip(u.get('title') or u.get('q'), 75),
                '실업,사례', clip(u.get('answer') or u.get('summary') or u.get('one'), 140), './labor/')


def docs_grad(add):
    wiki = read_json('grad', 'data', 'wiki.json')
    if wiki:
        DAE = {'A1': '인문·사회 계열 대학원', 'A2': '자연·생명·보건 계열 대학원', 'A3': '공학·기술 계열 대학원',
               'A4': '예체능 계열 대학원', 'A5': '의학·치의학·한의학·수의학 대학원'}
        for k, v in (wiki.get('dae') or {}).items():
            add('grad:track:' + k, 'grad', DAE.get(k, '대학원 계열 ' + k), '대학원,계열,전공',
                clip(v, 150), './grad/#wiki/' + k)
        for t in wiki.get('tracks') or []:
            if isinstance(t, dict):
                nm = t.get('id') or t.get('name') or ''
                add('grad:t:' + str(nm), 'grad', clip(nm, 75),
                    '대학원,진학,석사,박사', clip(t.get('one') or t.get('note'), 140), './grad/?q=' + _q(nm))


def docs_univ(add):
    """대학학과위키 — 대학 412곳과 학과 501개(커리어넷·대학알리미 공시). 학과는 한 줄 요약까지."""
    d = read_json('decalcomania', 'data', 'majors.json')
    if not d:
        return
    for u in d.get('universities') or []:
        name = u.get('name')
        if not name:
            continue
        add('univ:u:' + str(u.get('id')), 'univ', name,
            keys(u.get('kind'), u.get('region'), u.get('school_type')),
            clip(' · '.join(x for x in (u.get('kind'), u.get('region')) if x), 26),
            './univ/?q=' + name)
    for m in d.get('majors') or []:
        name = m.get('name')
        if not name:
            continue
        summary = str(m.get('summary') or '')
        first = summary.split('. ')[0].strip()
        add('univ:m:' + str(m.get('id')), 'univ', name,
            keys(m.get('category'), m.get('keyword'), cap=40),
            clip(first, 44), './univ/?q=' + name)


def docs_talk(add):
    """상담 대화 연습장 — 여섯 갈래(되받아 주기·질문·공감…)를 대화 상황으로 찾게."""
    src = read_text('talk', 'data.js')
    if not src:
        return
    for m in re.finditer(r"\{\s*\n?\s*id: '([a-z0-9_-]+)', icon: '([^']*)', name: '([^']*)', term: '([^']*)',\s*\n?\s*when: '([^']*)',", src):
        add('talk:' + m.group(1), 'talk', m.group(3) + ' — ' + m.group(4),
            keys(m.group(5), '상담 대화,멘트,연습'),
            clip(m.group(5), 140), './talk/#' + m.group(1))


def docs_decal(add):
    """커리어데칼코마니 — 직업 552개(jobs.json)와 그 직업에 이르는 학과(links.json).

    제목은 «직업 이름»이다(예전 판은 아이디 J-1 만 썼다). 누르면 그 직업 카드(#J-…)로 바로 간다.
    """
    d = read_json('decalcomania', 'data', 'jobs.json')
    if not d:
        return
    links = read_json('decalcomania', 'data', 'links.json') or {}
    lj = links.get('jobs') or {}
    for j in d.get('jobs') or []:
        jid = str(j.get('id') or '')
        name = str(j.get('name') or '').strip()
        if not jid or not name:
            continue
        keco = j.get('keco') or {}
        ksco = j.get('ksco') or {}
        rel = lj.get(jid) or {}
        majors = rel.get('majors') if isinstance(rel, dict) else []
        txt = ', '.join([m if isinstance(m, str) else (m.get('name') or '') for m in (majors or [])][:5])
        works = j.get('works') or []
        add('decal:' + jid, 'decalcomania', name,
            keys(j.get('group'), keco.get('detail_name'), ksco.get('detail_name'), txt, '직업,학과,전공'),
            clip(works[0] if works else ('관련 학과: ' + txt), 140),
            './decalcomania/#' + jid)


PARSONS_CH = {'intro': '들어가며', 'ch06': '6장 직업 세계를 숫자로', 'ch07': '7장 보스턴 직업국',
              'ch08': '8장 상담 노트', 'outro': '나가며 · 출처와 저작권'}


def docs_parsons(add):
    """다시 읽는 『직업의 선택』 — 장마다 그 장이 시작하는 쪽(#p<쪽번호>)으로 바로 간다."""
    book = read_json('parsons', 'data', 'book.json') or {}
    starts, cur = {}, 0
    for ch in book.get('chapters') or []:
        cd = read_json('parsons', 'data', str(ch.get('file') or ''))
        starts[str(ch.get('id'))] = cur
        cur += len(((cd or {}).get('cards') or []))
    for ch in ('intro', 'ch06', 'ch07', 'ch08', 'outro'):
        d = read_json('parsons', 'data', ch + '.json')
        if not d:
            continue
        cards = d.get('cards') or []
        lead = next((c.get('lead') for c in cards if isinstance(c, dict) and c.get('type') == 'cover' and c.get('lead')), '')
        first = next((c.get('title') for c in cards if isinstance(c, dict) and c.get('title')), '')
        label = PARSONS_CH.get(ch, ch)
        add('parsons:' + ch, 'parsons', clip((label + ' · ' + first).strip(' ·'), 75),
            keys(d.get('title'), d.get('subtitle'), label, '파슨스,직업의 선택,이북,장'),
            clip(lead or first, 150),
            './parsons/#p%d' % (starts.get(ch, 0) + 1))
    g = read_json('parsons', 'data', 'glossary.json')
    if isinstance(g, dict):
        rows = g.get('terms') or g.get('items') or []
        for t in rows if isinstance(rows, list) else []:
            if isinstance(t, dict) and t.get('term'):
                add('parsons:g:' + str(t.get('term')), 'parsons', t.get('term'), '용어',
                    clip(t.get('def') or t.get('meaning'), 120), './parsons/')


def docs_library(add):
    src = read_text('library', 'index.html')
    if not src:
        return
    i = src.find('const VOLS')
    if i < 0:
        return
    seg = src[i:]
    for m in re.finditer(r"\{\s*id:\s*(\d+),(.*?)\n  \}", seg, re.S):
        body = m.group(2)

        def pick(name):
            mm = re.search(r"\b%s:\s*'((?:[^'\\]|\\.)*)'" % name, body)
            return mm.group(1).replace("\\'", "'") if mm else ''

        title = pick('title')
        if not title:
            continue
        add('library:' + m.group(1), 'library', title.replace('<br>', ' '),
            keys(pick('authority'), pick('key'), pick('issue')),
            clip((pick('sub') + ' ' + pick('blurb')).replace('<br>', ' '), 155),
            './library/#vol-%02d' % int(m.group(1)))


TR_CAT = {'job': '직무·업무', 'industry': '산업·현장', 'edu': '학력·자격', 'policy': '고용제도'}


def docs_translator(add):
    """내담자 언어 번역기(translator/data/terms.json) — 현장 용어·약어 한 줄 풀이."""
    d = read_json('translator', 'data', 'terms.json')
    if not d:
        return
    cats = {c.get('id'): c.get('name', '') for c in d.get('categories') or []}
    for t in d.get('terms') or []:
        term = str(t.get('term') or '').strip()
        if not term:
            continue
        add('translator:' + str(t.get('id') or term), 'translator', term,
            keys(t.get('full'), t.get('ko'), t.get('aka'), TR_CAT.get(t.get('cat'), cats.get(t.get('cat'), ''))),
            clip(t.get('easy'), 150),
            './translator/?q=' + _q(term))


def docs_preset(add):
    """상담 프리셋(assets/presets.js) — 상황·유형에 맞는 상담 진행 코스."""
    src = read_text('assets', 'presets.js')
    i = src.find('window.JC_PRESETS')
    if i < 0:
        return
    j = src.find('{', i)
    depth, k, instr, esc = 0, j, False, False
    while k < len(src):
        c = src[k]
        if instr:
            if esc:
                esc = False
            elif c == '\\':
                esc = True
            elif c == '"':
                instr = False
        elif c == '"':
            instr = True
        elif c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                break
        k += 1
    try:
        data = json.loads(src[j:k + 1])
    except Exception as e:
        print('  · 프리셋 파싱 실패: %s' % e, file=sys.stderr)
        return
    for group, label in (('seed', '시드'), ('match', '매치')):
        for p in data.get(group) or []:
            steps = p.get('steps') or []
            qs = []
            for st in steps:
                if st.get('k') or st.get('q'):
                    qs.append((st.get('k') or '') + ' ' + (st.get('q') or ''))
            add('preset:' + str(p.get('id')), 'preset', str(p.get('k', '')),
                keys(p.get('w'), [st.get('k') for st in steps], label + ' 프리셋', '상담 코스', '목차'),
                clip((p.get('why') or '') + ' · ' + ' → '.join([st.get('k') or '' for st in steps]), 170),
                './?preset=' + str(p.get('id')))


def docs_manual(add):
    src = read_text('manual', 'index.html')
    m = re.search(r'const DATA=(\{.*?\});?\s*\n', src, re.S)
    if not m:
        return
    try:
        data = json.loads(m.group(1))
    except Exception:
        return
    for ch in data.get('C') or []:
        if isinstance(ch, list) and len(ch) >= 4:
            add('manual:c' + str(ch[0]), 'manual', '제%d장 %s' % (ch[0], ch[1]),
                keys(ch[2], '국민취업지원제도,국취'),
                clip(ch[3], 130), './manual/?q=' + _q(ch[1]))


def docs_dacum(add):
    src = read_text('dacum', 'index.html')
    for m in re.finditer(r"T\('([A-E]-\d+)',\s*'((?:[^'\\]|\\.)*)'", src):
        add('dacum:' + m.group(1), 'dacum', m.group(2).replace("\\'", "'"),
            keys(m.group(1), '데이컴,과업,DACUM'),
            'DACUM 과업 ' + m.group(1), './dacum/?q=' + _q(m.group(2).replace("\\'", "'")))


def docs_hud(add):
    src = read_text('hud', 'index.html')
    for m in re.finditer(r"\['([^']{2,40})','([^']{2,120})','([^']{2,300})',\[([^\]]*)\]\]", src):
        add('hud:' + m.group(1), 'hud', m.group(1), keys(m.group(4).replace("'", '')),
            clip(m.group(2) + ' ' + m.group(3), 150), './hud/')


def docs_vpi(add):
    src = read_text('vpi', 'index.html')
    for m in re.finditer(r"\{id:'(p\d)',label:'((?:[^'\\]|\\.)*)'", src):
        add('vpi:' + m.group(1), 'vpi', m.group(2).replace("\\'", "'"), 'L형,검사,사례',
            '직업선호도검사 L형 실습 사례', './vpi/?q=' + _q(m.group(2).replace("\\'", "'")))
    for m in re.finditer(r"\['([^']{2,60})','([^']{25,400})'\]", src):
        add('vpi:alt:' + m.group(1), 'vpi', m.group(1), 'L형,해석,주의',
            clip(m.group(2), 140), './vpi/?q=' + _q(m.group(1)))


# ---------------------------------------------------------------- 큰 디렉터리

CAT_KO = {'대기업': 0, '중견기업': 1, '공공기관': 2}

# 기업 명함첩 색인 — 9,137곳 전부를 한 줄씩 담는다. 대문·비서가 «검색할 때만» 받는다.
#   줄 형식: 아이디|이름|업종|분류|직원수|별칭|찾기 낱말
#   아이디는 앞머리(ENT-/MID-/PUB-/LPI-)를 빼고 담는다(분류 글자가 그 앞머리를 정한다).
#   분류: E=대기업, M=중견기업, P=중앙 공공기관, L=지방 공공기관
CAT_LETTER = {'대기업': 'E', '중견기업': 'M', '공공기관': 'P', '지방공공기관': 'L'}
ID_HEAD = {'E': 'ENT-', 'M': 'MID-', 'P': 'PUB-', 'L': 'LPI-'}


def _field(s, n):
    """한 줄 색인의 칸 — 구분자(|)와 줄바꿈을 없애고 길이를 자른다."""
    s = _ws.sub(' ', str(s or '')).replace('|', '/').strip()
    return s[:n]


def build_companies():
    """기업·기관 9,137곳 + 보강 레이어(별칭·대표 브랜드·주요 사업)를 한 파일로.

    이름은 원자료 그대로 두고, 검색용 별칭(해커스·삼전·파바)과 대표 브랜드·주요 사업만
    `company/data/enrich.json` 에서 옮겨 붙인다. 확인되지 않은 값은 넣지 않는다.
    """
    enrich = read_json('company', 'data', 'enrich.json') or {}
    aliases, profiles = {}, {}
    for a in enrich.get('aliases') or []:
        if not isinstance(a, dict):
            continue
        word = _field(a.get('a'), 40)
        if not word:
            continue
        for cid in a.get('ids') or []:
            arr = aliases.setdefault(str(cid), [])
            if word not in arr and len(arr) < 6:
                arr.append(word)
    for cid, p in (enrich.get('profiles') or {}).items():
        if isinstance(p, dict):
            profiles[str(cid)] = p

    rows, seen = [], set()

    def put(c, cat_default=''):
        cid = str(c.get('id') or '')
        if not cid or cid in seen:
            return
        letter = CAT_LETTER.get(str(c.get('category') or cat_default))
        if not letter:
            return
        name = _field(c.get('name'), 60)
        if not name:
            return
        seen.add(cid)
        if letter == 'P':
            industry = c.get('sub_category') or c.get('industry') or ''
        elif letter == 'L':
            industry = c.get('type_detail') or c.get('sub_category') or ''
        else:
            industry = c.get('industry') or ''
        p = profiles.get(cid) or {}
        kw = []
        # ① 원자료에 실린 검색 보강값(중견기업, companies.json v1.4.0) — 공식 홈페이지·공시에서 확인된 대표 제품·업종 낱말
        for x in (c.get('kw') or [])[:5]:
            if str(x).strip():
                kw.append(str(x).strip())
        # main_products 는 kw 가 비어 있는 기업(대부분 위키 유래)에서만 낱말로 쓴다 — DART 로 채운 기업은 같은 값이 kw 에 이미 있다
        if c.get('main_products') and not c.get('kw'):
            kw.append(str(c['main_products']))
        # ② 보강 레이어(enrich.json)의 대표 브랜드·주요 제품
        if p.get('b'):
            kw.append(str(p['b']))
        for x in (p.get('p') or [])[:3]:
            kw.append(str(x))
        # 업종 칸(industry)에 이미 든 말은 검색 낱말에서 덜어 낸다 — 같은 말을 두 번 싣지 않아
        # 그만큼 대표 제품 낱말을 더 실을 수 있다(색인 크기 상한 900KB).
        ind_low = str(industry or '').replace(' ', '')
        kw = [k for k in dict.fromkeys(kw) if k and str(k).replace(' ', '') not in ind_low]
        # 별칭 칸은 좁다(30자). 사람이 실제로 부르는 이름(enrich.json 의 별칭 — 「파바」·「해커스」)을 먼저 넣고,
        # 법인 표기만 다른 이름(「(주)파리크라상」→「파리크라상」)은 뒤에 둔다. 앞에서 잘려도 부르는 이름이 살아남게.
        plain = re.sub(r'\s+', '', re.sub(r'\(\s*주\s*\)|㈜|주식회사|유한회사|\(유\)|\(재\)', '', name)).lower()
        own = [str(a) for a in (c.get('alias') or []) if str(a).strip()]
        own.sort(key=lambda a: 1 if re.sub(r'\s+', '', a).lower() == plain else 0)
        al = aliases.get(cid, []) + own
        parts = [cid.split('-', 1)[1] if '-' in cid else cid, name, _field(industry, 16), letter,
                 str(int(c.get('employees') or 0)),
                 _field(';'.join(dict.fromkeys(al)), 34), _field(', '.join(dict.fromkeys(kw)), 32).strip(' ,')]
        rows.append('|'.join(parts))

    for c in (read_json('company', 'data', 'companies.json') or {}).get('companies') or []:
        put(c)
    for c in (read_json('company', 'data', 'local-public.json') or {}).get('institutions') or []:
        put(c, '지방공공기관')
    rows.sort()
    return {'v': 1, 'built': datetime.datetime.now().astimezone().replace(microsecond=0).isoformat(),
            'fields': 'id|name|industry|cat|emp|alias|kw',
            'cats': ','.join('%s=%s' % (v, k) for k, v in CAT_LETTER.items()),
            'rows': '\n'.join(rows)}


def build_dirs():
    """직업분류(6,700여 개) 한 줄 색인. 기업은 index-companies.json 으로 옮겼다."""
    out = {'v': 1, 'company': [], 'taxonomy': []}
    t = read_json('taxonomy', 'data', 'taxonomy.json')
    if t:
        rows = []
        for j in t.get('jobs') or []:
            nm = j.get('name')
            if not nm:
                continue
            # 한 줄에 「이름|KECO|KSCO」로 담는다(JSON 배열보다 6분의 1쯤 작다).
            rows.append('%s|%s|%s' % (nm, j.get('keco_code') or '', j.get('ksco_code') or ''))
        out['taxonomy'] = '\n'.join(rows)
    return out


def c_rev(c):
    try:
        return float(c.get('revenue') or 0)
    except Exception:
        return 0.0


# ---------------------------------------------------------------- 선참조 지도

def sector_keywords(s):
    """섹터 한 장을 가리키는 핵심 낱말 — 색인 낱말·배지·태그·약어 사전 정식어. 앞에 오는 것부터 중요하다."""
    out, seen = [], set()

    def put(w):
        w = _ws.sub(' ', str(w or '')).strip().strip(',')
        if not w or len(w) < 2 or len(w) > 14 or w in seen:
            return
        seen.add(w)
        out.append(w)

    for t in SECTOR_KW.get(s['id'], '').split(','):
        put(t)
    put(s['badge'])
    for t in s['tags'][:8]:
        put(t)
    # 이 섹터를 먼저 보라고 적힌 약어 사전 항목 — 「경단」→ 번역기·포털·환승노선…
    for e in ALIAS_ENTRIES:
        if s['id'] in e['s']:
            put(e['c'])
            for f in e['a'][:2]:
                put(f)
    keep, n = [], 0
    for w in out:
        if len(keep) >= 20 or n + len(w) > 200:
            break
        keep.append(w)
        n += len(w) + 1
    return keep


def build_preface(sectors, counts):
    rows, terms = [], {}
    for s in sectors:
        ks = sector_keywords(s)
        rows.append({
            'id': s['id'], 'no': s['no'], 'title': s['title'], 'url': s['path'],
            'b': s['badge'], 'd': clip(s['desc'], 90), 'k': ','.join(ks), 'n': counts.get(s['id'], 0),
        })
        for kw in ks:
            ids = terms.setdefault(kw, [])
            if s['id'] not in ids:
                ids.append(s['id'])
    return {
        'v': 1,
        'built': datetime.datetime.now().astimezone().replace(microsecond=0).isoformat(),
        'dict': ALIAS_ENTRIES,
        'sectors': rows,
        'terms': terms,
    }


def check_aliases(by_id):
    """약어 사전이 섹터 장부(assets/tools.js)와 어긋나지 않는지 본다. 어긋나면 실패로 돌린다."""
    bad = 0
    for e in ALIAS_ENTRIES:
        if not e['s']:
            print('  · 약어 「%s」에 먼저 볼 섹터가 없습니다.' % e['c'], file=sys.stderr)
            bad += 1
        for sid in e['s']:
            if sid not in by_id:
                print('  · 약어 「%s」의 섹터 「%s」가 섹터 장부에 없습니다.' % (e['c'], sid), file=sys.stderr)
                bad += 1
    return bad


# ---------------------------------------------------------------- 조립

def build():
    load_aliases()
    materials, apps = read_tools()
    sectors = materials
    # 비서 전용 «섹터» — 대문 목록에는 없지만 찾아 갈 수 있어야 하는 것들(검색에만 쓴다)
    #   · 상담 프리셋 … 자료실 섹터 장부와는 별개
    #   · 앱(JC_APPS — 상담 플로우) … 대문 자료 목록(01~31)에서 빠졌으나 왼쪽 카드덱 단추·검색으로 들어간다
    sectors = sectors + [{'id': 'preset', 'no': '', 'title': '상담 프리셋', 'desc': '상황·유형에 맞는 상담 진행 순서(단계·질문·체크포인트)',
                          'path': './', 'badge': '프리셋', 'tags': ['상담', '프리셋', '코스', '목차'], 'meta': []}]
    sectors = sectors + apps
    by_id = {s['id']: s for s in sectors}
    docs, counts, seen = [], {}, set()

    def add(i, sid, title, kws='', fact='', url=''):
        if not i or i in seen or not title:
            return
        s = by_id.get(sid)
        if not s:
            return
        seen.add(i)
        # 분류 이름 한 줄짜리(신산업 분류 등)는 섹터 낱말을 붙이지 않는다 — 얕은 문서가 위로 올라온다.
        shallow = ':cat:' in i or i.startswith('sector:')
        kk = (kws if shallow else (SECTOR_KW.get(sid, '') + ',' + kws)).strip(',')
        # 약어 사전: 이 문서가 정식 용어를 다루면 현장말(경단녀·경단·국취제…)도 함께 적는다.
        have = _ws.sub('', kk)
        extra = [f for f in alias_forms(title + ' ' + kk + ' ' + fact) if f not in have]
        if extra:
            kk = (kk + ',' + ','.join(extra)).strip(',')
        docs.append({'i': i, 's': sid, 't': clip(title, 100), 'k': kk[:KEY_CAP],
                     'x': fact[:175], 'u': url or s['path']})
        counts[sid] = counts.get(sid, 0) + 1

    for s in sectors:
        add('sector:' + s['id'], s['id'], s['title'], keys(s['tags'], s['badge'], s['meta'][:4]),
            clip(s['desc'], 180), s['path'])

    for fn in (docs_theory, docs_cert, docs_law, docs_thermometer, docs_emerging, docs_briefing,
               docs_interview, docs_surgery, docs_reality, docs_transit, docs_portals, docs_labor,
               docs_grad, docs_decal, docs_parsons, docs_library, docs_manual, docs_dacum,
               docs_hud, docs_vpi, docs_translator, docs_preset, docs_univ, docs_talk, docs_valuechain):
        try:
            fn(add)
        except Exception as e:
            print('  · %s 실패: %s' % (fn.__name__, e), file=sys.stderr)

    payload = {
        'v': 1,
        'built': datetime.datetime.now().astimezone().replace(microsecond=0).isoformat(),
        'sectors': [{'id': s['id'], 'no': s['no'], 'title': s['title'],
                     'desc': clip(s['desc'], 190), 'url': s['path'], 'tags': s['tags'][:12]}
                    for s in sectors],
        'docs': docs,
    }
    payload['_preface'] = build_preface(sectors, counts)
    payload['_alias_bad'] = check_aliases(by_id)
    return payload, counts, sectors


def main():
    payload, counts, sectors = build()
    preface = payload.pop('_preface')
    alias_bad = payload.pop('_alias_bad')
    dirs = build_dirs()
    comp = build_companies()
    blob = json.dumps(payload, ensure_ascii=False, separators=(',', ':'))
    blob2 = json.dumps(dirs, ensure_ascii=False, separators=(',', ':'))
    blob3 = json.dumps(preface, ensure_ascii=False, separators=(',', ':'))
    blob4 = json.dumps(comp, ensure_ascii=False, separators=(',', ':'))
    a, b, c = len(blob.encode()), len(blob2.encode()), len(blob3.encode())
    e = len(blob4.encode())
    print('섹터 %d개 · 문서 %d개 · %.0f KB' % (len(sectors), len(payload['docs']), a / 1024))
    ntax = len(dirs['taxonomy'].split('\n')) if dirs['taxonomy'] else 0
    ncomp = len(comp['rows'].split('\n')) if comp['rows'] else 0
    print('디렉터리 · 직업분류 %d · %.0f KB' % (ntax, b / 1024))
    print('기업 색인 · %d곳(별칭 %d곳) · %.0f KB — 검색할 때만 받는다'
          % (ncomp, sum(1 for r in comp['rows'].split('\n') if r.count('|') == 6 and r.split('|')[5]), e / 1024))
    print('선참조 · 약어 %d개 · 섹터 %d개 · 낱말 %d개 · %.1f KB'
          % (len(preface['dict']), len(preface['sectors']), len(preface['terms']), c / 1024))
    print('합계 %.0f KB (gzip 전)' % ((a + b + c + e) / 1024))
    for k, v in sorted(counts.items(), key=lambda kv: -kv[1]):
        print('  %-14s %5d' % (k, v))
    if alias_bad:
        print('✗ 약어 사전에 섹터 장부와 어긋난 항목 %d개' % alias_bad)
        return 1
    if '--check' in sys.argv:
        return 0
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(blob)
    with open(OUT_DIRS, 'w', encoding='utf-8') as f:
        f.write(blob2)
    with open(OUT_PREFACE, 'w', encoding='utf-8') as f:
        f.write(blob3)
    with open(OUT_COMPANIES, 'w', encoding='utf-8') as f:
        f.write(blob4)
    print('→ %s' % os.path.relpath(OUT, ROOT))
    print('→ %s' % os.path.relpath(OUT_DIRS, ROOT))
    print('→ %s' % os.path.relpath(OUT_PREFACE, ROOT))
    print('→ %s' % os.path.relpath(OUT_COMPANIES, ROOT))
    return 0


if __name__ == '__main__':
    sys.exit(main())
