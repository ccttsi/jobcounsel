#!/usr/bin/env python3
"""공용 법정 수치 — data/legal-constants.json 을 섹터가 읽는 JS로 옮긴다

  python3 ops/scripts/build_legal_constants.py           # assets/legal-constants.js 를 다시 만든다
  python3 ops/scripts/build_legal_constants.py --check    # 원천과 같은지만 본다(다르면 종료 코드 1)

왜 만드나
---------
최저임금·구직급여 상한·4대보험 요율처럼 여러 섹터가 함께 쓰는 수치를 섹터마다 손으로 적으면,
해가 바뀔 때 한 곳만 고치고 나머지가 옛 숫자로 남는다(상담에서 그대로 잘못 안내된다).
그래서 값은 data/legal-constants.json 한 곳에만 두고, 화면(브라우저)은 이 스크립트가 만든
assets/legal-constants.js(window.JC_LEGAL)를 읽는다.

원칙
----
- 이 파일은 값을 지어내지 않는다. 원천 JSON에 있는 숫자·문자만 그대로 옮긴다(가공·반올림 없음).
- 만든 파일은 손으로 고치지 않는다. 고치면 --check가 어긋남을 잡는다.
- 배포에 빌드 단계를 더하지 않는다. 만든 파일을 저장소에 함께 두고, CI(validate_repo.py)가
  원천과 같은지 대조한다.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "data" / "legal-constants.json"
TARGET = ROOT / "assets" / "legal-constants.js"

# group에서 JS meta로 옮기는 글자 칸 — 값이 아니라 「무엇을 근거로 언제 확인했는지」.
META_FIELDS = ("label", "law", "notice", "title", "period", "sourceName", "note")

HEADER = """/* 자동 생성 — 손으로 고치지 않는다.
   원천: data/legal-constants.json (공용 법정 수치 단일 원천)
   다시 만들기: python3 ops/scripts/build_legal_constants.py
   원천과 같은지 보기: python3 ops/scripts/build_legal_constants.py --check
   여기에는 값만 실린다. 출처·적용기간·확인일은 원천 JSON에 있다. */
"""


def build_payload(document: dict) -> dict:
    """원천 JSON → window.JC_LEGAL 에 실을 객체(칸 이름·차례를 원천 그대로)."""
    payload: dict = {
        "schemaVersion": document.get("schema_version"),
        "updatedAt": document.get("updated_at"),
        "title": document.get("title"),
        "notice": document.get("notice"),
    }
    for group_key, group in (document.get("groups") or {}).items():
        block: dict = {}
        for value_key, spec in (group.get("values") or {}).items():
            block[value_key] = spec.get("value")
        meta: dict = {}
        for field in META_FIELDS:
            if group.get(field) is not None:
                meta[field] = group[field]
        applies = group.get("applies") or {}
        if applies:
            meta["appliesFrom"] = applies.get("from")
            meta["appliesTo"] = applies.get("to")
        source_id = group.get("source")
        if source_id:
            meta["sourceId"] = source_id
            source = (document.get("sources") or {}).get(source_id) or {}
            meta["sourceUrl"] = source.get("url")
            meta["checkedAt"] = source.get("checked_at")
        if meta:
            block["meta"] = meta
        payload[group_key] = block
    return payload


def render(document: dict) -> str:
    body = json.dumps(build_payload(document), ensure_ascii=False, indent=2)
    return HEADER + "window.JC_LEGAL = " + body + ";\n"


def load_source() -> dict:
    with open(SOURCE, encoding="utf-8") as fh:
        return json.load(fh)


def main() -> int:
    parser = argparse.ArgumentParser(description="공용 법정 수치 생성·대조")
    parser.add_argument("--check", action="store_true", help="파일을 고치지 않고 원천과 같은지만 본다")
    args = parser.parse_args()

    if not SOURCE.exists():
        print(f"✗ 원천이 없다: {SOURCE.relative_to(ROOT)}", file=sys.stderr)
        return 1
    try:
        document = load_source()
    except json.JSONDecodeError as exc:
        print(f"✗ 원천 JSON을 읽지 못했다 {exc.lineno}행 {exc.colno}열: {exc.msg}", file=sys.stderr)
        return 1

    wanted = render(document)
    current = TARGET.read_text(encoding="utf-8") if TARGET.exists() else None

    if args.check:
        if current == wanted:
            print(f"✓ {TARGET.relative_to(ROOT)} 가 원천과 같다")
            return 0
        print(f"✗ {TARGET.relative_to(ROOT)} 가 원천과 다르다 — "
              f"python3 ops/scripts/build_legal_constants.py 로 다시 만든다", file=sys.stderr)
        return 1

    if current == wanted:
        print(f"· {TARGET.relative_to(ROOT)} 는 이미 원천과 같다")
        return 0
    TARGET.write_text(wanted, encoding="utf-8")
    print(f"✓ {TARGET.relative_to(ROOT)} 를 원천에서 다시 만들었다")
    return 0


if __name__ == "__main__":
    sys.exit(main())
