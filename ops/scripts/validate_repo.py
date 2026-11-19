#!/usr/bin/env python3
"""자료실 통합 검증 — CI 게이트의 정적 검사 (1순위 · 2순위)

  python3 ops/scripts/validate_repo.py                    # 전체 검사
  python3 ops/scripts/validate_repo.py --only json,js     # 일부만
  python3 ops/scripts/validate_repo.py --pr-json pr.json  # PR 역할 가드레일 포함
  python3 ops/scripts/validate_repo.py --summary-file "$GITHUB_STEP_SUMMARY"

검사 항목
  json     — briefing/·emerging/ 의 모든 .json 파싱·중복 키·스키마 필수 필드·참조 무결성
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
DATA_DIRS = ("briefing/data", "emerging/data")

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
    if not isinstance(metrics, list) or not 3 <= len(metrics) <= 4:
        fail("json", f"{label}: headline_metrics는 3~4개여야 한다(지금 {len(metrics) if isinstance(metrics, list) else '없음'})")

    cards = document.get("cards")
    if not isinstance(cards, list) or not 5 <= len(cards) <= 7:
        fail("json", f"{label}: cards는 5~7개여야 한다(지금 {len(cards) if isinstance(cards, list) else '없음'})")
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


CURRENT_CHECKERS = {
    "briefing/data/briefing.json": check_briefing,
    "briefing/data/news.json": check_news,
    "briefing/data/chain.json": check_chain,
    "emerging/data/emerging.json": check_emerging,
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
        labels = {"json": "데이터·스키마", "license": "저작권 가드레일", "js": "JS 문법", "role": "역할 가드레일"}
        for check in ("json", "license", "js", "role"):
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
        lines = ["## 정적 검증 (JSON·저작권·JS·역할)", ""]
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
