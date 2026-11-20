#!/usr/bin/env python3
"""매주 월요일 05:00 KST — NCS 훈련과정 정보 동기화

  python3 ops/scripts/sync_openapi_weekly.py [--dry-run] [--limit 50]

대상: 15086447 한국산업인력공단_NCS 훈련과정 정보 (이용허락범위 제한 없음)
      → data/openapi/ncs/training-courses.json

API는 대분류코드(ncsLclasCd)가 필수라 01~24를 차례로 부른다. 훈련목표·훈련시설·훈련방법 같은
긴 본문도 자르지 않고 응답 그대로 옮긴다(가공·요약하지 않는다).
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sync_openapi_common import (  # noqa: E402
    SOURCES,
    as_list,
    ensure_ok,
    get_json,
    load_key,
    make_parser,
    run_sources,
    selected,
    update_manifest,
    validate_outputs,
    write_source,
)

KEY = None
NCS_LCLAS = [f"{n:02d}" for n in range(1, 25)]


def ncs_training() -> int:
    items = []
    for code in NCS_LCLAS:
        rows = _category(code)
        print(f"  · 대분류 {code}: {len(rows):,}건")
        items.extend(rows)
    items.sort(key=lambda r: (str(r.get("ncsLclasCd", "")), str(r.get("ncsMclasCd", "")),
                              str(r.get("ncsSclasCd", "")), str(r.get("ncsSubdCd", "")),
                              str(r.get("ncsClCd", ""))))
    write_source("ncs_training", items, dry_run=DRY_RUN)
    return len(items)


def _category(code: str) -> list:
    page, out, total_page = 1, [], None
    while page <= (total_page or 1):
        payload = get_json(
            SOURCES["ncs_training"]["endpoint"],
            {
                "serviceKey": KEY,
                "pageNo": page,
                "numOfRows": 100,
                "returnType": "json",
                "ncsLclasCd": code,
            },
        )
        ensure_ok(payload, ok_codes=("000", "00", "0"))
        info = payload.get("dataInfo") or {}
        rows = as_list(payload.get("data"))
        out.extend(rows)
        total_page = int(info.get("totalPage") or 1)
        if LIMIT and len(out) >= LIMIT:
            return out[:LIMIT]
        if not rows:
            break
        page += 1
    return out


def main() -> int:
    global KEY, LIMIT, DRY_RUN
    parser = make_parser(__doc__ or "", "weekly")
    args = parser.parse_args()
    KEY, LIMIT, DRY_RUN = load_key("DATA_GO_KR_API_KEY", "data_go_kr_key"), args.limit, args.dry_run
    keys = selected(args.only, "weekly")
    code = run_sources(keys, {"ncs_training": ncs_training}, "Open API 주간 동기화 (월 05:00 KST)", args.summary_file)
    validate_outputs((KEY,))
    update_manifest()
    return code


if __name__ == "__main__":
    raise SystemExit(main())
