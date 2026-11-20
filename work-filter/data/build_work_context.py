#!/usr/bin/env python3
"""직업 현실 리얼 필터 — 근무환경 프로필 생성기 (1단계 데이터 가공)

원자료(모두 공식·개방 출처, 재가공 허용)
  1) O*NET® 31.0 Database Text (Work Context · Work Activities · Occupation Data)
     미국 노동부 취업훈련청(USDOL/ETA) — CC BY 4.0
     https://www.onetcenter.org/database.html  (db_31_0_text.zip)
  2) ISCO-08 ↔ 2010 SOC 연계표 (미국 노동통계국 BLS, 2012/2015)
     https://www.bls.gov/soc/soccrosswalks.htm  (ISCO_SOC_Crosswalk.xls)
  3) 2010 SOC ↔ 2018 SOC 연계표 (BLS, 2017)
     https://www.bls.gov/soc/2018/crosswalks.htm  (soc_2010_to_2018_crosswalk.xlsx)
  4) 한국표준직업분류(KSCO) 제8차 ↔ 국제표준직업분류(ISCO-08) 연계표
     국가데이터처(구 통계청) 통계분류포털, 2025-11-03 게시
     https://kssc.mods.go.kr:8443/  (KSCO > 연계표)
  5) 저장소 taxonomy/data/taxonomy.json (한국고용정보원 고용직업분류 KECO ↔ KSCO 공식 매핑)

원칙
  · 지어낸 값 0건 — 공식 자료에 있는 값만 쓰고, 한 축이라도 근거가 없으면 그 축은 null로 비운다.
  · 직업은 KSCO 제8차 세분류(4자리) 단위로 세운다. O*NET 직업 → SOC → ISCO-08 → KSCO 세분류의
    공식 연계 사슬만 쓴다.
  · 연계 사슬은 N:M이다(하나의 ISCO 세분류가 여러 KSCO로, 여러 SOC가 한 ISCO로). 그래서 한 KSCO
    칸에는 그 칸으로 이어진 O*NET 직업들의 값을 **같은 무게로 평균**한다. 평균에 들어간 O*NET
    직업 수(onet_n)를 함께 남겨 근거의 두께를 화면에 보이게 한다.

원자료는 저장소에 넣지 않는다(13MB ZIP + 연계표 4종). 아래 네 곳에서 직접 받아 두고 --인자로 가리킨다.
  O*NET      https://www.onetcenter.org/dl_files/database/db_31_0_text.zip  (CC BY 4.0)
  BLS ISCO   https://www.bls.gov/soc/soccrosswalks.htm  → ISCO_SOC_Crosswalk.xls
  BLS SOC    https://www.bls.gov/soc/2018/crosswalks.htm → soc_2010_to_2018_crosswalk.xlsx
  KSCO-ISCO  https://kssc.mods.go.kr:8443/  → KSCO > 연계표 > 「KSCO 8차-ISCO-08 연계표」xlsx

사용법
  python3 work-filter/data/build_work_context.py \
      --onet  <db_31_0_text 폴더> \
      --ksco-isco <KSCO-ISCO 연계표.xlsx> \
      --isco-soc  <ISCO_SOC_Crosswalk.xls> \
      --soc-crosswalk <soc_2010_to_2018_crosswalk.xlsx> \
      --taxonomy taxonomy/data/taxonomy.json \
      --out work-filter/data/work-context.json
"""
import argparse
import csv
import json
import os
import re
from datetime import date

# ---------------------------------------------------------------- 축 정의
# 화면에 그대로 나가는 문구라 여기서만 고친다. items는 O*NET 원소 ID(근거).
AXES = [
    {
        "id": "field",
        "name": "현장성",
        "left": "사무실(내근)",
        "right": "현장·야외",
        "question": "하루 대부분을 사무실에서 보내나요, 현장에서 보내나요?",
        "items": ["4.C.2.a.1.a", "4.C.2.a.1.b", "4.C.2.a.1.c", "4.C.2.a.1.d"],
        "formula": "현장성 = 평균(실내·비통제, 야외·전천후, 야외·지붕) ÷ 4 × 100. 사무실 값은 실내·환경통제를 같은 방식으로 100점 환산.",
        "office_item": "4.C.2.a.1.a",
    },
    {
        "id": "people",
        "name": "사람 대면",
        "left": "혼자",
        "right": "사람·고객 응대",
        "question": "고객·민원인을 직접 얼마나 자주 상대하나요?",
        "items": ["4.C.1.a.4", "4.C.1.b.1.f", "4.C.1.a.2.l"],
        "formula": "사람 대면 = 평균(타인 접촉, 외부 고객 응대, 대면 토의) ÷ 4 × 100.",
    },
    {
        "id": "team",
        "name": "팀 협업",
        "left": "혼자 맡은 일",
        "right": "팀으로 함께",
        "question": "내 일이 팀 협업을 얼마나 요구하나요?",
        "items": ["4.C.1.b.1.e", "4.C.1.b.1.g"],
        "formula": "팀 협업 = (팀 작업 중요도 + 타인 조율·지휘) 평균 ÷ 4 × 100.",
    },
    {
        "id": "screen",
        "name": "컴퓨터·이메일",
        "left": "몸으로 하는 일",
        "right": "컴퓨터·이메일 중심",
        "question": "컴퓨터와 이메일이 업무의 중심인가요?",
        "items": ["4.A.3.b.1", "4.C.1.a.2.h"],
        "formula": "컴퓨터·이메일 = 평균(컴퓨터 사용 중요도, 이메일 빈도)을 100점으로 환산. 컴퓨터 사용은 「업무활동(Work Activities)」 원소.",
        "extra_file": "Work Activities",
    },
    {
        "id": "travel",
        "name": "이동·차량",
        "left": "한곳에서",
        "right": "차량·이동 많음",
        "question": "차를 몰거나 밖으로 다니는 일이 많나요?",
        "items": ["4.C.2.a.1.f", "4.C.2.a.1.e", "4.C.2.d.1.d"],
        "formula": "이동·차량 = 평균(밀폐 차량·장비, 개방 차량, 걷기·뛰기) ÷ 4 × 100.",
    },
    {
        "id": "shift",
        "name": "교대·불규칙",
        "left": "정해진 시간",
        "right": "교대·불규칙·계절",
        "question": "근무 시간표가 정해져 있나요, 교대·불규칙인가요?",
        "items": ["4.C.3.d.4"],
        "formula": "교대·불규칙 = (근무일정 값 − 1) ÷ 2 × 100. 값 1은 정규(정해진 시간), 2는 불규칙, 3은 계절 근무.",
    },
]

# 축을 만드는 데 쓰는 O*NET 원소 이름(출처 표기용)
ELEMENT_NAMES = {
    "4.C.2.a.1.a": "Indoors, Environmentally Controlled (실내·환경 통제)",
    "4.C.2.a.1.b": "Indoors, Not Environmentally Controlled (실내·비통제)",
    "4.C.2.a.1.c": "Outdoors, Exposed to All Weather Conditions (야외·전천후)",
    "4.C.2.a.1.d": "Outdoors, Under Cover (야외·지붕 아래)",
    "4.C.2.a.1.e": "In an Open Vehicle or Operating Equipment (개방 차량·장비)",
    "4.C.2.a.1.f": "In an Enclosed Vehicle or Operate Enclosed Equipment (밀폐 차량·장비)",
    "4.C.2.d.1.d": "Spend Time Walking or Running (걷기·뛰기)",
    "4.C.1.a.4": "Contact With Others (타인 접촉 정도)",
    "4.C.1.b.1.f": "Deal With External Customers or the Public (외부 고객·민원 응대)",
    "4.C.1.a.2.l": "Face-to-Face Discussions (대면 토의)",
    "4.C.1.b.1.e": "Work With or Contribute to a Work Group or Team (팀 작업)",
    "4.C.1.b.1.g": "Coordinate or Lead Others (타인 조율·지휘)",
    "4.C.1.a.2.h": "E-Mail (이메일 빈도)",
    "4.A.3.b.1": "Working with Computers (컴퓨터 사용)",
    "4.C.3.d.4": "Work Schedules (근무 일정)",
}


def norm5(v):
    """O*NET 1~5 척도 → 0~100."""
    if v is None:
        return None
    return max(0.0, min(100.0, (v - 1.0) / 4.0 * 100.0))


def mean(values):
    vals = [v for v in values if v is not None]
    if not vals:
        return None
    return round(sum(vals) / len(vals), 1)


# ---------------------------------------------------------------- 원자료 읽기
def read_rows(path):
    with open(path, encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh, delimiter="\t"))


def load_onet(onet_dir, warnings):
    occ = {}
    for row in read_rows(os.path.join(onet_dir, "Occupation Data.txt")):
        code = (row["O*NET-SOC Code"] or "").strip()
        if code:
            occ[code] = (row["Title"] or "").strip()

    context = {}      # (code, element) -> CX(1~5) 값
    context_ct = {}   # (code, element) -> CT(1~3) 값 — 근무 일정만 3단 척도를 쓴다
    for row in read_rows(os.path.join(onet_dir, "Work Context.txt")):
        scale = row["Scale ID"]
        if scale not in ("CX", "CT"):
            continue
        try:
            value = float(row["Data Value"])
        except (TypeError, ValueError):
            continue
        key = (row["O*NET-SOC Code"].strip(), row["Element ID"].strip())
        if scale == "CX":
            context[key] = value
        else:
            context_ct[key] = value

    computers = {}    # code -> IM value of 4.A.3.b.1
    for row in read_rows(os.path.join(onet_dir, "Work Activities.txt")):
        if row["Element ID"].strip() != "4.A.3.b.1" or row["Scale ID"] != "IM":
            continue
        try:
            computers[row["O*NET-SOC Code"].strip()] = float(row["Data Value"])
        except (TypeError, ValueError):
            continue

    if not occ:
        warnings.append("O*NET Occupation Data를 읽지 못했습니다.")
    return occ, context, context_ct, computers


def profile_from_onet(code, context, context_ct, computers):
    get = lambda elem: context.get((code, elem))
    office = norm5(get("4.C.2.a.1.a"))
    field = mean([norm5(get("4.C.2.a.1.b")), norm5(get("4.C.2.a.1.c")), norm5(get("4.C.2.a.1.d"))])
    people = mean([norm5(get("4.C.1.a.4")), norm5(get("4.C.1.b.1.f")), norm5(get("4.C.1.a.2.l"))])
    team = mean([norm5(get("4.C.1.b.1.e")), norm5(get("4.C.1.b.1.g"))])
    screen = mean([norm5(computers.get(code)), norm5(get("4.C.1.a.2.h"))])
    travel = mean([norm5(get("4.C.2.a.1.f")), norm5(get("4.C.2.a.1.e")), norm5(get("4.C.2.d.1.d"))])
    shift_raw = context_ct.get((code, "4.C.3.d.4"))
    shift = None if shift_raw is None else max(0.0, min(100.0, (shift_raw - 1.0) / 2.0 * 100.0))
    return {
        "office": office,
        "field": field,
        "people": people,
        "team": team,
        "screen": screen,
        "travel": travel,
        "shift": None if shift is None else round(shift, 1),
    }


# ---------------------------------------------------------------- 연계표
def load_isco_soc(path, warnings):
    """ISCO-08 4자리 → 2010 SOC 6자리 목록, 2010 SOC → ISCO 목록."""
    import xlrd
    book = xlrd.open_workbook(path)
    sheet = book.sheet_by_name("ISCO-08 to 2010 SOC")
    header = [str(sheet.cell_value(6, c)).strip() for c in range(sheet.ncols)]
    try:
        i_isco = header.index("ISCO-08 Code")
        i_soc = header.index("2010 SOC Code")
    except ValueError:
        warnings.append("ISCO-SOC 연계표의 머리글을 찾지 못했습니다.")
        return {}, {}
    isco_to_soc, soc_to_isco = {}, {}
    for r in range(7, sheet.nrows):
        isco = str(sheet.cell_value(r, i_isco)).strip().split(".")[0]
        soc = str(sheet.cell_value(r, i_soc)).strip()
        if not isco or not soc:
            continue
        if not re.fullmatch(r"\d{4}", isco):
            continue
        soc = soc.replace("\u00a0", " ").strip()
        if not re.fullmatch(r"\d{2}-\d{4}", soc):
            continue
        isco_to_soc.setdefault(isco, set()).add(soc)
        soc_to_isco.setdefault(soc, set()).add(isco)
    return isco_to_soc, soc_to_isco


def load_soc_2010_2018(path, warnings):
    """2018 SOC → 2010 SOC 목록."""
    import openpyxl
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb[wb.sheetnames[0]]
    rows = list(ws.iter_rows(values_only=True))
    header_at = None
    for i, row in enumerate(rows[:20]):
        if row and row[0] == "2010 SOC Code":
            header_at = i
            break
    if header_at is None:
        warnings.append("2010→2018 SOC 연계표의 머리글을 찾지 못했습니다.")
        return {}
    out = {}
    for row in rows[header_at + 1:]:
        if not row or not row[0]:
            continue
        soc2010 = str(row[0]).strip()
        soc2018 = str(row[2]).strip() if len(row) > 2 and row[2] else ""
        if not re.fullmatch(r"\d{2}-\d{4}", soc2018) or not re.fullmatch(r"\d{2}-\d{4}", soc2010):
            continue
        out.setdefault(soc2018, set()).add(soc2010)
    return out


def load_ksco_isco(path, warnings):
    """ISCO-08 4자리 → [(KSCO 세분류 코드, 이름)] (KSCO 제8차)."""
    import openpyxl
    wb = openpyxl.load_workbook(path, data_only=True)
    name = None
    for sheet_name in wb.sheetnames:
        if "ISCO(08)-KSCO" in sheet_name:
            name = sheet_name
            break
    if name is None:
        warnings.append("KSCO-ISCO 연계표에서 ISCO→KSCO 시트를 찾지 못했습니다.")
        return {}, {}
    ws = wb[name]
    rows = list(ws.iter_rows(values_only=True))
    isco_to_ksco, ksco_name = {}, {}
    current = None
    for row in rows:
        if not row or len(row) < 5:
            continue
        first = row[0]
        if first is not None:
            candidate = str(first).strip()
            if re.fullmatch(r"\d{4}", candidate):
                current = candidate
            elif re.fullmatch(r"[A-Z]\d{3}", candidate):
                current = candidate
            else:
                current = current if re.fullmatch(r"\d{4}", candidate or "") else current
        code = row[3]
        ksco = None
        if isinstance(code, int):
            ksco = f"{code:04d}"
        elif code is not None:
            text = str(code).strip().lstrip("*#").strip()
            if re.fullmatch(r"\d{4}", text):
                ksco = text
        if current is None or ksco is None:
            continue
        if not re.fullmatch(r"\d{4}", current):
            continue          # 군인(A011 등)은 KECO·O*NET 대응이 없어 뺀다
        label = str(row[4] or "").strip()
        isco_to_ksco.setdefault(current, set()).add(ksco)
        if label:
            ksco_name.setdefault(ksco, label)
    return isco_to_ksco, ksco_name


def load_taxonomy(path, warnings):
    """KSCO 세분류 → KECO 세분류 목록(공식 매핑), KECO·KSCO 이름."""
    with open(path, encoding="utf-8") as fh:
        doc = json.load(fh)
    keco_name = {str(x["code"]): x["name"] for x in doc["keco"]["levels"]["sub"]}
    ksco_name = {str(x["code"]): x["name"] for x in doc["ksco"]["levels"]["sub"]}
    ksco_middle = {str(x["code"]): x["name"] for x in doc["ksco"]["levels"]["middle"]}
    keco_middle = {str(x["code"]): x["name"] for x in doc["keco"]["levels"]["middle"]}
    ksco_to_keco = {}
    for pair in doc["mappings"]["keco_ksco"]:
        ksco = str(pair["ksco_code"])
        keco = str(pair["keco_code"])
        ksco_to_keco.setdefault(ksco, []).append(keco)
    if not ksco_to_keco:
        warnings.append("taxonomy.json에서 KECO↔KSCO 매핑을 읽지 못했습니다.")
    return keco_name, ksco_name, ksco_to_keco, ksco_middle, keco_middle


# ---------------------------------------------------------------- 본체
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--onet", required=True)
    ap.add_argument("--ksco-isco", required=True)
    ap.add_argument("--isco-soc", required=True)
    ap.add_argument("--soc-crosswalk", required=True)
    ap.add_argument("--taxonomy", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    warnings = []
    occ, context, context_ct, computers = load_onet(args.onet, warnings)
    isco_to_soc, soc_to_isco = load_isco_soc(args.isco_soc, warnings)
    soc2018_to_2010 = load_soc_2010_2018(args.soc_crosswalk, warnings)
    isco_to_ksco, ksco_label = load_ksco_isco(args.ksco_isco, warnings)
    keco_name, ksco_name, ksco_to_keco, ksco_middle, keco_middle = load_taxonomy(args.taxonomy, warnings)

    # 1) O*NET 직업 → ISCO-08 4자리
    onet_to_isco = {}
    unmatched_soc = set()
    for code in occ:
        soc2018 = code.split(".")[0]
        socs = soc2018_to_2010.get(soc2018, {soc2018})
        iscos = set()
        for soc in socs:
            iscos |= soc_to_isco.get(soc, set())
        if not iscos:
            iscos = soc_to_isco.get(soc2018, set())
        if iscos:
            onet_to_isco[code] = sorted(iscos)
        else:
            unmatched_soc.add(soc2018)
    onet_mapped = len(onet_to_isco)

    # 2) ISCO → KSCO 세분류, 각 KSCO 칸에 모인 O*NET 직업
    ksco_contrib = {}
    for code, isco_list in onet_to_isco.items():
        for isco in isco_list:
            for ksco in isco_to_ksco.get(isco, ()):  # noqa: E501
                ksco_contrib.setdefault(ksco, {})[code] = isco

    # 3) KSCO 칸마다 축 평균
    jobs = []
    axis_complete = 0
    for ksco in sorted(ksco_contrib):
        codes = sorted(ksco_contrib[ksco])
        profiles = [profile_from_onet(c, context, context_ct, computers) for c in codes]
        values = {}
        missing = []
        for axis in AXES:
            key = axis["id"]
            values[key] = mean([p[key] for p in profiles])
            if values[key] is None:
                missing.append(key)
        values["office"] = mean([p["office"] for p in profiles])
        if not missing:
            axis_complete += 1
        keco_list = sorted(ksco_to_keco.get(ksco, []))
        jobs.append({
            "id": ksco,
            "ksco": ksco,
            "name": ksco_name.get(ksco) or ksco_label.get(ksco) or ksco,
            "ksco_middle": ksco_middle.get(ksco[:2]),
            "keco": keco_list,
            "keco_name": [keco_name.get(k, k) for k in keco_list],
            "keco_middle": [keco_middle.get(k[:2], "") for k in keco_list],
            "isco": sorted({ksco_contrib[ksco][c] for c in codes}),
            "profile": values,
            "missing": missing,
            "onet_n": len(codes),
            "onet_examples": [occ[c] for c in codes[:4]],
        })

    # 축마다 「낮은 편·보통·높은 편」의 경계를 자료에서 뽑는다(3등분). 값 자체는 0~100 그대로 둔다.
    cuts = {}
    for axis in AXES:
        values = sorted(j["profile"][axis["id"]] for j in jobs if j["profile"][axis["id"]] is not None)
        if values:
            cuts[axis["id"]] = [round(values[int(len(values) * 0.333)], 1),
                               round(values[int(len(values) * 0.667)], 1)]

    with_travel = sum(1 for j in jobs if j["profile"]["travel"] is not None)
    payload = {
        "schema_version": "1.0.0",
        "dataset": "직업 현실 리얼 필터 — 근무환경 프로필(KSCO 세분류)",
        "generated_at": date.today().isoformat(),
        "notice": (
            "O*NET 31.0의 근무환경·업무활동 응답값을 공식 연계표(O*NET→SOC→ISCO-08→KSCO 8차)로 "
            "한국표준직업분류 세분류에 옮겨 평균한 값입니다. O*NET은 미국 직업 기준이라 한국의 "
            "같은 이름 직무와 100% 같지 않으며, 연계가 없는 직무는 싣지 않았습니다."
        ),
        "sources": [
            {
                "id": "onet",
                "name": "O*NET® 31.0 Database — Work Context · Work Activities · Occupation Data",
                "publisher": "U.S. Department of Labor / Employment and Training Administration (USDOL/ETA)",
                "url": "https://www.onetcenter.org/database.html",
                "file": "db_31_0_text.zip",
                "license": {"type": "CC-BY-4.0", "name": "Creative Commons Attribution 4.0 International",
                            "url": "https://creativecommons.org/licenses/by/4.0/", "verified": True},
                "credit": "O*NET® is a trademark of USDOL/ETA. 이 화면은 O*NET 31.0 자료를 가공해 만들었습니다.",
                "base_date": "2026-08-30 (31.0 배포)",
                "used_for": "근무환경 축 6개의 원값",
            },
            {
                "id": "bls-isco-soc",
                "name": "ISCO-08 ↔ 2010 SOC 연계표",
                "publisher": "U.S. Bureau of Labor Statistics",
                "url": "https://www.bls.gov/soc/soccrosswalks.htm",
                "file": "ISCO_SOC_Crosswalk.xls",
                "license": {"type": "PUBLIC-DOMAIN", "name": "미국 연방정부 저작물(퍼블릭 도메인)", "verified": True},
                "base_date": "2012-08 (2015-06 갱신)",
                "used_for": "SOC → ISCO-08 연계",
            },
            {
                "id": "bls-soc-crosswalk",
                "name": "2010 SOC ↔ 2018 SOC 연계표",
                "publisher": "U.S. Bureau of Labor Statistics",
                "url": "https://www.bls.gov/soc/2018/crosswalks.htm",
                "file": "soc_2010_to_2018_crosswalk.xlsx",
                "license": {"type": "PUBLIC-DOMAIN", "name": "미국 연방정부 저작물(퍼블릭 도메인)", "verified": True},
                "base_date": "2017-11",
                "used_for": "O*NET(2018 SOC) → 2010 SOC 연계",
            },
            {
                "id": "kostat-ksco-isco",
                "name": "한국표준직업분류(KSCO) 제8차 ↔ 국제표준직업분류(ISCO-08) 연계표",
                "publisher": "국가데이터처(구 통계청) 통계분류포털",
                "url": "https://kssc.mods.go.kr:8443/",
                "file": "한국표준직업분류(KSCO 8차)-국제표준직업분류(ISCO-08) 연계표.xlsx",
                "license": {"type": "KOGL-1", "name": "공공누리 제1유형(출처표시)", "verified": True},
                "base_date": "2025-11-03 게시 / KSCO 제8차(2025-01-01 시행)",
                "used_for": "ISCO-08 → KSCO 세분류 연계",
            },
            {
                "id": "keco-ksco",
                "name": "한국고용직업분류 2025 ↔ 한국표준직업분류 8차 연계표(자료실 taxonomy 경유)",
                "publisher": "한국고용정보원",
                "url": "https://github.com/ccttsi/jobcounsel/tree/main/taxonomy/data",
                "file": "taxonomy.json",
                "license": {"type": "PUBLIC-DATA", "name": "이용허락범위 제한 없음", "verified": True},
                "base_date": "KECO 2025",
                "used_for": "KSCO 세분류 → KECO 세분류(화면에 함께 보이는 고용24 직무분류)",
            },
        ],
        "axes": [
            {
                "id": a["id"],
                "name": a["name"],
                "left": a["left"],
                "right": a["right"],
                "question": a["question"],
                "items": [{"id": i, "name": ELEMENT_NAMES.get(i, i)} for i in a["items"]],
                "formula": a["formula"],
                "cuts": cuts.get(a["id"]),
            }
            for a in AXES
        ],
        "method": {
            "chain": "O*NET-SOC(8자리) → 2018 SOC → 2010 SOC → ISCO-08 세분류(4자리) → KSCO 제8차 세분류(4자리)",
            "aggregation": "한 KSCO 세분류로 이어진 O*NET 직업들의 축 값을 같은 무게로 평균(반올림 0.1).",
            "scale": "O*NET 1~5 응답은 (값−1)÷4×100으로 100점 환산. 근무일정은 (값−1)÷2×100.",
            "missing": "근거 값이 하나라도 없으면 그 축은 null로 비우고, 화면에서 「지표 없음」으로 보여 준다.",
            "bands": "화면의 「낮은 편·보통·높은 편」은 축마다 직무들을 값 순서로 3등분한 경계(cuts)다. 값 자체는 0~100.",
            "not_invented": "팀 인원수·연봉·출장 일수처럼 O*NET에 없는 값은 만들지 않는다.",
        },
        "coverage": {
            "onet_occupations": len(occ),
            "onet_occupations_linked": onet_mapped,
            "onet_occupations_unlinked": len(occ) - onet_mapped,
            "isco_groups_linked": len({i for v in onet_to_isco.values() for i in v}),
            "ksco_sub_groups": len(jobs),
            "ksco_sub_groups_all_axes": axis_complete,
            "ksco_sub_groups_with_travel": with_travel,
            "ksco_sub_groups_with_keco": sum(1 for j in jobs if j["keco"]),
        },
        "warnings": warnings,
        "jobs": jobs,
    }

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))

    print(f"· O*NET 직업 {len(occ)}개 중 {onet_mapped}개가 ISCO-08로 이어졌습니다 "
          f"(연계 없음 {len(occ) - onet_mapped}).")
    print(f"· KSCO 세분류 {len(jobs)}개 칸 · 여섯 축 모두 있는 칸 {axis_complete}개 · "
          f"KECO 이름이 붙은 칸 {payload['coverage']['ksco_sub_groups_with_keco']}개")
    if warnings:
        print("· 경고:", *warnings, sep="\n    ")
    print(f"· 저장: {args.out}")


if __name__ == "__main__":
    main()
