#!/usr/bin/env python3
"""커리어넷 개편 전후 직업 데이터 대조 — `careernet/data/job-diff.json` 생성.

무엇을: 구버전 커리어넷 Open API 직업사전(`data/openapi/careernet/jobs.json`, 2023년 8월
개편 전 제공분)과 사이트 신버전 직업 데이터셋(`decalcomania/data/jobs.json`, 커리어넷
직업백과 2025년 갱신분 기반)을 직업명으로 맞대어 공통·신설·미수록을 판별하고,
공통 항목의 분류·유사직업 변화를 뽑아 정적 비교 데이터로 남긴다.

원칙(헌법 제1조·제2조):
- 이름·분류·수치·코드·목록 같은 사실만 옮긴다. 하는 일·적성·전망 문장 같은 서술문은
  두 데이터셋 모두 싣지 않는다.
- 값이 없으면 항목째 생략한다(빈 칸·추정 0).
- 출처·기준시점·매칭 규칙을 문서 머리에 함께 기록한다.

실행: python3 ops/scripts/build_careernet_diff.py [--check]
"""
import argparse
import collections
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OLD_PATH = ROOT / "data/openapi/careernet/jobs.json"
NEW_PATH = ROOT / "decalcomania/data/jobs.json"
MAJORS_PATH = ROOT / "decalcomania/data/majors.json"
OUT_PATH = ROOT / "careernet/data/job-diff.json"

# 직업명 매칭 규칙: 공백과 구분점(·)만 지우고 정확히 같은 이름끼리 맞댄다.
# 접두·접미 다듬기나 부분 일치를 두지 않는다 — 이름이 다르면 다른 직업으로 본다.
NORM_RE = re.compile(r"[\s·ㆍ]")


def norm(name: str) -> str:
    return NORM_RE.sub("", name)


def band_of(manwon) -> str | None:
    """신버전 연봉(만원)을 구버전 연봉구간 기준에 맞춰 볼 때의 구간(참고용 비교값)."""
    if manwon is None:
        return None
    if manwon >= 4000:
        return "4천만원 ↑"
    if manwon >= 3000:
        return "3천만원 ↑"
    if manwon >= 2000:
        return "2천만원 ↑"
    return "2천만원 ↓"


def build() -> dict:
    old_doc = json.loads(OLD_PATH.read_text())
    new_doc = json.loads(NEW_PATH.read_text())
    majors = {m["id"]: m["name"] for m in json.loads(MAJORS_PATH.read_text())["majors"]}

    old_items = old_doc["items"]
    new_items = new_doc["jobs"]

    old_by = {norm(x["name"]): x for x in old_items}
    new_by = {norm(x["name"]): x for x in new_items}

    def old_side(x: dict) -> dict:
        out = {
            "field": x.get("field") or None,
            "salary_band": x.get("salary_band") or None,
            "growth": x.get("growth") or None,
            "equal_employment": x.get("equal_employment") or None,
            "similar_jobs": x.get("similar_jobs") or [],
            "jobdic_seq": x.get("jobdic_seq") or None,
            "job_code": x.get("job_code") or None,
            "cnet_class_code": x.get("cnet_class_code") or None,
            "official_url": x.get("official_url") or None,
        }
        return {k: v for k, v in out.items() if v not in (None, [])}

    def new_side(x: dict) -> dict:
        out = {
            "id": x.get("id"),
            "group": x.get("group") or None,
            "salary_10k_krw": x.get("salary_10k_krw"),
            "related_job_names": x.get("related_job_names") or [],
            "related_major_names": [majors[i] for i in (x.get("related_majors") or []) if i in majors],
            "required_licenses": x.get("required_licenses") or [],
            "keco_detail": (x.get("keco") or {}).get("detail_name") or None,
            "ksco_detail": (x.get("ksco") or {}).get("detail_name") or None,
            "job_code": x.get("job_code") or None,
            "updated": x.get("updated") or None,
            "source_url": x.get("source_url") or None,
        }
        return {k: v for k, v in out.items() if v not in (None, [])}

    common, new_only, old_only = [], [], []
    cls_changed = 0
    similar_added_n = 0
    similar_removed_n = 0

    for x in old_items:
        y = new_by.get(norm(x["name"]))
        if y is None:
            old_only.append({"k": "old", "name": x["name"], "old": old_side(x)})
            continue
        o, n = old_side(x), new_side(y)
        add, rm = [], []
        oset = {norm(s) for s in (x.get("similar_jobs") or [])}
        nset = {norm(s) for s in (y.get("related_job_names") or [])}
        if oset or nset:
            add = [s for s in (y.get("related_job_names") or []) if norm(s) not in oset]
            rm = [s for s in (x.get("similar_jobs") or []) if norm(s) not in nset]
        cls = bool(o.get("field") and n.get("group") and norm(o["field"]) != norm(n["group"]))
        if cls:
            cls_changed += 1
        similar_added_n += len(add)
        similar_removed_n += len(rm)
        common.append({
            "k": "common", "name": x["name"], "old": o, "new": n,
            "chg": {"cls": cls, "add": add, "rm": rm},
        })

    for y in new_items:
        if norm(y["name"]) not in old_by:
            new_only.append({"k": "new", "name": y["name"], "new": new_side(y)})

    old_at = old_doc.get("fetched_at", "")[:10]
    new_at = new_doc.get("meta", {}).get("generated", "")
    counts = {
        "old": len(old_items),
        "new": len(new_items),
        "common": len(common),
        "new_only": len(new_only),
        "old_only": len(old_only),
        "classification_changed": cls_changed,
        "similar_added": similar_added_n,
        "similar_removed": similar_removed_n,
    }

    return {
        "schema": "jobcounsel.careernet.jobdiff.v1",
        "match_rule": "직업명의 공백·구분점(·)을 지운 뒤 정확히 같은 이름끼리 맞댔다. 이름이 다르면 다른 직업으로 본다.",
        "usage_scope": "이름·분류·수치·코드·이름 목록 같은 사실만 비교한다. 하는 일·적성·전망 문장 같은 서술문은 두 데이터셋 모두 싣지 않는다.",
        "basis": {
            "old": {
                "key": "careernet_jobs",
                "name": "커리어넷 직업정보(직업사전) Open API",
                "provider": "한국직업능력연구원(교육부 지원) 커리어넷",
                "url": "https://www.career.go.kr/cnet/front/openapi/openApiJobCenter.do",
                "license": "공공누리 제1유형(출처 표시)",
                "fetched_at": old_at,
                "note": "2023년 8월 개편 전 제공분. 개편 뒤 제공 중단이 예고된 서비스다.",
            },
            "new": {
                "key": "decalcomania_jobs",
                "name": "커리어데칼코마니 직업 데이터셋(커리어넷 직업백과 기반)",
                "provider": "한국고용정보원 커리어넷 직업백과를 사이트 데이터셋으로 정리",
                "url": "./decalcomania/",
                "license": "공공저작물 출처표시(KOGL 제1유형) 준용",
                "generated_at": new_at,
                "note": "직업정보 2025년 갱신분 / 임금·직업지표 워크피디아 2020~2024.",
            },
        },
        "counts": counts,
        "items": common + new_only + old_only,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="지금 파일과 다시 만든 것이 같은지 본다")
    args = ap.parse_args()
    doc = build()
    text = json.dumps(doc, ensure_ascii=False, separators=(",", ":"))
    if args.check:
        cur = OUT_PATH.read_text() if OUT_PATH.exists() else ""
        print("같음" if cur == text else "다름")
        raise SystemExit(0 if cur == text else 1)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(text)
    c = doc["counts"]
    print(f"공통 {c['common']} · 신설 {c['new_only']} · 구버전 전용 {c['old_only']} → {OUT_PATH.relative_to(ROOT)}")
    print(f"분류 이동 {c['classification_changed']}건 · 유사직업 추가 {c['similar_added']}·제외 {c['similar_removed']}")


if __name__ == "__main__":
    main()
