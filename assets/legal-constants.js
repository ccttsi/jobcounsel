/* 자동 생성 — 손으로 고치지 않는다.
   원천: data/legal-constants.json (공용 법정 수치 단일 원천)
   다시 만들기: python3 ops/scripts/build_legal_constants.py
   원천과 같은지 보기: python3 ops/scripts/build_legal_constants.py --check
   여기에는 값만 실린다. 출처·적용기간·확인일은 원천 JSON에 있다. */
window.JC_LEGAL = {
  "schemaVersion": "1.0.0",
  "updatedAt": "2026-11-22",
  "title": "공용 법정 수치 — 자료실 단일 원천",
  "notice": "값은 고시·법령 원문과 4대사회보험 정보연계센터 안내에 적힌 그대로 옮겼다. 제도 해석과 최종 판단은 고용센터·노동위원회 등 기관의 몫이다.",
  "baseYear": {
    "year": 2026,
    "meta": {
      "label": "자료실 기준년도",
      "law": "—",
      "note": "최저임금·구직급여 상한·4대보험 요율이 모두 이 해 기준이다. 해가 바뀌면 이 값과 아래 group들의 applies를 함께 옮긴다.",
      "appliesFrom": "2026-01-01",
      "appliesTo": "2026-12-31"
    }
  },
  "minimumWage": {
    "hourly": 10320,
    "daily8h": 82560,
    "monthly": 2156880,
    "monthlyHours": 209,
    "probationHourly": 9288,
    "meta": {
      "label": "2026년 최저임금",
      "law": "최저임금법 제5조·제10조, 최저임금법 시행령 제3조(수습 10% 감액)",
      "notice": "고용노동부고시 제2025-47호",
      "title": "2026년 적용 최저임금 고시",
      "period": "2026. 1. 1. ~ 2026. 12. 31.",
      "sourceName": "고용노동부",
      "appliesFrom": "2026-01-01",
      "appliesTo": "2026-12-31",
      "sourceId": "moel-minimum-wage-2026",
      "sourceUrl": "https://www.law.go.kr/%ED%96%89%EC%A0%95%EA%B7%9C%EC%B9%99/2026%EB%85%84%EC%A0%81%EC%9A%A9%EC%B5%9C%EC%A0%80%EC%9E%84%EA%B8%88%EA%B3%A0%EC%8B%9C",
      "checkedAt": "2026-11-21"
    }
  },
  "jobSeeking": {
    "baseDailyCap": 113500,
    "dailyCap": 68100,
    "rate": 0.6,
    "floorRate": 0.8,
    "floorDaily8h": 66048,
    "meta": {
      "label": "구직급여(실업급여) 일액 상한·하한",
      "law": "고용보험법 제45조·제46조, 고용보험법 시행령 제68조",
      "notice": "고용보험법 시행령 제68조",
      "title": "구직급여 기초일액 상한(2026년 상한액)",
      "period": "2026. 1. 1. 이후 이직자",
      "sourceName": "고용노동부",
      "note": "상한액은 해마다 1월 1일 기준으로 바뀐다. 2025.12.31. 이전 이직자는 상한 66,000원·기초일액 110,000원이라 이 값과 다르다.",
      "appliesFrom": "2026-01-01",
      "appliesTo": "2026-12-31",
      "sourceId": "moel-ei-decree-68",
      "sourceUrl": "https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EA%B3%A0%EC%9A%A9%EB%B3%B4%ED%97%98%EB%B2%95%EC%8B%9C%ED%96%89%EB%A0%B9",
      "checkedAt": "2026-11-21"
    }
  },
  "socialInsurance": {
    "pensionRateWorker": 0.0475,
    "pensionBaseMin": 410000,
    "pensionBaseMax": 6590000,
    "healthRateTotal": 0.0719,
    "healthRateWorker": 0.03595,
    "healthPremiumMin": 20160,
    "healthPremiumMax": 9183480,
    "ltcRateOnHealth": 0.1314,
    "employmentRateWorker": 0.009,
    "meta": {
      "label": "4대보험 요율(2026년)",
      "law": "국민연금법, 국민건강보험법 시행령, 노인장기요양보험법 시행령, 고용보험법 시행령(요율 조문 번호는 고시 원문에서 확인하지 못해 법령 이름까지만 적었다)",
      "notice": "4대사회보험 정보연계센터 2026년 보험료율",
      "period": "2026. 1. 1. ~ 2026. 12. 31.",
      "sourceName": "4대사회보험 정보연계센터",
      "note": "산재보험은 사업주 전액 부담이라 근로자 공제에 넣지 않는다. 국민연금 기준소득월액 상·하한만 적용기간이 7월~다음 해 6월이다.",
      "appliesFrom": "2026-01-01",
      "appliesTo": "2026-12-31",
      "sourceId": "4insure-2026",
      "sourceUrl": "https://www.4insure.or.kr/",
      "checkedAt": "2026-11-21"
    }
  }
};
