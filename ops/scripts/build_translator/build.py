#!/usr/bin/env python3
"""내담자 언어 번역기 용어 확충 빌더.

data_*.py 의 ROWS 를 읽어 translator/data/terms.json 에 합친다.
· 기존 용어와 같은 말(공백·기호 무시)은 건너뛴다.
· id 는 묶음 접두어 + 영문/순번으로 만들고 중복을 막는다.
· easy 90자·ctx 130자 상한을 여기서 먼저 잰다.
사용: python3 build.py [--dry] [--repo ../../jobcounsel]
"""
import argparse
import importlib
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

MODULES = sorted(
    f[:-3] for f in os.listdir(HERE)
    if f.startswith("data_") and f.endswith(".py")
)

GROUP_LINKS = {
    "job-it": [{"to": "taxonomy"}, {"to": "cert"}],
    "job-mfg": [{"to": "valuechain"}, {"to": "thermometer"}],
    "job-mgmt": [{"to": "labor"}, {"to": "taxonomy"}],
    "job-sales": [{"to": "portfolio"}, {"to": "surgery"}],
    "job-fin": [{"to": "fin-lab"}, {"to": "taxonomy"}],
    "job-design": [{"to": "portfolio"}, {"to": "interview"}],
    "job-logi": [{"to": "valuechain"}, {"to": "thermometer"}],
    "job-rnd": [{"to": "emerging"}, {"to": "thermometer"}],
    "job-svc": [{"to": "talk"}, {"to": "taxonomy"}],
    "job-med": [{"to": "cert"}, {"to": "taxonomy"}],
    "job-lab": [{"to": "cert"}, {"to": "taxonomy"}],
    "job-trade": [{"to": "taxonomy"}, {"to": "company"}],
    "job-const": [{"to": "valuechain"}, {"to": "law"}],
    "job-ehs": [{"to": "law"}, {"to": "valuechain"}],
    "job-legal": [{"to": "law"}, {"to": "posting"}],
    "job-public": [{"to": "manual"}, {"to": "company"}],
    "job-air": [{"to": "portals"}, {"to": "company"}],
    "job-hotel": [{"to": "portals"}, {"to": "taxonomy"}],
    "job-craft": [{"to": "taxonomy"}, {"to": "cert"}],
    "job-service2": [{"to": "talk"}, {"to": "taxonomy"}],
    "ind-semi": [{"to": "thermometer"}, {"to": "valuechain"}],
    "ind-bio": [{"to": "thermometer"}, {"to": "valuechain"}],
    "ind-auto": [{"to": "thermometer"}, {"to": "valuechain"}],
    "ind-build": [{"to": "valuechain"}, {"to": "thermometer"}],
    "ind-platform": [{"to": "thermometer"}, {"to": "taxonomy"}],
    "ind-retail": [{"to": "valuechain"}, {"to": "thermometer"}],
    "ind-pub": [{"to": "company"}, {"to": "taxonomy"}],
    "ind-energy": [{"to": "thermometer"}, {"to": "valuechain"}],
    "ind-food": [{"to": "thermometer"}, {"to": "valuechain"}],
    "ind-quality": [{"to": "valuechain"}, {"to": "cert"}],
    "ind-batt": [{"to": "thermometer"}, {"to": "valuechain"}],
    "ind-display": [{"to": "thermometer"}, {"to": "valuechain"}],
    "ind-defense": [{"to": "company"}, {"to": "thermometer"}],
    "ind-marine": [{"to": "thermometer"}, {"to": "valuechain"}],
    "ind-beauty": [{"to": "thermometer"}, {"to": "valuechain"}],
    "ind-content": [{"to": "emerging"}, {"to": "thermometer"}],
    "ind-logis": [{"to": "valuechain"}, {"to": "thermometer"}],
    "ind-med": [{"to": "cert"}, {"to": "thermometer"}],
    "edu-eng": [{"to": "cert"}, {"to": "decalcomania"}],
    "edu-biz": [{"to": "cert"}, {"to": "decalcomania"}],
    "edu-hum": [{"to": "cert"}, {"to": "decalcomania"}],
    "edu-health": [{"to": "cert"}, {"to": "decalcomania"}],
    "edu-cert": [{"to": "cert"}, {"to": "qnet"}],
    "edu-train": [{"to": "kdt-calc"}, {"to": "portals"}],
    "edu-path": [{"to": "cb"}, {"to": "univ"}],
    "pol-ins": [{"to": "manual"}, {"to": "hud"}],
    "pol-nat": [{"to": "hud"}, {"to": "manual"}],
    "pol-train": [{"to": "kdt-calc"}, {"to": "portals"}],
    "pol-target": [{"to": "policy-match"}, {"to": "manual"}],
    "pol-labor": [{"to": "law"}, {"to": "pay-calc"}],
    "pol-sub": [{"to": "policy-match"}, {"to": "hud"}],
    "sl-corp": [{"to": "talk"}, {"to": "labor"}],
    "sl-job": [{"to": "surgery"}, {"to": "interview"}],
    "sl-pay": [{"to": "pay-calc"}, {"to": "labor"}],
    "sl-study": [{"to": "interview"}, {"to": "surgery"}],
    "sl-field": [{"to": "taxonomy"}, {"to": "work-filter"}],
    "dg-person": [{"to": "talk"}, {"to": "theory"}],
    "dg-self": [{"to": "talk"}, {"to": "theory"}],
    "dg-status": [{"to": "talk"}, {"to": "reality"}],
    "dg-edu": [{"to": "talk"}, {"to": "reality"}],
    "dg-job": [{"to": "talk"}, {"to": "taxonomy"}],
    "fin-bank": [{"to": "fin-lab"}, {"to": "taxonomy"}],
    "fin-sec": [{"to": "fin-lab"}, {"to": "company"}],
    "fin-ins": [{"to": "fin-lab"}, {"to": "law"}],
    "fin-acct": [{"to": "fin-lab"}, {"to": "company"}],
    "fin-tax": [{"to": "fin-lab"}, {"to": "law"}],
    "leg-contract": [{"to": "law"}, {"to": "posting"}],
    "leg-ip": [{"to": "law"}, {"to": "company"}],
    "leg-labor": [{"to": "law"}, {"to": "pay-calc"}],
    "leg-safety": [{"to": "law"}, {"to": "valuechain"}],
    "leg-esg": [{"to": "law"}, {"to": "thermometer"}],
    "care-clinic": [{"to": "cert"}, {"to": "taxonomy"}],
    "care-pharma": [{"to": "cert"}, {"to": "thermometer"}],
    "care-service": [{"to": "manual"}, {"to": "policy-match"}],
    "care-device": [{"to": "cert"}, {"to": "thermometer"}],
    "org-structure": [{"to": "taxonomy"}, {"to": "company"}],
    "org-report": [{"to": "labor"}, {"to": "talk"}],
    "org-eval": [{"to": "labor"}, {"to": "taxonomy"}],
    "org-culture": [{"to": "talk"}, {"to": "labor"}],
    "org-collab": [{"to": "interview"}, {"to": "taxonomy"}],
    "trd-doc": [{"to": "taxonomy"}, {"to": "company"}],
    "trd-pay": [{"to": "fin-lab"}, {"to": "taxonomy"}],
    "trd-cus": [{"to": "law"}, {"to": "portals"}],
    "trd-log": [{"to": "valuechain"}, {"to": "thermometer"}],
    "agr-crop": [{"to": "taxonomy"}, {"to": "cert"}],
    "agr-live": [{"to": "taxonomy"}, {"to": "cert"}],
    "agr-sea": [{"to": "taxonomy"}, {"to": "thermometer"}],
    "agr-food": [{"to": "valuechain"}, {"to": "taxonomy"}],
}

# 화면의 섹터 id 가 아닌 것(자격증 도감은 cert, 학점은행제 근거는 cb) — 링크는 섹터만.
FIX_LINKS = {"qnet": "cert", "cb": "univ"}

PREFIX = {
    "job-it": "it", "job-mfg": "mfg", "job-mgmt": "mgmt", "job-sales": "sale",
    "job-fin": "fin", "job-design": "dsg", "job-logi": "logi", "job-rnd": "rnd",
    "job-svc": "svc", "job-med": "med", "job-lab": "lab", "job-trade": "trd",
    "job-const": "cst", "job-ehs": "ehs", "job-legal": "leg",
    "job-public": "gov", "job-air": "air", "job-hotel": "htl",
    "job-craft": "cf", "job-service2": "sv2",
    "ind-semi": "semi", "ind-bio": "bio", "ind-auto": "auto", "ind-build": "bld",
    "ind-platform": "plt", "ind-retail": "ret", "ind-pub": "pub", "ind-energy": "eng",
    "ind-food": "food", "ind-quality": "qal", "ind-batt": "bat", "ind-display": "dsp",
    "ind-defense": "def", "ind-marine": "mar", "ind-beauty": "bea", "ind-content": "cnt",
    "ind-logis": "lgs", "ind-med": "hlt",
    "edu-eng": "ede", "edu-biz": "edb", "edu-hum": "edh", "edu-health": "edm",
    "edu-cert": "edc", "edu-train": "edt", "edu-path": "edp",
    "pol-ins": "pli", "pol-nat": "pln", "pol-train": "plt2", "pol-target": "ptg",
    "pol-labor": "pll", "pol-sub": "pls",
    "sl-corp": "sc", "sl-job": "sj", "sl-pay": "sp", "sl-study": "ss", "sl-field": "sf",
    "dg-person": "dp", "dg-self": "ds", "dg-status": "dt", "dg-edu": "de", "dg-job": "dj",
    "fin-bank": "fb", "fin-sec": "fs", "fin-ins": "fi", "fin-acct": "fa", "fin-tax": "ft",
    "leg-contract": "lc", "leg-ip": "lp", "leg-labor": "ll", "leg-safety": "ls", "leg-esg": "le",
    "care-clinic": "cc", "care-pharma": "cp", "care-service": "cs", "care-device": "cd",
    "org-structure": "os", "org-report": "or", "org-eval": "oe", "org-culture": "oc", "org-collab": "ol",
    "trd-doc": "td", "trd-pay": "tp", "trd-cus": "tc", "trd-log": "tl",
    "agr-crop": "ac", "agr-live": "al", "agr-sea": "as", "agr-food": "af",
}

NEW_SOURCES = [
    {"id": "s-bok", "name": "한국은행", "url": "https://www.bok.or.kr",
     "note": "통화정책·기업경기실사지수·소비자동향지수 등 경제 통계 안내."},
    {"id": "s-fss", "name": "금융감독원", "url": "https://www.fss.or.kr",
     "note": "금융회사 감독·금융소비자 보호·불법금융 신고 안내."},
    {"id": "s-krx", "name": "한국거래소", "url": "https://www.krx.co.kr",
     "note": "유가증권·코스닥 시장 공시·상장 제도 안내."},
    {"id": "s-hira", "name": "건강보험심사평가원", "url": "https://www.hira.or.kr",
     "note": "진료비 심사·수가·요양급여 기준 안내."},
    {"id": "s-nhis", "name": "국민건강보험공단", "url": "https://www.nhis.or.kr",
     "note": "건강보험 자격·보험료·급여 안내."},
    {"id": "s-msit", "name": "과학기술정보통신부", "url": "https://www.msit.go.kr",
     "note": "정보통신·소프트웨어·연구개발 정책 안내."},
    {"id": "s-kisa", "name": "한국인터넷진흥원", "url": "https://www.kisa.or.kr",
     "note": "정보보호·개인정보·ISMS 인증 안내."},
    {"id": "s-kotra", "name": "KOTRA", "url": "https://www.kotra.or.kr",
     "note": "수출입 시장정보·해외 진출 지원 안내."},
    {"id": "s-me", "name": "환경부", "url": "https://www.me.go.kr",
     "note": "환경·온실가스·배출권거래 제도 안내."},
    {"id": "s-ftc", "name": "공정거래위원회", "url": "https://www.ftc.go.kr",
     "note": "공정거래·하도급·표시광고 제도 안내."},
    {"id": "s-pps", "name": "조달청", "url": "https://www.pps.go.kr",
     "note": "공공조달·입찰·계약 제도 안내."},
    {"id": "s-kocca", "name": "한국콘텐츠진흥원", "url": "https://www.kocca.kr",
     "note": "콘텐츠 산업 통계·지원 사업 안내."},
    {"id": "s-mcst", "name": "문화체육관광부", "url": "https://www.mcst.go.kr",
     "note": "문화·관광·콘텐츠 정책 안내."},
    {"id": "s-kdata", "name": "한국데이터산업진흥원", "url": "https://www.kdata.or.kr",
     "note": "데이터 산업·데이터 자격 안내."},
    {"id": "s-kostat", "name": "통계청", "url": "https://www.kostat.go.kr",
     "note": "인구·고용·물가 등 국가 통계 안내."},
    {"id": "s-mafra", "name": "농림축산식품부", "url": "https://www.mafra.go.kr",
     "note": "농업경영체·직불금·농지·축산 이력제 등 농림축산 정책 안내."},
    {"id": "s-grad", "name": "교육부", "url": "https://www.moe.go.kr",
     "note": "대학원·학위·연구윤리 등 고등교육 제도 안내."},
    {"id": "s-nps", "name": "국민연금공단", "url": "https://www.nps.or.kr",
     "note": "국민연금 가입·납부·수급 제도 안내."},
    {"id": "s-mma", "name": "병무청", "url": "https://www.mma.go.kr",
     "note": "병역 이행·대체복무·병역지정업체 안내."},
    {"id": "s-kdca", "name": "질병관리청", "url": "https://www.kdca.go.kr",
     "note": "감염병·예방접종·검역 안내."},
    {"id": "s-kipo", "name": "특허청", "url": "https://www.kipo.go.kr",
     "note": "특허·상표·디자인 출원과 지식재산 제도 안내."},
    {"id": "s-gov24", "name": "행정안전부 정부24", "url": "https://www.gov.kr",
     "note": "민원·증명서 발급 등 정부 온라인 서비스 안내."},
    {"id": "s-mofa", "name": "외교부", "url": "https://www.mofa.go.kr",
     "note": "여권·영사·해외 안전 정보 안내."},
    {"id": "s-mpva", "name": "국가보훈부", "url": "https://www.mpva.go.kr",
     "note": "국가유공자 등록·보훈 지원 제도 안내."},
]

NEW_CATS = [
    {"id": "finance", "name": "금융·재무", "short": "금융",
     "desc": "은행·증권·보험·회계·세무·리스크 직무의 약어와 실무 용어"},
    {"id": "legal", "name": "법률·노무", "short": "법률",
     "desc": "계약·지식재산·노무·산업안전·ESG 담당자가 쓰는 실무 용어"},
    {"id": "care", "name": "의료·바이오", "short": "의료",
     "desc": "병원·제약·임상·요양·의료기기 직무의 현장 용어"},
    {"id": "org", "name": "조직·일터", "short": "조직",
     "desc": "조직 구조·보고·평가·협업·문화를 회사 안에서 부르는 말"},
    {"id": "trade", "name": "무역·수출입", "short": "무역",
     "desc": "수출입 서류·결제·통관·국제운송 실무 용어"},
    {"id": "agri", "name": "농림수산", "short": "농수산",
     "desc": "재배·축산·수산·식품가공 현장의 직무 용어"},
]

NEW_GROUPS = [
    {"id": "job-legal", "cat": "job", "name": "법무·특허/컴플라이언스", "short": "법무"},
    {"id": "job-public", "cat": "job", "name": "공공·행정/공기업", "short": "공공"},
    {"id": "job-air", "cat": "job", "name": "항공·운항/정비", "short": "항공"},
    {"id": "job-hotel", "cat": "job", "name": "호텔·관광/MICE", "short": "호텔"},
    {"id": "job-craft", "cat": "job", "name": "기능·기술/건설현장", "short": "기능"},
    {"id": "job-service2", "cat": "job", "name": "서비스·현장직", "short": "서비스"},
    {"id": "ind-logis", "cat": "industry", "name": "물류·이커머스/풀필먼트", "short": "물류"},
    {"id": "ind-med", "cat": "industry", "name": "의료·헬스케어/케어", "short": "의료"},
    {"id": "fin-bank", "cat": "finance", "name": "은행·여신/수신", "short": "은행"},
    {"id": "fin-sec", "cat": "finance", "name": "증권·투자/자산관리", "short": "증권"},
    {"id": "fin-ins", "cat": "finance", "name": "보험·리스크", "short": "보험"},
    {"id": "fin-acct", "cat": "finance", "name": "회계·결산/원가", "short": "회계"},
    {"id": "fin-tax", "cat": "finance", "name": "세무·자금", "short": "세무"},
    {"id": "leg-contract", "cat": "legal", "name": "계약·법무/컴플라이언스", "short": "계약"},
    {"id": "leg-ip", "cat": "legal", "name": "지식재산·인허가", "short": "특허"},
    {"id": "leg-labor", "cat": "legal", "name": "노무·근로관계", "short": "노무"},
    {"id": "leg-safety", "cat": "legal", "name": "산업안전·중대재해", "short": "안전"},
    {"id": "leg-esg", "cat": "legal", "name": "ESG·환경규제", "short": "ESG"},
    {"id": "care-clinic", "cat": "care", "name": "병원·원무/간호", "short": "병원"},
    {"id": "care-pharma", "cat": "care", "name": "제약·임상/인허가", "short": "임상"},
    {"id": "care-service", "cat": "care", "name": "요양·복지/케어", "short": "요양"},
    {"id": "care-device", "cat": "care", "name": "의료기기·헬스테크", "short": "기기"},
    {"id": "org-structure", "cat": "org", "name": "조직구조·부서", "short": "구조"},
    {"id": "org-report", "cat": "org", "name": "보고·결재/의사결정", "short": "보고"},
    {"id": "org-eval", "cat": "org", "name": "평가·인사/보상", "short": "평가"},
    {"id": "org-culture", "cat": "org", "name": "조직문화·관계", "short": "문화"},
    {"id": "org-collab", "cat": "org", "name": "협업·프로젝트", "short": "협업"},
    {"id": "trd-doc", "cat": "trade", "name": "무역서류·계약", "short": "서류"},
    {"id": "trd-pay", "cat": "trade", "name": "결제·금융", "short": "결제"},
    {"id": "trd-cus", "cat": "trade", "name": "통관·관세", "short": "통관"},
    {"id": "trd-log", "cat": "trade", "name": "국제운송·물류", "short": "운송"},
    {"id": "agr-crop", "cat": "agri", "name": "재배·원예", "short": "재배"},
    {"id": "agr-live", "cat": "agri", "name": "축산·낙농", "short": "축산"},
    {"id": "agr-sea", "cat": "agri", "name": "수산·양식", "short": "수산"},
    {"id": "agr-food", "cat": "agri", "name": "식품가공·유통", "short": "가공"},
]

NORM_RE = re.compile(r"[\s·・\-_/()\[\].,]")


def norm(s):
    return NORM_RE.sub("", str(s or "").lower())


def slug(term, fallback):
    s = re.sub(r"[^a-z0-9]+", "", str(term).lower())
    return s if s else "x%d" % fallback


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=os.path.abspath(os.path.join(HERE, "..", "..", "..")))
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    path = os.path.abspath(os.path.join(a.repo, "translator", "data", "terms.json"))
    doc = json.load(open(path, encoding="utf-8"))
    groups = {g["id"]: g for g in doc["groups"]}
    terms = doc["terms"]
    have = {norm(t["term"]): t["term"] for t in terms}
    ids = {t["id"] for t in terms}

    rows, skipped, errors = [], [], []
    seen = {}
    for mod_name in MODULES:
        try:
            mod = importlib.import_module(mod_name)
        except ModuleNotFoundError:
            continue
        for row in mod.ROWS:
            grp, term, full, ko, easy, ctx, q1, q2 = row[:8]
            aka = row[8] if len(row) > 8 and row[8] else []
            src = row[9] if len(row) > 9 and row[9] else None
            if isinstance(src, list):
                # swap list written in the src slot for ban rows
                row = list(row[:9]) + [None] + list(row[9:])
                src = None
            if isinstance(aka, str):
                aka = [x for x in aka.split("|") if x]
            n = norm(term)
            if n in have:
                skipped.append((mod_name, term, "기존"))
                continue
            if n in seen:
                skipped.append((mod_name, term, "묶음 내 중복:%s" % seen[n]))
                continue
            if len(easy) > 90:
                errors.append("%s %s easy %d자" % (mod_name, term, len(easy)))
            if len(ctx) > 130:
                errors.append("%s %s ctx %d자" % (mod_name, term, len(ctx)))
            if not easy.strip() or not ctx.strip() or not q1.strip():
                errors.append("%s %s 빈 칸" % (mod_name, term))
            seen[n] = term
            extra = {}
            if len(row) > 10 and row[10]:
                extra["swap"] = row[10] if isinstance(row[10], list) else [row[10]]
            if len(row) > 11 and row[11]:
                extra["say"] = row[11]
            rows.append(dict(grp=grp, term=term, full=full, ko=ko, easy=easy, ctx=ctx,
                             qs=[q1, q2], aka=aka, src=src, mod=mod_name, **extra))
    if errors:
        print("\n".join(errors))
        print("상한/빈 칸 오류 %d건 — 먼저 고친다" % len(errors))
        return 1

    cat_ids = {c["id"] for c in doc["categories"]}
    for c in NEW_CATS:
        if c["id"] not in cat_ids:
            doc["categories"].append(c)
            cat_ids.add(c["id"])
    for g in NEW_GROUPS:
        if g["id"] not in groups:
            doc["groups"].append(g)
            groups[g["id"]] = g

    for i, r in enumerate(rows):
        grp = r["grp"]
        if grp not in groups:
            print("묶음 없음:", grp, r["term"])
            return 1
        cat = groups[grp]["cat"]
        base = "%s_%s" % (PREFIX.get(grp, "x"), slug(r["term"], i))
        tid, k = base, 2
        while tid in ids:
            tid = "%s%d" % (base, k)
            k += 1
        ids.add(tid)
        links = []
        for l in GROUP_LINKS.get(grp, [{"to": "taxonomy"}]):
            to = FIX_LINKS.get(l["to"], l["to"])
            links.append({"to": to})
        item = {"id": tid, "term": r["term"], "full": r["full"], "ko": r["ko"],
                "cat": cat, "grp": grp, "easy": r["easy"], "ctx": r["ctx"],
                "qs": r["qs"], "links": links, "src": r["src"], "aka": r["aka"]}
        if cat == "derog":
            item["ban"] = "forbid"
            item["swap"] = r.get("swap") or ["중립적인 처지·상태 표현"]
            item["say"] = r.get("say") or "그 말 대신 사실 그대로를 되받아 주세요."
        terms.append(item)

    for s in NEW_SOURCES:
        if not any(x["id"] == s["id"] for x in doc["sources"]):
            doc["sources"].append(s)

    doc["schema_version"] = "2.3.0"
    doc["updated_at"] = "2026-11-24"

    print("추가 %d · 건너뜀 %d(기존/중복) · 최종 %d" % (len(rows), len(skipped), len(terms)))
    from collections import Counter
    print(Counter(t["cat"] for t in terms))
    for s in skipped[:40]:
        print("  skip", s)
    if a.dry:
        return 0
    with open(path, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print("wrote", path, os.path.getsize(path), "bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
