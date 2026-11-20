#!/usr/bin/env python3
"""공공데이터 Open API 주기 동기화 — 공통 모듈

이 모듈은 `sync_openapi_daily.py`·`sync_openapi_weekly.py`·`sync_openapi_monthly.py`가
함께 쓰는 인증키·호출·파싱·저장 도구다. 표준 라이브러리만 쓴다(러너에 pip 설치 없음).

지재권 원칙
-----------
대상 API는 모두 공공데이터포털에서 **이용허락범위 제한 없음**으로 승인받았거나
(금융위원회·한국산업인력공단·재정경제부·국세청·한국산업인력공단 Q-net),
**공공누리 제1유형**(법제처 국가법령정보) / **OpenDART 공식 OpenAPI**다.
응답 값은 가공하지 않고 API가 준 그대로 저장하며, 값이 없으면 빈 문자열·null로 두고
지어내지 않는다. 각 산출물의 `source`에 서비스 ID·공식 URL·이용허락범위를 함께 남긴다.

비밀키
------
`DATA_GO_KR_API_KEY`·`OPENDART_API_KEY` 환경변수를 먼저 읽고, 없으면 저장소 밖
`.secrets/` 파일을 읽는다(로컬 드라이런용). 키는 어떤 산출물·로그에도 쓰지 않는다.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data" / "openapi"
SECRETS_DIR = ROOT.parent / ".secrets"
KST = timezone(timedelta(hours=9))

SCHEMA = "jobcounsel.openapi.v1"
USER_AGENT = "jobcounsel-openapi-sync/1.0 (+https://witw.pages.dev)"

# 공공데이터포털 서비스 메타데이터(공식 페이지 기준). 이용허락범위는 신청 화면과 같은 값이다.
SOURCES = {
    "alio_recruitment": {
        "name": "재정경제부_공공기관 채용정보 조회서비스",
        "provider": "재정경제부",
        "service_id": "15125273",
        "endpoint": "https://apis.data.go.kr/1051000/recruitment/list",
        "license": "이용허락범위 제한 없음",
        "official_url": "https://www.data.go.kr/data/15125273/openapi.do",
        "update_cycle": "실시간",
        "tier": "daily",
        "path": "alio/recruitment.json",
    },
    "qual_exam_schedule": {
        "name": "한국산업인력공단_국가자격 시험일정 조회 서비스",
        "provider": "한국산업인력공단",
        "service_id": "15074408",
        "endpoint": "https://apis.data.go.kr/B490007/qualExamSchd/getQualExamSchdList",
        "license": "이용허락범위 제한 없음",
        "official_url": "https://www.data.go.kr/data/15074408/openapi.do",
        "update_cycle": "실시간",
        "tier": "daily",
        "path": "qnet/exam-schedule.json",
    },
    "ncs_training": {
        "name": "한국산업인력공단_NCS 훈련과정 정보",
        "provider": "한국산업인력공단",
        "service_id": "15086447",
        "endpoint": "https://apis.data.go.kr/B490007/ncsTrainingCource/openapi18",
        "license": "이용허락범위 제한 없음",
        "official_url": "https://www.data.go.kr/data/15086447/openapi.do",
        "update_cycle": "실시간",
        "tier": "weekly",
        "path": "ncs/training-courses.json",
    },
    "fsc_corp_basic": {
        "name": "금융위원회_기업기본정보",
        "provider": "금융위원회",
        "service_id": "15043184",
        "endpoint": "https://apis.data.go.kr/1160100/service/GetCorpBasicInfoService_V2/getCorpOutline_V2",
        "license": "이용허락범위 제한 없음",
        "official_url": "https://www.data.go.kr/data/15043184/openapi.do",
        "update_cycle": "월 1회(공시 반영)",
        "tier": "monthly",
        "path": "fsc/corp-basic.json",
    },
    "fsc_fin_stat": {
        "name": "금융위원회_기업 재무정보",
        "provider": "금융위원회",
        "service_id": "15043459",
        "endpoint": "https://apis.data.go.kr/1160100/service/GetFinaStatInfoService_V2/getSummFinaStat_V2",
        "license": "이용허락범위 제한 없음",
        "official_url": "https://www.data.go.kr/data/15043459/openapi.do",
        "update_cycle": "월 1회(공시 반영)",
        "tier": "monthly",
        "path": "fsc/fin-stat.json",
    },
    "qnet_pass_rate": {
        "name": "한국산업인력공단_연도별 회별 국가기술자격 합격률",
        "provider": "한국산업인력공단",
        "service_id": "15089380",
        "endpoint": "http://openapi.q-net.or.kr/api/service/rest/InquiryQualPassRateSVC/getList",
        "license": "이용허락범위 제한 없음",
        "official_url": "https://www.data.go.kr/data/15089380/openapi.do",
        "update_cycle": "연 1회(회차 발표)",
        "tier": "monthly",
        "path": "qnet/pass-rate.json",
    },
    "qnet_stats": {
        "name": "한국산업인력공단_산업인력 국가기술자격 통계 정보",
        "provider": "한국산업인력공단",
        "service_id": "15025329",
        "endpoint": "http://openapi.q-net.or.kr/api/service/rest/InquiryStatSVC/getTotExamList",
        "license": "이용허락범위 제한 없음",
        "official_url": "https://www.data.go.kr/data/15025329/openapi.do",
        "update_cycle": "연 1회(통계 발표)",
        "tier": "monthly",
        "path": "qnet/stats.json",
    },
    "dart_corp_map": {
        "name": "OpenDART 기업 고유번호",
        "provider": "금융감독원 전자공시시스템",
        "service_id": "OpenDART corpCode.xml",
        "endpoint": "https://opendart.fss.or.kr/api/corpCode.xml",
        "license": "OpenDART 공식 OpenAPI(이용약관)",
        "official_url": "https://opendart.fss.or.kr/",
        "update_cycle": "월 1회",
        "tier": "monthly",
        "path": "dart/corp-map.json",
    },
    "dart_disclosures": {
        "name": "OpenDART 공시목록",
        "provider": "금융감독원 전자공시시스템",
        "service_id": "OpenDART list.json",
        "endpoint": "https://opendart.fss.or.kr/api/list.json",
        "license": "OpenDART 공식 OpenAPI(이용약관)",
        "official_url": "https://opendart.fss.or.kr/",
        "update_cycle": "월 1회",
        "tier": "monthly",
        "path": "dart/disclosures.json",
    },
    "law_revision": {
        "name": "법제처_국가법령정보 공유서비스",
        "provider": "법제처",
        "service_id": "15000115",
        "endpoint": "https://apis.data.go.kr/1170000/law/lawSearchList.do",
        "license": "공공누리 제1유형",
        "official_url": "https://www.data.go.kr/data/15000115/openapi.do",
        "update_cycle": "수시(공포·시행)",
        "tier": "monthly",
        "path": "law/revisions.json",
    },
    "nts_business_status": {
        "name": "국세청_사업자등록정보 진위확인 및 상태조회 서비스",
        "provider": "국세청",
        "service_id": "15081808",
        "endpoint": "https://api.odcloud.kr/api/nts-businessman/v1/status",
        "license": "이용허락범위 제한 없음",
        "official_url": "https://www.data.go.kr/data/15081808/openapi.do",
        "update_cycle": "실시간(30분 주기)",
        "tier": "monthly",
        "path": "nts/status.json",
    },
}


class AuthPending(RuntimeError):
    """인증 반영 대기(401/403·등록되지 않은 키). 실패로 몰지 않고 '대기'로 보고한다."""


class SourceError(RuntimeError):
    """그 밖의 호출·파싱 실패."""


# ------------------------------------------------------------------ 기본 도우미
def kst_now() -> datetime:
    return datetime.now(KST).replace(microsecond=0)


def load_key(env_name: str, file_name: str) -> str:
    value = os.environ.get(env_name, "").strip()
    if value:
        return value
    path = SECRETS_DIR / file_name
    if path.exists():
        return path.read_text(encoding="utf-8").strip()
    raise SystemExit(
        f"{env_name} 인증키가 없다. GitHub Actions에서는 Secrets로, 로컬에서는 "
        f"{path} 파일로 넣어라."
    )


def _quote(params: dict) -> str:
    return urllib.parse.urlencode(params, safe="", doseq=True)


def _open(req: urllib.request.Request, timeout: int):
    with urllib.request.urlopen(req, timeout=timeout) as res:
        raw = res.read()
        if res.headers.get("Content-Encoding") == "gzip":
            import gzip

            raw = gzip.decompress(raw)
        return res.status, raw


def request_raw(
    url: str,
    params: dict | None = None,
    *,
    data: bytes | None = None,
    headers: dict | None = None,
    timeout: int = 60,
    retries: int = 3,
) -> bytes:
    """GET/POST 한 번 — 429·5xx는 잠깐 쉬었다 다시, 401·403은 AuthPending."""
    full = url + ("&" if "?" in url else "?") + _quote(params) if params else url
    hdrs = {"User-Agent": USER_AGENT, "Accept-Encoding": "gzip", "Accept": "*/*"}
    if headers:
        hdrs.update(headers)
    last = None
    for attempt in range(retries + 1):
        try:
            status, raw = _open(urllib.request.Request(full, data=data, headers=hdrs), timeout)
            return raw
        except urllib.error.HTTPError as exc:
            body = exc.read()[:500]
            if exc.code in (401, 403):
                raise AuthPending(f"HTTP {exc.code}: {body[:200]!r}") from exc
            if exc.code in (429, 500, 502, 503, 504) and attempt < retries:
                last = exc
                time.sleep(1.5 * (attempt + 1))
                continue
            raise SourceError(f"HTTP {exc.code}: {body[:300]!r}") from exc
        except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
            if attempt < retries:
                last = exc
                time.sleep(1.5 * (attempt + 1))
                continue
            raise SourceError(f"연결 실패: {exc}") from exc
    raise SourceError(f"재시도 끝에 실패: {last}")


def get_json(url: str, params: dict, **kwargs):
    raw = request_raw(url, params, **kwargs)
    text = raw.decode("utf-8", errors="replace").lstrip("\ufeff").strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise SourceError(f"JSON이 아니다: {text[:200]}") from exc


def post_json(url: str, params: dict, payload: dict, **kwargs):
    raw = request_raw(
        url,
        params,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        **kwargs,
    )
    text = raw.decode("utf-8", errors="replace").lstrip("\ufeff").strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise SourceError(f"JSON이 아니다: {text[:200]}") from exc


def parse_xml(raw: bytes):
    """XML → dict. 같은 이름이 여러 번 나오면 list. CDATA는 ElementTree가 text로 준다."""
    try:
        root = ET.fromstring(raw)
    except ET.ParseError as exc:
        raise SourceError(f"XML 파싱 실패: {exc} — {raw[:200]!r}") from exc
    return {root.tag.split("}")[-1]: _element(root)}


def _element(node):
    children = list(node)
    if not children:
        return (node.text or "").strip()
    out = {}
    for child in children:
        key = child.tag.split("}")[-1]
        value = _element(child)
        if key in out:
            if not isinstance(out[key], list):
                out[key] = [out[key]]
            out[key].append(value)
        else:
            out[key] = value
    return out


def as_list(value) -> list:
    if value is None or value == "":
        return []
    return value if isinstance(value, list) else [value]


def body_items(body) -> list:
    """공공데이터포털 응답의 `body.items`가 list인 경우와 `{item: [...]}`인 경우를 모두 받는다."""
    if not isinstance(body, dict):
        return []
    items = body.get("items")
    if isinstance(items, list):
        return items
    if isinstance(items, dict):
        return as_list(items.get("item"))
    return []


def gateway_code(payload: dict) -> tuple[str, str]:
    """공공데이터포털 공통 응답의 결과코드·메시지를 꺼낸다(모양이 여러 가지다)."""
    if not isinstance(payload, dict):
        return "", ""
    for key in ("header", "dataInfo", "response"):
        node = payload.get(key)
        if isinstance(node, dict):
            code = node.get("resultCode") or node.get("code") or ""
            msg = node.get("resultMsg") or node.get("message") or ""
            if code or msg:
                return str(code), str(msg)
    return str(payload.get("resultCode", "")), str(payload.get("resultMsg", ""))


AUTH_HINTS = ("인증", "SERVICE_KEY", "등록되지 않은", "활용신청", "권한")


def ensure_ok(payload: dict, ok_codes=("00", "000", "0", "200")) -> None:
    code, msg = gateway_code(payload)
    if code in ok_codes or (not code and not msg):
        return
    if any(hint in msg for hint in AUTH_HINTS) or code in ("20", "30", "31", "32"):
        raise AuthPending(f"결과코드 {code}: {msg}")
    raise SourceError(f"결과코드 {code}: {msg}")


# ------------------------------------------------------------------ 저장
def _canonical(items) -> str:
    return json.dumps(items, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def envelope(key: str, items: list, fetched_at: str, extra: dict | None = None) -> dict:
    meta = SOURCES[key]
    out = {
        "schema": SCHEMA,
        "source": {
            "key": key,
            "name": meta["name"],
            "provider": meta["provider"],
            "service_id": meta["service_id"],
            "endpoint": meta["endpoint"],
            "license": meta["license"],
            "license_note": "공공데이터포털 이용허락범위 제한 없음 / 공공누리 제1유형 / OpenDART 공식 OpenAPI",
            "official_url": meta["official_url"],
            "update_cycle": meta["update_cycle"],
        },
        "fetched_at": fetched_at,
        "count": len(items),
        "items": items,
    }
    if extra:
        out.update(extra)
    return out


def write_source(key: str, items: list, *, dry_run: bool = False, extra: dict | None = None) -> bool:
    """바뀐 것이 있을 때만 쓴다. 반환값 = 파일을 새로 썼는지."""
    meta = SOURCES[key]
    path = DATA_DIR / meta["path"]
    old = None
    if path.exists():
        try:
            old = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            old = None
    if old and _canonical(old.get("items")) == _canonical(items):
        print(f"  = {key}: 변경 없음 ({len(items):,}건)")
        return False
    if dry_run:
        print(f"  * {key}: {len(items):,}건 (드라이런 — 쓰지 않음)")
        return True
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = envelope(key, items, kst_now().isoformat(), extra)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    print(f"  + {key}: {len(items):,}건 → {path.relative_to(ROOT)}")
    return True


def validate_outputs(secret_values: tuple[str, ...] = ()) -> None:
    """산출물이 JSON으로 읽히고 count가 맞는지, 인증키가 섮여 있지 않은지 마지막으로 확인한다."""
    problems = []
    for key, meta in SOURCES.items():
        path = DATA_DIR / meta["path"]
        if not path.exists():
            continue
        raw = path.read_text(encoding="utf-8")
        try:
            doc = json.loads(raw)
        except json.JSONDecodeError as exc:
            problems.append(f"{key}: JSON 구문 오류 {exc}")
            continue
        if doc.get("count") != len(doc.get("items", [])):
            problems.append(f"{key}: count({doc.get('count')})와 items({len(doc.get('items', []))})가 다르다")
        for secret in secret_values:
            if secret and len(secret) > 8 and secret in raw:
                problems.append(f"{key}: 인증키 값이 산출물에 들어 있다")
    if problems:
        for problem in problems:
            print(f"  ! 산출물 검사: {problem}")
        raise SystemExit(2)
    print("산출물 검사 통과 — JSON·count·인증키 노출 없음")


def update_manifest(tiers: list[str] | None = None) -> bool:
    """data/openapi 아래 산출물을 훑어 MANIFEST.json을 다시 만든다(사람이 읽는 색인)."""
    rows = []
    total_bytes = 0
    for key, meta in SOURCES.items():
        if tiers and meta["tier"] not in tiers:
            continue
        path = DATA_DIR / meta["path"]
        if not path.exists():
            continue
        raw = path.read_bytes()
        total_bytes += len(raw)
        try:
            doc = json.loads(raw.decode("utf-8"))
            count = doc.get("count")
            fetched_at = doc.get("fetched_at")
        except json.JSONDecodeError:
            count, fetched_at = None, None
        rows.append(
            {
                "key": key,
                "name": meta["name"],
                "service_id": meta["service_id"],
                "tier": meta["tier"],
                "path": f"data/openapi/{meta['path']}",
                "count": count,
                "fetched_at": fetched_at,
                "bytes": len(raw),
                "sha256": hashlib.sha256(raw).hexdigest(),
                "license": meta["license"],
                "official_url": meta["official_url"],
            }
        )
    manifest = {
        "schema": SCHEMA,
        "kind": "manifest",
        "generated_at": kst_now().isoformat(),
        "tiers": {tier: sorted({r["key"] for r in rows if r["tier"] == tier}) for tier in ("daily", "weekly", "monthly")},
        "total_bytes": total_bytes,
        "sources": rows,
        "note": "값은 공식 Open API 응답 그대로다. 확인되지 않은 값은 지어내지 않고 빈 문자열/null로 둔다.",
    }
    path = DATA_DIR / "MANIFEST.json"
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if path.exists():
        try:
            old = json.loads(path.read_text(encoding="utf-8"))
            old.pop("generated_at", None)
            fresh = dict(manifest)
            fresh.pop("generated_at", None)
            if old == fresh:
                return False  # 내용이 같으면 시각만 바뀌어도 쓰지 않는다(커밋 소음 방지)
        except json.JSONDecodeError:
            pass
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return True


# ------------------------------------------------------------------ 실행 틀
def make_parser(description: str, tier: str) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument("--dry-run", action="store_true", help="호출만 하고 파일은 쓰지 않는다")
    parser.add_argument("--only", default="", help="쉼표로 고른 소스 키만 실행")
    parser.add_argument("--workers", type=int, default=6, help="동시 호출 수(기본 6)")
    parser.add_argument("--limit", type=int, default=0, help="소스별 최대 건수(시험용, 0=전체)")
    parser.add_argument("--offset", type=int, default=0, help="앞에서 몇 건을 건너뛸지(긴 작업을 나눠 돌릴 때)")
    parser.add_argument("--dart-budget", type=int, default=2000, help="OpenDART에서 한 번에 새로 검증할 최대 기업 수(기본 2,000)")
    parser.add_argument("--summary-file", default="", help="GitHub Step Summary 경로")
    parser.add_argument("--max-age-days", type=int, default=0, help="주기 갱신 창(일)")
    return parser


def selected(only: str, tier: str) -> list[str]:
    wanted = [part.strip() for part in only.split(",") if part.strip()]
    keys = [k for k, v in SOURCES.items() if v["tier"] == tier]
    if wanted:
        unknown = [w for w in wanted if w not in SOURCES]
        if unknown:
            raise SystemExit(f"모르는 소스 키: {', '.join(unknown)}")
        keys = [k for k in keys if k in wanted]
    return keys


def write_summary(path: str, title: str, rows: list[dict], notes: list[str]) -> None:
    lines = [f"## {title}", "", "| 소스 | 서비스 | 건수 | 상태 |", "|---|---|---:|---|"]
    for row in rows:
        lines.append(
            f"| {row['name']} | `{row['service_id']}` | {row.get('count', '-'):,} | {row['status']} |"
            if isinstance(row.get("count"), int)
            else f"| {row['name']} | `{row['service_id']}` | - | {row['status']} |"
        )
    if notes:
        lines += ["", *[f"- {n}" for n in notes]]
    text = "\n".join(lines) + "\n"
    print("\n" + text)
    if path:
        Path(path).write_text(text, encoding="utf-8")


def run_sources(keys: list[str], funcs: dict, summary_title: str, summary_file: str) -> int:
    """소스별로 실행하고, 인증 대기는 실패로 세지 않는다. 하나라도 실패하면 종료코드 1."""
    rows, notes = [], []
    failed = False
    for key in keys:
        meta = SOURCES[key]
        started = time.time()
        try:
            count = funcs[key]()
            rows.append({"name": meta["name"], "service_id": meta["service_id"], "count": count, "status": "정상"})
            print(f"완료 {key}: {count:,}건 · {time.time() - started:.1f}s")
        except AuthPending as exc:
            rows.append({"name": meta["name"], "service_id": meta["service_id"], "status": "인증 대기"})
            notes.append(f"{key}: 인증 반영 대기 — {exc}")
            print(f"인증 대기 {key}: {exc}")
        except (SourceError, Exception) as exc:  # noqa: BLE001 — 한 소스 실패가 나머지를 막지 않게
            failed = True
            rows.append({"name": meta["name"], "service_id": meta["service_id"], "status": "실패"})
            notes.append(f"{key}: {type(exc).__name__} — {exc}")
            print(f"실패 {key}: {type(exc).__name__} — {exc}")
    write_summary(summary_file, summary_title, rows, notes)
    return 1 if failed else 0


def paginate(fetch_page, *, label: str, page_size: int = 100, max_pages: int = 1000, limit: int = 0):
    """pageNo/numOfRows 방식 공통 페이지 루프. fetch_page(page, size) → (rows, total)."""
    page, out, total = 1, [], None
    while page <= max_pages:
        rows, total = fetch_page(page, page_size)
        out.extend(rows)
        if limit and len(out) >= limit:
            return out[:limit]
        if not rows:
            break
        if total is not None and len(out) >= total:
            break
        if len(rows) < page_size:
            break
        page += 1
    if total is not None and len(out) < total:
        print(f"  ! {label}: {len(out):,}/{total:,}건만 받았다(페이지 상한 {max_pages})")
    return out


def companies() -> list[dict]:
    path = ROOT / "company" / "data" / "companies.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    return doc["companies"]


def normalize_name(name: str) -> str:
    text = re.sub(r"\(주\)|㈜|\(유\)|\(사\)|주식회사|유한회사", "", name or "")
    return re.sub(r"[\s\-_.·,]", "", text).lower()


def parse_yyyymmdd(value: str):
    value = (value or "").replace("-", "").replace(".", "").strip()
    if len(value) != 8 or not value.isdigit():
        return None
    try:
        return date(int(value[:4]), int(value[4:6]), int(value[6:]))
    except ValueError:
        return None


def month_window(today: date | None = None, days: int = 0) -> tuple[str, str]:
    """월간 공시 창 — 오늘이 1일이면 지난달 1일~말일, 아니면 최근 days일."""
    today = today or kst_now().date()
    if today.day == 1 and not days:
        end = today - timedelta(days=1)
        start = end.replace(day=1)
    else:
        end = today
        start = end - timedelta(days=days or 30)
    return start.strftime("%Y%m%d"), end.strftime("%Y%m%d")


def parallel_map(func, items, workers: int, label: str, fail_ratio: float = 0.1):
    """동시 호출 — 실패가 fail_ratio를 넘으면 멈춘다(한도·장애를 조용히 넘기지 않게)."""
    results, errors = [], []
    total = len(items)
    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        futures = {pool.submit(func, item): item for item in items}
        for idx, future in enumerate(as_completed(futures), 1):
            try:
                results.append(future.result())
            except Exception as exc:  # noqa: BLE001
                errors.append((futures[future], exc))
                if len(errors) > total * fail_ratio:
                    for f in futures:
                        f.cancel()
                    raise SourceError(f"{label}: {len(errors)}건 실패로 중단 — {errors[-1][1]}")
            if idx % 250 == 0 or idx == total:
                print(f"  … {label} {idx:,}/{total:,}")
    if errors:
        print(f"  ! {label}: {len(errors)}건 실패(허용 범위) — 예: {errors[0][1]}")
    return [r for r in results if r is not None]
