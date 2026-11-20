#!/usr/bin/env python3
"""직업 현실 리얼 필터 — 지역·산업 클러스터 집계기

원자료(자료실 기업 명함첩, 모두 공식 공개 자료)
  · company/data/companies.json — 대기업(공정거래위원회 공시대상기업집단·기업집단포털) ·
    중견기업(중견기업정보마당·국민연금 가입 사업장) · 공공기관(알리오) 7,822곳
  · company/data/local-public.json — 지방공공기관(행정안전부) 1,315곳
  합계 9,137곳.

하는 일
  · 기업의 「주된 영위업종(KSIC 세세분류 이름)」을 산업 분야(24개)로 묶고,
  · 본사·소재지 주소에서 시군구를 뽑아 분야별 상위 지역과 기업 수를 센다.
  · 값은 전부 센 것이고, 주소가 공개되지 않은 기업은 그 분야의 지역 집계에서 빠진다(비율을 함께 남긴다).

원칙
  · 산업 분야 묶음은 자료실이 만든 편집 기준이다(공식 통계 분류가 아니다). 어떤 KSIC 이름이 어느 분야로
    갔는지 `fields[].ksic_names`에 그대로 남겨 검증할 수 있게 한다.
  · 지어낸 값 0건 — 주소가 없으면 지역을 만들지 않고, 기업 수는 실제로 센 값만 쓴다.

사용법
  python3 work-filter/data/build_clusters.py --company-dir company/data \
      --out work-filter/data/clusters.json \
      --work-context work-filter/data/work-context.json \
      --links-out work-filter/data/job-fields.json
"""
import argparse
import collections
import json
import os
import re
from datetime import date

SIDO_METRO = ("서울특별시", "부산광역시", "대구광역시", "인천광역시", "광주광역시",
              "대전광역시", "울산광역시", "세종특별자치시")

# 산업 분야 — 기업 업종(KSIC 세세분류 이름)을 묶는 낱말(ksic)과,
# 직무 이름에서 그 분야를 알아보는 낱말(jobs)을 따로 둔다. 위에서부터 먼저 맞는 규칙을 쓴다.
FIELDS = [
    {"id": "semiconductor", "name": "반도체",
     "ksic": ["반도체", "전자집적회로", "다이오드, 트랜지스터"],
     "jobs": ["반도체"]},
    {"id": "display-electronics", "name": "전자·디스플레이·전기장비",
     "ksic": ["표시장치", "전자부품", "통신장비", "무선 통신", "컴퓨터 제조", "주변기기", "가전",
              "음향기기", "영상기기", "텔레비전", "조명장치", "전구", "전지", "축전지", "절연선",
              "케이블", "전동기", "발전기", "배전반", "전기 공급", "전기장비", "전기용 기계",
              "전자코일", "마그네틱", "사무용 기계", "정밀기기", "측정, 시험", "물질 검사"],
     "jobs": ["전자", "디스플레이", "전기", "전자부품", "가전"]},
    {"id": "auto", "name": "자동차·부품",
     "ksic": ["자동차", "차체", "트레일러", "모터사이클"],
     "jobs": ["자동차", "차량"]},
    {"id": "shipbuilding", "name": "조선·해양플랜트",
     "ksic": ["선박", "수상 부유"],
     "jobs": ["선박", "조선"]},
    {"id": "machinery", "name": "기계·로봇·금형",
     "ksic": ["기계", "로봇", "베어링", "유압", "펌프", "압축기", "공작기계", "금형", "주형",
              "보일러", "열 교환기", "냉각", "공기조화", "냉장", "밸브", "동력전달", "공구",
              "물품 취급장비", "승강기", "농업 및 임업용 기계"],
     "jobs": ["기계", "로봇", "금형", "설비", "메카트로닉스", "자동화"]},
    {"id": "steel-metal", "name": "철강·금속",
     "ksic": ["철강", "제강", "제철", "주물", "주조", "단조", "압연", "비철금속", "철광", "알루미늄",
              "금속", "도금", "열처리", "볼트", "철물", "금속 가공", "판금", "철골", "철근"],
     "jobs": ["금속", "철강", "용접", "주조", "단조", "판금", "도금", "제련"]},
    {"id": "chemical", "name": "화학·소재",
     "ksic": ["화학", "석유화학", "석유 정제", "원유 정제", "합성고무", "플라스틱", "합성수지",
              "도료", "잉크", "접착제", "비료", "농약", "살균", "비누", "세정제", "화장품",
              "의약용 화합물", "기초 무기", "기초 유기", "계면활성제", "윤활유", "산업용 가스",
              "고무", "유리", "요업", "시멘트", "석회", "콘크리트", "레미콘", "아스팔트", "내화"],
     "jobs": ["화학", "소재", "고무", "플라스틱", "도료", "화장품", "정유", "석유"]},
    {"id": "bio-pharma", "name": "바이오·제약·의료기기",
     "ksic": ["의약품", "의약 물질", "한의약품", "의료용 기기", "의료 기기", "의료용품",
              "진단 및 요법", "의학 및 약학 연구", "바이오"],
     "jobs": ["의약", "제약", "바이오", "의료기기", "임상"]},
    {"id": "food", "name": "식품·음료·담배",
     "ksic": ["식료품", "식품", "음료", "주류", "맥주", "소주", "탁주", "주정", "증류주", "발효주",
              "떡", "빵", "과자", "면류", "김치", "두부", "커피", "차류", "낙농", "유지", "사료",
              "수산물", "육류", "가금류", "도축", "수산동물", "수산식물", "건어물", "조미료",
              "설탕", "전분", "건강 기능", "건강 보조", "담배"],
     "jobs": ["식품", "식품가공", "음료", "제과", "제빵", "영양", "주류", "도축"]},
    {"id": "textile", "name": "섬유·의류·가죽",
     "ksic": ["섬유", "직물", "방적", "편조", "의복", "겉옷", "셔츠", "가죽", "모피", "신발", "구두",
              "가방", "모자", "침구", "카펫", "천막", "염색"],
     "jobs": ["섬유", "의복", "의류", "패션", "봉제", "가죽", "신발", "직물"]},
    {"id": "energy", "name": "에너지·발전",
     "ksic": ["발전업", "전기 판매", "송전", "배전", "태양력", "연료용 가스", "증기", "냉ㆍ온수",
              "냉․온수", "핵반응기", "석탄 광업", "천연가스 채굴", "석유 정제물 재처리"],
     "jobs": ["발전", "에너지", "원자력", "전력", "가스"]},
    {"id": "construction", "name": "건설·토목·건축자재",
     "ksic": ["건설", "공사업", "토목", "배관", "미장", "도배", "조경", "지반", "보링", "수중 공사",
              "석재", "골재", "창호", "건축", "시설물 유지"],
     "jobs": ["건설", "토목", "건축", "시공", "측량", "조경", "배관"]},
    {"id": "realestate", "name": "부동산·개발·임대",
     "ksic": ["부동산", "건물 개발", "건물 임대", "주차장", "지주회사", "회사 본부", "콘테이너임대",
              "사업 및 무형 재산권 중개"],
     "jobs": ["부동산", "감정평가", "주택관리", "임대"]},
    {"id": "it-software", "name": "IT·소프트웨어·통신",
     "ksic": ["소프트웨어", "컴퓨터 프로그래밍", "컴퓨터 시스템 통합", "컴퓨터시스템 통합",
              "자료 처리", "자료처리", "호스팅", "데이터베이스", "포털", "정보 서비스",
              "정보기술", "정보 기술", "통신", "전기 통신", "텔레마케팅", "콜센터"],
     "jobs": ["소프트웨어", "프로그래머", "시스템", "네트워크", "데이터베이스", "정보통신",
              "정보기술", "웹", "앱", "통신"]},
    {"id": "game-content", "name": "게임·영상·출판·공연",
     "ksic": ["게임", "영화", "비디오물", "방송 프로그램", "방송업", "오디오물", "음반", "출판",
              "신문", "잡지", "뉴스", "녹음", "공연", "창작 및 예술", "작곡", "프로그램 공급",
              "상영"],
     "jobs": ["게임", "영상", "방송", "출판", "공연", "콘텐츠", "편집", "작가", "기자", "음향"]},
    {"id": "advertising", "name": "광고·조사·전시",
     "ksic": ["광고", "시장 조사", "여론 조사", "전시", "컨벤션", "행사 대행"],
     "jobs": ["광고", "홍보", "카피", "마케팅", "전시"]},
    {"id": "design", "name": "디자인",
     "ksic": ["디자인"],
     "jobs": ["디자인", "그래픽", "시각"]},
    {"id": "finance", "name": "금융·보험",
     "ksic": ["금융", "은행", "보험", "증권", "선물", "신탁", "집합투자", "여신", "신용조합",
              "저축", "공제", "복권"],
     "jobs": ["금융", "은행", "보험", "증권", "펀드", "투자", "대출", "계리"]},
    {"id": "logistics", "name": "물류·운송·창고",
     "ksic": ["운송", "창고", "택배", "화물", "보관", "통관", "파이프라인", "철도", "버스", "도시철도",
              "여객", "항공 여객", "수상 운송", "내항", "외항", "항공 및 육상"],
     "jobs": ["물류", "운송", "창고", "택배", "배송", "기관사", "조종", "화물", "운전"]},
    {"id": "retail", "name": "유통·도소매",
     "ksic": ["소매", "도매", "백화점", "슈퍼마켓", "면세점", "종합 소매", "전자상거래", "통신 판매",
              "상품 종합 도매", "상품 중개", "판매업", "중개업", "판매원", "자동 판매기"],
     "jobs": ["판매", "영업", "매장", "유통", "구매", "상품", "중개"]},
    {"id": "tourism", "name": "숙박·관광·스포츠",
     "ksic": ["숙박", "호텔", "여행", "관광", "유원지", "테마파크", "골프장", "스키장", "스포츠",
              "경기장", "오락", "당구장", "사행", "자연공원", "식물원", "동물원", "수상오락", "휴양"],
     "jobs": ["관광", "숙박", "호텔", "여행", "스포츠", "레저", "문화"]},
    {"id": "restaurant", "name": "음식점·외식",
     "ksic": ["음식점", "구내식당", "제과점", "치킨", "김밥", "간이 음식", "음료점"],
     "jobs": ["조리", "음식", "식당", "급식", "바리스타", "서비스 종사"]},
    {"id": "healthcare", "name": "의료·보건·복지",
     "ksic": ["병원", "의원", "보건", "요양", "복지", "수의", "의료"],
     "jobs": ["간호", "보건", "의료", "치료", "임상", "요양", "복지", "약사", "의사", "수의"]},
    {"id": "education", "name": "교육·학원·훈련",
     "ksic": ["교육", "학원", "교습", "훈련기관", "직원훈련", "교과학원", "예술학원"],
     "jobs": ["교육", "교사", "교수", "강사", "훈련", "상담"]},
    {"id": "research-engineering", "name": "연구·엔지니어링·시험분석",
     "ksic": ["연구개발", "엔지니어링", "기술 시험", "검사 및 분석", "측량", "연구"],
     "jobs": ["연구", "엔지니어", "시험", "분석", "기술자"]},
    {"id": "legal-consulting", "name": "법무·회계·컨설팅",
     "ksic": ["변호사", "공인회계", "세무", "컨설팅", "감정 평가", "번역", "문서 작성", "경영"],
     "jobs": ["법무", "변호", "회계", "세무", "컨설팅", "노무", "번역", "통역"]},
    {"id": "business-support", "name": "사업지원·시설관리·인력",
     "ksic": ["인력 공급", "고용 알선", "경비", "청소", "사업시설 유지", "시설 유지", "보안",
              "사무지원", "기타 사업지원"],
     "jobs": ["경비", "청소", "시설관리", "인사", "총무", "비서", "사무"]},
    {"id": "environment", "name": "환경·수도·폐기물",
     "ksic": ["폐기물", "하수", "폐수", "환경", "원료 재생", "재생용 재료", "산업용수", "상수도",
              "분뇨"],
     "jobs": ["환경", "수질", "대기", "폐기물", "수도", "상하수도"]},
    {"id": "agriculture", "name": "농림어업",
     "ksic": ["재배", "사육", "양계", "양돈", "어업", "양식", "임업", "영림", "농업", "축산", "묘목",
              "작물"],
     "jobs": ["농업", "임업", "어업", "축산", "원예", "수산", "재배", "사육"]},
]

LOCAL_PUBLIC_TYPES = {
    "상수도": ("environment", "환경·수도·폐기물"),
    "하수도": ("environment", "환경·수도·폐기물"),
    "도시철도": ("logistics", "물류·운송·창고"),
    "도시개발": ("realestate", "부동산·개발·임대"),
}

SIGUNGUN = re.compile(r"^(.*?[시군구])(\s|$)")


def parse_region(address, sido_hint=None):
    """주소 문자열 → (시도, 시군구). 없으면 (None, None)."""
    if not address:
        return (sido_hint, None) if sido_hint else (None, None)
    text = re.sub(r"\s+", " ", str(address)).strip()
    parts = text.split(" ")
    if not parts:
        return (sido_hint, None) if sido_hint else (None, None)
    sido = parts[0]
    if sido not in SIDO_METRO and not re.match(r"^(경기|강원|충청|충북|충남|전라|전북|전남|경상|경북|경남|제주|전남광주|세종)", sido):
        sido = sido_hint or sido
        rest = parts
    else:
        rest = parts[1:]
    sigungu = None
    for token in rest:
        if token.endswith(("시", "군", "구")):
            sigungu = token
            break
    return sido, sigungu


def clean_region(sido, sigungu):
    """광역시는 구 단위, 도는 시·군 단위로 맞춘다."""
    if not sido or not sigungu:
        return sido, sigungu
    if sido in SIDO_METRO and not sigungu.endswith("구") and sido != "세종특별자치시":
        # 도 지역처럼 시·군으로 끝나면 그대로 둔다
        return sido, sigungu
    return sido, sigungu


def classify(industry):
    if not industry:
        return None
    text = str(industry)
    for spec in FIELDS:
        fid, fname = spec["id"], spec["name"]
        for key in spec["ksic"]:
            if key in text:
                return fid, fname
    return None


def link_jobs(jobs, fields_by_id):
    """직무 이름에 산업 분야의 낱말이 들어 있으면 그 분야를 참고로 잇는다.

    공식 매핑이 아니다 — 이름이 겹치는 것만 잇고, 무엇이 겹쳤는지(basis)를 함께 남긴다.
    """
    links = {}
    for job in jobs:
        name = job.get("name") or ""
        hits = []
        for spec in FIELDS:
            fid = spec["id"]
            if fid not in fields_by_id:
                continue
            for key in spec["jobs"]:
                if len(key) >= 2 and key in name:
                    hits.append({"field": fid, "basis": key})
                    break
        if hits:
            # 낱말이 길수록 그 분야를 더 콕 집어 말한다 — 두 곳까지만 남긴다.
            hits.sort(key=lambda h: -len(h["basis"]))
            links[job["id"]] = hits[:2]
    return links


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--company-dir", required=True, help="저장소 company/data 폴더")
    ap.add_argument("--out", required=True)
    ap.add_argument("--work-context", help="work-context.json — 직무↔산업 분야 참고 연결을 함께 만들 때")
    ap.add_argument("--links-out", help="직무↔분야 연결 JSON 경로")
    args = ap.parse_args()

    with open(os.path.join(args.company_dir, "companies.json"), encoding="utf-8") as fh:
        companies_doc = json.load(fh)
    companies = companies_doc["companies"]

    local_path = os.path.join(args.company_dir, "local-public.json")
    local_public = []
    if os.path.exists(local_path):
        with open(local_path, encoding="utf-8") as fh:
            local_public = json.load(fh).get("institutions", [])

    fields = {spec["id"]: {"id": spec["id"], "name": spec["name"], "companies": [],
                            "ksic_names": collections.Counter()} for spec in FIELDS}
    fields["public-local"] = {"id": "public-local", "name": "지방공공기관",
                              "companies": [], "ksic_names": collections.Counter()}

    unclassified = collections.Counter()
    total_with_industry = 0
    with_address = 0

    for company in companies:
        industry = company.get("industry")
        if industry:
            total_with_industry += 1
        target = classify(industry)
        address = company.get("headquarters")
        if address:
            with_address += 1
        sido, sigungu = parse_region(address, company.get("location_sido"))
        sido, sigungu = clean_region(sido, sigungu)
        record = {
            "name": company.get("name"),
            "industry": industry,
            "category": company.get("category"),
            "sido": sido,
            "sigungu": sigungu,
            "employees": company.get("employees") if isinstance(company.get("employees"), int) else None,
        }
        if not target:
            if industry:
                unclassified[industry] += 1
            continue
        fid, fname = target
        fields[fid]["companies"].append(record)
        fields[fid]["ksic_names"][industry] += 1

    for inst in local_public:
        sido, sigungu = parse_region(None, inst.get("location_sido"))
        founder = inst.get("founder")
        if founder:
            f_sido, f_sigungu = parse_region(founder)
            sido = sido or f_sido
            sigungu = sigungu or f_sigungu
        tipo = inst.get("type_detail")
        fid, fname = LOCAL_PUBLIC_TYPES.get(tipo, ("public-local", "지방공공기관"))
        if fid not in fields:
            fid, fname = "public-local", "지방공공기관"
        record = {
            "name": inst.get("name"),
            "industry": tipo,
            "category": "지방공공기관",
            "sido": sido,
            "sigungu": sigungu,
            "employees": None,
        }
        fields[fid]["companies"].append(record)

    out_fields = []
    for spec in FIELDS:
        fid = spec["id"]
        fname = spec["name"]
        item = fields[fid]
        rows = item["companies"]
        regions = collections.Counter()
        for r in rows:
            if r["sigungu"]:
                label = f'{r["sido"]} {r["sigungu"]}'.strip()
                regions[label] += 1
        top = [{"region": label, "companies": n} for label, n in regions.most_common(8)]
        by_emp = sorted([r for r in rows if r["employees"]], key=lambda r: -r["employees"])[:4]
        out_fields.append({
            "id": fid,
            "name": fname,
            "total": len(rows),
            "with_address": sum(1 for r in rows if r["sigungu"]),
            "regions": top,
            "region_count": len(regions),
            "examples": [{"name": r["name"], "industry": r["industry"],
                          "region": f'{r["sido"]} {r["sigungu"]}'.strip() if r["sigungu"] else None,
                          "employees": r["employees"]} for r in by_emp],
            "ksic_names": [{"name": k, "companies": v} for k, v in item["ksic_names"].most_common(6)],
        })

    public_rows = fields["public-local"]["companies"]
    regions = collections.Counter()
    for r in public_rows:
        if r["sigungu"]:
            regions[f'{r["sido"]} {r["sigungu"]}'.strip()] += 1
    out_fields.append({
        "id": "public-local",
        "name": "지방공공기관",
        "total": len(public_rows),
        "with_address": sum(1 for r in public_rows if r["sigungu"]),
        "regions": [{"region": k, "companies": v} for k, v in regions.most_common(8)],
        "region_count": len(regions),
        "examples": [],
        "ksic_names": [],
    })

    # 지역 → 분야 되짚기(「이 지역에서 무슨 일을 하나」)
    region_map = collections.defaultdict(collections.Counter)
    region_sido = {}
    field_name = {f["id"]: f["name"] for f in out_fields}
    for f in out_fields:
        for row in fields[f["id"]]["companies"]:
            if not row["sigungu"]:
                continue
            label = f'{row["sido"]} {row["sigungu"]}'.strip()
            region_map[label][f["id"]] += 1
            region_sido[label] = row["sido"]
    regions_out = []
    for label, counter in sorted(region_map.items(), key=lambda kv: -sum(kv[1].values())):
        total = sum(counter.values())
        if total < 5:
            continue
        regions_out.append({
            "region": label,
            "sido": region_sido.get(label),
            "total": total,
            "fields": [{"id": fid, "name": field_name.get(fid, fid), "companies": n}
                       for fid, n in counter.most_common(6)],
        })

    payload = {
        "schema_version": "1.0.0",
        "dataset": "직업 현실 리얼 필터 — 지역·산업 클러스터(자료실 기업 명함첩 집계)",
        "generated_at": date.today().isoformat(),
        "notice": (
            "자료실 기업 명함첩(대기업·중견기업·공공기관·지방공공기관)의 본사·소재지 실제 주소를 시군구로 "
            "묶어 센 값입니다. 산업 분야 묶음은 자료실이 만든 편집 기준이며 공식 산업통계가 아닙니다. "
            "주소가 공개되지 않은 기업은 지역 집계에서 빠져 있습니다."
        ),
        "sources": [
            {"id": "company", "name": "자료실 기업 명함첩 — 대기업·중견기업·공공기관 7,822곳",
             "publisher": "공정거래위원회 기업집단포털 · 중견기업정보마당 · 알리오 · 국민연금 가입 사업장",
             "url": "https://github.com/ccttsi/jobcounsel/tree/main/company/data",
             "license": {"type": "PUBLIC-DATA", "name": "공공기관 공개 자료(단순 사실정보)", "verified": True},
             "base_date": "2026-11-16 구축 / 재무·인력 2025-12-31 결산"},
            {"id": "local-public", "name": "지방공공기관 1,315곳",
             "publisher": "행정안전부", "url": "https://github.com/ccttsi/jobcounsel/tree/main/company/data",
             "license": {"type": "PUBLIC-DATA", "name": "행정안전부 공개 자료", "verified": True},
             "base_date": "2026-06-30 기준"},
        ],
        "method": {
            "region": "주소의 첫 시·도 + 첫 시·군·구. 광역시는 구 단위(예: 서울특별시 강남구), 도는 시·군 단위(예: 경기도 평택시).",
            "field": "기업의 KSIC 세세분류 업종 이름을 24개 산업 분야 키워드에 맞춰 묶음(위에서부터 먼저 맞는 규칙).",
            "caution": "기업 명함첩은 「대기업·중견기업·공공기관·지방공공기관」만 담아 중소기업 사업체 분포와 다르다.",
        },
        "totals": {
            "companies": len(companies) + len(local_public),
            "companies_with_industry": total_with_industry,
            "companies_with_address": with_address,
            "unclassified_industry_names": len(unclassified),
            "unclassified_companies": sum(unclassified.values()),
        },
        "fields": out_fields,
        "regions": regions_out,
        "field_keywords": [{"id": spec["id"], "name": spec["name"], "words": spec["ksic"], "job_words": spec["jobs"]} for spec in FIELDS],
        "unclassified_top": [{"name": k, "companies": v} for k, v in unclassified.most_common(20)],
    }

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))

    print(f"· 기업 {len(companies) + len(local_public)}곳 · 업종 있음 {total_with_industry} · 주소 있음 {with_address}")
    for f in out_fields:
        top = f["regions"][0]["region"] if f["regions"] else "—"
        print(f"  {f['name']:<22} {f['total']:>5}곳 (주소 {f['with_address']:>4}) 1위 {top}")
    print(f"· 분류 못 한 업종 {len(unclassified)}종 {sum(unclassified.values())}곳")
    print(f"· 지역(5곳 이상) {len(regions_out)}곳")
    print(f"· 저장: {args.out}")

    if args.work_context and args.links_out:
        with open(args.work_context, encoding="utf-8") as fh:
            jobs_doc = json.load(fh)
        fields_by_id = {f["id"]: f for f in out_fields if f["total"] > 0}
        links = link_jobs(jobs_doc["jobs"], fields_by_id)
        link_payload = {
            "schema_version": "1.0.0",
            "generated_at": date.today().isoformat(),
            "notice": (
                "직무 이름에 산업 분야의 낱말이 들어 있을 때만 이은 참고 연결입니다(공식 직무↔산업 매핑이 "
                "아닙니다). 무엇이 겹쳤는지 basis에 적었습니다."
            ),
            "links": links,
            "coverage": {"jobs": len(jobs_doc["jobs"]), "jobs_with_field": len(links)},
        }
        with open(args.links_out, "w", encoding="utf-8") as fh:
            json.dump(link_payload, fh, ensure_ascii=False, separators=(",", ":"))
        print(f"· 직무↔분야 참고 연결 {len(links)}개 / 직무 {len(jobs_doc['jobs'])}개 → {args.links_out}")


if __name__ == "__main__":
    main()
