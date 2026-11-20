#!/usr/bin/env python3
"""OpenDART 기업 고유번호 대조 — 이름이 아니라 **법인등록번호·사업자번호로 검증**한다.

이름만으로 맞추면 동명 법인이 섞여 공시가 엉뚱한 기업에 붙을 수 있다. 그래서
corpCode.xml에서 이름이 맞는 후보를 추린 뒤, 각 후보의 company.json이 주는
`jurir_no`(법인등록번호)·`bizr_no`(사업자번호)를 `company/data/companies.json`의 값과
대조해 **정확히 일치하는 것만** 남긴다. 검증되지 않은 후보는 버린다(추측 금지).
"""
from __future__ import annotations

import io
import json
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sync_openapi_common import (  # noqa: E402
    DATA_DIR,
    SOURCES,
    SourceError,
    companies,
    get_json,
    kst_now,
    load_key,
    make_parser,
    normalize_name,
    parallel_map,
    request_raw,
    run_sources,
    selected,
    write_source,
)

def _candidates(dart_key: str, limit: int = 0) -> list[dict]:
    raw = request_raw(
        SOURCES["dart_corp_map"]["endpoint"],
        {"crtfc_key": dart_key},
        timeout=180,
        retries=2,
    )
    try:
        archive = zipfile.ZipFile(io.BytesIO(raw))
        xml_bytes = archive.read(archive.namelist()[0])
    except (zipfile.BadZipFile, KeyError) as exc:
        raise SourceError(f"corpCode.xml 압축을 풀 수 없다: {raw[:120]!r}") from exc

    by_name: dict[str, list[dict]] = {}
    for _event, elem in ET.iterparse(io.BytesIO(xml_bytes), events=("end",)):
        if elem.tag != "list":
            continue
        corp_code = (elem.findtext("corp_code") or "").strip()
        corp_name = (elem.findtext("corp_name") or "").strip()
        if corp_code and corp_name:
            by_name.setdefault(normalize_name(corp_name), []).append(
                {
                    "corp_code": corp_code,
                    "corp_name": corp_name,
                    "stock_code": (elem.findtext("stock_code") or "").strip(),
                    "modify_date": (elem.findtext("modify_date") or "").strip(),
                }
            )
        elem.clear()

    picked: dict[str, dict] = {}
    for company in companies():
        if not (company.get("corp_reg_no") or company.get("biz_no")):
            continue  # 검증할 번호가 없는 기업은 대조하지 않는다
        for field in ("name", "search_name"):
            value = company.get(field)
            if not value:
                continue
            for candidate in by_name.get(normalize_name(value), []):
                picked.setdefault(candidate["corp_code"], candidate)
    rows = sorted(picked.values(), key=lambda c: c["corp_code"])
    print(f"  · corpCode.xml {sum(len(v) for v in by_name.values()):,}곳 · 이름 후보 {len(rows):,}곳")
    return rows[:limit] if limit else rows


def dart_corp_map(dart_key: str, *, dry_run: bool = False, limit: int = 0, workers: int = 8) -> int:
    candidates = _candidates(dart_key, limit)
    by_crno = {str(c["corp_reg_no"]): c for c in companies() if c.get("corp_reg_no")}
    by_biz = {str(c["biz_no"]): c for c in companies() if c.get("biz_no")}

    def verify(candidate):
        payload = get_json(
            "https://opendart.fss.or.kr/api/company.json",
            {"crtfc_key": dart_key, "corp_code": candidate["corp_code"]},
            timeout=60,
        )
        status = str(payload.get("status") or "")
        if status == "013":
            return None
        if status != "000":
            message = str(payload.get("message") or "")
            if any(h in message for h in ("인증", "키", "권한", "한도")):
                raise SourceError(f"OpenDART status {status}: {message}")
            return None
        jurir = str(payload.get("jurir_no") or "").strip()
        bizr = str(payload.get("bizr_no") or "").strip()
        company = by_crno.get(jurir) if jurir else None
        matched_by = "법인등록번호"
        if not company and bizr:
            company = by_biz.get(bizr)
            matched_by = "사업자번호"
        if not company:
            return None
        return {
            "corp_code": candidate["corp_code"],
            "corp_name": payload.get("corp_name") or candidate["corp_name"],
            "corp_name_eng": payload.get("corp_name_eng", ""),
            "stock_code": payload.get("stock_code") or candidate["stock_code"],
            "corp_cls": payload.get("corp_cls", ""),
            "jurir_no": jurir,
            "bizr_no": bizr,
            "modify_date": candidate["modify_date"],
            "matched_by": matched_by,
            "company_id": company.get("id"),
            "company_name": company.get("name"),
            "category": company.get("category"),
        }

    verified = parallel_map(verify, candidates, workers, "OpenDART 기업 검증")
    verified.sort(key=lambda r: r["corp_code"])
    print(f"  · 후보 {len(candidates):,}곳 중 번호 일치 {len(verified):,}곳")
    write_source(
        "dart_corp_map",
        verified,
        dry_run=dry_run,
        extra={
            "verified_by": "법인등록번호(우선)·사업자번호",
            "candidates": len(candidates),
            "note": "이름이 같은 다른 법인을 붙이지 않도록 번호가 일치하는 기업만 담았다.",
        },
    )
    return len(verified)


def main() -> int:
    parser = make_parser(__doc__ or "", "monthly")
    args = parser.parse_args()
    key = load_key("OPENDART_API_KEY", "opendart_api_key")
    return run_sources(
        selected("dart_corp_map", "monthly"),
        {"dart_corp_map": lambda: dart_corp_map(key, dry_run=args.dry_run, limit=args.limit, workers=args.workers)},
        "OpenDART 기업 고유번호 대조",
        args.summary_file,
    )


if __name__ == "__main__":
    raise SystemExit(main())
