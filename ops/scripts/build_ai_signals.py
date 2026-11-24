#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""환승노선도 「오늘의 신호」 띠 — 브리핑 날짜별 AI 소식 색인.

briefing/data/archive/YYYY-MM-DD.json 에 이미 실려 있는 카드(사실·수치)만 골라
transit/data/ai-signals.json 을 만든다. 새 값을 지어내지 않는다.

- 고르는 카드: theme_key 가 th-ai-labor 인 카드 → 없으면 제목·부제에 AI/인공지능이 있는 카드
- 한 날짜에 한 건, 앞 날짜와 같은 제목이면 건너뛴다(같은 소식이 두 장으로 겹치지 않게)
- 수치: 그 카드의 key_numbers 가운데 첫 번째. 단 「분석한 공고」「조사 규모」처럼
  기사 범위를 말하는 값은 건너뛴다.

    python3 ops/scripts/build_ai_signals.py
"""
import datetime, json, os, re, glob

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ARCH = os.path.join(ROOT, 'briefing', 'data', 'archive')
OUT = os.path.join(ROOT, 'transit', 'data', 'ai-signals.json')
LIMIT = 14                      # 띠에 담는 날짜 수
SINCE = '2026-10-01'            # 너무 오래된 호는 넣지 않는다
SCOPE_WORDS = ('분석', '조사 규모', '규모', '구성', '수험생', '시험장', '공고 수', '기간')
MIN_DATE_GAP = 21               # 최신 호에서 이만큼 거슬러 올라간 날짜까지만


def is_ai(card):
    if card.get('theme_key') == 'th-ai-labor':
        return True
    hay = (card.get('title') or '') + ' ' + (card.get('kicker') or '')
    return bool(re.search(r'AI|인공지능', hay))


def bigrams(text):
    t = re.sub(r'[^0-9a-z가-힣]', '', text.lower())
    return set(t[i:i + 2] for i in range(len(t) - 1))


def alike(a, b):
    """앞 날짜와 같은 소식인지 — 제목 두 글자 조각이 절반 넘게 겹치면 같은 소식으로 본다."""
    x, y = bigrams(a), bigrams(b)
    return bool(x and y) and len(x & y) / float(len(x | y)) >= 0.2


def metric(card):
    kns = card.get('key_numbers') or []
    for kn in kns:
        label = kn.get('label') or ''
        if any(w in label for w in SCOPE_WORDS):
            continue
        if not kn.get('value'):
            continue
        return kn
    return kns[0] if kns else None


def main():
    items, used = [], {}
    dates = sorted((os.path.basename(p)[:-5] for p in glob.glob(os.path.join(ARCH, '*.json'))), reverse=True)
    newest = dates[0] if dates else ''
    since = max(SINCE, (datetime.date.fromisoformat(newest) - datetime.timedelta(days=MIN_DATE_GAP)).isoformat()) if newest else SINCE
    for date in dates:
        if date < since or len(items) >= LIMIT:
            break
        doc = json.load(open(os.path.join(ARCH, date + '.json'), encoding='utf-8'))
        cards = sorted(doc.get('cards') or [], key=lambda c: c.get('order') or 0)
        # 제목에 AI를 내건 카드부터 — 그날의 AI 소식을 가장 앞세운 카드다
        cards.sort(key=lambda c: (0 if 'AI' in (c.get('title') or '') else 1, c.get('order') or 0))
        pick = None
        for card in cards:
            if not is_ai(card):
                continue
            title = (card.get('title') or '').strip()
            if not title or title in used or any(alike(title, t) for t in used):
                continue
            kn = metric(card)
            if not kn:
                continue
            pick = (card, kn, title)
            break
        if not pick:
            continue
        card, kn, title = pick
        used[title] = date
        href = '../briefing/?date=%s#%s' % (date, card.get('id') or '')
        items.append({
            'date': date,
            'card': card.get('id') or '',
            'value': kn.get('value') or '',
            'label': kn.get('label') or '',
            'delta': kn.get('delta') or '',
            'period': kn.get('period') or '',
            'title': title,
            'summary': (card.get('kicker') or '').strip(),
            'href': href,
        })
    out = {
        'version': '1.0.0',
        'updated': items[0]['date'] if items else '',
        'notice': '브리핑(briefing)에 실린 AI 관련 카드 가운데 날짜별 한 건씩, 카드에 적힌 수치와 문장만 옮겼습니다. 원문을 새로 쓰지 않았고, 수치의 출처는 각 날짜 브리핑 카드에 그대로 있습니다.',
        'items': items,
    }
    json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('wrote', OUT, len(items), 'items')
    for it in items:
        print(' ', it['date'], it['card'], it['value'], '|', it['label'], '|', it['title'][:40])


if __name__ == '__main__':
    main()
