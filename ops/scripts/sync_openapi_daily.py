#!/usr/bin/env python3
"""매일 06:00 KST — 알리오 공공기관 채용 + 국가자격 시험일정 동기화

  python3 ops/scripts/sync_openapi_daily.py [--dry-run] [--only alio_recruitment] [--limit 5]

대상(둘 다 공공데이터포털 이용허락범위 제한 없음)
  15125273 재정경제부_공공기관 채용정보 조회서비스  → data/openapi/alio/recruitment.json
  15074408 한국산업인력공단_국가자격 시험일정 조회 서비스 → data/openapi/qnet/exam-schedule.json

값은 응답 그대로 저장한다. 채용공고 본문·첨부 메타데이터도 API가 준 범위에서만 옮긴다.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sync_openapi_common import (  # noqa: E402
    SOURCES,
    as_list,
    body_items,
    ensure_ok,
    get_json,
    kst_now,
    load_key,
    make_parser,
    paginate,
    run_sources,
    selected,
    update_manifest,
    validate_outputs,
    write_source,
)

KEY = None


def alio() -> int:
    """진행 중(ongoingYn=Y) 공공기관 채용공고 — 하루 500건 안팎."""
    rows = paginate(
        lambda page, size: _alio_page(page, size),
        label="알리오 채용",
        page_size=100,
        max_pages=30,
        limit=LIMIT,
    )
    # 같은 공고가 페이지 경계에서 겹치지 않게 일련번호로 접는다.
    seen, items = set(), []
    for row in rows:
        key = row.get("recrutPblntSn")
        if key in seen:
            continue
        seen.add(key)
        items.append(row)
    items.sort(key=lambda r: (str(r.get("pbancBgngYmd", "")), -int(r.get("recrutPblntSn") or 0)), reverse=True)
    write_source("alio_recruitment", items, dry_run=DRY_RUN)
    return len(items)


def _alio_page(page: int, size: int):
    payload = get_json(
        SOURCES["alio_recruitment"]["endpoint"],
        {
            "serviceKey": KEY,
            "resultType": "json",
            "pageNo": page,
            "numOfRows": size,
            "ongoingYn": "Y",
        },
    )
    ensure_ok(payload)
    rows = as_list(payload.get("result"))
    total = payload.get("totalCount")
    return rows, int(total) if str(total).isdigit() else None


def exam() -> int:
    """올해·내년 국가자격 시험일정. 시행년도는 필수 입력이라 해마다 두 번 부른다."""
    year = kst_now().year
    items = []
    for target_year in (year, year + 1):
        rows = paginate(
            lambda page, size, y=target_year: _exam_page(y, page, size),
            label=f"시험일정 {target_year}",
            page_size=50,  # 이 API는 한 페이지 50건까지만 허용한다(초과 시 결과코드 930)
            max_pages=30,
            limit=LIMIT,
        )
        items.extend(rows)
    items.sort(key=lambda r: (str(r.get("implYy", "")), str(r.get("qualgbCd", "")), int(r.get("implSeq") or 0)))
    write_source("qual_exam_schedule", items, dry_run=DRY_RUN)
    return len(items)


def _exam_page(year: int, page: int, size: int):
    payload = get_json(
        SOURCES["qual_exam_schedule"]["endpoint"],
        {
            "serviceKey": KEY,
            "numOfRows": size,
            "pageNo": page,
            "dataFormat": "json",
            "implYy": str(year),
        },
    )
    ensure_ok(payload)
    body = payload.get("body") or {}
    rows = body_items(body)
    total = body.get("totalCount")
    return rows, int(total) if str(total).isdigit() else None


def main() -> int:
    global KEY, LIMIT, DRY_RUN
    parser = make_parser(__doc__ or "", "daily")
    args = parser.parse_args()
    KEY, LIMIT, DRY_RUN = load_key("DATA_GO_KR_API_KEY", "data_go_kr_key"), args.limit, args.dry_run
    keys = selected(args.only, "daily")
    funcs = {"alio_recruitment": alio, "qual_exam_schedule": exam}
    code = run_sources(keys, funcs, "Open API 일일 동기화 (06:00 KST)", args.summary_file)
    validate_outputs((KEY,))
    update_manifest()
    return code


if __name__ == "__main__":
    raise SystemExit(main())
