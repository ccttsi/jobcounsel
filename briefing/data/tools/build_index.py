#!/usr/bin/env python3
"""17번 브리핑 데이터 색인·연결고리 메타 도구 (사이트 빌드가 아니라 데이터 정비용).

하는 일
 1) 모든 날짜 파일(archive/*.json, news-archive/*.json)의 `archive_dates`를 "보관된 전 날짜(최신이 앞)"로 맞춘다.
    → 미니 달력이 점을 찍을 수 있는 날짜 목록이 여기서 나온다.
 2) `edition.no`(제N호)를 지운다 — 2026-11-19 지면 개편으로 호수 표기를 쓰지 않는다.
 3) 카드마다 `theme_key`·`theme_label`·`region`을 붙인다(이미 있으면 보존).
 4) `chain.json`을 만든다 — 날짜별 카드에서 뽑은 연결고리 색인. 화면은 이 파일 하나만 받는다.

쓰는 법:  python3 briefing/data/tools/build_index.py      (저장소 뿌리에서)
"""
import json, os, re, glob, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # briefing/data
NOW = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9)))
SCHEMA = "1.3.0"

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
MAP = {
    "2026-11-13": {"c01": "th-labor-policy", "c02": "th-youth-employment", "c03": "th-wage-income",
                   "c04": "th-labor-policy", "c05": "th-global-labor", "c06": "th-employment-service",
                   "c07": "th-ai-labor"},
    "2026-11-14": {"c01": "th-employment-service", "c02": "th-skills-training", "c03": "th-youth-employment",
                   "c04": "th-global-labor", "c05": "th-global-labor", "c06": "th-wage-income",
                   "c07": "th-ai-labor"},
    "2026-11-15": {"c01": "th-ai-labor", "c02": "th-youth-employment", "c03": "th-global-labor",
                   "c04": "th-global-labor", "c05": "th-global-labor", "c06": "th-labor-policy"},
    "2026-11-16": {"c01": "th-youth-employment", "c02": "th-labor-policy", "c03": "th-wage-income",
                   "c04": "th-ai-labor", "c05": "th-ai-labor", "c06": "th-ai-labor",
                   "c07": "th-skills-training"},
    "2026-11-17": {"c01": "th-wage-income", "c02": "th-youth-employment", "c03": "th-wage-income",
                   "c04": "th-ai-labor", "c05": "th-labor-policy", "c06": "th-skills-training",
                   "c07": "th-skills-training"},
    "2026-11-18": {"c01": "th-ai-labor", "c02": "th-employment-service", "c03": "th-wage-income",
                   "c04": "th-ai-labor", "c05": "th-macro-economy", "c06": "th-skills-training",
                   "c07": "th-pension-social"},
}

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


def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def save(p, d):
    with open(p, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
        f.write("\n")


def main():
    bdir = os.path.join(ROOT, "archive")
    ndir = os.path.join(ROOT, "news-archive")
    bfiles = sorted(glob.glob(os.path.join(bdir, "*.json")))
    nfiles = sorted(glob.glob(os.path.join(ndir, "*.json")))
    dates = sorted({os.path.basename(p)[:10] for p in bfiles} | {os.path.basename(p)[:10] for p in nfiles},
                   reverse=True)

    for p in bfiles:
        d = load(p)
        date = os.path.basename(p)[:10]
        E = d.get("edition", {})
        E.pop("no", None)
        E.setdefault("date", date)
        d["edition"] = E
        d["schema_version"] = SCHEMA
        d["archive_dates"] = list(dates)
        for c in d.get("cards", []):
            key = MAP.get(date, {}).get(c["id"]) or c.get("theme_key") or guess_theme(c)
            c["theme_key"] = key
            c["theme_label"] = THEMES[key]
            c["region"] = c.get("region") or region_of(c)
        save(p, d)

    for p in nfiles:
        d = load(p)
        d["schema_version"] = "1.2.0"
        d["archive_dates"] = list(dates)
        save(p, d)

    # 오늘 자(briefing.json / news.json)
    bp = os.path.join(ROOT, "briefing.json")
    if os.path.exists(bp):
        d = load(bp)
        E = d.get("edition", {}); E.pop("no", None); d["edition"] = E
        d["schema_version"] = SCHEMA
        d["archive_dates"] = list(dates)
        for c in d.get("cards", []):
            key = MAP.get(E.get("date"), {}).get(c["id"]) or c.get("theme_key") or guess_theme(c)
            c["theme_key"] = key
            c["theme_label"] = THEMES[key]
            c["region"] = c.get("region") or region_of(c)
        save(bp, d)
    np_ = os.path.join(ROOT, "news.json")
    if os.path.exists(np_):
        d = load(np_); d["archive_dates"] = list(dates); save(np_, d)

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
    print("dates:", len(dates), dates[0] if dates else "-", "~", dates[-1] if dates else "-")
    print("themes:", {k: len(v["items"]) for k, v in themes.items()})


if __name__ == "__main__":
    main()
