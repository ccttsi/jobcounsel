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
  css      — .css 파일과 .html 안 <style>의 중괄호 짝·고아 닫는 괄호·일찍 닫힌 블록 검사
  text     — 화면 문구의 맞춤법·이웃한 중복 어구 (원문 자리·고유명사는 ops/text-lint-allow.tsv로 뺀다)
  count    — 대문의 「N가지 자료」가 섹터 장부(JC_TOOLS) 길이와 맞는지, 손으로 적은 수가 남았는지
  dates    — 법령 데이터의 시행일(efYd)이 잘못된 모양이거나 오늘(KST)보다 뒤(미시행 개정본)인지
  role     — PR 제목/라벨 기반 역할 분리 가드레일 ([data-only] PR이 화면 코드를 건드리면 실패)

  text·count·dates는 --only 에 넣지 않아도 json과 함께 돈다(CI 워크플로를 고치지 않아도 되게).

종료 코드 0 = 통과, 1 = 실패. 실패 항목은 전부 모아서 한 번에 보여 준다(첫 오류에서 멈추지 않는다).
"""
import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIRS = ("briefing/data", "emerging/data", "thermometer/data", "translator/data")
KST = timezone(timedelta(hours=9))

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

    # 상위 묶음(grp) — 분야마다 하위 카테고리를 두어 직업군·현장·계열로 좁혀 본다.
    groups = document.get("groups")
    group_cat = {}
    if not isinstance(groups, list) or not groups:
        fail("json", f"{label}: groups가 비어 있다")
        groups = []
    for grp in groups:
        gid = grp.get("id")
        if not str(gid or "").strip():
            fail("json", f"{label}: 묶음에 id가 없다")
            continue
        if gid in group_cat:
            fail("json", f"{label}: 묶음 id가 중복된다: {gid}")
        for key in ("cat", "name", "short"):
            if not str(grp.get(key) or "").strip():
                fail("json", f"{label}: 묶음 '{gid}'에 {key}가 없다")
        if grp.get("cat") not in cat_ids:
            fail("json", f"{label}: 묶음 '{gid}'의 분야 '{grp.get('cat')}'가 categories에 없다")
        group_cat[gid] = grp.get("cat")

    notice = document.get("banNotice")
    if not isinstance(notice, dict) or not notice.get("forbid") or not notice.get("care"):
        fail("json", f"{label}: banNotice에 forbid·care 안내문이 있어야 한다")

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
        grp = term.get("grp")
        if grp not in group_cat:
            fail("json", f"{label}: 용어 {tid}의 묶음 '{grp}'가 groups에 없다")
        elif group_cat.get(grp) != term.get("cat"):
            fail("json", f"{label}: 용어 {tid}의 묶음 '{grp}'가 분야 '{term.get('cat')}'와 다르다")
        ban = term.get("ban")
        if ban is not None and ban not in ("forbid", "care"):
            fail("json", f"{label}: 용어 {tid}의 ban은 forbid·care여야 한다")
        if ban:
            swap = term.get("swap")
            if not isinstance(swap, list) or not (1 <= len(swap) <= 3):
                fail("json", f"{label}: 용어 {tid}에 상담사가 대신 쓸 중립 표현(swap) 1~3개가 없다")
            if not str(term.get("say") or "").strip():
                fail("json", f"{label}: 용어 {tid}에 대응 문장(say)이 없다")
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
    note(f"내담자 언어 번역기 용어 {len(terms)}개 · 묶음 {len(groups)}개 · 출처 {len(sources)}곳 · "
         + " · ".join(f"{k} {counts.get(k, 0)}" for k in [c.get('id') for c in categories])
         + f" · 금지 표시 {sum(1 for t in terms if t.get('ban'))}개")


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
    missing_node = False
    for name in files:
        try:
            result = subprocess.run(["node", "--check", name], cwd=ROOT, capture_output=True, text=True)
        except FileNotFoundError:
            missing_node = True
            break
        if result.returncode != 0:
            first = (result.stderr or "").strip().splitlines()
            detail = next((line for line in first if "Error" in line), first[0] if first else "")
            fail("js", f"{name}: 문법 오류 — {detail.strip()[:160]}")
            bad += 1
    if missing_node:
        note(f"이 환경에는 node가 없어 JS 문법 검사를 건너뛰었다({len(files)}개) — CI(ubuntu)에서는 node가 있어 그대로 돈다")
    else:
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
    # 카드는 자료(JC_TOOLS)의 id만 가리킨다 — 앱(JC_APPS — 상담 플로우)은 덱의 칸을 쓰지 않는다.
    tools_body = tools_raw[tools_raw.find("window.JC_TOOLS"):tools_raw.find("window.JC_LINKS")]
    ids = set(re.findall(r"\{id:'([^']+)'", tools_body))
    modes = dict(re.findall(r"\{id:'([^']+)'[^}]*?mode:'(seed|match)'", tools_body))
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


# ---------------------------------------------------------------- 3-2) CSS 문법 (7종 기초 결함 게이트 ①)
#   화면이 깨지는 가장 흔한 원인은 중괄호 짝이 틀어지거나 `}` 하나가 속성 사이에 끼는 것이다.
#   브라우저는 그런 파일을 조용히 일부만 적용해, 눈으로 보기 전에는 모른다.
#   그래서 .css 파일과 .html 안 <style> 블록을 전부 훑어 (1) 괄호 짝 (2) 고아 닫는 괄호
#   (3) 닫히지 않은 블록 (4) 닫는 괄호 뒤에 붙은 속성 선언을 센다.
CSS_TOKEN = re.compile(r"\{|\}|\(|\)|\[|\]")
STYLE_BLOCK = re.compile(r"<style\b[^>]*>(.*?)</style\s*>", re.S | re.I)


def strip_css(text):
    """주석과 문자열을 지운 사본 — 괄호 세기 전에 지워야 주석 속 괄호를 오해하지 않는다."""
    out = []
    i, n = 0, len(text)
    while i < n:
        ch = text[i]
        if ch == "/" and i + 1 < n and text[i + 1] == "*":
            end = text.find("*/", i + 2)
            i = n if end < 0 else end + 2
            out.append(" ")
        elif ch in "\"'":
            quote = ch
            i += 1
            while i < n:
                if text[i] == "\\":
                    i += 2
                    continue
                if text[i] == quote:
                    i += 1
                    break
                i += 1
            out.append(" ")
        else:
            out.append(ch)
            i += 1
    return "".join(out)


def css_syntax_problems(text):
    """(줄 번호, 사유) 목록. 중괄호·괄호 짝과 고아 선언을 본다."""
    clean = strip_css(text)
    problems = []
    stack = []          # (글자, 위치)
    pairs = {"}": "{", ")": "(", "]": "["}
    for m in CSS_TOKEN.finditer(clean):
        ch, pos = m.group(0), m.start()
        if ch in "{([":
            stack.append((ch, pos))
        else:
            if not stack or stack[-1][0] != pairs[ch]:
                problems.append((clean.count("\n", 0, pos) + 1, f"짝 없는 '{ch}'"))
                continue
            stack.pop()
    for ch, pos in stack[:6]:
        problems.append((clean.count("\n", 0, pos) + 1, f"'{ch}'가 닫히지 않았다"))
    # 닫는 중괄호 바로 뒤에 속성처럼 보이는 `이름:`이 오면, 블록 하나가 일찍 닫힌 것이다.
    for m in re.finditer(r"}\s*([a-zA-Z-]{2,})\s*:", clean):
        word = m.group(1)
        if word.startswith(("hover", "focus", "active", "before", "after", "not", "is", "where", "has")):
            continue                       # }div:hover 같은 오탐 방지(선택자)
        if "-" in word or word in ("color", "display", "margin", "padding", "width", "height",
                                   "background", "border", "font", "opacity", "transform"):
            problems.append((clean.count("\n", 0, m.start()) + 1, f"닫는 '}}' 뒤에 속성 '{word}:'가 붙었다"))
    # 속성 이름 없이 `:`만 있는 선언(예: `: ;`)
    for m in re.finditer(r"\{\s*:\s*;", clean):
        problems.append((clean.count("\n", 0, m.start()) + 1, "이름 없는 속성 선언 ':'"))
    return problems[:8]


def repo_files(suffixes):
    """저장소에 든 파일 중 주어진 확장자만 — git이 있으면 git ls-files, 없으면 폴더를 훑는다."""
    try:
        listed = subprocess.run(["git", "ls-files", "-z"], cwd=ROOT,
                                capture_output=True, check=True).stdout.decode("utf-8")
        names = [f for f in listed.split("\0") if f]
    except (OSError, subprocess.CalledProcessError):
        names = []
        for dirpath, dirnames, filenames in os.walk(ROOT):
            dirnames[:] = [d for d in dirnames if d not in (".git", "node_modules")]
            for name in filenames:
                names.append(rel(os.path.join(dirpath, name)))
    return [n for n in names if n.endswith(tuple(suffixes)) and "node_modules/" not in n]


def css_sources():
    """(.css 파일, .html 안 <style> 블록)을 (이름, 내용)으로 낸다."""
    for name in repo_files((".css",)):
        path = os.path.join(ROOT, name)
        try:
            yield name, open(path, encoding="utf-8").read()
        except OSError as exc:
            fail("css", f"{name}: 읽지 못했다 — {exc}")
    for name in repo_files((".html",)):
        path = os.path.join(ROOT, name)
        try:
            raw = open(path, encoding="utf-8").read()
        except OSError:
            continue
        for i, block in enumerate(STYLE_BLOCK.findall(raw), 1):
            yield f"{name} <style#{i}>", block


def run_css_checks():
    count = 0
    bad = 0
    for name, text in css_sources():
        count += 1
        for line, why in css_syntax_problems(text):
            fail("css", f"{name}:{line}: {why}")
            bad += 1
    note(f"CSS {count}곳(.css 파일 + .html 안 <style>)의 괄호 짝·고아 선언을 검사했다" + (f" (문제 {bad})" if bad else ""))


# ---------------------------------------------------------------- 3-3) 심전도 방치 모션 표
#   대문 심전도는 0~59분 60분 한 바퀴를 표(ECG_SEQ)로 돈다. 표를 손으로 고치다 이웃한 분에 같은
#   문양이 이어지거나 한 분 안에서 문양이 겹치면 "부드럽게 이어진다"는 약속이 깨진다.
#   그래서 표의 규칙을 글로만 두지 않고 배포 전에 센다(2026-11-19).
ECG_SEQ_BLOCK = re.compile(r"var\s+ECG_SEQ\s*=\s*\[(.*?)\]\s*;", re.S)
ECG_ROW = re.compile(r"\[([0-9,\s]+)\]")
ECG_NAMES_BLOCK = re.compile(r"var\s+ECG_NAMES\s*=\s*(\[[^\]]*\])")


def run_ecg_checks():
    path = os.path.join(ROOT, "assets", "modes.js")
    if not os.path.exists(path):
        fail("ecg", "assets/modes.js가 없다")
        return
    raw = open(path, encoding="utf-8").read()
    names_match = ECG_NAMES_BLOCK.search(raw)
    block = ECG_SEQ_BLOCK.search(raw)
    if not names_match or not block:
        fail("ecg", "modes.js에서 ECG_NAMES·ECG_SEQ 표를 찾지 못했다")
        return
    try:
        names = json.loads(names_match.group(1))
    except json.JSONDecodeError as exc:
        fail("ecg", f"ECG_NAMES를 읽지 못했다 — {exc}")
        return
    rows = [[int(x) for x in m.group(1).replace(" ", "").split(",") if x != ""] for m in ECG_ROW.finditer(block.group(1))]
    if len(rows) != 60:
        fail("ecg", f"60분 표여야 하는데 {len(rows)}줄이다")
        return
    for i, row in enumerate(rows):
        if len(row) != 4:
            fail("ecg", f"{i}분: 문양이 4개가 아니다({len(row)}개)")
            continue
        if len(set(row)) != 4:
            fail("ecg", f"{i}분: 같은 문양이 한 분 안에서 겹친다 {row}")
        for k in row:
            if not 0 <= k < len(names):
                fail("ecg", f"{i}분: 문양 번호 {k}가 목록({len(names)}개) 밖이다")
    flat = [k for row in rows for k in row]
    for i in range(len(flat)):
        if flat[i] == flat[(i + 1) % len(flat)]:
            fail("ecg", f"{i // 4}분 → {(i + 1) // 4}분 경계에서 같은 문양이 이어진다")
    for i in range(60):
        if set(rows[i]) == set(rows[(i + 1) % 60]):
            fail("ecg", f"{i}분과 {(i + 1) % 60}분이 같은 네 문양이다")
    counts = {k: flat.count(k) for k in range(len(names))}
    if min(counts.values()) < 10:
        fail("ecg", f"한 시간에 거의 안 나오는 문양이 있다 {counts}")
    note(f"심전도 60분 표 — 문양 {len(names)}종 · 분마다 4개 · 경계 중복 0"
         f" · 한 시간 등장 {min(counts.values())}~{max(counts.values())}회")


# ---------------------------------------------------------------- 3-4) 섹터 장부·27번 플로우·마이덱 (2026-11-20)
#   27번 상담 플로우와 마이덱을 붙이면서, 장부(tools.js)와 색(brand.css)·폴더·프리셋이 어긋나면
#   그 섹터가 조용히 죽는다(색이 없으면 제목이 검게, 폴더가 없으면 404). 그래서 배포 전에 장부를 통째로 본다.
TOOL_FIELDS = {"id": r"id:'([^']*)'", "gi": r"gi:'([^']*)'", "mode": r"mode:'([^']*)'",
               "no": r"no:'([^']*)'", "badge": r"badge:'([^']*)'", "short": r"short:'([^']*)'",
               "color": r"color:'([^']*)'", "title": r"title:'([^']*)'", "path": r"path:'([^']*)'",
               "desc": r"desc:'([^']*)'"}


def read_tools():
    """tools.js의 섹터 장부를 글자 그대로 읽는다(한 칸 = 한 섹터).

    돌려주는 것 — 자료(JC_TOOLS) · 앱(JC_APPS) · 연결 짝(JC_LINKS).
      · 자료 = 대문 목록 01~31. 번호·색·폴더·프리셋 칸이 여기에만 달려 있다.
      · 앱   = 자료가 아닌 화면(상담 플로우). 목록·덱 칸은 쓰지 않지만 폴더·색은 필요하고,
              JC_LINKS의 짝으로도 나온다(그래서 짝 검사는 두 장부의 id를 함께 본다).
    """
    raw = open(os.path.join(ROOT, "assets", "tools.js"), encoding="utf-8").read()
    body = raw[raw.find("window.JC_TOOLS"):raw.find("window.JC_LINKS")]
    apps_body = raw[raw.find("window.JC_APPS"):]
    tools = _read_blocks(body)
    apps = _read_blocks(apps_body)
    links_raw = raw[raw.find("window.JC_LINKS"):raw.find("window.JC_APPS")]
    links = re.findall(r"\['([^']+)','([^']+)'\]", links_raw)
    return tools, links, apps


def _read_blocks(body):
    blocks = re.split(r"\n\s*\{(?=id:')", body)[1:]
    tools = []
    for block in blocks:
        item = {}
        for key, pattern in TOOL_FIELDS.items():
            m = re.search(pattern, block)
            if not m:
                fail("sectors", f"섹터 한 칸에 '{key}'가 없다(장부 모양이 깨졌다)")
                item[key] = ""
            else:
                item[key] = m.group(1)
        m = re.search(r"meta:\[([^\]]*)\]", block)
        item["meta"] = re.findall(r"'([^']*)'", m.group(1)) if m else []
        m = re.search(r"tags:\[([^\]]*)\]", block)
        item["tags"] = re.findall(r"'([^']*)'", m.group(1)) if m else []
        if item.get("id"):
            tools.append(item)
    return tools


def run_sector_checks():
    tools, links, apps = read_tools()
    if not tools:
        fail("sectors", "assets/tools.js에서 섹터를 하나도 읽지 못했다")
        return
    brand = open(os.path.join(ROOT, "assets", "brand.css"), encoding="utf-8").read()
    ids, nos = {}, {}
    for t in tools:
        tid, no, color = t["id"], t["no"], t["color"]
        if tid in ids:
            fail("sectors", f"섹터 id가 중복된다: {tid}")
        ids[tid] = 1
        if no in nos:
            fail("sectors", f"섹터 번호가 중복된다: {no}({nos[no]}·{tid})")
        nos[no] = tid
        if not re.fullmatch(r"\d{2}", no):
            fail("sectors", f"섹터 {tid}의 번호 '{no}'가 두 자리 숫자가 아니다")
        if t["mode"] not in ("seed", "match"):
            fail("sectors", f"섹터 {tid}의 mode '{t['mode']}'가 seed·match가 아니다")
    # 폴더·색은 앱(JC_APPS)도 가진다 — 자료와 같은 기준으로 본다(둘 다 자기 화면·자기 색을 갖는다).
    for t in tools + apps:
        tid, color = t["id"], t["color"]
        folder = t["path"].replace("./", "").rstrip("/")
        if not folder or not os.path.exists(os.path.join(ROOT, folder, "index.html")):
            fail("sectors", f"섹터 {tid}의 폴더에 index.html이 없다: {t['path']}")
        found = len(re.findall(r"--tc-" + re.escape(color) + r"\s*:", brand))
        if found < 3:
            fail("sectors", f"브랜드 색 --tc-{color}가 {found}곳뿐이다(밝게·세피아·어둡게 3곳이 필요) — 섹터 {tid}")
        if f'body[data-jc-tool="{tid}"]' not in brand:
            fail("sectors", f"brand.css에 body[data-jc-tool=\"{tid}\"] 규칙이 없다")
    link_ids = dict(ids)
    for t in apps:
        if t["id"] in link_ids:
            fail("sectors", f"앱 id가 자료 id와 겹친다: {t['id']}")
        link_ids[t["id"]] = 1
    for a, b in links:
        if a not in link_ids or b not in link_ids:
            fail("sectors", f"JC_LINKS의 짝 '{a}'·'{b}' 가운데 장부(자료·앱)에 없는 것이 있다")
        if a == b:
            fail("sectors", f"JC_LINKS에 자기 자신을 잇는 짝이 있다: {a}")
    pairs = [tuple(sorted(x)) for x in links]
    if len(pairs) != len(set(pairs)):
        fail("sectors", "JC_LINKS에 같은 짝이 두 번 나온다")
    seeds = sum(1 for t in tools if t["mode"] == "seed")
    note(f"섹터 장부 {len(tools)}개(시드 {seeds} · 매치 {len(tools) - seeds}) + 앱 {len(apps)}개 · 연결 짝 {len(links)}쌍 · "
         f"색 {len({t['color'] for t in tools + apps})}종을 brand.css 3테마와 대조했다")


def run_flow_checks():
    """상담 플로우의 시너지 지도와 마이덱 화면·DIY 여섯 요소를 배포 전에 센다."""
    tools, _links, _apps = read_tools()
    ids = {t["id"] for t in tools}
    graph_path = os.path.join(ROOT, "flow", "data", "graph.json")
    document, error = load_json(graph_path)
    if error:
        fail("flow", f"flow/data/graph.json: {error}")
        return
    for key in ("schema_version", "sources", "self", "sectors", "pairs", "kw", "starts"):
        if key not in document:
            fail("flow", f"graph.json에 '{key}'가 없다")
    graph_ids = {s.get("id") for s in document.get("sectors") or []}
    if ids - graph_ids:
        fail("flow", f"장부에는 있는데 시너지 지도에 없는 섹터: {sorted(ids - graph_ids)[:5]}")
    if graph_ids - ids:
        fail("flow", f"시너지 지도에만 있는 섹터(장부에 없다): {sorted(graph_ids - ids)[:5]}")
    if document.get("self") != "flow":
        fail("flow", f"graph.json의 self가 flow가 아니다({document.get('self')})")
    seen = set()
    for p in document.get("pairs") or []:
        a, b = p.get("a"), p.get("b")
        if a not in ids or b not in ids or a == b:
            fail("flow", f"시너지 짝이 장부 밖을 가리킨다: {a}·{b}")
            continue
        key = tuple(sorted((a, b)))
        if key in seen:
            fail("flow", f"같은 짝이 두 번 들어 있다: {a}·{b}")
        seen.add(key)
        if not isinstance(p.get("w"), int) or p["w"] <= 0:
            fail("flow", f"짝 {a}·{b}의 무게(w)가 0 이하다 — 근거 없는 짝은 싣지 않는다")
        if not p.get("link") and not (p.get("shared") or []):
            fail("flow", f"짝 {a}·{b}에 근거(연결 짝·겹치는 말)가 하나도 없다")
        if p.get("basis") not in ("자료실 연결 짝", "겹치는 말만"):
            fail("flow", f"짝 {a}·{b}의 근거 종류 '{p.get('basis')}'가 알 수 없는 값이다")
    for s in document.get("starts") or []:
        if not s.get("to"):
            fail("flow", f"시작 키워드 '{s.get('k')}'에 이어지는 자료가 없다")
        for tid in s.get("to") or []:
            if tid not in ids:
                fail("flow", f"시작 키워드 '{s.get('k')}'가 장부 밖 섹터 '{tid}'를 가리킨다")
        if "flow" in (s.get("to") or []):
            fail("flow", f"시작 키워드 '{s.get('k')}'가 자기 자신(flow)을 첫 자료로 준다")
    if document.get("kw"):
        for word, targets in list(document["kw"].items())[:4000]:
            for tid in targets:
                if tid not in ids:
                    fail("flow", f"키워드 '{word}'가 장부 밖 섹터 '{tid}'를 가리킨다")
                    break

    # 화면 두 곳이 있어야 한다 — 27번 섹터와 마이덱
    flow_html = os.path.join(ROOT, "flow", "index.html")
    if not os.path.exists(flow_html):
        fail("flow", "flow/index.html이 없다")
    else:
        raw = open(flow_html, encoding="utf-8").read()
        for need in ('data-jc-tool="flow"', 'id="chain"', 'id="cands"', 'id="makeBtn"', 'id="note"'):
            if need not in raw:
                fail("flow", f"flow/index.html에 {need}가 없다")
    deck_html = os.path.join(ROOT, "mydeck", "index.html")
    if not os.path.exists(deck_html):
        fail("flow", "mydeck/index.html이 없다")
    else:
        raw = open(deck_html, encoding="utf-8").read()
        for need in ('id="space"', 'id="decks"', 'id="diy"', 'id="diyTabs"', 'mydeck-diy.js', 'mydeck-store.js'):
            if need not in raw:
                fail("flow", f"mydeck/index.html에 {need}가 없다")

    # DIY — 여섯 요소 × 요소마다 여섯 조건
    diy_path = os.path.join(ROOT, "assets", "mydeck-diy.js")
    if not os.path.exists(diy_path):
        fail("flow", "assets/mydeck-diy.js가 없다")
    else:
        raw = open(diy_path, encoding="utf-8").read()
        blocks = re.split(r"\n\s*\{\s*\n\s*id: '", raw)
        groups = [b.split("'")[0] for b in blocks[1:]]
        groups = [g for g in groups if g in ("bg", "ink", "card", "font", "layout", "deco")]
        if len(groups) != 6:
            fail("flow", f"DIY 요소가 6가지가 아니라 {len(groups)}가지다: {groups}")
        for name, block in zip(groups, blocks[1:]):
            options = re.findall(r"\{ id: '([a-z0-9_]+)'", block)
            if len(options) != 6:
                fail("flow", f"DIY '{name}'의 조건이 6가지가 아니라 {len(options)}가지다: {options}")
        if "input" in raw and "color" not in raw:
            fail("flow", "DIY에 자유 색상표(color) 안내가 없다")
    note(f"시너지 지도 — 섹터 {len(graph_ids)}개 · 짝 {len(seen)}쌍 · 키워드 {len(document.get('kw') or {})}개 · "
         f"시작 키워드 {len(document.get('starts') or [])}개")


# ---------------------------------------------------------------- 3-5) 문구·수치·시행일 린터 (2026-11-22)
#   MLC 보완 1순위 — 화면에 나가는 한국어 문구의 맞춤법·중복 어구, 손으로 적은 자료 개수,
#   아직 시행되지 않은 법령(개정본)이 배포되는 것을 배포 전에 막는다. 셋 다 사람이 눈으로 보기
#   전에는 조용히 지나가는 종류의 사고라, 규칙을 글로만 두지 않고 CI에서 센다.
#
#   오탐을 막는 두 가지 약속
#     1) 원문 자리(국가법령정보센터 조문·공공데이터·기관 공개문)는 검사에서 뺀다. 원문 표기를 우리
#        맞춤법으로 고치면 그 순간 원문이 아니게 되고, 자료실의 저작권 원칙(원문 그대로)과도 어긋난다.
#     2) 그래도 남는 정당한 예외(고유명사·제품명 등)는 ops/text-lint-allow.tsv에 근거와 함께 적는다.
#        검사를 통과시키려고 규칙을 느슨하게 만드는 대신, 예외를 눈에 보이게 남긴다.
TEXT_QUOTED_PREFIXES = (
    "law/",              # 국가법령정보센터 조문·조례 원문
    "data/openapi/",     # 공공데이터포털에서 받은 원문
    "taxonomy/data/",    # NCS 능력단위 원문
    "company/data/",     # DART 사업보고서·공공기관 공개문에서 뽑은 원문
    "assistant/data/",   # 비서 검색 색인(원문 발췌)
    "briefing/data/",    # 브리핑 기사 제목·출처 원문
    "emerging/data/",
    "thermometer/data/",
    "reality/data/",
    "transit/data/",
    "valuechain/data/",
    "decalcomania/data/",  # 채용공고 원문
    "cert/data/",          # 한국산업인력공단 종목 설명 원문
)
# 값 자체가 인용문인 칸 — 어느 파일에 있든 표기를 고치지 않는다.
TEXT_QUOTED_KEYS = {"text", "title_original", "source_name", "quote", "excerpt",
                    "raw", "kw_source", "trainGoal", "name_original"}

TEXT_RULES = (
    # (규칙 이름, 찾을 모양, 고칠 말, 왜 그런가)
    ("몇일", r"몇\s?일", "며칠", "「몇 일」은 「며칠」로 적는다"),
    ("안되요", r"안되요", "안 돼요", "부사 '안'과 '되다'는 띄어 「안 돼요」로 적는다"),
    ("안됬", r"안됬", "안 됐", "「됐」은 「되었」의 줄임이다"),
    ("안되서", r"안되서", "안 돼서", "「안 돼서」로 적는다"),
    ("되요", r"되요", "돼요", "「되어요」의 줄임은 「돼요」다"),
    ("웬지", r"웬지", "왠지", "「왠지」는 「왜인지」의 줄임이다"),
    ("오랫만", r"오랫만", "오랜만", "「오랜만」이 맞다"),
    ("금새", r"금새", "금세", "「금세」는 「금시에」의 줄임이다"),
    ("역활", r"(?<![지구])역활(?!성화|동)", "역할", "「역할(役割)」이 맞다 — 지역활성화·구역활동은 뺀다"),
    ("어의없", r"어의없", "어이없", "「어이없다」가 맞다"),
    ("어떻해", r"어떻해", "어떡해", "「어떡해」가 맞다"),
    ("어떻게해", r"어떻게해", "어떡해", "붙여 쓴 「어떻게해」는 「어떡해」로 적는다"),
    ("됬", r"됬", "됐", "「됬」은 쓰지 않는다 — 「됐」으로 적는다"),
    ("할께", r"(할|갈|올|볼|줄|드릴|마실)께", r"\1게", "「~할게」로 적는다(소리대로 적는 예외)"),
    ("뵈요", r"뵈요", "봬요", "「뵈어요」의 줄임은 「봬요」다"),
    ("갯수", r"갯수", "개수", "「개수」가 맞다"),
    ("곰곰히", r"곰곰히", "곰곰이", "부사 뒤의 「-이」는 「곰곰이」로 적는다"),
    ("가르키", r"가르키", "가리키", "「가리키다」가 맞다(가르치다와 다르다)"),
    ("설겆", r"설겆", "설거지", "「설거지」가 맞다"),
    ("통채", r"통채", "통째", "「통째」가 맞다"),
    ("뒤쳐", r"뒤쳐", "뒤처", "「뒤처지다」가 맞다"),
    ("희안", r"희안", "희한", "「희한하다」가 맞다"),
)
# 같은 말이 붙어 나오는 자리(「같은 같은」). 낱말 왼쪽·오른쪽이 한글이면 다른 낱말의 꼬리
# (「대학과 학과」·「근로자파견 파견」)이므로 잡지 않는다.
TEXT_DUPLICATE = re.compile(r"(?<![가-힣])([가-힣]{2,})\s+\1(?![가-힣])")


def text_lint_allow():
    """ops/text-lint-allow.tsv — (파일, 규칙, 잘못 쓴 말) → 이유. 예외는 여기 남기고 검사는 그대로 둔다."""
    path = os.path.join(ROOT, "ops", "text-lint-allow.tsv")
    allow = {}
    if not os.path.exists(path):
        return allow
    with open(path, encoding="utf-8") as fh:
        for number, line in enumerate(fh, 1):
            line = line.rstrip("\n")
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            parts = line.split("\t")
            if len(parts) < 3:
                fail("text", f"ops/text-lint-allow.tsv {number}행: 파일·규칙·말 세 칸이 필요하다")
                continue
            allow[(parts[0], parts[1], parts[2])] = parts[3] if len(parts) > 3 else ""
    return allow


def text_hits(text):
    """(규칙, 잘못 쓴 말, 고칠 말, 위치) — 두 규칙이 같은 자리를 잡으면 앞의 규칙만 남긴다."""
    hits, spans = [], []
    for name, pattern, fix, _why in TEXT_RULES:
        for match in re.finditer(pattern, text):
            if any(start < match.end() and match.start() < end for start, end in spans):
                continue
            spans.append((match.start(), match.end()))
            hits.append((name, match.group(0), match.expand(fix), match.start()))
    for match in TEXT_DUPLICATE.finditer(text):
        hits.append(("중복어구", match.group(0), match.group(1), match.start()))
    return hits


def run_text_checks():
    """맞춤법·중복 어구 — 화면에 나가는 .html·.css·.js 문자열과 .json 값."""
    allow = text_lint_allow()
    files = strings = found = 0

    def scan(text, name, where):
        nonlocal strings, found
        strings += 1
        for rule, wrong, right, _position in text_hits(text):
            if (name, rule, wrong) in allow:
                continue
            found += 1
            fail("text", f"{name} {where}: 「{wrong}」 → 「{right}」 ({rule})")

    for name in repo_files((".html", ".css", ".js", ".json")):
        if any(name.startswith(prefix) for prefix in TEXT_QUOTED_PREFIXES):
            continue
        full = os.path.join(ROOT, name)
        files += 1
        if name.endswith(".json"):
            document, error = load_json(full)
            if error:
                continue          # 깨진 JSON은 json 검사가 이미 잡는다
            stack = [("", document)]
            while stack:
                where, node = stack.pop()
                if isinstance(node, dict):
                    for key, value in node.items():
                        stack.append((f"{where}.{key}" if where else key, value))
                elif isinstance(node, list):
                    for value in node:
                        stack.append((where + "[]", value))
                elif isinstance(node, str):
                    if where.rsplit(".", 1)[-1].replace("[]", "") in TEXT_QUOTED_KEYS:
                        continue
                    scan(node, name, where or "(값)")
            continue
        try:
            with open(full, encoding="utf-8") as fh:
                text = fh.read()
        except OSError:
            continue
        if name.endswith(".js"):
            # 문자열 안쪽만 본다 — 식별자·주석의 낱말은 문구가 아니다.
            # 쉼표·세로줄이 많은 문자열은 키워드·동의어 목록이라 이웃 중복이 정상이다.
            for match in re.finditer(r"'((?:[^'\\\n]|\\.)*)'|\"((?:[^\"\\\n]|\\.)*)\"", text, re.S):
                body = match.group(1) or match.group(2) or ""
                if "|" in body or body.count(",") >= 2:
                    continue
                scan(body, name, f"{text.count(chr(10), 0, match.start()) + 1}행")
        else:
            for line, body in enumerate(text.split("\n"), 1):
                scan(body, name, f"{line}행")

    note(f"맞춤법·중복 어구 — 줄·문자열 {strings:,}개(파일 {files}개)를 규칙 {len(TEXT_RULES) + 1}종으로 봤다"
         + (f" · 문제 {found}건" if found else " · 문제 0건"))


# ---------------------------------------------------------------- 3-6) 손으로 적은 자료 개수 (2026-11-22)
#   대문의 「지금은 N가지 학습·실무 자료」가 장부(JC_TOOLS)와 어긋난 채 오래 남았던 일이 있었다
#   (31가지 ↔ 35개). 숫자를 손으로 적지 않고 장부 길이를 따르게 해 두고, 그래도 손으로 적힌 수가
#   있으면 여기서 잡는다.
COUNT_CLAIM = re.compile(r"(\d+)\s*가지")
DATA_COUNT_SPAN = re.compile(r"<([a-zA-Z][^>]*\bdata-count\b[^>]*)>\s*(\d*)\s*</")
RANGE_CLAIM = re.compile(r"01\s*[~～]\s*(\d+)")


def run_count_checks():
    tools, _links, _apps = read_tools()
    total = len(tools)
    if not total:
        fail("count", "섹터 장부(assets/tools.js)에서 자료를 하나도 읽지 못해 개수를 셀 수 없다")
        return
    path = os.path.join(ROOT, "index.html")
    try:
        with open(path, encoding="utf-8") as fh:
            raw = fh.read()
    except OSError as exc:
        fail("count", f"index.html을 읽지 못했다 — {exc}")
        return

    # 1) 동적 치환 칸에 처음 그려 둔 숫자가 장부와 같은가.
    stale = 0
    for match in DATA_COUNT_SPAN.finditer(raw):
        drawn = match.group(2)
        if drawn and int(drawn) != total:
            stale += 1
            line = raw.count("\n", 0, match.start()) + 1
            fail("count", f"index.html {line}행: data-count 칸에 「{drawn}」이 그려져 있는데 장부는 {total}개다"
                          f" — 처음 그리는 숫자도 장부와 맞춘다(비JS·검색 미리보기에서 읽히는 값)")
    # 2) 동적 치환 밖에 손으로 적은 「N가지 … 자료」가 남아 있는가.
    stripped = DATA_COUNT_SPAN.sub("<span></span>", raw)
    for line, body in enumerate(stripped.split("\n"), 1):
        for match in COUNT_CLAIM.finditer(body):
            around = body[max(0, match.start() - 30):match.end() + 30]
            if "자료" not in around:
                continue
            good = int(match.group(1)) == total
            if not good:
                fail("count", f"index.html {line}행: 「{match.group(1)}가지 … 자료」가 장부({total}개)와 다르다"
                              f" — <span data-count>로 두고 장부 길이를 따르게 한다")
    # 3) 개수를 장부에서 세는 동선이 살아 있는가(치환을 지우면 숫자는 다시 굳는다).
    if "[data-count]" not in raw or not re.search(r"function\s+renderCounts\s*\(", raw):
        fail("count", "index.html에 자료 개수를 장부에서 세는 치환([data-count]·function renderCounts)이 없다"
                      " — 숫자를 손으로 적게 되돌아간다")

    # 4) 주석의 번호 범위(01~N) — 화면 글자는 아니지만 같은 어긋남이 여기서도 자란다. 경고로만 남긴다.
    drifted = []
    for name in repo_files((".html", ".js")):
        if any(name.startswith(prefix) for prefix in TEXT_QUOTED_PREFIXES):
            continue
        try:
            with open(os.path.join(ROOT, name), encoding="utf-8") as fh:
                text = fh.read()
        except OSError:
            continue
        for match in RANGE_CLAIM.finditer(text):
            line = text[text.rfind("\n", 0, match.start()) + 1:text.find("\n", match.end())]
            if not any(word in line for word in ("목록", "번호", "장부")):
                continue                        # 역사 기록·다른 문맥의 01~N은 이 장부와 상관없다
            if re.search(r"\d{4}-\d{2}-\d{2}", line):
                continue                        # 날짜가 붙은 줄은 그날의 기록이다(과거는 고치지 않는다)
            if int(match.group(1)) != total:
                drifted.append(f"{name}:{text.count(chr(10), 0, match.start()) + 1}")
    if drifted:
        note(f"번호 범위 표기가 장부({total}개)와 다르다 — {', '.join(sorted(set(drifted))[:6])}")
    note(f"자료 개수 — 장부 {total}개 · 대문 동적 치환 {len(DATA_COUNT_SPAN.findall(raw))}칸"
         + (f" · 처음 그린 숫자 어긋남 {stale}칸" if stale else ""))


# ---------------------------------------------------------------- 3-7) 법령 시행일(미시행 개정본) (2026-11-22)
#   조문을 옮겨 적을 때 국가법령정보센터의 «시행일»을 함께 적는다. 그 날짜가 오늘보다 뒤면 아직
#   시행되지 않은 개정본을 현행으로 실었다는 뜻이고, 상담에서 그대로 잘못 안내된다
#   (고용보험법 제40조 2028-01-01, 근로기준법 제54조 2026-12-10 단서 같은 일이 실제로 있었다).
EFFECTIVE_KEYS = {"efYd", "effective", "effective_date", "enforced_at", "시행일자"}
EFFECTIVE_FORMATS = (
    re.compile(r"^(\d{4})(\d{2})(\d{2})$"),
    re.compile(r"^(\d{4})-(\d{2})-(\d{2})$"),
    re.compile(r"^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.$"),
)


def parse_effective(value):
    """'20261008'·'2026-10-08'·'2026. 10. 8.' → date. 그 밖의 모양은 None(형식 오류)."""
    for pattern in EFFECTIVE_FORMATS:
        match = pattern.match(value.strip())
        if match:
            try:
                return datetime(int(match.group(1)), int(match.group(2)), int(match.group(3))).date()
            except ValueError:
                return None
    return None


def run_effective_date_checks():
    today = datetime.now(KST).date()   # 오늘(KST)
    checked = 0
    for name in repo_files((".json",)):
        if name.startswith("ops/"):
            continue
        document, error = load_json(os.path.join(ROOT, name))
        if error:
            continue
        collected = any(name.startswith(prefix) for prefix in TEXT_QUOTED_PREFIXES)
        stack = [("", document)]
        while stack:
            where, node = stack.pop()
            if isinstance(node, dict):
                for key, value in node.items():
                    stack.append((f"{where}.{key}" if where else key, value))
            elif isinstance(node, list):
                for value in node:
                    stack.append((where + "[]", value))
            elif isinstance(node, str):
                key = where.rsplit(".", 1)[-1].replace("[]", "")
                if key not in EFFECTIVE_KEYS:
                    continue
                checked += 1
                day = parse_effective(node)
                if day is None:
                    fail("dates", f"{name} {where}: 시행일 「{node[:20]}」이 날짜 모양(YYYYMMDD·YYYY-MM-DD·YYYY. M. D.)이 아니다")
                    continue
                if day > today:
                    message = (f"{name} {where}: 시행일 {day.isoformat()}이 오늘(KST {today.isoformat()})보다 "
                               f"{(day - today).days}일 뒤다 — 아직 시행되지 않은 개정본이다."
                               f" 현행 시행본으로 바꾸거나 그 조문을 빼야 한다")
                    if collected:
                        note(f"경고 — {message}")
                    else:
                        fail("dates", message)
    note(f"법령 시행일 — 날짜 {checked}개를 오늘(KST {today.isoformat()})과 대조했다")


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
    if "json" in selected or "text" in selected:
        run_text_checks()          # 맞춤법·중복 어구 — 화면에 나가는 문구 전체
    if "json" in selected or "count" in selected:
        run_count_checks()         # 「N가지 자료」가 장부 길이와 맞는지
    if "json" in selected or "dates" in selected:
        run_effective_date_checks()  # 미시행 개정본(미래 시행일) 유입
    if "json" in selected or "presets" in selected:
        run_preset_checks()   # 프리셋 장부도 데이터다 — json 검사에 함께 돌려 CI 워크플로를 고치지 않아도 되게 한다
    if "license" in selected:
        run_license_checks()
    if "js" in selected:
        run_js_checks()
        run_css_checks()      # CSS 문법도 같은 단계에서 돈다(CI 워크플로를 고치지 않아도 되게)
        run_ecg_checks()      # 심전도 60분 표의 약속(이웃한 분 중복 금지)도 함께 센다
    if "json" in selected or "sectors" in selected:
        run_sector_checks()   # 섹터 장부·색·폴더·연결 짝이 한 몸으로 맞는지
    if "json" in selected or "flow" in selected:
        run_flow_checks()     # 27번 플로우의 시너지 지도와 마이덱·DIY 여섯 요소
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
        labels = {"json": "데이터·스키마", "license": "저작권 가드레일", "js": "JS·CSS 문법", "css": "CSS 문법", "ecg": "심전도 60분 표", "presets": "상담 프리셋 장부", "sectors": "섹터 장부·색", "flow": "27번 플로우·마이덱", "text": "화면 문구(맞춤법·중복)", "count": "자료 개수 수치", "dates": "법령 시행일", "role": "역할 가드레일"}
        for check in ("json", "license", "js", "css", "ecg", "presets", "sectors", "flow", "text", "count", "dates", "role"):
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
        lines = ["## 정적 검증 (JSON·저작권·JS·CSS·프리셋·섹터·플로우·문구·수치·시행일·역할)", ""]
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
