#!/usr/bin/env python3
"""매월 1일 04:00 KST — 기업·자격·법령 대량 동기화

  python3 ops/scripts/sync_openapi_monthly.py [--dry-run] [--only fsc_corp_basic] [--limit 30]

대상(전부 공식 Open API)
  15043184 금융위원회_기업기본정보            → data/openapi/fsc/corp-basic.json
  15043459 금융위원회_기업 재무정보           → data/openapi/fsc/fin-stat.json
  OpenDART corpCode.xml·list.json            → data/openapi/dart/corp-map.json · disclosures.json
  15089380 연도별 회별 국가기술자격 합격률    → data/openapi/qnet/pass-rate.json
  15025329 산업인력 국가기술자격 통계 정보    → data/openapi/qnet/stats.json
  15000115 법제처 국가법령정보 공유서비스     → data/openapi/law/revisions.json
  15081808 국세청 사업자등록 상태조회         → data/openapi/nts/status.json

기업 대상은 `company/data/companies.json`을 **읽기만** 한다(덮어쓰지 않는다 — 다른 작업과 충돌 방지).
금융위·국세청은 법인등록번호·사업자번호가 있는 기업만 부르고, 없으면 그 기업은 건너뛴다(값을 지어내지 않는다).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sync_openapi_common import (  # noqa: E402
    DATA_DIR,
    ROOT,
    SOURCES,
    AuthPending,
    SourceError,
    as_list,
    body_items,
    companies,
    ensure_ok,
    get_json,
    kst_now,
    load_key,
    make_parser,
    month_window,
    parallel_map,
    parse_xml,
    post_json,
    request_raw,
    run_sources,
    selected,
    update_manifest,
    validate_outputs,
    write_source,
)

DATA_KEY = None
DART_KEY = None
LIMIT = 0
DRY_RUN = False
WORKERS = 6

GRADES = [("10", "기술사"), ("20", "기능장"), ("30", "기사"), ("40", "산업기사")]


# ------------------------------------------------------------------ 금융위 기업기본
def _crno_targets() -> list[dict]:
    rows = [c for c in companies() if str(c.get("corp_reg_no") or "").isdigit()]
    rows.sort(key=lambda c: str(c["corp_reg_no"]))
    return rows[:LIMIT] if LIMIT else rows


def fsc_corp_basic() -> int:
    targets = _crno_targets()
    print(f"  · 대상 {len(targets):,}곳(법인등록번호 보유)")

    def one(company):
        payload = get_json(
            SOURCES["fsc_corp_basic"]["endpoint"],
            {
                "serviceKey": DATA_KEY,
                "pageNo": 1,
                "numOfRows": 10,
                "resultType": "json",
                "crno": company["corp_reg_no"],
            },
        )
        ensure_ok(payload)
        body = ((payload.get("response") or {}).get("body") or {})
        rows = body_items(body)
        row = next((r for r in rows if str(r.get("crno")) == str(company["corp_reg_no"])), None)
        if not row:
            return None
        keep = (
            "crno", "corpNm", "corpEnsnNm", "enpPbanCmpyNm", "enpRprFnm",
            "corpRegMrktDcd", "corpRegMrktDcdNm", "bzno",
            "enpBsadr", "enpHmpgUrl", "enpTlno", "sicNm", "enpEstbDt",
            "enpEmpeCnt", "empeAvgCnwkTermCtt", "enpPn1AvgSlryAmt",
            "actnAudpnNm", "audtRptOpnnCtt", "enpMainBizNm", "lastOpegDt",
        )
        item = {k: row.get(k, "") for k in keep}
        item["company_id"] = company.get("id")
        item["company_name"] = company.get("name")
        item["category"] = company.get("category")
        return item

    items = parallel_map(one, targets, WORKERS, "금융위 기업기본")
    items.sort(key=lambda r: str(r.get("crno", "")))
    write_source("fsc_corp_basic", items, dry_run=DRY_RUN)
    return len(items)


# ------------------------------------------------------------------ 금융위 재무
def fsc_fin_stat() -> int:
    targets = _crno_targets()
    print(f"  · 대상 {len(targets):,}곳(법인등록번호 보유)")
    current_year = kst_now().year
    min_year = current_year - 3

    def one(company):
        payload = get_json(
            SOURCES["fsc_fin_stat"]["endpoint"],
            {
                "serviceKey": DATA_KEY,
                "pageNo": 1,
                "numOfRows": 100,
                "resultType": "json",
                "crno": company["corp_reg_no"],
            },
        )
        ensure_ok(payload)
        body = ((payload.get("response") or {}).get("body") or {})
        rows = body_items(body)
        # 연도별로 연결(110)을 먼저, 없으면 별도(120) 하나만 남긴다.
        by_year = {}
        for row in rows:
            year = str(row.get("bizYear") or "")
            if not year.isdigit() or int(year) < min_year:
                continue
            code = str(row.get("fnclDcd") or "")
            if code not in ("110", "120"):
                continue
            if year not in by_year or (code == "110" and by_year[year].get("fnclDcd") != "110"):
                by_year[year] = row
        out = []
        for year in sorted(by_year, reverse=True)[:3]:
            row = by_year[year]
            item = {
                "crno": row.get("crno", company["corp_reg_no"]),
                "bizYear": year,
                "basDt": row.get("basDt", ""),
                "fnclDcd": row.get("fnclDcd", ""),
                "fnclDcdNm": row.get("fnclDcdNm", ""),
                "enpSaleAmt": row.get("enpSaleAmt", ""),
                "enpBzopPft": row.get("enpBzopPft", ""),
                "enpCrtmNpf": row.get("enpCrtmNpf", ""),
                "enpTastAmt": row.get("enpTastAmt", ""),
                "enpTdbtAmt": row.get("enpTdbtAmt", ""),
                "enpCptlAmt": row.get("enpCptlAmt", ""),
                "fnclDebtRto": row.get("fnclDebtRto", ""),
                "curCd": row.get("curCd", ""),
                "company_id": company.get("id"),
                "company_name": company.get("name"),
            }
            out.append(item)
        return out or None

    grouped = parallel_map(one, targets, WORKERS, "금융위 재무")
    items = [row for group in grouped for row in group]
    items.sort(key=lambda r: (str(r.get("crno", "")), str(r.get("bizYear", ""))))
    write_source("fsc_fin_stat", items, dry_run=DRY_RUN)
    return len(items)


# ------------------------------------------------------------------ Q-net
def _qnet_xml(url: str, params: dict) -> dict:
    raw = request_raw(url, {**params, "serviceKey": DATA_KEY})
    doc = parse_xml(raw)
    response = doc.get("response") or {}
    header = response.get("header") or {}
    code = str(header.get("resultCode") or "")
    if code and code not in ("00", "0"):
        msg = str(header.get("resultMsg") or "")
        if any(h in msg for h in ("인증", "등록되지 않은", "권한")):
            raise AuthPending(f"결과코드 {code}: {msg}")
        raise SourceError(f"결과코드 {code}: {msg}")
    return response


def qnet_pass_rate() -> int:
    last_year = kst_now().year - 1
    years = [str(last_year - offset) for offset in range(5)]
    items = []
    for grade_code, grade_name in GRADES:
        for year in years:
            page, total = 1, None
            while page <= (total or 1) and page <= 50:
                response = _qnet_xml(
                    SOURCES["qnet_pass_rate"]["endpoint"],
                    {"grdCd": grade_code, "baseYY": year, "pageNo": page, "numOfRows": 100},
                )
                body = response.get("body") or {}
                rows = body_items(body)
                for row in rows:
                    row["queryGrdCd"] = grade_code
                    row["queryGrdNm"] = grade_name
                items.extend(rows)
                total = int(body.get("totalCount") or 0) or None
                if not rows or len(rows) < 100:
                    break
                page += 1
            print(f"  · {grade_name} {year}: 누적 {len(items):,}건")
    items.sort(key=lambda r: (str(r.get("implYy", "")), str(r.get("implSeq", "")),
                              str(r.get("jmCd", "")), str(r.get("examTypCcd", ""))))
    write_source("qnet_pass_rate", items, dry_run=DRY_RUN)
    return len(items)


def qnet_stats() -> int:
    year = str(kst_now().year - 1)
    response = _qnet_xml(SOURCES["qnet_stats"]["endpoint"], {"baseYY": year})
    body = response.get("body") or {}
    rows = body_items(body)
    items = [{**row, "baseYY": year} for row in rows]
    write_source("qnet_stats", items, dry_run=DRY_RUN)
    return len(items)


# ------------------------------------------------------------------ OpenDART
def dart_corp_map() -> int:
    """이름이 아니라 법인등록번호·사업자번호로 검증한 대조표(sync_opendart_map.py)."""
    from sync_opendart_map import dart_corp_map as verified_map

    return verified_map(DART_KEY, dry_run=DRY_RUN, limit=LIMIT, workers=WORKERS)


def _load_corp_map() -> dict:
    path = DATA_DIR / SOURCES["dart_corp_map"]["path"]
    if not path.exists():
        raise SourceError("dart/corp-map.json이 없다 — 기업 고유번호 동기화를 먼저 실행해야 한다")
    doc = json.loads(path.read_text(encoding="utf-8"))
    return {row["corp_code"]: row for row in doc.get("items", [])}


def dart_disclosures() -> int:
    corp_map = _load_corp_map()
    if not corp_map:
        raise SourceError("기업 고유번호 대조 결과가 비어 있다")
    days = MAX_AGE_DAYS or 0
    begin, end = month_window(days=days)
    print(f"  · 공시 창 {begin}~{end} · 대조 기업 {len(corp_map):,}곳")

    page, total_page, items = 1, None, []
    while page <= (total_page or 1) and page <= 400:
        payload = get_json(
            SOURCES["dart_disclosures"]["endpoint"],
            {
                "crtfc_key": DART_KEY,
                "bgn_de": begin,
                "end_de": end,
                "page_no": page,
                "page_count": 100,
                "sort": "date",
                "sort_mth": "desc",
            },
            timeout=90,
        )
        status = str(payload.get("status") or "")
        if status == "013":  # 조회된 데이터 없음
            break
        if status != "000":
            message = str(payload.get("message") or "")
            if any(h in message for h in ("인증", "키", "권한")):
                raise AuthPending(f"OpenDART status {status}: {message}")
            raise SourceError(f"OpenDART status {status}: {message}")
        rows = payload.get("list") or []
        for row in rows:
            match = corp_map.get(str(row.get("corp_code")))
            if not match:
                continue
            items.append(
                {
                    "corp_code": row.get("corp_code"),
                    "corp_name": row.get("corp_name"),
                    "stock_code": row.get("stock_code", ""),
                    "corp_cls": row.get("corp_cls", ""),
                    "report_nm": row.get("report_nm", "").strip(),
                    "rcept_no": row.get("rcept_no"),
                    "flr_nm": row.get("flr_nm", ""),
                    "rcept_dt": row.get("rcept_dt", ""),
                    "rm": row.get("rm", ""),
                    "company_id": match.get("company_id"),
                    "company_name": match.get("company_name"),
                }
            )
        total_page = int(payload.get("total_page") or 1)
        if page % 20 == 0 or page == total_page:
            print(f"  … 공시 {page:,}/{total_page:,}쪽 · 남은 {len(items):,}건")
        page += 1
    items.sort(key=lambda r: (str(r.get("rcept_dt", "")), str(r.get("rcept_no", ""))), reverse=True)
    write_source("dart_disclosures", items, dry_run=DRY_RUN,
                 extra={"window": {"begin": begin, "end": end}})
    return len(items)


# ------------------------------------------------------------------ 법제처
def law_revision() -> int:
    source = ROOT / "law" / "data" / "laws.json"
    names = [law.get("name") for law in json.loads(source.read_text(encoding="utf-8")).get("laws", []) if law.get("name")]
    items = []
    for name in names:
        raw = request_raw(
            SOURCES["law_revision"]["endpoint"],
            {"serviceKey": DATA_KEY, "target": "law", "query": name, "type": "XML", "numOfRows": 20, "pageNo": 1},
        )
        doc = parse_xml(raw).get("LawSearch") or {}
        code = str(doc.get("resultCode") or "")
        if code and code != "00":
            raise SourceError(f"법제처 결과코드 {code}: {doc.get('resultMsg')}")
        laws = as_list(doc.get("law"))
        exact = [law for law in laws if (law.get("법령명한글") or "").strip() == name]
        pool = exact or laws
        if not pool:
            print(f"  ! {name}: 응답에 법령이 없어 건너뜀")
            continue
        law = max(pool, key=lambda l: str(l.get("공포일자") or ""))
        mst = str(law.get("법령일련번호") or "")
        items.append(
            {
                "query": name,
                "법령명한글": law.get("법령명한글", ""),
                "법령ID": law.get("법령ID", ""),
                "법령일련번호": mst,
                "현행연혁코드": law.get("현행연혁코드", ""),
                "공포일자": law.get("공포일자", ""),
                "공포번호": law.get("공포번호", ""),
                "제개정구분명": law.get("제개정구분명", ""),
                "소관부처명": law.get("소관부처명", ""),
                "법령구분명": law.get("법령구분명", ""),
                "시행일자": law.get("시행일자", ""),
                # 사람이 여는 국가법령정보센터 주소(OC 없이). API 상세주소의 OC는 저장하지 않는다.
                "official_url": f"https://www.law.go.kr/LSW/lsInfoR.do?lsiSeq={mst}&efYd={law.get('시행일자', '')}",
            }
        )
        print(f"  · {name}: 공포 {law.get('공포일자')} · 시행 {law.get('시행일자')}")
    items.sort(key=lambda r: r["query"])
    write_source("law_revision", items, dry_run=DRY_RUN)
    return len(items)


# ------------------------------------------------------------------ 국세청
def nts_business_status() -> int:
    rows = [c for c in companies() if str(c.get("biz_no") or "").isdigit()]
    rows.sort(key=lambda c: str(c["biz_no"]))
    if LIMIT:
        rows = rows[:LIMIT]
    print(f"  · 대상 {len(rows):,}곳(사업자번호 보유)")

    batches = [rows[i:i + 100] for i in range(0, len(rows), 100)]

    def one(batch):
        payload = post_json(
            SOURCES["nts_business_status"]["endpoint"],
            {"serviceKey": DATA_KEY, "returnType": "JSON"},
            {"b_no": [str(c["biz_no"]) for c in batch]},
            timeout=90,
        )
        if str(payload.get("status_code")) != "OK":
            raise SourceError(f"국세청 status_code={payload.get('status_code')}")
        by_no = {str(c["biz_no"]): c for c in batch}
        out = []
        for row in payload.get("data") or []:
            company = by_no.get(str(row.get("b_no")))
            out.append(
                {
                    "b_no": row.get("b_no"),
                    "b_stt": row.get("b_stt", ""),
                    "b_stt_cd": row.get("b_stt_cd", ""),
                    "tax_type": row.get("tax_type", ""),
                    "tax_type_cd": row.get("tax_type_cd", ""),
                    "end_dt": row.get("end_dt", ""),
                    "utcc_yn": row.get("utcc_yn", ""),
                    "tax_type_change_dt": row.get("tax_type_change_dt", ""),
                    "company_id": company.get("id") if company else None,
                    "company_name": company.get("name") if company else None,
                }
            )
        return out

    grouped = parallel_map(one, batches, min(WORKERS, 4), "국세청 상태")
    items = [row for group in grouped for row in group]
    items.sort(key=lambda r: str(r.get("b_no", "")))
    write_source("nts_business_status", items, dry_run=DRY_RUN,
                 extra={"as_of": kst_now().isoformat()})
    return len(items)


def main() -> int:
    global DATA_KEY, DART_KEY, LIMIT, DRY_RUN, WORKERS, MAX_AGE_DAYS
    parser = make_parser(__doc__ or "", "monthly")
    args = parser.parse_args()
    DRY_RUN, LIMIT, WORKERS, MAX_AGE_DAYS = args.dry_run, args.limit, args.workers, args.max_age_days
    keys = selected(args.only, "monthly")
    DATA_KEY = load_key("DATA_GO_KR_API_KEY", "data_go_kr_key")
    DART_KEY = load_key("OPENDART_API_KEY", "opendart_api_key")
    funcs = {
        "fsc_corp_basic": fsc_corp_basic,
        "fsc_fin_stat": fsc_fin_stat,
        "qnet_pass_rate": qnet_pass_rate,
        "qnet_stats": qnet_stats,
        "dart_corp_map": dart_corp_map,
        "dart_disclosures": dart_disclosures,
        "law_revision": law_revision,
        "nts_business_status": nts_business_status,
    }
    code = run_sources(keys, funcs, "Open API 월간 동기화 (1일 04:00 KST)", args.summary_file)
    validate_outputs((DATA_KEY, DART_KEY))
    update_manifest()
    return code


MAX_AGE_DAYS = 0

if __name__ == "__main__":
    raise SystemExit(main())
