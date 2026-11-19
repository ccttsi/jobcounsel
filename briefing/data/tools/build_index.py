#!/usr/bin/env python3
"""17번 브리핑 데이터 색인·연결고리 메타 도구 (사이트 빌드가 아니라 데이터 정비용).

하는 일
 1) `archive_dates`를 "그 갈래에 보관된 전 날짜(최신이 앞)"로 맞춘다.
    → 17번 지면 달력은 17번 지면 날짜만, 17-1 원문 달력은 원문 호가 있는 날짜만 점을 찍는다.
 2) `edition.no`(제N호)를 지운다 — 2026-11-19 지면 개편으로 호수 표기를 쓰지 않는다.
 3) 카드마다 `theme_key`·`theme_label`·`region`을 붙인다(이미 있으면 보존).
 4) `chain.json`을 만든다 — 날짜별 카드에서 뽑은 연결고리 색인. 화면은 이 파일 하나만 받는다.
 5) 노동시장 산책에 쓸 수 있는 카드에 `labor_walk: true`·`labor_walk_topic`을 붙이고,
    `/labor/`가 한 번에 받는 `labor-walk.json`(실기사 목록·본문·출처)을 만든다.

쓰는 법:  python3 briefing/data/tools/build_index.py      (저장소 뿌리에서)
"""
import json, os, re, glob, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # briefing/data
NOW = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9)))
SCHEMA = "1.4.0"

THEMES = {
    "th-youth-employment": "청년 고용",
    "th-ai-labor": "AI와 직무 재편",
    "th-wage-income": "임금과 소득",
    "th-global-labor": "해외 노동시장",
    "th-labor-policy": "고용정책과 감독",
    "th-skills-training": "재취업과 직업훈련",
    "th-employment-service": "고용서비스와 상담",
    "th-pension-social": "퇴직과 사회안전망",
    "th-macro-economy": "거시경제와 고용",
}

# 날짜·카드별 주제(사람이 읽고 정한 값). 이후 날짜는 규칙으로 채운다.
GLOBAL_SRC = re.compile(r"BLS|노동통계국|ILO|국제노동기구|IMF|국제통화기금|arXiv|OECD|World Bank|Eurostat|Indeed|Upwork", re.I)


def guess_theme(card):
    cat = card.get("category", "")
    title = card.get("title", "")
    src = ((card.get("source") or {}).get("source_name") or "")
    if "해외 노동시장" in cat:
        return "th-global-labor"
    if "AI" in cat or "AI" in title or "인공지능" in title:
        return "th-ai-labor"
    if "청년" in title or "청년" in cat:
        return "th-youth-employment"
    if "임금" in title or "소득" in title or "노동비용" in title:
        return "th-wage-income"
    if "훈련" in title or "재취업" in title or "자격" in title:
        return "th-skills-training"
    if "연금" in title or "퇴직" in title:
        return "th-pension-social"
    if "성장" in title or "물가" in title:
        return "th-macro-economy"
    if "고용서비스" in title or "상담" in title:
        return "th-employment-service"
    if GLOBAL_SRC.search(src):
        return "th-global-labor"
    return "th-labor-policy"


def region_of(card):
    cat = card.get("category", "")
    src = ((card.get("source") or {}).get("source_name") or "")
    if "해외" in cat or GLOBAL_SRC.search(src):
        return "global"
    return "kr"


# ── 노동시장 산책 실기사 ──────────────────────────────────────────────
# 카드 주제(theme)에서 노동시장 산책의 어문에 바로 쓰는 갈래로 옮긴다.
LABOR_TOPICS = {
    "th-youth-employment": "청년·중장년 고용",
    "th-wage-income": "임금·물가",
    "th-ai-labor": "AI와 직무",
    "th-global-labor": "해외 노동시장",
    "th-labor-policy": "고용정책·감독",
    "th-skills-training": "훈련·재취업",
    "th-employment-service": "고용서비스·채용",
    "th-pension-social": "퇴직·사회안전망",
    "th-macro-economy": "거시경제와 고용",
}
# 노동시장 산책에 쓰기 어려운 카드(시험·수능, 산업활동·소비 같은 고용 바깥 주제)는 뺀다.
LABOR_SKIP = {
    ("2026-10-31", "c01"),   # 생산·소비·투자(산업활동)
    ("2026-10-31", "c03"),   # 승용차 판매
    ("2026-11-16", "c01"),   # 세무사 시험 AI 부정행위
    ("2026-11-18", "c02"),   # 수능 시험장 부정행위
    ("2026-11-19", "c01"),   # 수능 당일 필기구
}


def labor_topic(card, date):
    """노동시장 산책에 쓸 수 있는 카드면 갈래 이름, 아니면 None."""
    if (date, card.get("id")) in LABOR_SKIP:
        return None
    return LABOR_TOPICS.get(card.get("theme_key"))


def tag_labor(card, date):
    topic = labor_topic(card, date)
    if topic:
        card["labor_walk"] = True
        card["labor_walk_topic"] = topic
    else:
        card.pop("labor_walk", None)
        card.pop("labor_walk_topic", None)


def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def save(p, d):
    with open(p, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
        f.write("\n")


def main():
    bdir = os.path.join(ROOT, "archive")
    bp = os.path.join(ROOT, "briefing.json")
    np_ = os.path.join(ROOT, "news.json")
    ndir = os.path.join(ROOT, "news-archive")
    bfiles = sorted(glob.glob(os.path.join(bdir, "*.json")))
    nfiles = sorted(glob.glob(os.path.join(ndir, "*.json")))
    today_date = (load(bp).get("edition") or {}).get("date") if os.path.exists(bp) else None
    bdates = sorted({os.path.basename(p)[:10] for p in bfiles} |
                    ({today_date} if today_date else set()), reverse=True)
    ndates = sorted({os.path.basename(p)[:10] for p in nfiles}, reverse=True)
    dates = bdates

    for p in bfiles:
        d = load(p)
        date = os.path.basename(p)[:10]
        E = d.get("edition", {})
        E.pop("no", None)
        E.setdefault("date", date)
        d["edition"] = E
        d["schema_version"] = SCHEMA
        d["archive_dates"] = list(bdates)
        for c in d.get("cards", []):
            key = c.get("theme_key") or guess_theme(c)
            c["theme_key"] = key
            c["theme_label"] = THEMES[key]
            c["region"] = c.get("region") or region_of(c)
            tag_labor(c, date)
        save(p, d)

    for p in nfiles:
        d = load(p)
        d["schema_version"] = "1.2.0"
        d["archive_dates"] = list(ndates)
        save(p, d)

    # 오늘 자(briefing.json / news.json)
    if os.path.exists(bp):
        d = load(bp)
        E = d.get("edition", {}); E.pop("no", None); d["edition"] = E
        d["schema_version"] = SCHEMA
        d["archive_dates"] = list(bdates)
        bdate = E.get("date") or ""
        for c in d.get("cards", []):
            key = c.get("theme_key") or guess_theme(c)
            c["theme_key"] = key
            c["theme_label"] = THEMES[key]
            c["region"] = c.get("region") or region_of(c)
            tag_labor(c, bdate)
        save(bp, d)
    if os.path.exists(np_):
        d = load(np_); d["archive_dates"] = list(ndates); save(np_, d)

    # chain.json — 화면이 받는 유일한 연결고리 색인
    themes = {}
    for p in sorted(bfiles) + ([bp] if os.path.exists(bp) else []):
        d = load(p)
        date = (d.get("edition") or {}).get("date") or os.path.basename(p)[:10]
        for c in d.get("cards", []):
            k = c.get("theme_key")
            if not k:
                continue
            src = c.get("source") or {}
            bucket = themes.setdefault(k, {"label": THEMES.get(k, k), "items": []})["items"]
            if any(x["date"] == date and x["card_id"] == c.get("id") for x in bucket):
                continue   # briefing.json과 그날 archive가 같은 카드를 두 번 넣지 않게
            if bucket and any(x["title"] == c.get("title") and x["source_url"] == src.get("source_url") for x in bucket):
                continue   # 같은 자료를 여러 날 다시 실은 경우 타임라인에는 처음 한 번만
            bucket.append({
                "date": date,
                "card_id": c.get("id"),
                "title": c.get("title"),
                "kicker": c.get("kicker"),
                "category": c.get("category"),
                "region": c.get("region") or region_of(c),
                "source_name": src.get("source_name"),
                "source_url": src.get("source_url"),
                "published_at": src.get("published_at"),
            })
    for k, v in themes.items():
        v["label"] = THEMES.get(k, v.get("label", k))
        v["items"].sort(key=lambda x: x["date"])
    out = {
        "generated_at": NOW.replace(microsecond=0).isoformat(),
        "schema_version": SCHEMA,
        "note": "날짜별 카드에서 만든 파생 색인. 날짜 JSON을 고친 뒤 이 도구를 다시 돌린다.",
        "dates": dates,
        "themes": themes,
    }
    save(os.path.join(ROOT, "chain.json"), out)

    # labor-walk.json — 노동시장 산책(/labor/)이 한 번에 받는 실기사 색인
    seen, articles = set(), []
    for p in sorted(bfiles) + ([bp] if os.path.exists(bp) else []):
        d = load(p)
        date = (d.get("edition") or {}).get("date") or os.path.basename(p)[:10]
        for c in sorted(d.get("cards", []), key=lambda x: x.get("order") or 0):
            if c.get("labor_walk") is not True:
                continue
            key = (date, c.get("id"))
            if key in seen:
                continue            # briefing.json과 그날 archive가 같은 카드를 두 번 넣지 않게
            seen.add(key)
            step = c.get("three_step") or {}
            src = c.get("source") or {}
            what = str(step.get("what") or "").strip()
            ev = str(step.get("evidence") or "").strip()
            text = what + ("\n\n" + ev if ev else "")
            if not text:
                continue
            articles.append({
                "date": date,
                "card_id": c.get("id"),
                "order": c.get("order"),
                "title": c.get("title"),
                "kicker": c.get("kicker"),
                "category": c.get("category"),
                "topic": c.get("labor_walk_topic"),
                "theme_key": c.get("theme_key"),
                "theme_label": c.get("theme_label"),
                "region": c.get("region"),
                "track": c.get("track"),
                "source_name": src.get("source_name"),
                "source_title": src.get("source_title"),
                "source_url": src.get("source_url"),
                "published_at": src.get("published_at"),
                "license_type": (src.get("license") or {}).get("type"),
                "key_numbers": c.get("key_numbers") or [],
                "text": text,
            })
    articles.sort(key=lambda a: (a["order"] or 0))
    articles.sort(key=lambda a: a["date"], reverse=True)
    ldates = sorted({a["date"] for a in articles}, reverse=True)
    counts = {x: sum(1 for a in articles if a["date"] == x) for x in ldates}
    lw = {
        "schema_version": SCHEMA,
        "generated_at": NOW.replace(microsecond=0).isoformat(),
        "note": "briefing.json·archive/*.json의 카드 중 labor_walk:true(고용·임금·직무·정책 등)를 모은 실기사 색인. "
                "본문은 카드의 「무슨 일·수치·근거」를 그대로 옮긴 우리 말 요약이며 원문 문장이 아니다.",
        "dates": ldates,
        "counts": counts,
        "articles": articles,
    }
    save(os.path.join(ROOT, "labor-walk.json"), lw)

    print("briefing dates:", len(bdates), bdates[-1] if bdates else "-", "~", bdates[0] if bdates else "-")
    print("news dates:", len(ndates), ndates[-1] if ndates else "-", "~", ndates[0] if ndates else "-")
    print("themes:", {k: len(v["items"]) for k, v in themes.items()})
    print("labor-walk:", len(articles), "articles on", len(ldates), "dates")


if __name__ == "__main__":
    main()
