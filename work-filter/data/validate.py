#!/usr/bin/env python3
"""직업 현실 리얼 필터 — 자료 검사 (data/*.json)

  python3 work-filter/data/validate.py

보는 것
  · 세 파일이 UTF-8·중복 키 없이 읽히는가
  · work-context: 축 6개 · 값 0~100 또는 null · 3등분 경계(cuts)가 오름차순 · 개수 집계가 실제와 같은가
  · clusters: 분야 id 중복 0 · 지역 합계가 총계를 넘지 않는가 · 순위가 내림차순인가
  · job-fields: 잇는 분야가 clusters에 있는가 · basis 낱말이 직무 이름에 실제로 들어 있는가
  · 모든 자료에 출처와 라이선스가 붙어 있는가

종료 코드 0 = 통과, 1 = 실패.
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
problems = []
notes = []


def fail(message):
    problems.append(message)


def load(name):
    path = os.path.join(HERE, name)
    try:
        with open(path, "rb") as fh:
            raw = fh.read()
    except OSError as exc:
        fail(f"{name}: 읽지 못했습니다 — {exc}")
        return None
    if raw.startswith(b"\xef\xbb\xbf"):
        fail(f"{name}: UTF-8 BOM이 붙어 있습니다")
        return None
    seen = []

    def hook(pairs):
        keys = [k for k, _ in pairs]
        if len(set(keys)) != len(keys):
            seen.append([k for k in keys if keys.count(k) > 1][0])
        return dict(pairs)

    try:
        return json.loads(raw.decode("utf-8"), object_pairs_hook=hook)
    except UnicodeDecodeError as exc:
        fail(f"{name}: UTF-8이 아닙니다 — {exc}")
    except json.JSONDecodeError as exc:
        fail(f"{name}: JSON 구문 오류 {exc.lineno}행 — {exc.msg}")
    if seen:
        fail(f"{name}: 같은 키가 두 번 나옵니다 — {seen[0]}")
    return None


def check_sources(doc, name):
    sources = doc.get("sources")
    if not isinstance(sources, list) or not sources:
        fail(f"{name}: sources가 비어 있습니다")
        return
    for src in sources:
        sid = src.get("id")
        if not sid:
            fail(f"{name}: 출처에 id가 없습니다")
        if not isinstance(src.get("license"), dict):
            fail(f"{name}: 출처 {sid}에 license가 없습니다")
        elif src["license"].get("verified") is not True:
            fail(f"{name}: 출처 {sid}의 라이선스 확인(verified)이 끝나지 않았습니다")


def check_work_context():
    doc = load("work-context.json")
    if not doc:
        return
    check_sources(doc, "work-context.json")
    axes = doc.get("axes") or []
    if len(axes) != 6:
        fail(f"work-context: 축이 6개가 아니라 {len(axes)}개입니다")
    axis_ids = [a.get("id") for a in axes]
    if len(set(axis_ids)) != len(axis_ids):
        fail("work-context: 축 id가 중복됩니다")
    for axis in axes:
        cuts = axis.get("cuts")
        if not (isinstance(cuts, list) and len(cuts) == 2):
            fail(f"work-context: 축 {axis.get('id')}에 3등분 경계(cuts)가 없습니다")
        elif not (0 <= cuts[0] < cuts[1] <= 100):
            fail(f"work-context: 축 {axis.get('id')}의 cuts가 오름차순 0~100이 아닙니다 {cuts}")
        if not axis.get("items"):
            fail(f"work-context: 축 {axis.get('id')}에 근거 항목(items)이 없습니다")
        if not str(axis.get("formula") or "").strip():
            fail(f"work-context: 축 {axis.get('id')}에 환산식 설명이 없습니다")

    who_types = doc.get("who_types") or []
    who_ids = {w.get("id") for w in who_types}
    for need in ("customers", "care", "internal", "conflict", "alone"):
        if need not in who_ids:
            fail(f"work-context: who_types에 '{need}'가 없습니다")
    for spec in who_types:
        if not spec.get("items"):
            fail(f"work-context: who_types {spec.get('id')}에 근거 항목이 없습니다")
        if not str(spec.get("formula") or "").strip():
            fail(f"work-context: who_types {spec.get('id')}에 계산식 설명이 없습니다")
    if not (doc.get("who_rules") or {}).get("pick"):
        fail("work-context: who_rules.pick(대표 갈래 고르는 규칙)이 없습니다")

    jobs = doc.get("jobs") or []
    if not jobs:
        fail("work-context: jobs가 비어 있습니다")
        return
    seen = set()
    full = 0
    for job in jobs:
        jid = job.get("id")
        if not jid:
            fail("work-context: id 없는 직무가 있습니다")
            continue
        if jid in seen:
            fail(f"work-context: 직무 id가 중복됩니다 {jid}")
        seen.add(jid)
        if not str(job.get("name") or "").strip():
            fail(f"work-context: 직무 {jid}에 이름이 없습니다")
        if not re.fullmatch(r"\d{4}", str(job.get("ksco") or "")):
            fail(f"work-context: 직무 {jid}의 KSCO 코드가 4자리가 아닙니다")
        profile = job.get("profile") or {}
        missing = job.get("missing") or []
        for axis_id in axis_ids:
            value = profile.get(axis_id)
            if value is None:
                if axis_id not in missing:
                    fail(f"work-context: 직무 {jid}의 {axis_id}가 null인데 missing에 없습니다")
                continue
            if not isinstance(value, (int, float)) or not (0 <= value <= 100):
                fail(f"work-context: 직무 {jid}의 {axis_id} 값 {value}가 0~100 밖입니다")
            if axis_id in missing:
                fail(f"work-context: 직무 {jid}의 {axis_id}가 값이 있는데 missing에 들어 있습니다")
        if not isinstance(job.get("onet_n"), int) or job.get("onet_n", 0) < 1:
            fail(f"work-context: 직무 {jid}의 onet_n이 1 이상의 정수가 아닙니다")
        if not job.get("onet_examples"):
            fail(f"work-context: 직무 {jid}에 O*NET 예시가 없습니다")
        who = job.get("who")
        if not isinstance(who, dict):
            fail(f"work-context: 직무 {jid}에 who가 없습니다")
        else:
            if who.get("primary") not in ("customers", "care", "internal", "alone", "mixed"):
                fail(f"work-context: 직무 {jid}의 who.primary '{who.get('primary')}'가 알 수 없는 값입니다")
            if not isinstance(who.get("conflict"), bool):
                fail(f"work-context: 직무 {jid}의 who.conflict가 true/false가 아닙니다")
            for key in ("customers", "care", "internal", "conflict"):
                value = (who.get("scores") or {}).get(key)
                if value is not None and (not isinstance(value, (int, float)) or not (0 <= value <= 100)):
                    fail(f"work-context: 직무 {jid}의 who.scores.{key} {value}가 0~100 밖입니다")
            if who.get("contact") is not None and not (0 <= who["contact"] <= 100):
                fail(f"work-context: 직무 {jid}의 who.contact가 0~100 밖입니다")
        if not missing:
            full += 1

    coverage = doc.get("coverage") or {}
    if coverage.get("ksco_sub_groups") != len(jobs):
        fail(f"work-context: coverage.ksco_sub_groups({coverage.get('ksco_sub_groups')})가 실제({len(jobs)})와 다릅니다")
    if coverage.get("ksco_sub_groups_all_axes") != full:
        fail(f"work-context: coverage.ksco_sub_groups_all_axes({coverage.get('ksco_sub_groups_all_axes')})가 실제({full})와 다릅니다")
    primaries = {}
    for job in jobs:
        key = (job.get("who") or {}).get("primary")
        primaries[key] = primaries.get(key, 0) + 1
    notes.append(f"직무 {len(jobs)}개 · 여섯 축 모두 있는 직무 {full}개 · 축 {len(axes)}개 · "
                 f"만나는 사람 " + " · ".join(f"{k} {v}" for k, v in sorted(primaries.items(), key=lambda kv: -kv[1])))


def check_clusters():
    doc = load("clusters.json")
    if not doc:
        return
    check_sources(doc, "clusters.json")
    fields = doc.get("fields") or []
    if not fields:
        fail("clusters: fields가 비어 있습니다")
        return
    seen = set()
    for field in fields:
        fid = field.get("id")
        if not fid:
            fail("clusters: id 없는 분야가 있습니다")
            continue
        if fid in seen:
            fail(f"clusters: 분야 id가 중복됩니다 {fid}")
        seen.add(fid)
        total = field.get("total")
        addressed = field.get("with_address")
        if not isinstance(total, int) or total < 0:
            fail(f"clusters: {fid}의 total이 정수가 아닙니다")
        if not isinstance(addressed, int) or addressed > total:
            fail(f"clusters: {fid}의 with_address({addressed})가 total({total})보다 큽니다")
        regions = field.get("regions") or []
        counts = [r.get("companies") for r in regions]
        if counts != sorted(counts, reverse=True):
            fail(f"clusters: {fid}의 지역 순위가 내림차순이 아닙니다")
        if sum(counts) > addressed:
            fail(f"clusters: {fid}의 지역 합계({sum(counts)})가 주소 공개 수({addressed})보다 큽니다")
        for region in regions:
            if not str(region.get("region") or "").strip():
                fail(f"clusters: {fid}에 이름 없는 지역이 있습니다")

    regions = doc.get("regions") or []
    if not regions:
        fail("clusters: regions가 비어 있습니다")
    for region in regions:
        shown = sum(f.get("companies", 0) for f in region.get("fields") or [])
        if region.get("total", 0) < shown:
            fail(f"clusters: 지역 {region.get('region')}의 total({region.get('total')})이 실린 분야 합계({shown})보다 작습니다")
        if len(region.get("fields") or []) > 6:
            fail(f"clusters: 지역 {region.get('region')}에 실린 분야가 6개를 넘습니다")
        if region.get("total", 0) < 5:
            fail(f"clusters: 지역 {region.get('region')}이 5곳 미만인데 실려 있습니다")

    totals = doc.get("totals") or {}
    if totals.get("companies", 0) < sum(f["total"] for f in fields):
        fail("totals.companies가 분야 합계보다 작습니다")
    if totals.get("companies_with_address") != 4080 and totals.get("companies_with_address", 0) <= 0:
        fail("totals.companies_with_address가 비어 있습니다")
    notes.append(f"분야 {len(fields)}개 · 지역 {len(regions)}곳 · 기업 {totals.get('companies')}곳 중 주소 {totals.get('companies_with_address')}곳")


def check_links():
    doc = load("job-fields.json")
    if not doc:
        return
    wc = load("work-context.json") or {}
    cl = load("clusters.json") or {}
    jobs = {j["id"]: j for j in wc.get("jobs") or []}
    fields = {f["id"] for f in cl.get("fields") or []}
    links = doc.get("links") or {}
    if not links:
        fail("job-fields: links가 비어 있습니다")
        return
    for jid, hits in links.items():
        job = jobs.get(jid)
        if not job:
            fail(f"job-fields: 장부에 없는 직무 {jid}")
            continue
        if not isinstance(hits, list) or not (1 <= len(hits) <= 2):
            fail(f"job-fields: 직무 {jid}의 연결이 1~2개가 아닙니다")
            continue
        for hit in hits:
            if hit.get("field") not in fields:
                fail(f"job-fields: 직무 {jid}가 없는 분야 {hit.get('field')}를 가리킵니다")
            basis = hit.get("basis") or ""
            if basis and basis not in job["name"]:
                fail(f"job-fields: 직무 {jid}의 근거 낱말 '{basis}'가 이름에 없습니다")
    coverage = doc.get("coverage") or {}
    if coverage.get("jobs_with_field") != len(links):
        fail("job-fields: coverage.jobs_with_field가 실제 연결 수와 다릅니다")
    notes.append(f"직무↔분야 참고 연결 {len(links)}건 / 직무 {len(jobs)}개")


def main():
    check_work_context()
    check_clusters()
    check_links()
    print("· " + "\n· ".join(notes))
    if problems:
        print("-" * 60)
        for message in problems[:40]:
            print(f"✗ {message}")
        if len(problems) > 40:
            print(f"… 그 밖 {len(problems) - 40}건")
        print(f"실패 {len(problems)}건")
        return 1
    print("✓ 자료 검사 통과")
    return 0


if __name__ == "__main__":
    sys.exit(main())
