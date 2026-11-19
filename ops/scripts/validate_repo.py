#!/usr/bin/env python3
"""자료실 통합 검증 — CI 게이트의 정적 검사 (1순위 · 2순위)

  python3 ops/scripts/validate_repo.py                    # 전체 검사
  python3 ops/scripts/validate_repo.py --only json,js     # 일부만
  python3 ops/scripts/validate_repo.py --pr-json pr.json  # PR 역할 가드레일 포함
  python3 ops/scripts/validate_repo.py --summary-file "$GITHUB_STEP_SUMMARY"

검사 항목
  json     — briefing/·emerging/ 의 모든 .json 파싱·중복 키·스키마 필수 필드·참조 무결성
             + 대문 상담 프리셋(assets/presets.js)이 섹터 장부(assets/tools.js)와 맞는지
  license  — 저작권 Track A/B 교차 가드레일 (PRESS·KOGL-NONE·FACTS-ONLY·미확인 라이선스가 Track A면 실패)
  js       — 저장소에 든 .js 전부 `node --check` 문법 검사
  role     — PR 제목/라벨 기반 역할 분리 가드레일 ([data-only] PR이 화면 코드를 건드리면 실패)

종료 코드 0 = 통과, 1 = 실패. 실패 항목은 전부 모아서 한 번에 보여 준다(첫 오류에서 멈추지 않는다).
"""
import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIRS = ("briefing/data", "emerging/data", "thermometer/data", "translator/data")

# 재가공이 허락되지 않는 라이선스 — 이 라이선스를 단 자료는 절대 Track A가 될 수 없다.
RESTRICTED_LICENSE_TYPES = {"PRESS", "KOGL-NONE", "FACTS-ONLY"}
UNKNOWN_LICENSE_TYPES = {"", "UNKNOWN", "UNVERIFIED", "NONE", "N/A", "NULL"}
ALLOWED_TRACKS = {"A", "B"}

CODE_EXT = (".html", ".css", ".js", ".mjs", ".ts", ".tsx", ".jsx")
DATA_MARKERS = ("/data/", "data/")

problems = []   # (검사, 메시지)
notes = []      # 참고(실패 아님)


def fail(check, msg):
    problems.append((check, msg))


def note(msg):
    notes.append(msg)


# ---------------------------------------------------------------- 파일 도우미
def rel(path):
    return os.path.relpath(path, ROOT).replace(os.sep, "/")


def iter_json(directory):
    base = os.path.join(ROOT, directory)
    for dirpath, _dirnames, filenames in os.walk(base):
        for name in sorted(filenames):
            if name.endswith(".json"):
                yield os.path.join(dirpath, name)


class DuplicateKey(Exception):
    pass


def _no_duplicates(pairs):
    seen = set()
    out = {}
    for key, value in pairs:
        if key in seen:
            raise DuplicateKey(key)
        seen.add(key)
        out[key] = value
    return out


def load_json(path):
    """UTF-8(BOM 허용)·중복 키 금지로 읽는다. 실패하면 (None, 이유)."""
    try:
        with open(path, "rb") as fh:
            raw = fh.read()
    except OSError as exc:
        return None, f"읽기 실패: {exc}"
    if raw.startswith(b"\xef\xbb\xbf"):
        return None, "UTF-8 BOM이 붙어 있다(BOM 없이 저장해야 한다)"
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        return None, f"UTF-8이 아니다: {exc}"
    try:
        return json.loads(text, object_pairs_hook=_no_duplicates), None
    except DuplicateKey as exc:
        return None, f"같은 키가 두 번 나온다: {exc}"
    except json.JSONDecodeError as exc:
        return None, f"JSON 구문 오류 {exc.lineno}행 {exc.colno}열: {exc.msg}"


def walk(node, path=""):
    """모든 객체를 (경로, 객체)로 훑는다. 배열은 /[]로 표시."""
    if isinstance(node, dict):
        yield path, node
        for key, value in node.items():
            yield from walk(value, f"{path}/{key}")
    elif isinstance(node, list):
        for value in node:
            yield from walk(value, f"{path}/[]")


def is_iso_datetime(value):
    if not isinstance(value, str):
        return False
    try:
        datetime.fromisoformat(value)
        return True
    except ValueError:
        return False


def is_date(value):
    return isinstance(value, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", value) is not None


# ---------------------------------------------------------------- 1) JSON·스키마
def build_id_index(document):
    """source_id/id → 그 객체(라이선스를 들고 있는 출처) 색인."""
    index = {}
    for _path, node in walk(document):
        key = node.get("source_id") or node.get("id")
        if isinstance(key, str) and ("license" in node or "source" in node):
            index.setdefault(key, node)
    return index


def resolve_license(node, index):
    """객체에 붙은 라이선스: 인라인 → source.license → source_id가 가리키는 출처 순."""
    lic = node.get("license")
    if isinstance(lic, dict):
        return lic
    src = node.get("source")
    if isinstance(src, dict) and isinstance(src.get("license"), dict):
        return src["license"]
    ref = node.get("source_id") or node.get("id")
    target = index.get(ref) if isinstance(ref, str) else None
    if isinstance(target, dict):
        if isinstance(target.get("license"), dict):
            return target["license"]
        inner = target.get("source")
        if isinstance(inner, dict) and isinstance(inner.get("license"), dict):
            return inner["license"]
    return None


def check_briefing(document, path):
    """briefing.json — 17번 지면의 계약(briefing/data/SCHEMA.md v1.3)."""
    label = rel(path)
    required = ["schema_version", "updated_at", "edition", "headline_metrics",
                "cards", "radar", "sources", "archive_dates", "copyright_policy", "disclaimer"]
    for key in required:
        if key not in document:
            fail("json", f"{label}: 필수 키 '{key}'가 없다")
    if not re.fullmatch(r"\d+\.\d+\.\d+", str(document.get("schema_version", ""))):
        fail("json", f"{label}: schema_version이 'MAJOR.MINOR.PATCH' 형식이 아니다")
    for key in ("updated_at",):
        if not is_iso_datetime(document.get(key)):
            fail("json", f"{label}: {key}가 ISO 8601 시각이 아니다")

    edition = document.get("edition") or {}
    if not is_date(edition.get("date")):
        fail("json", f"{label}: edition.date가 YYYY-MM-DD가 아니다")

    metrics = document.get("headline_metrics")
    if not isinstance(metrics, list) or not 0 <= len(metrics) <= 4:
        fail("json", f"{label}: headline_metrics는 4개 이하여야 한다(지금 {len(metrics) if isinstance(metrics, list) else '없음'})")

    cards = document.get("cards")
    if not isinstance(cards, list) or not 1 <= len(cards) <= 9:
        fail("json", f"{label}: cards는 1~9개여야 한다(지금 {len(cards) if isinstance(cards, list) else '없음'})")
        cards = cards if isinstance(cards, list) else []
    orders = []
    for card in cards:
        cid = card.get("id", "?")
        for key in ("id", "order", "track", "title", "three_step", "source"):
            if key not in card:
                fail("json", f"{label}: 카드 {cid}에 필수 키 '{key}'가 없다")
        step = card.get("three_step") or {}
        for key in ("what", "evidence", "implication"):
            if not str(step.get(key) or "").strip():
                fail("json", f"{label}: 카드 {cid}의 three_step.{key}가 비어 있다")
        if isinstance(card.get("order"), int):
            orders.append(card["order"])
    if orders and orders != list(range(1, len(orders) + 1)):
        fail("json", f"{label}: 카드 order가 1부터 빠짐없이 이어지지 않는다 {orders}")

    sources = document.get("sources")
    if not isinstance(sources, list) or not sources:
        fail("json", f"{label}: sources가 비어 있다")
        sources = []
    source_ids = set()
    for src in sources:
        sid = src.get("source_id") or src.get("id")
        source_ids.add(sid)
        if not sid:
            fail("json", f"{label}: 출처에 source_id가 없다({str(src.get('source_name'))[:20]})")
        if not str(src.get("source_name") or "").strip():
            fail("json", f"{label}: 출처 {sid}에 source_name이 없다")
        url = str(src.get("source_url") or "")
        if not url.startswith("https://"):
            fail("json", f"{label}: 출처 {sid}의 source_url이 https가 아니다({url[:40]})")
        if not isinstance(src.get("license"), dict):
            fail("json", f"{label}: 출처 {sid}에 license가 없다")
    for metric in metrics if isinstance(metrics, list) else []:
        ref = metric.get("source_id")
        if ref and ref not in source_ids:
            fail("json", f"{label}: 지표 {metric.get('id')}의 source_id '{ref}'가 sources에 없다")

    dates = document.get("archive_dates")
    if not isinstance(dates, list) or not dates:
        fail("json", f"{label}: archive_dates가 비어 있다")
    elif not all(is_date(d) for d in dates):
        fail("json", f"{label}: archive_dates에 YYYY-MM-DD가 아닌 값이 있다")
    elif dates != sorted(dates, reverse=True):
        fail("json", f"{label}: archive_dates가 최신순이 아니다")
    elif edition.get("date") and dates[0] != edition["date"]:
        fail("json", f"{label}: archive_dates 첫 값({dates[0]})이 edition.date({edition.get('date')})와 다르다 — 오늘 호가 보관 목록에 없다")


def check_news(document, path):
    label = rel(path)
    for key in ("schema_version", "updated_at", "date", "items", "archive_dates"):
        if key not in document:
            fail("json", f"{label}: 필수 키 '{key}'가 없다")
    if not is_date(document.get("date")):
        fail("json", f"{label}: date가 YYYY-MM-DD가 아니다")
    items = document.get("items")
    if not isinstance(items, list) or not items:
        fail("json", f"{label}: items가 비어 있다")
        return
    for item in items:
        iid = item.get("id", "?")
        if not str(item.get("id") or "").strip():
            fail("json", f"{label}: 항목에 id가 없다")
        if not str(item.get("title_original") or "").strip():
            fail("json", f"{label}: 항목 {iid}에 title_original(원문 제목)이 없다")
        if str(item.get("track") or "").strip().upper() not in ALLOWED_TRACKS:
            fail("json", f"{label}: 항목 {iid}에 track(A/B)이 없다")
        license_obj = item.get("license") if isinstance(item.get("license"), dict) else None
        if license_obj is None and isinstance(item.get("source"), dict):
            license_obj = item["source"].get("license") if isinstance(item["source"].get("license"), dict) else None
        if license_obj is None:
            fail("json", f"{label}: 항목 {iid}에 license가 없다")
        elif not str(license_obj.get("type") or "").strip():
            fail("json", f"{label}: 항목 {iid}의 license.type이 비어 있다")


def check_chain(document, path):
    label = rel(path)
    for key in ("generated_at", "schema_version", "dates", "themes"):
        if key not in document:
            fail("json", f"{label}: 필수 키 '{key}'가 없다")
    dates = document.get("dates")
    if not isinstance(dates, list) or not dates:
        fail("json", f"{label}: dates가 비어 있다")
    elif not all(is_date(d) for d in dates):
        fail("json", f"{label}: dates에 YYYY-MM-DD가 아닌 값이 있다")
    themes = document.get("themes")
    if not isinstance(themes, dict) or not themes:
        fail("json", f"{label}: themes가 비어 있다")
    else:
        bad = [k for k, v in themes.items() if not isinstance(v, dict) or not str(v.get("label") or "").strip()
               or not isinstance(v.get("items"), list)]
        if bad:
            fail("json", f"{label}: 테마 {bad[:3]}에 label 또는 items가 없다")


def check_emerging(document, path):
    label = rel(path)
    for key in ("schema_version", "edition", "sectors", "categories", "items", "sources", "updated_at", "archive_dates"):
        if key not in document:
            fail("json", f"{label}: 필수 키 '{key}'가 없다")
    edition = document.get("edition") or {}
    if not is_date(edition.get("date")):
        fail("json", f"{label}: edition.date가 YYYY-MM-DD가 아니다")
    sectors = document.get("sectors")
    if not isinstance(sectors, list) or not sectors:
        fail("json", f"{label}: sectors가 비어 있다")
    categories = document.get("categories")
    if not isinstance(categories, list) or not categories:
        fail("json", f"{label}: categories가 비어 있다")
    items = document.get("items")
    if not isinstance(items, list) or not items:
        fail("json", f"{label}: items가 비어 있다")
        items = []
    sources = document.get("sources")
    if not isinstance(sources, list) or not sources:
        fail("json", f"{label}: sources가 비어 있다")
        sources = []
    source_ids = set()
    for src in sources:
        sid = src.get("source_id") or src.get("id")
        source_ids.add(sid)
        if not isinstance(src.get("license"), dict):
            fail("json", f"{label}: 출처 {sid}에 license가 없다")
    for item in items:
        ref = item.get("source_id")
        if not ref:
            fail("json", f"{label}: 기사 {item.get('id', '?')}에 source_id가 없다")
        elif ref not in source_ids:
            fail("json", f"{label}: 기사 {item.get('id', '?')}의 source_id '{ref}'가 sources에 없다")
        if not str(item.get("title") or "").strip():
            fail("json", f"{label}: 기사 {item.get('id', '?')}에 title이 없다")
    dates = document.get("archive_dates")
    if not isinstance(dates, list) or not dates:
        fail("json", f"{label}: archive_dates가 비어 있다")
    elif not all(is_date(d) for d in dates):
        fail("json", f"{label}: archive_dates에 YYYY-MM-DD가 아닌 값이 있다")


def check_thermometer(document, path):
    """thermometer.json — 16번 산업 온도계의 계약(thermometer/data/SCHEMA.md v1.0.0)."""
    label = rel(path)
    for key in ("schema_version", "generated_at", "industry_count", "method",
                "classifications", "feel_groups", "sources", "industries"):
        if key not in document:
            fail("json", f"{label}: 필수 키 '{key}'가 없다")
    industries = document.get("industries")
    if not isinstance(industries, list) or not industries:
        fail("json", f"{label}: industries가 비어 있다")
        industries = []
    elif document.get("industry_count") != len(industries):
        fail("json", f"{label}: industry_count({document.get('industry_count')})가 실제 산업 수({len(industries)})와 다르다")
    sources = document.get("sources")
    source_ids = set()
    if not isinstance(sources, list) or not sources:
        fail("json", f"{label}: sources가 비어 있다")
        sources = []
    for src in sources:
        sid = src.get("source_id")
        source_ids.add(sid)
        if not str(src.get("name") or "").strip():
            fail("json", f"{label}: 출처 {sid}에 name이 없다")
        if not str(src.get("url") or "").startswith("https://"):
            fail("json", f"{label}: 출처 {sid}의 url이 https가 아니다")
        if not isinstance(src.get("license"), dict):
            fail("json", f"{label}: 출처 {sid}에 license가 없다")
    for industry in industries:
        iid = industry.get("id", "?")
        for key in ("id", "name", "ksic", "feel", "size", "domestic", "global"):
            if key not in industry:
                fail("json", f"{label}: 산업 {iid}에 '{key}'가 없다")
        for side in ("domestic", "global"):
            block = industry.get(side) or {}
            if not isinstance(block, dict) or "axes" not in block:
                fail("json", f"{label}: {iid}.{side}에 axes가 없다")
                continue
            if not block.get("axes"):
                fail("json", f"{label}: {iid}.{side}.axes가 비어 있다")
            temp = block.get("temperature")
            if temp is not None and not (-20 <= temp <= 40):
                fail("json", f"{label}: {iid}.{side} 온도 {temp}가 -20~40℃ 밖이다")
            for axis, info in (block.get("axes") or {}).items():
                for item in (info or {}).get("items") or []:
                    if item.get("source_id") not in source_ids:
                        fail("json", f"{label}: {iid}.{side}.{axis}의 출처 '{item.get('source_id')}'가 sources에 없다")
                    if not str(item.get("period") or "").strip():
                        fail("json", f"{label}: {iid}.{side}.{axis} '{item.get('label')}'에 기준시점(period)이 없다")
        for item in industry.get("info") or []:
            if item.get("source_id") not in source_ids:
                fail("json", f"{label}: {iid}.info의 출처 '{item.get('source_id')}'가 sources에 없다")
    note(f"산업 온도계 {len(industries)}개 산업 · 출처 {len(sources)}곳")


def check_terms(document, path):
    """terms.json — 26번 내담자 언어 번역기의 계약(translator/data/SCHEMA.md v1.0.0).

    용어 한 건이 화면 한 장이므로, 필수 칸·길이·연계 섹터 id를 배포 전에 본다.
    특히 links[].to 가 섹터 장부에 없으면 그 칩이 조용히 죽으므로 여기서 잡는다.
    """
    label = rel(path)
    for key in ("schema_version", "dataset", "updated_at", "notice", "categories", "sources", "terms"):
        if key not in document:
            fail("json", f"{label}: 필수 키 '{key}'가 없다")
    if not re.fullmatch(r"\d+\.\d+\.\d+", str(document.get("schema_version", ""))):
        fail("json", f"{label}: schema_version이 'MAJOR.MINOR.PATCH' 형식이 아니다")
    if not is_date(document.get("updated_at")):
        fail("json", f"{label}: updated_at이 YYYY-MM-DD가 아니다")

    categories = document.get("categories")
    cat_ids = set()
    if not isinstance(categories, list) or not categories:
        fail("json", f"{label}: categories가 비어 있다")
        categories = []
    for cat in categories:
        for key in ("id", "name", "short", "desc"):
            if not str(cat.get(key) or "").strip():
                fail("json", f"{label}: 분야 '{cat.get('id', '?')}'에 {key}가 없다")
        cat_ids.add(cat.get("id"))

    sources = document.get("sources")
    source_ids = set()
    if not isinstance(sources, list) or not sources:
        fail("json", f"{label}: sources가 비어 있다")
        sources = []
    for src in sources:
        sid = src.get("id")
        source_ids.add(sid)
        if not str(src.get("name") or "").strip():
            fail("json", f"{label}: 출처 {sid}에 name이 없다")
        if not str(src.get("url") or "").startswith("https://"):
            fail("json", f"{label}: 출처 {sid}의 url이 https가 아니다")

    tools_path = os.path.join(ROOT, "assets", "tools.js")
    sector_ids = set(re.findall(r"\{id:'([^']+)'", open(tools_path, encoding="utf-8").read()))

    terms = document.get("terms")
    if not isinstance(terms, list) or not terms:
        fail("json", f"{label}: terms가 비어 있다")
        return
    seen = set()
    counts = {}
    for term in terms:
        tid = term.get("id", "?")
        for key in ("id", "term", "full", "ko", "cat", "easy", "ctx"):
            if not str(term.get(key) or "").strip():
                fail("json", f"{label}: 용어 {tid}에 '{key}'가 없다")
        if tid in seen:
            fail("json", f"{label}: 용어 id가 중복된다: {tid}")
        seen.add(tid)
        if term.get("cat") not in cat_ids:
            fail("json", f"{label}: 용어 {tid}의 분야 '{term.get('cat')}'가 categories에 없다")
        counts[term.get("cat")] = counts.get(term.get("cat"), 0) + 1
        if len(str(term.get("easy") or "")) > 90:
            fail("json", f"{label}: 용어 {tid}의 easy가 90자를 넘는다({len(str(term.get('easy')))}자)")
        if len(str(term.get("ctx") or "")) > 130:
            fail("json", f"{label}: 용어 {tid}의 ctx가 130자를 넘는다({len(str(term.get('ctx')))}자)")
        qs = term.get("qs")
        if not isinstance(qs, list) or not (1 <= len(qs) <= 3):
            fail("json", f"{label}: 용어 {tid}의 질문은 1~3개여야 한다")
        links = term.get("links")
        if not isinstance(links, list) or not (1 <= len(links) <= 3):
            fail("json", f"{label}: 용어 {tid}의 연계는 1~3개여야 한다")
            links = links if isinstance(links, list) else []
        for link in links:
            target = link.get("to")
            if target not in sector_ids:
                fail("json", f"{label}: 용어 {tid}의 연계 '{target}'가 섹터 장부(assets/tools.js)에 없다")
        src = term.get("src")
        if src is not None and src not in source_ids:
            fail("json", f"{label}: 용어 {tid}의 출처 '{src}'가 sources에 없다")
    note(f"내담자 언어 번역기 용어 {len(terms)}개 · 출처 {len(sources)}곳 · "
         + " · ".join(f"{k} {counts.get(k, 0)}" for k in [c.get('id') for c in categories]))


CURRENT_CHECKERS = {
    "briefing/data/briefing.json": check_briefing,
    "briefing/data/news.json": check_news,
    "briefing/data/chain.json": check_chain,
    "emerging/data/emerging.json": check_emerging,
    "thermometer/data/thermometer.json": check_thermometer,
    "translator/data/terms.json": check_terms,
}


def run_json_checks():
    count = 0
    for directory in DATA_DIRS:
        for path in iter_json(directory):
            count += 1
            document, error = load_json(path)
            if error:
                fail("json", f"{rel(path)}: {error}")
                continue
            checker = CURRENT_CHECKERS.get(rel(path))
            if checker:
                checker(document, path)
    note(f"JSON {count}개 파일을 읽었다")


# ---------------------------------------------------------------- 2) 저작권 가드레일
def run_license_checks():
    historical = []
    checked = 0
    for directory in DATA_DIRS:
        for path in iter_json(directory):
            document, error = load_json(path)
            if error:
                continue
            label = rel(path)
            strict = label in CURRENT_CHECKERS   # 오늘 자 데이터는 엄격, 지난 보관본은 명시된 라이선스만 본다
            index = build_id_index(document)
            for node_path, node in walk(document):
                if "track" not in node:
                    continue
                checked += 1
                track = str(node.get("track") or "").strip().upper()
                ident = node.get("id") or node.get("source_id") or str(node.get("title") or "")[:24]
                where = f"{label}{node_path} ({ident})"
                if track not in ALLOWED_TRACKS:
                    fail("license", f"{where}: track '{node.get('track')}'는 A/B가 아니다")
                    continue
                license_obj = resolve_license(node, index)
                if license_obj is None:
                    if strict and track == "A":
                        fail("license", f"{where}: Track A인데 라이선스를 찾을 수 없다 — 출처를 잇거나 Track B로 내려라")
                        flagged += 1
                    continue
                ltype = str(license_obj.get("type") or "").strip().upper()
                if track != "A":
                    continue
                if ltype in RESTRICTED_LICENSE_TYPES or ltype in UNKNOWN_LICENSE_TYPES:
                    # 지난 보관본은 이미 발행된 기록이라 실패로 잡지 않고 건수만 알린다.
                    # 오늘 자 데이터(현재 파일)는 한 건이라도 있으면 실패한다.
                    if strict:
                        fail("license",
                             f"{where}: {ltype or '미확인'} 라이선스를 Track A로 분류했다 — 재가공 불가 자료는 Track B여야 한다")
                    else:
                        historical.append(where)
                    continue
                if strict and license_obj.get("verified") is not True:
                    fail("license", f"{where}: Track A인데 라이선스 확인(verified)이 끝나지 않았다")
    note(f"Track 표시 {checked}개를 교차 확인했다" + (f" (과거 보관본 충돌 {len(historical)}건은 발행된 기록이라 그대로 둔다)" if historical else ""))


# ---------------------------------------------------------------- 3) JS 문법
def js_files():
    """저장소에 든 .js — git이 있으면 git ls-files, 없으면 폴더를 직접 훑는다."""
    try:
        listed = subprocess.run(["git", "ls-files", "-z", "*.js"], cwd=ROOT,
                                capture_output=True, check=True).stdout.decode("utf-8")
        return [f for f in listed.split("\0") if f and "node_modules/" not in f]
    except (OSError, subprocess.CalledProcessError):
        found = []
        for dirpath, dirnames, filenames in os.walk(ROOT):
            dirnames[:] = [d for d in dirnames if d not in (".git", "node_modules")]
            for name in filenames:
                if name.endswith(".js"):
                    found.append(rel(os.path.join(dirpath, name)))
        return sorted(found)


def run_js_checks():
    files = js_files()
    if not files:
        fail("js", "검사할 .js 파일을 찾지 못했다")
        return
    bad = 0
    for name in files:
        result = subprocess.run(["node", "--check", name], cwd=ROOT, capture_output=True, text=True)
        if result.returncode != 0:
            first = (result.stderr or "").strip().splitlines()
            detail = next((line for line in first if "Error" in line), first[0] if first else "")
            fail("js", f"{name}: 문법 오류 — {detail.strip()[:160]}")
            bad += 1
    note(f"JS {len(files)}개를 node --check로 검사했다" + (f" (오류 {bad})" if bad else ""))


# ---------------------------------------------------------------- 3-1) 상담 프리셋 장부
#   대문 덱의 프리셋은 섹터 id로만 카드를 가리킨다. 오타·중복이 있으면 그 카드가 조용히 빠져
#   상담 순서가 끊긴 채로 배포되므로, 배포 전에 장부와 대조한다.
def run_preset_checks():
    path = os.path.join(ROOT, "assets", "presets.js")
    tools_path = os.path.join(ROOT, "assets", "tools.js")
    if not os.path.exists(path):
        fail("presets", "assets/presets.js가 없다")
        return
    raw = open(path, encoding="utf-8").read()
    start = raw.find("window.JC_PRESETS")
    if start < 0:
        fail("presets", "window.JC_PRESETS 선언을 찾지 못했다")
        return
    start = raw.find("{", start)
    try:
        data, _end = json.JSONDecoder().raw_decode(raw[start:])
    except Exception as exc:
        fail("presets", f"프리셋 JSON을 읽지 못했다 — {exc}")
        return
    tools_raw = open(tools_path, encoding="utf-8").read()
    ids = set(re.findall(r"\{id:'([^']+)'", tools_raw))
    modes = dict(re.findall(r"\{id:'([^']+)'[^}]*?mode:'(seed|match)'", tools_raw))
    slots = {m: sum(1 for v in modes.values() if v == m) for m in ("seed", "match")}

    seen, total, placed = set(), 0, 0
    for mode in ("seed", "match"):
        group = data.get(mode)
        if not isinstance(group, list) or not group:
            fail("presets", f"{mode} 프리셋이 비어 있다")
            continue
        for i, preset in enumerate(group):
            where = f"{mode}[{i}]"
            if not isinstance(preset, dict):
                fail("presets", f"{where}가 객체가 아니다")
                continue
            for key in ("id", "k", "w", "why", "basis", "steps"):
                if not preset.get(key):
                    fail("presets", f"{where} {key} 누락")
            pid = preset.get("id")
            if pid in seen:
                fail("presets", f"{where} id가 중복된다: {pid}")
            seen.add(pid)
            if len(str(preset.get("why", ""))) > 170:
                fail("presets", f"{where} why가 너무 길다(한 줄 근거): {len(preset['why'])}자")
            steps = preset.get("steps") or []
            if not (2 <= len(steps) <= 6):
                fail("presets", f"{where} 단계는 2~6개: {len(steps)}개")
            cards = []
            for j, step in enumerate(steps):
                label = f"{where} {j + 1}단계"
                for key in ("k", "q", "c", "cards"):
                    if not step.get(key):
                        fail("presets", f"{label} {key} 누락")
                if len(str(step.get("q", ""))) > 80:
                    fail("presets", f"{label} 질문이 너무 길다: {len(step['q'])}자")
                if len(str(step.get("c", ""))) > 110:
                    fail("presets", f"{label} 확인 문장이 너무 길다: {len(step['c'])}자")
                for cid in step.get("cards") or []:
                    if cid not in ids:
                        fail("presets", f"{label} 카드 '{cid}'가 섹터 장부에 없다")
                    elif cid in cards:
                        fail("presets", f"{label} 카드 '{cid}'가 같은 프리셋에 두 번 나온다")
                    else:
                        cards.append(cid)
            if len(cards) > slots[mode]:
                fail("presets", f"{where} 카드 {len(cards)}장이 {mode} 칸 {slots[mode]}개를 넘는다")
            total += 1
            placed += len(cards)
    note(f"상담 프리셋 {total}개 · 단계별 카드 {placed}자리를 섹터 장부 {len(ids)}개와 대조했다"
         f"(시드 {slots['seed']}칸 · 매치 {slots['match']}칸)")


# ---------------------------------------------------------------- 4) 역할 분리 가드레일
def classify(path):
    if path.startswith(".github/") or path.startswith("ops/"):
        return "infra"
    if path.endswith(".md"):
        return "docs"
    if path.endswith(CODE_EXT) and not path.startswith("assets/"):
        return "code"
    if path.startswith("assets/"):
        return "shared-code"
    if any(marker in path for marker in DATA_MARKERS) or path.endswith(".json"):
        return "data"
    return "other"


def run_role_checks(pr_json_path):
    document, error = load_json(pr_json_path)
    if error:
        fail("role", f"PR 정보를 읽지 못했다({pr_json_path}): {error}")
        return
    title = str(document.get("title") or "")
    labels = [str(l.get("name") if isinstance(l, dict) else l) for l in document.get("labels") or []]
    files = [str(f.get("path") if isinstance(f, dict) else f) for f in document.get("files") or []]
    markers = " ".join(labels) + " " + title
    kinds = {}
    for path in files:
        kinds.setdefault(classify(path), []).append(path)

    note("PR 역할 분류 — " + ", ".join(f"{k} {len(v)}개" for k, v in sorted(kinds.items())) if files else "PR 파일 목록이 비어 있다")

    data_only = "[data-only]" in title.lower() or "data-only" in [l.lower() for l in labels]
    code_only = "[code-only]" in title.lower() or "code-only" in [l.lower() for l in labels]

    if data_only:
        offenders = [p for p in files if p.endswith(CODE_EXT)]
        if offenders:
            fail("role", "[data-only] PR이 화면 코드를 건드렸다 — 수집 데이터만 담아야 한다: " + ", ".join(offenders[:6]))
    if code_only:
        offenders = [p for p in files if classify(p) == "data" and not p.startswith("ops/")]
        if offenders:
            fail("role", "[code-only] PR이 수집 데이터를 건드렸다 — 코드만 담아야 한다: " + ", ".join(offenders[:6]))
    if not files:
        note("변경 파일 목록이 없어 역할 가드레일은 건너뛴다(로컬 실행이면 정상)")


# ---------------------------------------------------------------- 실행
def main():
    parser = argparse.ArgumentParser(description="자료실 통합 검증(CI 게이트)")
    parser.add_argument("--only", default="json,license,js,role", help="쉼표로 검사 항목 선택")
    parser.add_argument("--pr-json", help="PR 제목·라벨·변경 파일 JSON (역할 가드레일)")
    parser.add_argument("--summary-file", help="GitHub Actions Job Summary 파일 경로")
    args = parser.parse_args()

    selected = {item.strip() for item in args.only.split(",") if item.strip()}

    if "json" in selected:
        run_json_checks()
    if "json" in selected or "presets" in selected:
        run_preset_checks()   # 프리셋 장부도 데이터다 — json 검사에 함께 돌려 CI 워크플로를 고치지 않아도 되게 한다
    if "license" in selected:
        run_license_checks()
    if "js" in selected:
        run_js_checks()
    if "role" in selected:
        if args.pr_json:
            run_role_checks(args.pr_json)
        else:
            note("PR 정보가 없어 역할 가드레일은 건너뛴다 (--pr-json)")

    by_check = {}
    for check, message in problems:
        by_check.setdefault(check, []).append(message)

    print("=" * 72)
    for line in notes:
        print(f"· {line}")
    print("-" * 72)
    if problems:
        labels = {"json": "데이터·스키마", "license": "저작권 가드레일", "js": "JS 문법", "presets": "상담 프리셋 장부", "role": "역할 가드레일"}
        for check in ("json", "license", "js", "presets", "role"):
            if check not in by_check:
                continue
            print(f"✗ {labels[check]} — {len(by_check[check])}건")
            for message in by_check[check][:40]:
                print(f"    - {message}")
            if len(by_check[check]) > 40:
                print(f"    … 그 밖 {len(by_check[check]) - 40}건")
        print("-" * 72)
        print(f"실패 {len(problems)}건 — 위 항목을 고친 뒤 다시 검사한다.")
    else:
        print("✓ 모든 정적 검사 통과")

    if args.summary_file:
        lines = ["## 정적 검증 (JSON·저작권·JS·프리셋·역할)", ""]
        lines += [f"- {line}" for line in notes]
        if problems:
            lines += ["", f"**실패 {len(problems)}건**", ""]
            for check, message in problems[:40]:
                lines.append(f"- `{check}` {message}")
        else:
            lines.append("- **모두 통과**")
        with open(args.summary_file, "a", encoding="utf-8") as fh:
            fh.write("\n".join(lines) + "\n")

    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
