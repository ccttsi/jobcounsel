/* 자동 생성 — 손으로 고치지 않는다.
   원천: data/legal-constants.json (값·적용기간) + assets/tools.js (자료실 섹터 주소)
   다시 만들기: python3 ops/scripts/build_answer_check.py
   원천과 같은지: python3 ops/scripts/build_answer_check.py --check
   AUP-5 답 검사기(assistant/answer-check.js)가 이 규칙만 읽는다. 값은 원천에 있는 그대로다. */
globalThis.JCAssistCheckData = {
 "v": "witw-assist-check-data/1.0.0",
 "updatedAt": "2026-11-22",
 "baseYear": 2026,
 "sectors": [
  "theory",
  "casecon",
  "parsons",
  "dacum",
  "taxonomy",
  "careernet",
  "decalcomania",
  "library",
  "briefing",
  "emerging",
  "labor",
  "reality",
  "work-filter",
  "manual",
  "kdt-calc",
  "law",
  "intake",
  "triage",
  "talk",
  "translator",
  "vpi",
  "policy-match",
  "hud",
  "pay-calc",
  "posting",
  "first-year",
  "cert",
  "univ",
  "grad",
  "company",
  "fin-lab",
  "portals",
  "thermometer",
  "valuechain",
  "surgery",
  "layer-merge",
  "trait-flip",
  "interview",
  "portfolio",
  "transit",
  "flow"
 ],
 "rules": [
  {
   "key": "minimumWage.hourly",
   "group": "minimumWage",
   "name": "시급",
   "value": 10320,
   "kind": "won",
   "forms": [
    "10,320원"
   ],
   "display": "10,320원",
   "fix": true,
   "pre": "최저임금(?:은|는|이|가|의)?\\s*(?:2026년\\s*)?(?:시급|시간급|시간당)?\\s*(?:은|는|이|가|은요|는요|:)?\\s*",
   "guard": "(?:수습|감액|견습|월\\s*(?:급|환산|기준)|일급|8\\s*시간|연봉|주휴|20(?:0\\d|1\\d|2[0-5])\\s*년|19\\d\\d\\s*년|작년|지난해|전년|과거)",
   "lo": 5000,
   "hi": 20000
  },
  {
   "key": "minimumWage.daily8h",
   "group": "minimumWage",
   "name": "일급(8시간)",
   "value": 82560,
   "kind": "won",
   "forms": [
    "82,560원"
   ],
   "display": "82,560원",
   "fix": false,
   "pre": "최저임금[^0-9.?!\n]{0,16}(?:일급|1일(?:\\s*8\\s*시간)?)[^0-9.?!\n]{0,8}(?:은|는|이|가|분)?\\s*",
   "need": "일급",
   "guard": "(?:하한|상한|구직급여|실업급여|소정급여|20(?:0\\d|1\\d|2[0-5])\\s*년|19\\d\\d\\s*년|작년|지난해|전년|과거)",
   "lo": 30000,
   "hi": 200000
  },
  {
   "key": "minimumWage.monthly",
   "group": "minimumWage",
   "name": "월 환산",
   "value": 2156880,
   "kind": "won",
   "forms": [
    "2,156,880원"
   ],
   "display": "2,156,880원",
   "fix": true,
   "pre": "최저임금[^0-9.?!\n]{0,20}(?:월\\s*(?:급|환산|기준)?|한\\s*달)[^0-9.?!\n]{0,8}(?:은|는|이|가|액)?\\s*",
   "guard": "(?:수습|감액|내담자|급여|알바|받|예시|연봉|소득|20(?:0\\d|1\\d|2[0-5])\\s*년|19\\d\\d\\s*년|작년|지난해|전년|과거)",
   "lo": 500000,
   "hi": 5000000
  },
  {
   "key": "minimumWage.monthlyHours",
   "group": "minimumWage",
   "name": "월 기준시간",
   "value": 209,
   "kind": "hours",
   "forms": [
    "209시간"
   ],
   "display": "209시간",
   "fix": false,
   "pre": "(?:월\\s*(?:기준\\s*)?시간|월\\s*환산\\s*기준)[^0-9.?!\n]{0,8}(?:은|는|이|가)?\\s*",
   "need": "최저임금|주\\s*40\\s*시간|주휴",
   "guard": "(?:20(?:0\\d|1\\d|2[0-5])\\s*년|19\\d\\d\\s*년|작년|지난해|전년|과거)"
  },
  {
   "key": "minimumWage.probationHourly",
   "group": "minimumWage",
   "name": "수습 시급",
   "value": 9288,
   "kind": "won",
   "forms": [
    "9,288원"
   ],
   "display": "9,288원",
   "fix": true,
   "pre": "수습[^0-9.?!\n]{0,16}(?:기간)?[^0-9.?!\n]{0,10}(?:시급|시간급|시간당)?[^0-9.?!\n]{0,6}(?:은|는|이|가)?\\s*",
   "need": "수습",
   "guard": "(?:20(?:0\\d|1\\d|2[0-5])\\s*년|19\\d\\d\\s*년|작년|지난해|전년|과거)",
   "lo": 3000,
   "hi": 20000
  },
  {
   "key": "jobSeeking.baseDailyCap",
   "group": "jobSeeking",
   "name": "기초일액 상한",
   "value": 113500,
   "kind": "won",
   "forms": [
    "113,500원"
   ],
   "display": "113,500원",
   "fix": true,
   "pre": "(?:급여)?기초(?:임금)?일액[^0-9.?!\n]{0,8}(?:상한액?|최고액?|최대)?[^0-9.?!\n]{0,6}(?:은|는|이|가)?\\s*",
   "guard": "(?:20(?:0\\d|1\\d|2[0-5])\\s*년|19\\d\\d\\s*년|작년|지난해|전년|과거)",
   "lo": 30000,
   "hi": 300000
  },
  {
   "key": "jobSeeking.dailyCap",
   "group": "jobSeeking",
   "name": "일액 상한",
   "value": 68100,
   "kind": "won",
   "forms": [
    "68,100원"
   ],
   "display": "68,100원",
   "fix": true,
   "pre": "(?:구직급여|실업급여)\\s*(?:일액|일\\s*지급액)?[^0-9.?!\n]{0,10}(?:의\\s*)?(?:상한액|상한|최고액?|최대)[^0-9.?!\n]{0,6}(?:은|는|이|가)?\\s*",
   "guard": "(?:20(?:0\\d|1\\d|2[0-5])\\s*년|19\\d\\d\\s*년|작년|지난해|전년|과거)",
   "lo": 20000,
   "hi": 300000
  },
  {
   "key": "jobSeeking.rate",
   "group": "jobSeeking",
   "name": "기초일액의",
   "value": 0.6,
   "kind": "pct",
   "forms": [
    "60%"
   ],
   "display": "60%",
   "fix": false,
   "pre": "(?:기초일액|평균임금)[^0-9.?!\n]{0,6}(?:의\\s*)?",
   "need": "구직급여|실업급여",
   "guard": "(?:20(?:0\\d|1\\d|2[0-5])\\s*년|19\\d\\d\\s*년|작년|지난해|전년|과거)"
  },
  {
   "key": "jobSeeking.floorRate",
   "group": "jobSeeking",
   "name": "최저임금의",
   "value": 0.8,
   "kind": "pct",
   "forms": [
    "80%"
   ],
   "display": "80%",
   "fix": false,
   "pre": "최저임금의\\s*",
   "need": "구직급여|실업급여|하한",
   "guard": "(?:20(?:0\\d|1\\d|2[0-5])\\s*년|19\\d\\d\\s*년|작년|지난해|전년|과거)"
  },
  {
   "key": "jobSeeking.floorDaily8h",
   "group": "jobSeeking",
   "name": "일액 하한",
   "value": 66048,
   "kind": "won",
   "forms": [
    "66,048원"
   ],
   "display": "66,048원",
   "fix": true,
   "pre": "(?:(?:구직급여|실업급여)\\s*(?:일액)?[^0-9.?!\n]{0,10}(?:의\\s*)?)?(?:하한액|최저\\s*구직급여일액)[^0-9.?!\n]{0,6}(?:은|는|이|가)?\\s*",
   "need": "구직급여|실업급여|최저\\s*구직급여일액",
   "guard": "(?:20(?:0\\d|1\\d|2[0-5])\\s*년|19\\d\\d\\s*년|작년|지난해|전년|과거)",
   "lo": 20000,
   "hi": 300000
  },
  {
   "key": "socialInsurance.pensionRateWorker",
   "group": "socialInsurance",
   "name": "국민연금",
   "value": 0.0475,
   "kind": "pct",
   "forms": [
    "4.75%"
   ],
   "display": "4.75%",
   "fix": false,
   "pre": "국민연금[^0-9.?!\n]{0,18}(?:근로자\\s*)?(?:부담)?\\s*(?:요율|보험료율|부담률)?[^0-9.?!\n]{0,8}(?:은|는|이|가)?\\s*",
   "guard": "(?:20(?:0\\d|1\\d|2[0-5])\\s*년|19\\d\\d\\s*년|작년|지난해|전년|과거)"
  },
  {
   "key": "socialInsurance.pensionBaseMin",
   "group": "socialInsurance",
   "name": "기준소득월액 하한",
   "value": 410000,
   "kind": "won",
   "forms": [
    "410,000원"
   ],
   "display": "410,000원",
   "fix": false,
   "pre": "기준소득월액[^0-9.?!\n]{0,10}(?:의\\s*)?(?:하한액?|최저)[^0-9.?!\n]{0,6}(?:은|는|이|가)?\\s*",
   "need": "국민연금|기준소득월액",
   "guard": "(?:20(?:0\\d|1\\d|2[0-5])\\s*년|19\\d\\d\\s*년|작년|지난해|전년|과거)",
   "lo": 100000,
   "hi": 1000000
  },
  {
   "key": "socialInsurance.pensionBaseMax",
   "group": "socialInsurance",
   "name": "기준소득월액 상한",
   "value": 6590000,
   "kind": "won",
   "forms": [
    "6,590,000원"
   ],
   "display": "6,590,000원",
   "fix": false,
   "pre": "기준소득월액[^0-9.?!\n]{0,10}(?:의\\s*)?(?:상한액?|최고)[^0-9.?!\n]{0,6}(?:은|는|이|가)?\\s*",
   "need": "국민연금|기준소득월액",
   "guard": "(?:20(?:0\\d|1\\d|2[0-5])\\s*년|19\\d\\d\\s*년|작년|지난해|전년|과거)",
   "lo": 1000000,
   "hi": 20000000
  },
  {
   "key": "socialInsurance.healthRateTotal",
   "group": "socialInsurance",
   "name": "건강보험 노사 합산",
   "value": 0.0719,
   "kind": "pct",
   "forms": [
    "7.19%"
   ],
   "display": "7.19%",
   "fix": false,
   "pre": "건강보험(?:료)?[^0-9.?!\n]{0,18}(?:노사\\s*합산|합산)?[^0-9.?!\n]{0,8}(?:요율|보험료율|부담률|은|는|이|가)?\\s*",
   "guard": "(?:20(?:0\\d|1\\d|2[0-5])\\s*년|19\\d\\d\\s*년|작년|지난해|전년|과거)"
  },
  {
   "key": "socialInsurance.healthRateWorker",
   "group": "socialInsurance",
   "name": "건강보험 근로자",
   "value": 0.03595,
   "kind": "pct",
   "forms": [
    "3.595%"
   ],
   "display": "3.595%",
   "fix": false,
   "pre": "건강보험(?:료)?[^0-9.?!\n]{0,18}(?:근로자|본인|절반)[^0-9.?!\n]{0,8}(?:부담)?[^0-9.?!\n]{0,8}(?:요율|보험료율|부담률|은|는|이|가)?\\s*",
   "guard": "(?:20(?:0\\d|1\\d|2[0-5])\\s*년|19\\d\\d\\s*년|작년|지난해|전년|과거)"
  },
  {
   "key": "socialInsurance.healthPremiumMin",
   "group": "socialInsurance",
   "name": "건강보험료 월 하한",
   "value": 20160,
   "kind": "won",
   "forms": [
    "20,160원"
   ],
   "display": "20,160원",
   "fix": false,
   "pre": "(?:월\\s*)?보험료[^0-9.?!\n]{0,8}(?:의\\s*)?(?:하한액?|최저)[^0-9.?!\n]{0,6}(?:은|는|이|가)?\\s*",
   "need": "건강보험",
   "guard": "(?:20(?:0\\d|1\\d|2[0-5])\\s*년|19\\d\\d\\s*년|작년|지난해|전년|과거)",
   "lo": 5000,
   "hi": 100000
  },
  {
   "key": "socialInsurance.healthPremiumMax",
   "group": "socialInsurance",
   "name": "건강보험료 월 상한",
   "value": 9183480,
   "kind": "won",
   "forms": [
    "9,183,480원"
   ],
   "display": "9,183,480원",
   "fix": false,
   "pre": "(?:월\\s*)?보험료[^0-9.?!\n]{0,8}(?:의\\s*)?(?:상한액?|최고)[^0-9.?!\n]{0,6}(?:은|는|이|가)?\\s*",
   "need": "건강보험",
   "guard": "(?:20(?:0\\d|1\\d|2[0-5])\\s*년|19\\d\\d\\s*년|작년|지난해|전년|과거)",
   "lo": 1000000,
   "hi": 30000000
  },
  {
   "key": "socialInsurance.ltcRateOnHealth",
   "group": "socialInsurance",
   "name": "장기요양(건강보험료의)",
   "value": 0.1314,
   "kind": "pct",
   "forms": [
    "13.14%"
   ],
   "display": "13.14%",
   "fix": false,
   "pre": "(?:건강보험료|건강보험)[^0-9.?!\n]{0,8}(?:의\\s*)?",
   "need": "장기요양",
   "guard": "(?:20(?:0\\d|1\\d|2[0-5])\\s*년|19\\d\\d\\s*년|작년|지난해|전년|과거)"
  },
  {
   "key": "socialInsurance.employmentRateWorker",
   "group": "socialInsurance",
   "name": "고용보험",
   "value": 0.009,
   "kind": "pct",
   "forms": [
    "0.9%"
   ],
   "display": "0.9%",
   "fix": false,
   "pre": "고용보험[^0-9.?!\n]{0,24}(?:실업급여분)?[^0-9.?!\n]{0,10}(?:근로자|본인)?[^0-9.?!\n]{0,8}(?:부담)?[^0-9.?!\n]{0,6}(?:요율|보험료율|부담률|은|는|이|가)?\\s*",
   "guard": "(?:20(?:0\\d|1\\d|2[0-5])\\s*년|19\\d\\d\\s*년|작년|지난해|전년|과거)"
  }
 ],
 "groups": {
  "minimumWage": "최저임금: 시급 10,320원 · 일급(8시간) 82,560원 · 월 환산 2,156,880원 · 월 기준시간 209시간 · 수습 시급 9,288원",
  "jobSeeking": "구직급여: 일액 상한 68,100원 · 기초일액 상한 113,500원 · 일액 하한 66,048원 · 기초일액의 60% · 최저임금의 80%",
  "socialInsurance": "4대보험 근로자 부담: 국민연금 4.75% · 건강보험 근로자 3.595% · 건강보험 노사 합산 7.19% · 장기요양(건강보험료의) 13.14% · 고용보험 0.9% · 기준소득월액 하한 410,000원 · 기준소득월액 상한 6,590,000원 · 건강보험료 월 하한 20,160원 · 건강보험료 월 상한 9,183,480원"
 }
};
