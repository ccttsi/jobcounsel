/*
 * 기업 명함첩 · 화면 엔진
 *
 * 데이터(고치지 않고 읽기만 한다)
 *   data/companies.json    company-wiki v1.3.0 · 7,822곳(대기업 3,521 · 중견기업 3,946 · 중앙 공공기관 355)
 *   data/public-2026.json  공공기관 2026년 지정(342)과 알리오 부설기관(13) 대조 — 유형 칩·부설 표시의 근거
 *   data/local-public.json company-local-public v1.0.0 · 1,315곳(지방직영기업 256 · 지방공사·공단 167 · 출자기관 103 · 출연기관 789)
 *   data/enrich.json       보강 레이어(2026-11-19) — 실제 법인명으로 대조한 별칭(검색용)과 회사 요약·주요 제품/서비스·주요 고객층(표시용).
 *     원자료는 고치지 않는다. 별칭은 .aliases, 설명은 .profiles 이고, 없는 법인은 만들지 않았다.
 *     행정안전부 「지방공기업(2026.6.30. 기준) 현황」·「지방자치단체 출자출연기관 현황(2026.6.30. 기준)」의
 *     명칭·구분·지역·설립 지자체·유형만 옮겼다. 매출·정원·홈페이지는 원자료에 없어 필드 자체를 생략했다.
 *     중견기업은 국민연금 가입 사업장 내역(2026-09)을 사업자번호 앞 6자리 + 법인명으로 대조해
 *     업종·가입자수·사업장 소재지를 붙였다(3,946곳 중 3,725곳). 여기에 공식 홈페이지·주요 사업·
 *     상장 정보(종목코드·상장일·증권업종)를 한국어 위키백과·위키데이터·상장 종목 공개 정보로 보강했다.
 *     코드·값은 원자료 그대로다.
 *
 * 주소
 *   #list?c=ENT&g=삼성&k=C&ct=일반회사&ls=1&t=…&mi=…&sd=…&ve=…&rv=1&em=2&in=…&o=emp&q=하이닉스&p=2   찾기(조건은 고를 때만)
 *   지방공공기관은 t(세부 유형)·tt(업무 유형)·sd(시·도)·rg(수도권/비수도권)·sc(광역/기초)·fd(설립 지자체)로 더 좁힌다.
 *   #ENT-1301110006246 · #MID-1058639463 · #PUB-C0247 · #LPI-G0001   한 곳            #about   출처와 한계
 *
 * 규칙
 *   - 레코드에 없는 항목(키 생략)은 줄을 만들지 않는다. 매출·직원수·자산이 0이면 "원자료에 값이 없거나 0"이라 싣지 않는다.
 *     상세 맨 아래에 미표기 안내 한 문장과, 있으면 공식 홈페이지(official_url)를 둔다.
 *   - 7,822건을 한 번에 그리지 않는다: 찾기 열쇠를 불러올 때 한 번 만들고, 목록은 20개씩 쪽 나누기.
 *   - 외부 API·저장 없음. 조건은 주소(hash)에만 남는다(고를 때는 replaceState, 상세로 갈 때만 기록을 남긴다).
 */
(function () {
  'use strict';
  var d = document, main = d.getElementById('main');
  var CATS = [
    { k: 'ENT', key: '대기업', name: '대기업', unit: '곳', src: 'FTC',
      def: '공정거래위원회가 2026-05-01 지정한 공시대상기업집단 102곳의 소속회사입니다. 매출·종업원수·자산총액은 2025년 결산 값입니다.' },
    { k: 'MID', key: '중견기업', name: '중견기업', unit: '곳', src: 'MME · NPS',
      def: '중견기업정보마당에 공개된 확인서 발급기업 가운데 2026-11-16 기준 유효한 곳입니다. 이름·사업자등록번호·확인서만 공개되므로, 업종·국민연금 가입자수·사업장 소재지는 국민연금 가입 사업장 내역(2026-09)을 사업자번호 앞 6자리와 법인명으로 대조해 붙였습니다(3,946곳 중 3,725곳). 공식 홈페이지·주요 사업·상장 정보는 위키백과·위키데이터와 상장 종목 공개 정보로 보강했습니다.' },
    { k: 'PUB', key: '공공기관', name: '중앙', full: '중앙 공공기관', post: '공공기관', unit: '곳', src: 'ALIO',
      def: '알리오에 공시되는 지정 공공기관 342곳과 부설기관 13곳입니다. 직원수는 정원, 매출은 2025년 결산입니다.' },
    { k: 'LPI', key: '지방공공기관', name: '지방', full: '지방 공공기관', post: '공공기관', unit: '곳', src: '행안부',
      def: '행정안전부 2026-06-30 기준 1,315곳입니다. 원자료에 매출·정원이 없어 숫자로 줄 세우지 않습니다.' }
  ];
  var CK = {}, CN = {}; CATS.forEach(function (c, i) { c.i = i; CK[c.k] = c; CN[c.key] = c; });
  /* 한국표준산업분류(KSIC) 대분류 */
  var KSIC = {
    A: ['농림어업', '농업, 임업 및 어업'], B: ['광업', '광업'], C: ['제조', '제조업'], D: ['전기·가스', '전기, 가스, 증기 및 공기 조절 공급업'],
    E: ['수도·환경', '수도, 하수 및 폐기물 처리, 원료 재생업'], F: ['건설', '건설업'], G: ['도소매', '도매 및 소매업'], H: ['운수·창고', '운수 및 창고업'],
    I: ['숙박·음식', '숙박 및 음식점업'], J: ['정보통신', '정보통신업'], K: ['금융·보험', '금융 및 보험업'], L: ['부동산', '부동산업'],
    M: ['전문·과학기술', '전문, 과학 및 기술 서비스업'], N: ['사업지원·임대', '사업시설 관리, 사업 지원 및 임대 서비스업'], O: ['공공행정', '공공 행정, 국방 및 사회보장 행정'],
    P: ['교육', '교육 서비스업'], Q: ['보건·복지', '보건업 및 사회복지 서비스업'], R: ['예술·여가', '예술, 스포츠 및 여가관련 서비스업'],
    S: ['협회·수리·개인', '협회 및 단체, 수리 및 기타 개인 서비스업'], T: ['가구 내 고용', '가구 내 고용활동 및 달리 분류되지 않은 자가 소비 생산활동'], U: ['국제기관', '국제 및 외국기관']
  };
  /* 중앙 공공기관 세부분류 — 「공공기관의 운영에 관한 법률」 제5조.
     k는 data/sub_category 값을 그대로 쓴다(원자료 표기), n은 화면에 보이는 이름, b는 법적 분류 기준. */
  var PUBT = [
    { k: '공기업(시장형)', n: '시장형 공기업', b: '자산 2조 원 이상이고 자체수입이 총수입의 85% 이상인 공기업' },
    { k: '공기업(준시장형)', n: '준시장형 공기업', b: '자체수입이 총수입의 50% 이상이면서 시장형 공기업 요건에 미치지 못하는 공기업' },
    { k: '준정부기관(기금관리형)', n: '기금관리형', b: '「국가재정법」에 따라 기금을 관리하거나 기금 관리를 위탁받은 준정부기관' },
    { k: '준정부기관(위탁집행형)', n: '위탁집행형', b: '기금관리형이 아닌 준정부기관 — 정부 업무를 위탁받아 집행' },
    { k: '기타공공기관', n: '기타공공기관', b: '공기업·준정부기관을 제외한 공공기관' }
  ];
  var PUBNAME = {}; PUBT.forEach(function (t) { PUBNAME[t.k] = t.n; });
  /* 알리오가 지정 기관과 함께 공시하는 부설기관(2026년 13곳). data/public-2026.json에서 읽는다. */
  var PUBSUB = '부설기관';
  var SUB = {};
  /* 지방공공기관: 세부 유형 넷 · 광역/기초 · 수도권/비수도권 · 17개 시·도(원자료 이름 그대로) */
  var LPIT = [
    { k: '지방직영기업', n: '지방직영기업', b: '지방자치단체가 공기업특별회계를 두고 직접 운영하는 기업(상수도·하수도 등)' },
    { k: '지방공사·공단', n: '지방공사·공단', b: '지방자치단체가 자본금의 50% 이상을 출자해 세운 법인' },
    { k: '출자기관', n: '지방출자기관', b: '지방자치단체가 자본금의 전부 또는 일부(10% 이상)를 출자한 주식회사' },
    { k: '출연기관', n: '지방출연기관', b: '지방자치단체가 재산의 전부 또는 일부를 출연해 세운 재단법인' }
  ];
  var LPINAME = {}; LPIT.forEach(function (t) { LPINAME[t.k] = t.n; });
  var PMETA = null;
  var SCOPE = [['광역', '광역'], ['기초', '기초']];
  var METRO = [['수도권', '수도권'], ['비수도권', '비수도권']];
  var SIDO = ['서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시', '대전광역시', '울산광역시', '세종특별자치시', '경기도', '강원특별자치도', '충청북도', '충청남도', '전북특별자치도', '전라남도', '경상북도', '경상남도', '제주특별자치도'];
  function sidoS(v) { return String(v || '').replace(/(특별시|광역시|특별자치시|특별자치도|도)$/, ''); }
  var RV = [['1', '1조 원 이상', 1e12, Infinity], ['2', '1천억~1조', 1e11, 1e12], ['3', '100억~1천억', 1e10, 1e11], ['4', '100억 미만', 1, 1e10]];
  var EM = [['1', '1만 명 이상', 1e4, Infinity], ['2', '1천~1만', 1e3, 1e4], ['3', '100~1천', 100, 1e3], ['4', '100명 미만', 1, 100]];
  var PER = 20;
  var IC = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
    out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    pie: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/></svg>',
    turn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/></svg>',
    filt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>'
  };
  var KEYS = ['c', 'g', 'k', 'k2', 'bt', 'ct', 'ls', 't', 'tt', 'mi', 'sd', 'rg', 'sc', 'fd', 've', 'rv', 'em', 'in', 'o', 'q'];
  var FKEYS = ['g', 'k', 'k2', 'bt', 'ct', 'ls', 't', 'tt', 'mi', 'sd', 'rg', 'sc', 'fd', 've', 'rv', 'em', 'in'];
  var META, LMETA = null, ITEMS = [], BYID = {}, BYN = {}, GRP = {}, SAME = {}, DIST = {}, SRC = {}, ENTREV = [], TAGV = {}, TAGS = {};
  /* 보강 레이어(data/enrich.json): id → 별칭[], id → {d 요약, p 제품·서비스[], c 고객층, b 대표 브랜드} */
  var ALI = {}, PROF = {}, ENRICH = null;
  /* 고용노동부 허가·등록 태그(business_tags, 피클 v1.3.0)를 찾을 때 함께 걸리는 말. 태그 자체는 원자료 그대로 */
  var TAGSYN = { '근로자파견': '근로자파견 파견 인력파견 파견사업 아웃소싱', '유료직업소개': '유료직업소개 직업소개 고용알선 헤드헌팅 인력소개', '직업정보제공': '직업정보제공 채용정보 구인구직 정보제공' };
  var st = blank(), view = '', listY = 0, lastList = '';
  var TODAY = (function () { var t = new Date(); return t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2); })();

  function blank() { var s = { p: 1 }; KEYS.forEach(function (k) { s[k] = ''; }); return s; }
  /* 화면에 보이는 기관 유형 이름(원자료 값은 그대로 두고 이름만 바꾼다) */
  function ptype(x) {
    if (x._c === 'LPI') return LPINAME[x.sub_category] || x.sub_category || '';
    if (x._c === 'PUB') return x._pt === PUBSUB ? PUBSUB : (PUBNAME[x.sub_category] || x.sub_category || '');
    return '';
  }
  function ptypeFull(x) {
    var t = ptype(x); return x._sub ? t + ' · 모기관 ' + x._sub + ' · ' + (PUBNAME[x.sub_category] || x.sub_category || '') : t;
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function has(v) { return v != null && (typeof v !== 'string' || v.trim() !== ''); }
  function num(v) { return typeof v === 'number' && isFinite(v) && v !== 0; } // 0은 "값이 없거나 0"
  function ko(a, b) { return a.localeCompare(b, 'ko'); }
  // 만 단위 숫자를 화면마다 수천 번 맞춘다. 같은 수는 만든 글자를 다시 쓴다(localeCompare 류 Intl 비용 제거).
  var _fmtC = {};
  function fmt(n) { var k = Number(n), v = _fmtC[k]; if (v === undefined) v = _fmtC[k] = k.toLocaleString('ko-KR'); return v; }

  /* ---------- 찾기용 정규화 ---------- */
  // search_name과 같은 규칙: (주)·주식회사·(유) 등 법인 표기, 공백·기호를 빼고 소문자
  function norm(s) {
    return String(s || '').toLowerCase()
      .replace(/\(\s*(주|유|재|사|합|사단|재단|학)\s*\)|㈜|주식회사|유한회사|유한책임회사|합자회사|합명회사|재단법인|사단법인/g, '')
      .replace(/[\s\-_.,·ㆍ()\[\]{}&/'"’`~!@#$%^*+=:;<>?|\\]+/g, '');
  }
  // 로마자는 한글 이름 표기로도 찾는다: sk하이닉스 → 에스케이하이닉스, lg → 엘지
  var LAT = { a: '에이', b: '비', c: '씨', d: '디', e: '이', f: '에프', g: '지', h: '에이치', i: '아이', j: '제이', k: '케이', l: '엘', m: '엠', n: '엔', o: '오', p: '피', q: '큐', r: '알', s: '에스', t: '티', u: '유', v: '브이', w: '더블유', x: '엑스', y: '와이', z: '지' };
  function hangulize(s) { return s.replace(/[a-z]/g, function (c) { return LAT[c]; }); }
  var CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  function cho(s) {
    var o = '';
    for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i) - 44032; o += c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : s[i]; }
    return o;
  }
  function digits(s) { return String(s || '').replace(/\D/g, ''); }

  /* ---------- 숫자 읽기 ---------- */
  function won(n) {
    var a = Math.abs(n), s = n < 0 ? '−' : '', t;
    if (a >= 1e12) t = (a / 1e12).toFixed(a >= 1e14 ? 0 : 1).replace(/\.0$/, '') + '조';
    else if (a >= 1e8) t = fmt(Math.round(a / 1e8)) + '억';
    else if (a >= 1e4) t = fmt(Math.round(a / 1e4)) + '만';
    else t = fmt(a);
    return s + t + ' 원';
  }
  function wonFull(n) {
    var a = Math.abs(n), p = [], jo = Math.floor(a / 1e12), eok = Math.floor(a % 1e12 / 1e8), man = Math.floor(a % 1e8 / 1e4), r = a % 1e4;
    if (jo) p.push(fmt(jo) + '조'); if (eok) p.push(fmt(eok) + '억'); if (man) p.push(fmt(man) + '만'); if (r) p.push(fmt(r));
    return (n < 0 ? '−' : '') + (p.join(' ') || '0') + '원';
  }
  function wonShort(n) { var a = Math.abs(n), s = n < 0 ? '−' : ''; return s + (a >= 1e12 ? (a / 1e12).toFixed(1).replace(/\.0$/, '') + '조' : a >= 1e8 ? fmt(Math.round(a / 1e8)) + '억' : fmt(Math.round(a / 1e4)) + '만'); }
  function ppl(n) { return n >= 1e4 ? (n / 1e4).toFixed(1).replace(/\.0$/, '') + '만 명' : fmt(n) + '명'; }
  function bucket(v, B) { if (!num(v) || v < 0) return ''; for (var i = 0; i < B.length; i++) if (v >= B[i][2] && v < B[i][3]) return B[i][0]; return ''; }

  /* ---------- 불러온 뒤 한 번 ---------- */
  function prep(x) {
    x._c = String(x.id).slice(0, 3); if (!CK[x._c]) x._c = (CN[x.category] || CATS[0]).k;
    x._rev = num(x.revenue) ? x.revenue : null;
    x._emp = num(x.employees) ? x.employees : null;
    x._ast = num(x.total_assets) ? x.total_assets : null;
    x._grp = has(x.group) ? x.group.split(/\s*\/\s*/).filter(Boolean) : [];
    x._k = has(x.sector_code) && KSIC[x.sector_code] ? x.sector_code : (has(x.ksic_code) && KSIC[x.ksic_code.charAt(0)] ? x.ksic_code.charAt(0) : '');
    x._k2 = x._c === 'ENT' && /^[A-Z]\d\d/.test(String(x.ksic_code || '')) ? String(x.ksic_code).slice(0, 3) : '';   // KSIC 중분류(예: C26)
    x._rb = bucket(x._rev, RV); x._eb = bucket(x._emp, EM);
    x._pt = has(x.sub_category) ? x.sub_category : '';
    if (x._c === 'PUB') { var sb = SUB[norm(x.name)]; if (sb) { x._pt = PUBSUB; x._sub = sb.parent || ''; } }
    x._ve = x._c === 'MID' && has(x.certificate_valid) ? (String(x.certificate_valid).match(/(\d{4}-\d{2}-\d{2})\s*$/) || [])[1] || '' : '';
    var sn = has(x.search_name) ? x.search_name : norm(x.name);
    x._n = sn; x._cho = cho(sn);
    if (ALI[x.id]) x._al = ALI[x.id];
    if (PROF[x.id]) x._px = PROF[x.id];
    x._id = digits(x.biz_no) + ' ' + digits(x.corp_reg_no) + ' ' + digits(x.certificate_no);
    // 찾기 열쇠: [낱말, 무게, 이름표]
    x._f = [];
    function add(k, v, w) { if (has(v)) x._f.push({ k: k, t: String(v), s: norm(v), w: w }); }
    add('group', x.group, 34); add('ind', x.industry, 14); add('min', x.ministry, 14); add('type', x._c === 'PUB' || x._c === 'LPI' ? ptypeFull(x) : '', 12);
    add('dtl', x._c === 'LPI' ? x.type_detail : '', 10);
    add('ceo', x.ceo, 7); add('hq', has(x.headquarters) ? x.headquarters : (x._c === 'LPI' ? x.founder : ''), 6);
    add('sum', x._c === 'PUB' ? x.business_summary : '', 2);
    add('prod', x._c === 'MID' ? x.main_products : '', 4);
    (x.business_tags || []).forEach(function (t) { x._f.push({ k: 'tag', t: (TAGV[t] || {}).label || t, s: norm(TAGSYN[t] || t), w: 30 }); (TAGS[t] = TAGS[t] || []).push(x); });   // 찾기는 비슷한 말까지, 보이는 이름은 공식 명칭
    /* 보강 레이어: 별칭은 이름 다음으로 세게 걸리고, 사업 설명은 낱말 하나로도 걸리게 둔다 */
    (x._al || []).forEach(function (a) { if (a && a.a) x._f.push({ k: 'alias', t: a.a, s: a.n || norm(a.a), w: 150 }); });
    if (x._px) x._f.push({ k: 'rich', t: x._px.d, s: norm([x._px.d].concat(x._px.p || []).concat(x._px.c || []).join(' ')), w: 8 });
    (SAME[x._c + '|' + sn] = SAME[x._c + '|' + sn] || []).push(x);
    x._grp.forEach(function (g) { (GRP[g] = GRP[g] || []).push(x); });
    if (!BYN[norm(x.name)]) BYN[norm(x.name)] = x;
  }
  // 분류별 규모 분포: 로그 눈금 24칸 + 순위
  function dist() {
    CATS.forEach(function (c) {
      ['_rev', '_emp', '_ast'].forEach(function (f) {
        var arr = ITEMS.filter(function (x) { return x._c === c.k && x[f] > 0; }).sort(function (a, b) { return b[f] - a[f]; });
        if (arr.length < 8) return;
        var lo = Math.log10(arr[arr.length - 1][f]), hi = Math.log10(arr[0][f]), bins = [], N = 24, w = (hi - lo) / N || 1;
        for (var i = 0; i < N; i++) bins.push(0);
        arr.forEach(function (x, i) {
          var b = Math.min(N - 1, Math.floor((Math.log10(x[f]) - lo) / w)); bins[b]++;
          x[f + 'R'] = (i > 0 && arr[i - 1][f] === x[f]) ? arr[i - 1][f + 'R'] : i + 1; x[f + 'B'] = b;
        });
        if (f === '_rev' && c.k === 'ENT') { LOGHI = hi; LOGLO = Math.log10(1e8); }
        DIST[c.k + f] = { n: arr.length, lo: arr[arr.length - 1][f], hi: arr[0][f], bins: bins, max: Math.max.apply(null, bins), loL: lo, w: w };
      });
    });
  }

  /* ---------- 상태 ↔ 주소 ---------- */
  function readHash() {
    var h = location.hash.replace(/^#/, '');
    try { h = decodeURIComponent(h); } catch (e) {}
    if (/^(ENT|MID|PUB|LPI)-/.test(h) && BYID[h]) return { v: 'item', id: h };
    if (h === 'about') return { v: 'about' };
    var s = blank(), q = h.indexOf('?');
    if (/^list/.test(h) && q > -1) {
      h.slice(q + 1).split('&').forEach(function (kv) {
        var i = kv.indexOf('='); if (i < 0) return; var k = kv.slice(0, i), v = kv.slice(i + 1);
        try { v = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) {}
        if (k in s) s[k] = k === 'p' ? Math.max(1, parseInt(v, 10) || 1) : v;
      });
    }
    return { v: 'list', s: fix(s) };
  }
  // 분류에 맞지 않는 조건은 버린다
  function fix(s) {
    if (s.c && !CK[s.c]) s.c = '';
    if (s.c !== 'ENT') { s.g = ''; s.ct = ''; s.ls = ''; s.k2 = ''; }
    if (s.o && !sortOpts(s).some(function (o) { return o[0] === s.o; })) s.o = '';   // 이 분류에서 쓸 수 없는 정렬은 기본으로
    if (s.c !== 'ENT' && s.c !== 'MID') { s.k = ''; s.in = ''; }
    if (s.c !== 'PUB' && s.c !== 'MID' && s.c !== 'LPI') { s.t = ''; s.sd = ''; }
    if (s.c !== 'PUB' && s.c !== 'MID') s.mi = '';
    if (s.c !== 'LPI') { s.tt = ''; s.rg = ''; s.sc = ''; s.fd = ''; }
    if (s.c !== 'MID') s.ve = '';
    if (s.c === 'MID') s.rv = '';
    return s;
  }
  function listHash(s) {
    var o = [];
    KEYS.forEach(function (k) { if (s[k]) o.push(k + '=' + encodeURIComponent(s[k])); });
    if (s.p > 1) o.push('p=' + s.p);
    return '#list' + (o.length ? '?' + o.join('&') : '');
  }
  function setState(patch) {
    for (var k in patch) st[k] = patch[k];
    if (!('p' in patch)) st.p = 1;
    fix(st);
    try { history.replaceState(null, '', listHash(st)); } catch (e) { location.hash = listHash(st); }
    updateList();
  }

  /* ---------- 거르기·찾기 ---------- */
  function toks(q) { return String(q || '').trim().toLowerCase().split(/\s+/).map(function (t) { return { raw: t, n: norm(t), h: hangulize(norm(t)), d: /^[\d-]{5,}$/.test(t) ? digits(t) : '' }; }).filter(function (t) { return t.n || t.d; }); }
  function isCho(t) { return /^[ㄱ-ㅎ]+$/.test(t); }
  function score(x, ts) {
    if (!ts.length) return { sc: 1 };
    var total = 0, hit = null;
    for (var i = 0; i < ts.length; i++) {
      var t = ts[i], best = 0, bf = null;
      if (t.d) { if (x._id.indexOf(t.d) > -1) { best = 150; bf = { k: 'idno' }; } }
      else if (isCho(t.n)) { var ci = x._cho.indexOf(t.n); if (ci > -1) { best = ci === 0 ? 60 : 40; bf = { k: 'name' }; } }
      else {
        [t.n, t.h].forEach(function (w, wi) {
          if (!w || (wi && w === t.n)) return;
          var at = x._n.indexOf(w);
          if (at > -1) { var sc = x._n === w ? 200 : at === 0 ? 150 : 110; if (sc > best) { best = sc; bf = { k: 'name' }; } }
          for (var j = 0; j < x._f.length; j++) {
            var f = x._f[j], fa = f.s.indexOf(w); if (fa < 0) continue;
            // 별칭은 「이 이름으로도 부른다」는 표시라 이름 바로 뒤에 둔다(정확 175 · 앞머리 160 · 안쪽 130)
            var fw = f.k === 'alias' ? (f.s === w ? 175 : fa === 0 ? 160 : 130) : f.w;
            if (fw > best) { best = fw; bf = f; }
          }
        });
      }
      if (!best) return null;
      total += best; if (!hit || (hit.k === 'name' && bf.k !== 'name')) hit = bf;
    }
    // 같은 점수면 큰 곳이 먼저
    return { sc: total, hit: hit && hit.t ? hit : null };
  }
  function pass(x, s, skip) {
    if (skip !== 'c' && s.c && x._c !== s.c) return false;
    if (skip !== 'g' && s.g && x._grp.indexOf(s.g) < 0) return false;
    if (skip !== 'k' && s.k && x._k !== s.k) return false;
    if (skip !== 'k2' && s.k2 && x._k2 !== s.k2) return false;
    if (skip !== 'bt' && s.bt && (x.business_tags || []).indexOf(s.bt) < 0) return false;
    if (skip !== 'in' && s.in && x.industry !== s.in) return false;
    if (skip !== 'ct' && s.ct && x.corp_type !== s.ct) return false;
    if (skip !== 'ls' && s.ls && !has(x.listed_date)) return false;
    if (skip !== 't' && s.t && x._pt !== s.t) return false;
    if (skip !== 'tt' && s.tt && x.type_detail !== s.tt) return false;
    if (skip !== 'rg' && s.rg && x.metro !== s.rg) return false;
    if (skip !== 'sc' && s.sc && x.region_scope !== s.sc) return false;
    if (skip !== 'fd' && s.fd && x.founder !== s.fd) return false;
    if (skip !== 'mi' && s.mi && x.ministry !== s.mi) return false;
    if (skip !== 'sd' && s.sd && x.location_sido !== s.sd) return false;
    if (skip !== 've' && s.ve && x._ve.slice(0, 7) !== s.ve) return false;
    if (skip !== 'rv' && s.rv && x._rb !== s.rv) return false;
    if (skip !== 'em' && s.em && x._eb !== s.em) return false;
    return true;
  }
  var qCache = { q: null, map: null };
  function qmap(q) {
    if (qCache.q === q) return qCache.map;
    var ts = toks(q), m = null;
    if (ts.length) { m = {}; for (var i = 0; i < ITEMS.length; i++) { var r = score(ITEMS[i], ts); if (r) m[ITEMS[i].id] = r; } }
    qCache = { q: q, map: m }; return m;
  }
  function filtered(s, skip) {
    var m = skip === 'q' ? null : qmap(s.q), out = [];
    for (var i = 0; i < ITEMS.length; i++) { var x = ITEMS[i]; if ((!m || m[x.id]) && pass(x, s, skip)) out.push(x); }
    return out;
  }
  function cmpNum(f, dir) {
    return function (a, b) {
      var va = a[f], vb = b[f];
      if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1;
      return dir * (vb - va);
    };
  }
  /* 분류마다 실제로 값이 있는 정렬만 보여 준다(중견기업은 매출·자산·설립연도가 원자료에 없다) */
  function sortOpts(s) {
    if (s.c === 'MID') return [['', '가입자 많은 순'], ['name', '이름순'], ['sido', '소재지순'], ['ve', '확인서 만료 이른 순']];
    if (s.c === 'PUB') return [['', '매출 큰 순'], ['emp', '정원 많은 순'], ['old', '설립 오래된 순'], ['new', '설립 최근 순'], ['name', '이름순']];
    if (s.c === 'LPI') return [['', '이름순'], ['sido', '시·도순'], ['fd', '설립 지자체순'], ['tt', '업무 유형순']];
    return [['', '매출 큰 순'], ['emp', '직원 많은 순'], ['ast', '자산 큰 순'], ['old', '설립 오래된 순'], ['new', '설립 최근 순'], ['name', '이름순']];
  }
  var SORTF = { emp: '_emp', ast: '_ast', old: 'established_year', new: 'established_year', ve: '_ve', sido: 'location_sido', fd: 'founder', tt: 'type_detail' };
  function sorted(arr, s) {
    var m = qmap(s.q), byQ = !!m && !s.o, f;
    if (s.o === 'name') f = function (a, b) { return ko(a._n, b._n); };
    else if (s.o === 'emp') f = cmpNum('_emp', 1);
    else if (s.o === 'ast') f = cmpNum('_ast', 1);
    else if (s.o === 'old') f = cmpNum('established_year', -1);
    else if (s.o === 'new') f = cmpNum('established_year', 1);
    else if (s.o === 've') { var k = SORTF[s.o]; f = function (a, b) { var va = a[k], vb = b[k]; if (!va && !vb) return 0; if (!va) return 1; if (!vb) return -1; return ko(va, vb); }; }
    else if (s.o === 'sido') {
      // 지방공공기관은 17개 시·도를 법령 순서(서울→제주)대로 늘어놓는다. 그 밖의 분류는 이름순.
      if (s.c === 'LPI') f = function (a, b) { var ia = SIDO.indexOf(a.location_sido), ib = SIDO.indexOf(b.location_sido); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); };
      else f = function (a, b) { var va = a.location_sido, vb = b.location_sido; if (!va && !vb) return 0; if (!va) return 1; if (!vb) return -1; return ko(va, vb); };
    }
    else if (s.o === 'fd' || s.o === 'tt') { var k2 = SORTF[s.o]; f = function (a, b) { var va = a[k2], vb = b[k2]; if (!va && !vb) return 0; if (!va) return 1; if (!vb) return -1; return ko(va, vb); }; }
    else if (s.c === 'MID') f = cmpNum('_emp', 1);
    else if (s.c === 'LPI') f = function (a, b) { return ko(a._n, b._n); };
    else f = cmpNum('_rev', 1);
    return arr.slice().sort(function (a, b) {
      if (byQ) { var d1 = m[b.id].sc - m[a.id].sc; if (d1) return d1; }
      return f(a, b) || cmpNum('_emp', 1)(a, b) || ko(a._n, b._n);
    });
  }
  function counts(s, skip, fn) {
    var o = {}, l = filtered(s, skip);
    for (var i = 0; i < l.length; i++) { var k = fn(l[i]); if (k == null || k === '') continue; [].concat(k).forEach(function (kk) { o[kk] = (o[kk] || 0) + 1; }); }
    return o;
  }

  /* ---------- 공용 조각 ---------- */
  function hl(text, q) {
    var t = esc(text), ts = String(q || '').trim().split(/\s+/).filter(function (w) { return w && !isCho(w) && !/^[\d-]{5,}$/.test(w); });
    ts.forEach(function (w) {
      var e = esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); if (!e) return;
      try { t = t.replace(new RegExp('(' + e + ')(?![^<]*>)', 'gi'), '<mark>$1</mark>'); } catch (er) {}
    });
    return t;
  }
  var FLAB = { group: '기업집단', ind: '업종', min: '주무부처', type: '기관 유형', dtl: '업무 유형', hq: '소재지', ceo: '대표자', sum: '하는 일', prod: '주요 사업', tag: '고용노동부 허가·등록', alias: '별칭' };
  function snippet(f, q) {
    var t = f.t, w = (String(q || '').trim().split(/\s+/)[0] || '').toLowerCase(), at = t.toLowerCase().indexOf(w);
    if (at < 0) at = 0;
    var a = Math.max(0, at - 20), b = Math.min(t.length, at + w.length + 40);
    return '<p class="r-x"><b>' + FLAB[f.k] + '</b>' + (a > 0 ? '…' : '') + hl(t.slice(a, b), q) + (b < t.length ? '…' : '') + '</p>';
  }
  function safeUrl(u) { u = String(u || '').trim(); if (!u) return ''; if (!/^https?:\/\//i.test(u)) u = 'http://' + u.replace(/^\/+/, ''); return /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : ''; }
  /* 보강 레이어 표시 — 목록은 한 줄에 「별칭」과 첫 문장만, 상세는 전문과 제품·고객 */
  function firstSentence(s) { var t = String(s || ''), i = t.indexOf('. '); return i > 20 ? t.slice(0, i + 1) : t; }
  function descLine(x, hit, q) {
    var a = hit && hit.k === 'alias' && hit.t ? '<b>별칭</b>' + hl(hit.t, q) : '';
    var d = x._px && x._px.d ? '<span class="rq">' + esc(firstSentence(x._px.d)) + '</span>' : '';
    if (!a && !d) return '';
    return '<p class="r-x r-a">' + a + (a && d ? '<i class="sep" aria-hidden="true">·</i>' : '') + d + '</p>';
  }
  function profSec(x, tag) {
    var P = x._px; if (!P) return '';
    var gong = x._c === 'PUB' || x._c === 'LPI';
    var h = '<p class="t">' + esc(P.d) + '</p>';
    var left = '';
    if (P.p && P.p.length) left = '<div class="pfc"><h3>주요 ' + (gong ? '서비스·사업' : '제품·서비스') + '</h3><ul class="pfl">' + P.p.map(function (v) { return '<li>' + esc(v) + '</li>'; }).join('') + '</ul></div>';
    var right = P.c ? '<div class="pfc"><h3>' + (gong ? '주요 대상(민원인)' : '주요 고객') + '</h3><p class="t">' + esc(P.c) + '</p></div>' : '';
    if (left || right) h += '<div class="pf2">' + left + right + '</div>';
    var alt = (x._al || []).filter(function (a) { return a.n !== x._n; });
    if (alt.length) h += '<p class="al"><b>다른 이름</b>' + alt.map(function (a) { return esc(a.a); }).join(' · ') + '</p>';
    h += '<p class="t fnote">요약·제품·고객은 공개된 ' + (gong ? '기관' : '회사') + ' 소개를 바탕으로 보강한 값입니다. 아래 원자료에 적힌 ' + (gong ? '유형·분류' : '업종·분류') + '와 함께 보십시오.' +
      (x._c === 'LPI' ? ' 행정안전부 현황은 명칭·구분·지역·설립 지자체·유형만 공개해, 매출·정원·설립일·홈페이지는 싣지 않았습니다.' : '') + '</p>';
    return sec('무슨 ' + (gong ? '기관인가' : '회사인가'), h, '', tag || '공개된 ' + (gong ? '기관' : '회사') + ' 소개');
  }
  function host(u) { return u.replace(/^https?:\/\//i, '').replace(/\/$/, ''); }
  function initial(x) { var s = String(x._n || x.name).replace(/^(재|사)(?=[가-힣]{3})/, ''); var m = s.match(/[가-힣a-z0-9]/i); return m ? m[0].toUpperCase() : '·'; }
  function lineOf(x) {
    if (x._c === 'ENT') return [x.group, x.industry].filter(has).join(' · ');
    if (x._c === 'PUB') return [ptype(x), x.ministry].filter(has).join(' · ');
    if (x._c === 'LPI') return [ptype(x), x.type_detail].filter(has).join(' · ');
    return [x.industry, x.location_sido].filter(has).join(' · ') || '중견기업 확인서 발급기업';
  }

  /* ---------- 탭·첫머리 ---------- */
  function tabs(cur) {
    var h = '<a href="#list" ' + (cur === 'all' ? 'aria-current="page"' : '') + '>전체 <small>' + fmt(ITEMS.length) + '</small></a>';
    CATS.forEach(function (c) { h += '<a class="k-' + c.k + '" href="#list?c=' + c.k + '" aria-label="' + esc(c.full || c.name) + ' ' + fmt(c.n) + '곳" ' + (cur === c.k ? 'aria-current="page"' : '') + '><i aria-hidden="true"></i>' + esc(c.name) + ' <small>' + fmt(c.n) + '</small></a>'; });
    h += '<a class="sm" href="#about" ' + (cur === 'about' ? 'aria-current="page"' : '') + '>출처와 한계</a>';
    var box = d.getElementById('tabsIn'); box.innerHTML = h;
    var a = box.querySelector('[aria-current]'); if (a && a.offsetLeft) box.scrollLeft = Math.max(0, a.offsetLeft - 16);
  }
  /* ---------- 기관 유형 띠: 대분류를 고르면 2차 세부 분류 칩과 법적 기준이 늘 보인다 ---------- */
  var clfOpen = false;
  function strip(c) {
    var pub = c.k === 'PUB', L = pub ? PUBT : LPIT;
    var tc = counts(st, 't', function (x) { return x._pt; });
    var chips = L.map(function (t) { return chip('t', t.k, t.n, tc[t.k]); });
    if (pub && tc[PUBSUB]) chips.push(chip('t', PUBSUB, PUBSUB, tc[PUBSUB]));
    var note = pub
      ? '「공공기관의 운영에 관한 법률」 제5조 — 정원 300명·총수입 200억·자산 30억 원 이상이면 공기업·준정부기관으로 나뉩니다.'
      : '「지방공기업법」의 직영기업·공사·공단과 「지방자치단체 출자·출연기관의 운영에 관한 법률」의 출자·출연기관입니다.';
    var rows = L.map(function (t) { return '<li><b>' + esc(t.n) + '</b><span>' + esc(t.b) + '</span></li>'; }).join('') +
      (pub && tc[PUBSUB] ? '<li><b>' + PUBSUB + '</b><span>독립 지정 기관이 아니라 알리오가 모기관과 함께 공시하는 기관</span></li>' : '');
    return '<p class="clf-h"><b>' + esc(c.full || c.name) + '</b><span>' + esc(c.def) + '</span></p>' +
      '<div class="opts">' + chips.join('') + '</div>' +
      '<details class="clf-d"' + (clfOpen ? ' open' : '') + '><summary><b>분류 기준</b><span>' + esc(note) + '</span></summary><ul class="clf-bs">' + rows + '</ul></details>';
  }
  function album() {
    d.getElementById('heroN').textContent = fmt(ITEMS.length);
    var line = {
      ENT: '공시대상기업집단 ' + Object.keys(GRP).length + '곳 소속회사',
      MID: '확인서 발급기업 · 업종·가입자 보강 ' + fmt(ITEMS.filter(function (x) { return x._c === 'MID' && x.employees; }).length) + '곳',
      PUB: PMETA && PMETA.counts ? '알리오 지정 ' + fmt(PMETA.counts['지정']) + ' · 부설기관 ' + fmt(ITEMS.filter(function (x) { return x._sub; }).length) : '알리오 ' + PUBT.length + '개 유형',
      LPI: '직영·공사공단·출자·출연 ' + LPIT.length + '갈래'
    };
    var el = d.getElementById('album'), h = '';
    CATS.forEach(function (c) {
      h += '<a class="bc k-' + c.k + '" href="#list?c=' + c.k + '" data-jc-ignore><p class="nm"><span>' + esc(c.name) + (c.post ? '<small>' + esc(c.post) + '</small>' : '') + '</span><span class="ct">' + fmt(c.n) + '<small>곳</small></span></p>' +
        '<p class="ln"><b>' + esc(c.src) + '</b><span>' + esc(line[c.k]) + '</span></p></a>';
    });
    el.insertAdjacentHTML('afterbegin', h);
  }

  /* ---------- 그림 조각: 모두 transform·opacity로만 움직인다 ---------- */
  var PAL = ['var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--p4)', 'var(--p5)', 'var(--p6)', 'var(--p0)'];
  // 도넛: 조각들이 12시 방향에 포개져 있다가 부채처럼 제자리로 펴진다
  function donut(parts, center, sub, label) {
    var T = parts.reduce(function (a, p) { return a + Math.max(0, p.v); }, 0); if (!T) return '';
    var C = 2 * Math.PI * 42, cum = 0, h = '';
    parts.forEach(function (p, i) {
      var v = Math.max(0, p.v); if (!v) return;
      var len = v / T * C, gap = parts.length > 1 && len > 3 ? 1.4 : 0, a = cum / T * 360 - 90; cum += v;
      h = '<circle class="sl" cx="60" cy="60" r="42" stroke="' + (p.col || PAL[i % PAL.length]) + '" stroke-dasharray="' + (len - gap).toFixed(2) + ' ' + C.toFixed(2) + '" style="transform:rotate(' + a.toFixed(2) + 'deg);--i:' + i + '"/>' + h; // 앞 조각이 위에 오도록 거꾸로 쌓는다
    });
    return '<div class="dn" role="img" aria-label="' + esc(label || '') + '"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="42" class="trk"/>' + h + '</svg>' +
      '<p class="dn-c"><b>' + esc(center) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</p></div>';
  }
  // 세로 막대: 바닥부터 차오른다. 누르면 조건으로 고른다(k·v가 있을 때)
  function vbars(rows, k) {
    var max = Math.max.apply(null, rows.map(function (r) { return r.n; }).concat([1]));
    return '<div class="vb">' + rows.map(function (r, i) {
      var on = k && st[k] === r.v, tag = k ? 'button type="button" data-k="' + k + '" data-v="' + esc(r.v) + '" aria-pressed="' + on + '"' + (r.n || on ? '' : ' disabled') : 'div';
      return '<' + tag + ' aria-label="' + esc(r.label + ' ' + fmt(r.n) + '곳') + '"><em>' + fmt(r.n) + '</em><i style="--h:' + (r.n ? Math.max(.04, r.n / max) : 0).toFixed(3) + ';--i:' + i + '"></i><span>' + esc(r.label) + '</span></' + tag.split(' ')[0] + '>';
    }).join('') + '</div>';
  }
  // 가로 막대 순위: 왼쪽부터 뻗어 나간다
  function hbars(list, x, f, fmtV, n) {
    // 지금 보는 곳이 앞 n곳 밖이면 마지막 줄을 그곳으로 바꿔, 묶음 안에서의 자리를 항상 보이게 한다
    if (list.indexOf(x) >= n) list = list.slice(0, n - 1).concat([x]);
    var max = Math.max.apply(null, list.slice(0, n).map(function (y) { return Math.abs(y[f] || 0); }).concat([1]));
    return '<ol class="hb">' + list.slice(0, n).map(function (y, i) {
      var v = y[f];
      return '<li><a href="#' + y.id + '"' + (y.id === x.id ? ' aria-current="page"' : '') + '><span class="hb-n">' + esc(y.name) + '</span><em>' + (v != null ? fmtV(v) : '') + '</em><s style="--w:' + (v > 0 ? Math.max(.02, v / max) : 0).toFixed(3) + ';--i:' + i + '"></s></a></li>';
    }).join('') + '</ol>';
  }
  // 화면에 들어올 때 한 번 움직인다(움직임 줄이기·집중 보기에서는 그대로 서 있다)
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('run'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -12% 0px' }) : null;
  function arm(root) { [].forEach.call(root.querySelectorAll('[data-run]'), function (el) { if (io) io.observe(el); else el.classList.add('run'); }); }
  function rerun(el) { el.classList.remove('run'); void el.offsetWidth; el.classList.add('run'); }

  /* ---------- 찾기 화면 ---------- */
  var EG = ['삼전', '해커스', '파바', '올영', '건보', '코레일', 'ㅎㄱㄷㄹ'];
  var PERS = [5, 10, 20];
  try { var sp0 = +localStorage.getItem('jc-company-per'); PER = PERS.indexOf(sp0) > -1 ? sp0 : 10; } catch (e) { PER = 10; }
  var MQ_WIDE = window.matchMedia ? window.matchMedia('(min-width:980px)') : { matches: true };
  var glance = false; // 「한눈에」 판 열림
  var LOGLO = 0, LOGHI = 1;
  function renderList() {
    view = 'list';
    main.innerHTML =
      '<div id="cdef" hidden></div><div class="clf" id="clf" hidden></div>' +
      '<div class="sb" id="sb">' + IC.search + '<input id="q" type="search" enterkeyhint="search" autocomplete="off" placeholder="이름·브랜드·줄임말로 찾기 (예: 삼전, 해커스)" aria-label="기업·기관 찾기"><button class="clr" id="qx" type="button" aria-label="검색어 지우기">' + IC.x + '</button></div>' +
      '<p class="eg" id="eg"><span class="eg-l">이렇게도 찾습니다</span>' + EG.map(function (e) { return '<button type="button">' + esc(e) + '</button>'; }).join('') + '</p>' +
      '<div class="fd"><aside class="fl" id="fl" aria-label="조건 고르기"><div class="fl-sh"><div class="fl-hd"><b>조건 고르기</b><button type="button" class="fl-x" id="flX" aria-label="닫기">' + IC.x + '</button></div><div class="fl-b" id="flB"></div><div class="fl-ft"><button type="button" class="reset" id="flR">모두 풀기</button><button type="button" class="fl-go" id="flGo">결과 보기</button></div></div></aside>' +
      '<section id="res" aria-live="polite"></section></div><div class="scrim" id="scrim" hidden></div>';
    var q = d.getElementById('q'); q.value = st.q;
    var tmr = 0;
    q.addEventListener('input', function () { d.getElementById('sb').classList.toggle('has', !!q.value); clearTimeout(tmr); tmr = setTimeout(function () { setState({ q: q.value.trim() }); }, 160); });
    q.addEventListener('keydown', function (e) { if (e.key === 'Enter') q.blur(); });
    d.getElementById('qx').addEventListener('click', function () { q.value = ''; d.getElementById('sb').classList.remove('has'); setState({ q: '' }); q.focus(); });
    d.getElementById('eg').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; q.value = b.textContent; d.getElementById('sb').classList.add('has'); setState({ q: b.textContent }); });
    d.getElementById('flX').addEventListener('click', function () { sheet(false); });
    d.getElementById('flGo').addEventListener('click', function () { sheet(false); });
    d.getElementById('scrim').addEventListener('click', function () { sheet(false); });
    d.getElementById('flR').addEventListener('click', function () { var o = {}; FKEYS.forEach(function (k) { o[k] = ''; }); setState(o); });
    d.getElementById('flB').addEventListener('click', onFilter);
    d.getElementById('clf').addEventListener('click', onFilter);
    d.getElementById('clf').addEventListener('toggle', function (e) { if (e.target.matches && e.target.matches('details.clf-d')) clfOpen = e.target.open; }, true);
    d.getElementById('flB').addEventListener('toggle', function (e) { var t = e.target; if (t.matches && t.matches('details[data-fg]')) fgOpen[t.getAttribute('data-fg')] = t.open; }, true);
    d.getElementById('res').addEventListener('click', function (e) {
      if (e.target.closest('#flOpen')) { sheet(true); return; }
      if (e.target.closest('#glBtn')) { glance = !glance; updateList(); return; }
      var pb = e.target.closest('[data-per]'); if (pb) { PER = +pb.getAttribute('data-per'); try { localStorage.setItem('jc-company-per', String(PER)); } catch (er) {} setState({ p: 1 }); return; }
      var k = e.target.closest('.gl [data-k]'); if (k) { onFilter(e); return; }
      var b = e.target.closest('[data-p]'); if (b) { setState({ p: +b.getAttribute('data-p') }); var r = d.getElementById('res'); window.scrollTo(0, Math.max(0, r.getBoundingClientRect().top + window.pageYOffset - 140)); return; }
      var x = e.target.closest('[data-un]'); if (x) { var o = {}; o[x.getAttribute('data-un')] = ''; setState(o); }
    });
    d.getElementById('sb').classList.toggle('has', !!st.q);
    updateList();
  }
  // 휴대폰: 조건은 아래에서 올라오는 시트. 넓은 화면: 왼쪽 고정 칸.
  function sheet(on) {
    var fl = d.getElementById('fl'), sc = d.getElementById('scrim'); if (!fl) return;
    if (on && MQ_WIDE.matches) return;
    fl.classList.toggle('open', on); sc.hidden = !on;
    d.documentElement.classList.toggle('jc-lock', on);
    if (on) { var x = d.getElementById('flX'); if (x) x.focus(); }
  }
  d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && d.querySelector('.fl.open')) { e.stopPropagation(); sheet(false); } }, true);
  if (MQ_WIDE.addEventListener) MQ_WIDE.addEventListener('change', function () { sheet(false); });
  function onSelect(e) { var s = e.target.closest('select[name]'); if (!s || view !== 'list') return; var o = {}; o[s.name] = s.value; setState(o); }
  function onFilter(e) {
    var b = e.target.closest('button[data-k]'); if (!b) return;
    var k = b.getAttribute('data-k'), v = b.getAttribute('data-v'), p = {}; p[k] = st[k] === v ? '' : v; setState(p);
  }
  function chip(k, v, label, n, title) {
    var on = st[k] === v;
    return '<button type="button" data-k="' + k + '" data-v="' + esc(v) + '" aria-pressed="' + on + '"' + (title ? ' title="' + esc(title) + '"' : '') + (!n && !on ? ' disabled' : '') + '>' + esc(label) + '<small>' + fmt(n || 0) + '</small></button>';
  }
  function select(name, label, cnt, all) {
    var keys = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a] || ko(a, b); });
    if (st[name] && keys.indexOf(st[name]) < 0) keys.unshift(st[name]);
    var h = '<select name="' + name + '" aria-label="' + label + '"><option value="">' + all + '</option>';
    keys.forEach(function (k) { h += '<option value="' + esc(k) + '"' + (st[name] === k ? ' selected' : '') + '>' + esc(k) + ' (' + fmt(cnt[k] || 0) + ')</option>'; });
    return h + '</select>';
  }
  // 17개 시·도는 많은 순이 아니라 서울→제주 순으로 늘어놓는다(주소를 떠올리는 순서와 같게)
  function sidoSelect(name, label, cnt, all) {
    var keys = Object.keys(cnt).filter(function (k) { return SIDO.indexOf(k) > -1; }).sort(function (a, b) { return SIDO.indexOf(a) - SIDO.indexOf(b); });
    Object.keys(cnt).forEach(function (k) { if (SIDO.indexOf(k) < 0) keys.push(k); });
    if (st[name] && keys.indexOf(st[name]) < 0) keys.unshift(st[name]);
    var h = '<select name="' + name + '" aria-label="' + label + '"><option value="">' + all + '</option>';
    keys.forEach(function (k) { h += '<option value="' + esc(k) + '"' + (st[name] === k ? ' selected' : '') + '>' + esc(sidoS(k)) + ' (' + fmt(cnt[k] || 0) + ')</option>'; });
    return h + '</select>';
  }
  // 조건 묶음은 접고 펴는 칸. 고른 값이 있으면 제목 옆에 보이고 펼친다.
  var fgOpen = { g: true, t: true, ve: true, rv: true };
  function fg(key, title, cur, inner) {
    var open = key in fgOpen ? fgOpen[key] : !!cur;
    return '<details class="fg" data-fg="' + key + '"' + (open || cur ? ' open' : '') + '><summary><b>' + title + '</b>' + (cur ? '<em>' + esc(cur) + '</em>' : '') + '</summary><div class="fg-in">' + inner + '</div></details>';
  }
  function rvLab(v) { var r = RV.filter(function (x) { return x[0] === v; })[0]; return r ? r[1] : ''; }
  function emLab(v) { var r = EM.filter(function (x) { return x[0] === v; })[0]; return r ? r[1] : ''; }
  function filters() {
    var h = '', c = st.c;
    if (c === 'ENT') {
      h += fg('g', '기업집단', st.g, select('g', '기업집단', counts(st, 'g', function (x) { return x._grp; }), '모든 기업집단 (102곳)'));
      var kc = counts(st, 'k', function (x) { return x._k; });
      h += fg('k', '업종 대분류', st.k ? KSIC[st.k][0] : '', '<div class="opts">' + Object.keys(KSIC).filter(function (k) { return kc[k] || st.k === k; }).sort(function (a, b) { return (kc[b] || 0) - (kc[a] || 0); }).map(function (k) { return chip('k', k, KSIC[k][0], kc[k], KSIC[k][1]); }).join('') + '</div>');
      var cc = counts(st, 'ct', function (x) { return x.corp_type; }), lc = counts(st, 'ls', function (x) { return has(x.listed_date) ? '1' : ''; });
      h += fg('ct', '구분 · 기업공개', [st.ct, st.ls ? '기업공개' : ''].filter(Boolean).join(' · '), '<div class="opts">' + Object.keys(cc).sort(function (a, b) { return cc[b] - cc[a]; }).map(function (k) { return chip('ct', k, k, cc[k]); }).join('') + (st.ct && !cc[st.ct] ? chip('ct', st.ct, st.ct, 0) : '') + chip('ls', '1', '기업공개(상장) 법인', lc['1']) + '</div>');
    }
    if (c === 'PUB') {
      h += fg('mi', '주무부처', st.mi, select('mi', '주무부처', counts(st, 'mi', function (x) { return x.ministry; }), '모든 주무부처'));
      h += fg('sd', '소재지', st.sd, select('sd', '소재지 시·도', counts(st, 'sd', function (x) { return x.location_sido; }), '모든 시·도'));
    }
    if (c === 'LPI') {
      var dt = counts(st, 'tt', function (x) { return x.type_detail; });
      h += fg('tt', '업무 유형', st.tt, '<div class="opts">' + Object.keys(dt).sort(function (a, b) { return dt[b] - dt[a] || ko(a, b); }).map(function (t) { return chip('tt', t, t, dt[t]); }).join('') + '</div>' +
        '<p class="nt">원자료의 공기업유형(상수도·하수도·지방공단 등)·기관유형(문화·복지·관광, 장학 등) 값 그대로입니다.</p>');
      h += fg('sd', '시·도', st.sd, sidoSelect('sd', '시·도', counts(st, 'sd', function (x) { return x.location_sido; }), '모든 시·도'));
      var rgc = counts(st, 'rg', function (x) { return x.metro; });
      h += fg('rg', '수도권 · 비수도권', st.rg, '<div class="opts">' + METRO.map(function (r) { return chip('rg', r[0], r[1], rgc[r[0]]); }).join('') + '</div>' +
        '<p class="nt">지방공기업은 원자료의 구분을 그대로, 출자·출연기관은 시·도가 서울·인천·경기인지로 나눴습니다.</p>');
      var scc = counts(st, 'sc', function (x) { return x.region_scope; });
      h += fg('sc', '설립 단위', st.sc, '<div class="opts">' + SCOPE.map(function (r) { return chip('sc', r[0], r[1], scc[r[0]], r[0] === '광역' ? '시·도(본청)가 설립한 기관' : '시·군·구가 설립한 기관'); }).join('') + '</div>' +
        '<p class="nt">광역은 시·도(본청)가 설립한 기관, 기초는 시·군·구가 설립한 기관입니다.</p>');
      h += fg('fd', '설립 지자체', st.fd, select('fd', '설립 지자체', counts(st, 'fd', function (x) { return x.founder; }), '모든 설립 지자체'));
    }
    if (c === 'MID') {
      var mk = counts(st, 'k', function (x) { return x._k; });
      h += fg('k', '업종 갈래', st.k ? KSIC[st.k][0] : '', '<div class="opts">' + Object.keys(KSIC).filter(function (k) { return mk[k] || st.k === k; }).sort(function (a, b) { return (mk[b] || 0) - (mk[a] || 0); }).map(function (k) { return chip('k', k, KSIC[k][0], mk[k], KSIC[k][1]); }).join('') + '</div>');
      h += fg('in', '업종', st.in, select('in', '업종', counts(st, 'in', function (x) { return x.industry; }), '모든 업종'));
      h += fg('sd', '소재지', st.sd, select('sd', '소재지 시·도', counts(st, 'sd', function (x) { return x.location_sido; }), '모든 시·도'));
      var mec = counts(st, 'em', function (x) { return x._eb; });
      h += fg('em', '직원 규모', emLab(st.em), '<div class="opts">' + EM.map(function (r) { return chip('em', r[0], r[1], mec[r[0]]); }).join('') + '</div><p class="nt">직원수는 국민연금 가입자수(2026-09)입니다. 대조되지 않은 275곳은 규모를 고르면 빠집니다.</p>');
      var vc = counts(st, 've', function (x) { return x._ve.slice(0, 7); });
      h += fg('ve', '확인서가 끝나는 달', st.ve ? st.ve.replace('-', '년 ') + '월' : '', '<div class="opts">' + Object.keys(vc).sort().map(function (k) { return chip('ve', k, k.replace('-', '년 ') + '월', vc[k]); }).join('') + '</div><p class="nt">중견기업정보마당은 이름·사업자등록번호·확인서 정보만 공개합니다.</p>');
    }
    if (c !== 'MID' && c !== 'LPI') {
      var rc = counts(st, 'rv', function (x) { return x._rb; }), ec = counts(st, 'em', function (x) { return x._eb; });
      h += fg('rv', '매출 규모', rvLab(st.rv), '<div class="opts">' + RV.map(function (r) { return chip('rv', r[0], r[1], rc[r[0]]); }).join('') + '</div>');
      h += fg('em', '직원 규모', emLab(st.em), '<div class="opts">' + EM.map(function (r) { return chip('em', r[0], r[1], ec[r[0]]); }).join('') + '</div>');
    }
    var btc = counts(st, 'bt', function (x) { return x.business_tags || []; });
    if (Object.keys(btc).length || st.bt) h += fg('bt', '고용서비스 허가·등록', st.bt ? (TAGV[st.bt] || {}).label : '', '<div class="opts">' + Object.keys(TAGV).map(function (t) { return chip('bt', t, TAGV[t].label, btc[t], TAGV[t].basis); }).join('') + '</div><p class="nt">고용노동부 공개 명단과 이름·소재지가 맞은 곳만 표시합니다.</p>');
    return h;
  }
  function actives() {
    var a = [];
    if (st.g) a.push(['g', st.g]); if (st.k) a.push(['k', KSIC[st.k] ? KSIC[st.k][0] : st.k]); if (st.in) a.push(['in', st.in]); if (st.k2) a.push(['k2', '산업 갈래 KSIC ' + st.k2]); if (st.bt) a.push(['bt', (TAGV[st.bt] || {}).label || st.bt]);
    if (st.ct) a.push(['ct', st.ct]); if (st.ls) a.push(['ls', '기업공개 법인']);
    if (st.t) a.push(['t', (st.c === 'PUB' ? (PUBNAME[st.t] || st.t) : (LPINAME[st.t] || st.t))]); if (st.tt) a.push(['tt', '업무 ' + st.tt]); if (st.mi) a.push(['mi', st.mi]); if (st.sd) a.push(['sd', st.sd]);
    if (st.rg) a.push(['rg', st.rg]); if (st.sc) a.push(['sc', st.sc + ' 설립']); if (st.fd) a.push(['fd', '설립 ' + st.fd]);
    if (st.ve) a.push(['ve', st.ve.replace('-', '년 ') + '월 만료']);
    if (st.rv) a.push(['rv', '매출 ' + rvLab(st.rv)]); if (st.em) a.push(['em', '직원 ' + emLab(st.em)]);
    return a;
  }
  // 목록 오른쪽: 매출(로그 막대가 왼쪽부터 뻗음)·직원
  function metrics(x, i) {
    var h = '';
    if (x._rev != null) {
      var w = x._rev > 0 ? Math.min(1, Math.max(.03, (Math.log10(x._rev) - LOGLO) / (LOGHI - LOGLO))) : 0;
      h += '<span class="mv"><small>매출</small><em' + (x._rev < 0 ? ' class="neg"' : '') + '>' + wonShort(x._rev) + '</em></span>' + (w ? '<span class="lb" aria-hidden="true"><s style="--w:' + w.toFixed(3) + ';--i:' + i + '"></s></span>' : '');
    }
    if (x._emp != null) h += '<span class="mv"><small>' + (x._c === 'PUB' ? '정원' : x._c === 'MID' ? '가입자' : '직원') + '</small><em>' + fmt(x._emp) + '</em></span>';
    if (st.o === 'ast' && x._ast != null) h += '<span class="mv"><small>자산</small><em>' + wonShort(x._ast) + '</em></span>';
    if ((st.o === 'old' || st.o === 'new') && has(x.established_year)) h += '<span class="mv"><small>설립</small><em>' + x.established_year + '</em></span>';
    if (x._c === 'MID' && x._ve) h += '<span class="mv"><small>확인서</small><em>~' + esc(x._ve.slice(0, 7).replace('-', '.')) + '</em></span>';
    return h ? '<span class="r-m">' + h + '</span>' : '';
  }
  // 「한눈에」: 지금 걸러진 곳들의 구성(도넛)과 매출 규모(막대). 조각·막대를 누르면 그 조건으로 고른다.
  function glancePanel() {
    var c = st.c, key, rows;
    if (!c) { key = 'c'; var cc = counts(st, 'c', function (x) { return x._c; }); var CCOL = { ENT: 'var(--ce)', MID: 'var(--cm)', PUB: 'var(--cp)', LPI: 'var(--cl)' }; rows = CATS.map(function (k) { return { v: k.k, label: k.name, n: cc[k.k] || 0, col: CCOL[k.k] }; }); }
    else if (c === 'ENT') { key = 'k'; var kc = counts(st, 'k', function (x) { return x._k; }); rows = Object.keys(kc).sort(function (a, b) { return kc[b] - kc[a]; }).map(function (k) { return { v: k, label: KSIC[k][0], n: kc[k] }; }); }
    else if (c === 'PUB') { key = 't'; var tc = counts(st, 't', function (x) { return x._pt; }); rows = PUBT.map(function (t) { return { v: t.k, label: t.n, n: tc[t.k] || 0 }; }); rows.push({ v: PUBSUB, label: PUBSUB, n: tc[PUBSUB] || 0 }); }
    else if (c === 'MID') { key = 'k'; var mk2 = counts(st, 'k', function (x) { return x._k; }); rows = Object.keys(mk2).sort(function (a, b) { return mk2[b] - mk2[a]; }).map(function (k) { return { v: k, label: KSIC[k][0], n: mk2[k] }; }); }
    else if (c === 'LPI') { key = 't'; var lt2 = counts(st, 't', function (x) { return x._pt; }); rows = LPIT.map(function (t) { return { v: t.k, label: t.n, n: lt2[t.k] || 0 }; }); }
    else { key = 've'; var vc = counts(st, 've', function (x) { return x._ve.slice(0, 7); }); rows = Object.keys(vc).sort(function (a, b) { return vc[b] - vc[a]; }).map(function (k) { return { v: k, label: k.replace('-', '.') + ' 만료', n: vc[k] }; }); }
    rows = rows.filter(function (r) { return r.n; });
    if (rows.length > 6) { var rest = rows.slice(5).reduce(function (a, r) { return a + r.n; }, 0); rows = rows.slice(0, 5).concat([{ v: '', label: '그 밖 ' + (rows.length - 5) + '갈래', n: rest, col: 'var(--p0)' }]); }
    var tot = rows.reduce(function (a, r) { return a + r.n; }, 0);
    var title = { c: '분류', k: c === 'MID' ? '업종 갈래' : '업종 대분류', t: c === 'LPI' ? '세부 유형' : '기관 유형', ve: '확인서 만료 달' }[key];
    var leg = '<ul class="leg">' + rows.map(function (r, i) {
      var col = r.col || PAL[i % PAL.length], on = r.v && st[key] === r.v, pct = Math.round(r.n / tot * 1000) / 10;
      return '<li>' + (r.v ? '<button type="button" data-k="' + key + '" data-v="' + esc(r.v) + '" aria-pressed="' + on + '">' : '<span>') + '<i style="background:' + col + '"></i><b>' + esc(r.label) + '</b><em>' + fmt(r.n) + '<small>' + pct + '%</small></em>' + (r.v ? '</button>' : '</span>') + '</li>';
    }).join('') + '</ul>';
    var h = '<div class="gl" data-run data-jc-still><div class="gl-a"><h3>' + title + ' 구성 <small>누르면 고릅니다</small></h3><div class="gl-d">' +
      donut(rows.map(function (r, i) { return { v: r.n, col: r.col || PAL[i % PAL.length] }; }), fmt(tot), '곳', title + ' 구성') + leg + '</div></div>';
    if (c === 'LPI') {
      // 지방공공기관은 매출·정원이 없어, 원자료에 있는 시·도 분포를 보여 준다.
      var sdc = counts(st, 'sd', function (x) { return x.location_sido; });
      var srows = SIDO.filter(function (s) { return sdc[s]; }).map(function (s) { return { v: s, label: sidoS(s), n: sdc[s] }; }).sort(function (a, b) { return b.n - a.n; });
      if (srows.length > 7) { var rest = srows.slice(6).reduce(function (a, r) { return a + r.n; }, 0); srows = srows.slice(0, 6).concat([{ v: '', label: '그 밖 ' + (srows.length - 6) + '개 시·도', n: rest }]); }
      h += '<div class="gl-b"><h3>시·도 분포 <small>누르면 고릅니다</small></h3><ul class="leg">' + srows.map(function (r, i) {
        var on = !!r.v && st.sd === r.v;
        return '<li>' + (r.v ? '<button type="button" data-k="sd" data-v="' + esc(r.v) + '" aria-pressed="' + on + '">' : '<span>') + '<i style="background:' + PAL[i % PAL.length] + '"></i><b>' + esc(r.label) + '</b><em>' + fmt(r.n) + '</em>' + (r.v ? '</button>' : '</span>') + '</li>';
      }).join('') + '</ul></div>';
    } else if (c !== 'MID') {
      var rc = counts(st, 'rv', function (x) { return x._rb; });
      h += '<div class="gl-b"><h3>매출 규모 <small>2025 결산 · 누르면 고릅니다</small></h3>' + vbars(RV.slice().reverse().map(function (r) { return { v: r[0], label: r[1], n: rc[r[0]] || 0 }; }), 'rv') + '</div>';
    } else {
      var mec = counts(st, 'em', function (x) { return x._eb; });
      h += '<div class="gl-b"><h3>가입자 규모 <small>국민연금 2026-09 · 누르면 고릅니다</small></h3>' + vbars(EM.slice().reverse().map(function (r) { return { v: r[0], label: r[1], n: mec[r[0]] || 0 }; }), 'em') + '</div>';
    }
    return h + '</div>';
  }
  function updateList() {
    if (view !== 'list') return;
    var home = !st.c && !st.q && !FKEYS.some(function (k) { return st[k]; });
    d.body.toggleAttribute('data-home', home);
    tabs(st.c || 'all');
    var c = st.c ? CK[st.c] : null, cdef = d.getElementById('cdef'), clf = d.getElementById('clf');
    if (cdef) {
      if (c && c.k !== 'PUB' && c.k !== 'LPI') { cdef.className = 'cdef k-' + c.k; cdef.innerHTML = '<b>' + esc(c.full || c.name) + '</b><span>' + esc(c.def) + '</span>'; cdef.hidden = false; }
      else { cdef.className = 'cdef'; cdef.innerHTML = ''; cdef.hidden = true; }
    }
    if (clf) {
      if (c && (c.k === 'PUB' || c.k === 'LPI')) { clf.className = 'clf k-' + c.k; clf.innerHTML = strip(c); clf.hidden = false; }
      else { clf.className = 'clf'; clf.innerHTML = ''; clf.hidden = true; }
    }
    [].forEach.call(d.querySelectorAll('#flB details[data-fg]'), function (el) { fgOpen[el.getAttribute('data-fg')] = el.open; });
    d.getElementById('flB').innerHTML = filters();
    var act = actives();
    d.getElementById('flR').hidden = !act.length;
    var arr = sorted(filtered(st), st), pages = Math.max(1, Math.ceil(arr.length / PER));
    if (st.p > pages) st.p = pages;
    var cur = arr.slice((st.p - 1) * PER, st.p * PER), m = qmap(st.q) || {};
    var sdef = sortOpts(st);
    if (st.q) sdef = [['', '찾는 말과 가까운 순']].concat(sdef.slice(1));
    var sf = SORTF[st.o] || (st.o ? '' : (st.c === 'MID' ? '_emp' : st.c === 'LPI' ? '' : '_rev')), miss = sf ? arr.filter(function (x) { return x[sf] == null || x[sf] === ''; }).length : 0;
    var so = '<label class="so"><span>정렬</span><select name="o" aria-label="정렬">' + sdef.map(function (s) { return '<option value="' + s[0] + '"' + (st.o === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') + '</select></label>';
    var per = '<span class="per" role="group" aria-label="한 쪽에 보일 개수"><span>보기</span>' + PERS.map(function (n) { return '<button type="button" data-per="' + n + '" aria-pressed="' + (n === PER) + '" aria-label="' + n + '개씩 보기">' + n + '</button>'; }).join('') + '</span>';
    var r = '<div class="vw"><button type="button" class="fl-t" id="flOpen">' + IC.filt + '조건' + (act.length ? '<i>' + act.length + '</i>' : '') + '</button>' +
      '<p class="cnt"><b>' + fmt(arr.length) + '</b>곳' + (st.q ? ' · 「' + esc(st.q) + '」' : '') + (miss && !st.q ? ' <small class="fnote">· 정렬 값이 없는 ' + fmt(miss) + '곳은 뒤에</small>' : '') + '</p>' +
      '<button type="button" class="gl-t" id="glBtn" aria-expanded="' + glance + '">' + IC.pie + '한눈에</button>' + so + per + '</div>' +
      (act.length ? '<div class="act">' + act.map(function (a) { return '<button type="button" data-un="' + a[0] + '" aria-label="' + esc(a[1]) + ' 조건 풀기">' + esc(a[1]) + '</button>'; }).join('') + '</div>' : '') +
      (glance && arr.length ? glancePanel() : '');
    if (!arr.length) r += '<p class="empty">조건에 맞는 곳이 없습니다. 검색어를 줄이거나 <a href="#list' + (st.c ? '?c=' + st.c : '') + '">조건을 풀어</a> 보십시오.' + (st.c && st.q ? ' 다른 분류에 있을 수도 있습니다: <a href="' + q1({ q: st.q }) + '">전체에서 찾기</a>' : '') + '</p>';
    else {
      r += '<div class="rows' + (PER > 5 ? ' two' : '') + '" data-jc-still>';
      cur.forEach(function (x, i) {
        var hit = m[x.id] && m[x.id].hit, sub = '';
        if (x._c === 'ENT') sub = (has(x.group) ? '<span class="tg">' + esc(x.group) + '</span>' : '') + (has(x.industry) ? '<span>' + esc(x.industry) + '</span>' : '');
        else if (x._c === 'PUB') sub = '<span class="tg">' + esc(ptype(x)) + '</span>' + (has(x.ministry) ? '<span>' + esc(x.ministry) + '</span>' : '');
        else if (x._c === 'LPI') sub = '<span class="tg">' + esc(ptype(x)) + '</span>' + (has(x.type_detail) ? '<span>' + esc(x.type_detail) + '</span>' : '') + (has(x.founder) ? '<span>' + esc(x.founder) + '</span>' : '');
        else sub = (has(x.industry) ? '<span>' + esc(x.industry) + '</span>' : '') + (has(x.location_sido) ? '<span>' + esc(x.location_sido) + '</span>' : '') || (has(x.biz_no) ? '<span class="code">' + esc(x.biz_no) + '</span>' : '');
        if (x.business_tags && x.business_tags.length) sub += x.business_tags.map(function (t) { return '<span class="bt">' + esc(t) + '</span>'; }).join('');
        r += '<a class="row k-' + x._c + '" href="#' + x.id + '"><span class="r-n">' + hl(x.name, st.q) + '</span>' +
          '<span class="r-s"><span class="ty">' + esc(CK[x._c].full || CK[x._c].name) + '</span>' + sub + '</span>' +
          descLine(x, hit, st.q) +
          (hit && (hit.k === 'ceo' || hit.k === 'hq' || hit.k === 'sum' || hit.k === 'prod' || hit.k === 'tag') ? snippet(hit, st.q) : '') + metrics(x, i) + '</a>';
      });
      r += '</div>' + pager(st.p, pages);
    }
    d.getElementById('res').innerHTML = r;
    var g = d.querySelector('#res .gl'); if (g) requestAnimationFrame(function () { g.classList.add('run'); });
  }
  function pager(p, n) {
    if (n <= 1) return '';
    var w = window.innerWidth < 400 ? 1 : 2, h = '<nav class="pg" aria-label="쪽 나누기"><button type="button" data-p="' + (p - 1) + '"' + (p <= 1 ? ' disabled' : '') + ' aria-label="앞 쪽">‹</button>', last = 0;
    for (var i = 1; i <= n; i++) {
      if (i === 1 || i === n || Math.abs(i - p) <= w) { if (last && i - last > 1) h += '<span>…</span>'; h += '<button type="button" data-p="' + i + '"' + (i === p ? ' aria-current="page"' : '') + '>' + i + '</button>'; last = i; }
    }
    return h + '<button type="button" data-p="' + (p + 1) + '"' + (p >= n ? ' disabled' : '') + ' aria-label="다음 쪽">›</button></nav>';
  }

  /* ---------- 한 곳 ---------- */
  function sec(title, inner, cls, tag) { return '<section class="sec' + (cls ? ' ' + cls : '') + '"><h2>' + esc(title) + (tag ? ' <small>' + esc(tag) + '</small>' : '') + '</h2>' + inner + '</section>'; }
  function lk(href, text) { return '<a href="' + href + '">' + esc(text) + '</a>'; }
  function q1(o) { return listHash(fix(Object.assign(blank(), o))); }
  // 하는 일: "; " "□" "1." 으로 이어 적힌 공시 문장을 항목으로 나누고, 처음엔 셋만
  function doesBlock(s) {
    var parts = String(s).split(/\s*;\s*|\s*□\s*/).map(function (p) { return p.replace(/^\s*(?:\d{1,2}|[①-⑳]|[가-하])\s*[.)]\s*/, '').trim(); }).filter(function (p) { return p.length > 1; });
    if (parts.length < 2) return '<p class="t">' + esc(s) + '</p>';
    var more = parts.length - 3;
    return '<ol class="does' + (more > 0 ? ' cut' : '') + '">' + parts.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ol>' +
      (more > 0 ? '<button type="button" class="more-b" data-more>나머지 ' + more + '개 더 보기</button>' : '');
  }
  // 숫자 칸: 처음엔 값 하나. 누르면 아래 판이 열리며 도넛이 펴지고 막대가 차오른다.
  var MET = {
    _rev: { lab: '매출', pub: '매출(수익)', unit: won, short: function (v) { return wonShort(v) + ' 원'; }, asof: function (x) { return (x.revenue_year ? x.revenue_year + ' 결산' : '') + (has(x.revenue_as_of) ? ' · ' + x.revenue_as_of : ''); } },
    _emp: { lab: '종업원', pub: '정원', unit: function (v) { return fmt(v) + '명'; }, short: ppl, asof: function (x) { return (x._c === 'PUB' ? '임직원 총계(A+B+C) · ' : x._c === 'MID' ? '국민연금 가입자수 · ' : '') + (x.employees_as_of || ''); } },
    _ast: { lab: '자산총액', pub: '자산총액', unit: won, short: function (v) { return wonShort(v) + ' 원'; }, asof: function (x) { return x.total_assets_as_of || ''; } }
  };
  function pool(x) {
    if (x._c === 'ENT' && x._grp[0]) return { name: x._grp[0] + ' 소속 ' + GRP[x._grp[0]].length + '곳', list: GRP[x._grp[0]] };
    if (x._c === 'PUB' && has(x.ministry)) { var L = ITEMS.filter(function (y) { return y._c === 'PUB' && y.ministry === x.ministry; }); return { name: x.ministry + ' 소관 ' + L.length + '곳', list: L }; }
    return null;
  }
  function tiles(x) {
    if (x._c === 'MID') {
      var h0 = '';
      if (x._emp != null) h0 += '<button type="button" class="tile" data-tile="_emp" aria-expanded="false"><span>국민연금 가입자</span><b>' + ppl(x._emp) + '</b><i>눌러서 보기</i></button>';
      if (x._ve) {
        var from0 = (String(x.certificate_valid).match(/^(\d{4}-\d{2}-\d{2})/) || [])[1], a0 = Date.parse(from0), b0 = Date.parse(x._ve), n0 = Date.parse(TODAY);
        if (a0 && b0 && b0 > a0) {
          var left0 = Math.round((b0 - n0) / 864e5);
          h0 += '<button type="button" class="tile" data-tile="cert" aria-expanded="false"><span>확인서 남은 기간</span><b>' + (left0 >= 0 ? fmt(left0) + '일' : '지남') + '</b><i>눌러서 보기</i></button>';
        }
      }
      return h0 ? '<section class="tl k-MID"><h2 class="tl-h">숫자로 보기 <small>공시·가입자 원값 · 누르면 그림으로 풀어 봅니다</small></h2><div class="tl-row">' + h0 + '</div><div class="tl-p" id="tlP" hidden></div></section>' : '';
    }
    var h = '';
    ['_rev', '_emp', '_ast'].forEach(function (f) {
      if (x[f] == null) return;
      var M = MET[f];
      h += '<button type="button" class="tile" data-tile="' + f + '" aria-expanded="false"><span>' + (x._c === 'PUB' ? M.pub : M.lab) + '</span><b' + (x[f] < 0 ? ' class="neg"' : '') + '>' + M.short(x[f]) + '</b><i>눌러서 보기</i></button>';
    });
    return h ? '<section class="tl k-' + x._c + '"><h2 class="tl-h">숫자로 보기 <small>공시 원값 · 누르면 그림으로 풀어 봅니다</small></h2><div class="tl-row">' + h + '</div><div class="tl-p" id="tlP" hidden></div></section>' : '';
  }
  function tilePanel(x, f) {
    if (f === 'cert') {
      var from = (String(x.certificate_valid).match(/^(\d{4}-\d{2}-\d{2})/) || [])[1], t0 = Date.parse(from), t1 = Date.parse(x._ve), tn = Date.parse(TODAY);
      var all = Math.round((t1 - t0) / 864e5), gone = Math.max(0, Math.min(all, Math.round((tn - t0) / 864e5))), left = all - gone;
      return '<div class="tp tp-cert"><div class="tp-d">' + donut([{ v: gone, col: 'var(--p0)' }, { v: left, col: 'var(--c)' }], left >= 0 ? fmt(left) + '일' : '지남', '남음', '유효기간 ' + all + '일 가운데 ' + gone + '일 지남') +
        '<ul class="leg"><li><span><i style="background:var(--p0)"></i><b>지난 날</b><em>' + fmt(gone) + '일</em></span></li><li><span><i style="background:var(--c)"></i><b>남은 날</b><em>' + fmt(left) + '일</em></span></li></ul></div>' +
        '<div class="tp-t"><p class="tp-big"><b>' + esc(from) + '</b> → <b>' + esc(x._ve) + '</b></p><p>오늘(' + TODAY + ')은 유효기간 ' + fmt(all) + '일 가운데 ' + fmt(gone) + '일째입니다. 중견기업 확인서는 직전 사업연도 실적으로 해마다 다시 발급받습니다.</p></div></div>';
    }
    var M = MET[f], v = x[f], P = pool(x), D = DIST[x._c + f], h = '<div class="tp">';
    if (P && v > 0) {
      var sum = P.list.reduce(function (a, y) { return a + (y[f] > 0 ? y[f] : 0); }, 0), share = v / sum, pct = share * 100;
      if (P.list.length > 1 && sum > v) {
        h += '<div class="tp-d">' + donut([{ v: v, col: 'var(--c)' }, { v: sum - v, col: 'var(--p0)' }], (pct < 1 ? pct.toFixed(1) : Math.round(pct)) + '%', x._c === 'PUB' ? '부처 합 중' : '집단 합 중', P.name + ' 합계 가운데 ' + pct.toFixed(1) + '%') +
          '<p class="tp-s">' + esc(P.name) + '의 ' + (x._c === 'PUB' ? M.pub : M.lab) + ' 합 <b>' + M.short(sum) + '</b> 가운데 이곳이 차지하는 몫</p></div>';
      }
    }
    h += '<div class="tp-t"><p class="tp-big"><b' + (v < 0 ? ' class="neg"' : '') + '>' + M.unit(v) + '</b><small>' + esc(M.asof(x)) + '</small></p>';
    if (f !== '_emp') h += '<p class="ex">' + esc(wonFull(v)) + '</p>';
    if (D && v > 0) {
      var bins = '';
      D.bins.forEach(function (n, i) { bins += '<i' + (i === x[f + 'B'] ? ' class="me"' : '') + ' style="--h:' + (n ? Math.max(.06, n / D.max) : 0).toFixed(3) + ';--i:' + i + '"></i>'; });
      var r = x[f + 'R'], top = r / D.n * 100, fv = f === '_emp' ? ppl : function (z) { return wonShort(z); };
      h += '<div class="hist" role="img" aria-label="' + esc(CK[x._c].name + ' ' + fmt(D.n) + '곳 가운데 ' + fmt(r) + '번째') + '">' + bins + '</div>' +
        '<p class="hist-a" aria-hidden="true"><span>' + fv(D.lo) + '</span><span>작은 곳 ← 로그 눈금 → 큰 곳</span><span>' + fv(D.hi) + '</span></p>' +
        '<p class="rank">색칠한 막대가 이곳입니다. ' + esc(CK[x._c].name) + ' ' + fmt(D.n) + '곳 중 <b>' + fmt(r) + '번째</b>' + (top <= 50 ? ' · 상위 ' + (top < 1 ? Math.max(.1, Math.ceil(top * 10) / 10).toFixed(1) : Math.ceil(top)) + '%' : '') + '</p>';
    }
    if (f === '_rev' && v > 0 && x._emp) h += '<p class="tp-n">' + (x._c === 'PUB' ? '정원' : '직원') + ' 한 사람당 매출로 나누면 약 <b>' + wonShort(Math.round(v / x._emp)) + ' 원</b>입니다(단순 나눗셈).</p>';
    if (v < 0) h += '<p class="tp-n">음수 매출은 투자조합·펀드성 법인의 원자료 값(손실)입니다.</p>';
    return h + '</div></div>';
  }
  function openTile(btn) {
    var x = BYID[curId], p = d.getElementById('tlP'); if (!x || !p) return;
    var f = btn.getAttribute('data-tile'), on = btn.getAttribute('aria-expanded') !== 'true';
    [].forEach.call(main.querySelectorAll('[data-tile]'), function (b) { b.setAttribute('aria-expanded', String(on && b === btn)); });
    if (!on) { p.hidden = true; p.innerHTML = ''; return; }
    p.innerHTML = tilePanel(x, f); p.hidden = false;
    var tp = p.firstChild; requestAnimationFrame(function () { requestAnimationFrame(function () { tp.classList.add('run'); }); });
    var r = p.getBoundingClientRect(); if (r.bottom > window.innerHeight) window.scrollBy({ top: Math.min(r.bottom - window.innerHeight + 24, r.top - 140), behavior: 'smooth' });
  }
  function byRev(a, b) { return cmpNum('_rev', 1)(a, b) || cmpNum('_emp', 1)(a, b) || ko(a._n, b._n); }
  var curId = '';
  function renderItem(id) {
    view = 'item'; curId = id;
    var x = BYID[id], c = CK[x._c];
    d.body.removeAttribute('data-home'); tabs(x._c);
    var back = lastList || listHash(st);
    /* 명함 앞면(핵심)과 뒷면(상세) */
    var fr = '', bk = '';
    function row(side, label, v) { var s = '<dt>' + label + '</dt><dd>' + v + '</dd>'; if (side) fr += s; else bk += s; }
    if (x._c === 'ENT') {
      if (x._grp.length) row(1, '기업집단', x._grp.map(function (g) { return lk(q1({ c: 'ENT', g: g }), g); }).join(' · '));
      if (has(x.industry)) row(1, '업종', lk(q1({ c: 'ENT', in: x.industry }), x.industry));
      if (has(x.ceo)) row(0, '대표자', esc(x.ceo));
      if (has(x.established_year)) row(0, '설립', x.established_year + '년');
      if (has(x.listed_date)) row(0, '기업공개', '<span class="code">' + esc(x.listed_date) + '</span>');
      if (has(x.corp_type)) row(0, '구분', lk(q1({ c: 'ENT', ct: x.corp_type }), x.corp_type));
      if (x._k) row(0, '산업분류', lk(q1({ c: 'ENT', k: x._k }), KSIC[x._k][1]) + (has(x.ksic_code) ? ' <span class="code">' + esc(x.ksic_code) + '</span>' : ''));
      if (has(x.corp_reg_no)) row(0, '법인번호', '<span class="code">' + esc(x.corp_reg_no) + '</span>');
      if (has(x.biz_no)) row(0, '사업자번호', '<span class="code">' + esc(String(x.biz_no).replace(/^(\d{3})(\d{2})(\d{5})$/, '$1-$2-$3')) + '</span>');
    } else if (x._c === 'PUB') {
      row(1, '기관 유형', lk(q1({ c: 'PUB', t: x._pt }), ptype(x)));
      if (x._sub) { var pr = BYN[norm(x._sub)]; row(1, '모기관', pr ? lk('#' + pr.id, x._sub) : esc(x._sub)); }
      if (has(x.ministry)) row(1, '주무부처', lk(q1({ c: 'PUB', mi: x.ministry }), x.ministry));
      if (has(x.ceo)) row(0, '기관장', esc(String(x.ceo).replace(/^([가-힣]) ([가-힣]) ([가-힣])$/, '$1$2$3')));
      if (has(x.established_year)) row(0, '설립', x.established_year + '년');
      if (has(x.headquarters)) row(0, '소재지', (has(x.location_sido) ? lk(q1({ c: 'PUB', sd: x.location_sido }), x.location_sido) + ' ' : '') + esc(String(x.headquarters).replace(x.location_sido || '\u0000', '').trim()));
      var u0 = safeUrl(x.official_url); if (u0) row(0, '홈페이지', '<a href="' + esc(u0) + '" target="_blank" rel="noopener noreferrer">' + esc(host(u0)) + '</a>');
      if (has(x.source_ref)) row(0, '공시 기준', esc(String(x.source_ref).replace(/;\s*/g, ' · ').replace(/임직원수/g, '임직원 수').replace(/손익/g, '손익계산서')));
    } else if (x._c === 'LPI') {
      row(1, '세부 유형', lk(q1({ c: 'LPI', t: x.sub_category }), ptype(x)));
      if (has(x.type_detail)) row(1, '업무 유형', lk(q1({ c: 'LPI', tt: x.type_detail }), x.type_detail));
      if (has(x.founder)) row(1, '설립 지자체', lk(q1({ c: 'LPI', fd: x.founder }), x.founder));
      if (has(x.location_sido)) row(0, '시·도', lk(q1({ c: 'LPI', sd: x.location_sido }), sidoS(x.location_sido)));
      row(0, '설립 단위', lk(q1({ c: 'LPI', sc: x.region_scope }), x.region_scope === '광역' ? '광역 · 시·도(본청)' : '기초 · 시·군·구') + (has(x.metro) ? ' · ' + lk(q1({ c: 'LPI', rg: x.metro }), x.metro) : ''));
      if (has(x.operating)) row(0, '운영 구분', x.operating === '직영' ? '직영(지자체 직접 운영)' : '간접(지자체 출자 법인)');
      if (has(x.note)) row(0, '원자료 비고', esc(x.note));
      if (has(x.source_no)) row(0, '원자료 연번', '<span class="code">' + esc(x.source) + ' ' + esc(x.source_no) + '</span>');
    } else {
      if (has(x.industry)) row(1, '업종', lk(q1({ c: 'MID', in: x.industry }), x.industry));
      if (has(x.main_products)) row(1, '주요 사업', esc(x.main_products));
      if (has(x.location_sido)) row(1, '소재지', lk(q1({ c: 'MID', sd: x.location_sido }), x.location_sido) + (has(x.headquarters) ? ' ' + esc(String(x.headquarters).replace(String(x.location_sido || '\u0000'), '').trim()) : ''));
      if (x._ve) row(1, '확인서', '~ <span class="code">' + esc(x._ve) + '</span>까지 유효');
      if (has(x.biz_no)) row(0, '사업자번호', '<span class="code">' + esc(x.biz_no) + '</span>');
      if (x._k) row(0, '산업 갈래', lk(q1({ c: 'MID', k: x._k }), KSIC[x._k][1]) + (has(x.industry_code) ? ' <span class="code">' + esc(x.industry_code) + '</span>' : ''));
      if (has(x.employees)) row(0, '국민연금 가입자', fmt(x.employees) + '명 <span class="code">' + esc(x.employees_as_of || '') + '</span>' + (x.nps_workplaces > 1 ? ' · 사업장 ' + fmt(x.nps_workplaces) + '곳 합산' : ''));
      if (has(x.certificate_no)) row(0, '발급번호', '<span class="code">' + esc(x.certificate_no) + '</span>');
      if (has(x.certificate_valid)) row(0, '유효기간', '<span class="code">' + esc(x.certificate_valid) + '</span>');
      if (has(x.stock_code)) row(0, '상장', esc(x.market || '상장') + ' <span class="code">' + esc(x.stock_code) + '</span>' + (has(x.listed_at) ? ' · ' + esc(String(x.listed_at).slice(0, 4)) + '년' : '') + (has(x.market_sector) ? ' · ' + esc(x.market_sector) : ''));
      var um = safeUrl(x.official_url); if (um) row(0, '홈페이지', '<a href="' + esc(um) + '" target="_blank" rel="noopener noreferrer">' + esc(host(um)) + '</a>' + (x.official_url_checked === 'sources' ? ' <span class="code">출처 대조</span>' : ''));
      if (has(x.industry)) row(0, '업종·가입자 출처', '국민연금 가입 사업장 내역 <span class="code">2026-09</span>');
      row(0, '공개 범위', has(x.biz_no) && has(x.certificate_no) ? '이름·사업자등록번호·확인서는 중견기업정보마당, 업종·가입자수·사업장 주소는 국민연금 가입 사업장 공개 자료입니다.' : '중견기업정보마당은 확인서 발급기업의 이름·사업자등록번호·발급번호·유효기간만 공개합니다.');
    }
    var seal = x._c === 'PUB' ? '<span class="seal round" aria-hidden="true">공공<br>기관</span>' : x._c === 'MID' ? '<span class="seal" aria-hidden="true">확인서<br>발급</span>' : x._c === 'LPI' ? '<span class="seal round" aria-hidden="true">지방<br>공공</span>' : '<span class="seal" aria-hidden="true">공시<br>대상</span>';
    var flipB = function (t) { return '<button type="button" class="flip-b" data-flip aria-label="' + t + '">' + IC.turn + '<span>' + t + '</span></button>'; };
    var card = '<div class="flip k-' + x._c + '" id="flip"><div class="flip-in">' +
      '<article class="card face front"><p class="card-top"><b>' + esc(c.name) + '</b><span>' + esc((x.sources || [x.source]).filter(Boolean).map(function (id) { return (x._c === 'LPI' && SRC[id] && SRC[id].short) ? SRC[id].short : id; }).join(' · ')) + '</span><span class="code">' + esc(x.id) + '</span></p>' + seal +
      '<div class="card-id"><span class="mono" aria-hidden="true">' + esc(initial(x)) + '</span><div><h1>' + esc(x.name) + '</h1><p class="sub">' + esc(lineOf(x)) + '</p></div></div>' +
      (fr ? '<dl>' + fr + '</dl>' : '') + (bk ? '<div class="card-ft">' + flipB('뒷면 · 상세 정보') + '</div>' : '') + '</article>' +
      (bk ? '<article class="card face back" inert aria-label="명함 뒷면"><p class="card-top"><b>상세 정보</b><span class="code">' + esc(x.id) + '</span></p><dl>' + bk + '</dl><div class="card-ft">' + flipB('앞면으로') + '</div></article>' : '') +
      '</div></div>';
    /* 본문 */
    var b = '';
    if (x._c === 'PUB' && x._sub) b += sec('부설기관', '<p class="t">알리오가 <b>' + esc(x._sub) + '</b> 산하 부설기관으로 함께 공시합니다. 2026년 지정 공공기관 342곳에는 따로 세지 않습니다. 알리오가 적은 기관 유형은 <b>' + esc(PUBNAME[x.sub_category] || x.sub_category) + '</b>입니다.</p>', '', '알리오 부설기관');
    if (x._c === 'PUB') {
      b += profSec(x) || sec('무슨 기관인가', '<p class="t">' +
        (has(x.ministry) ? esc(x.ministry) + ' 소관 ' : '') + esc(ptype(x)) + '입니다. ' +
        (num(x.established_year) ? esc(x.established_year) + '년에 설립했고 ' : '') +
        (has(x.location_sido) ? esc(x.location_sido) + '에 있습니다. ' : '') +
        '알리오에 공시된 설립목적·주요사업은 아래 「하는 일」에 그대로 실었습니다.</p>' +
        '<p class="t fnote">기관의 사업 설명은 알리오 공시를 그대로 옮겼고, 이 화면이 따로 만들지 않았습니다.</p>', '', '알리오 · 공공기관 일반현황');
    }
    if (x._c === 'PUB' && has(x.business_summary)) b += sec('하는 일', doesBlock(x.business_summary), '', '설립목적·주요사업 공시');
    if (x._c === 'LPI') {
      var how = {
        '지방직영기업': '지방자치단체가 공기업특별회계를 두고 직접 사업을 수행하는 기업입니다(직영).',
        '지방공사·공단': '지방자치단체가 자본금의 50% 이상을 출자해 세운 법인입니다(간접경영).',
        '출자기관': '지방자치단체가 자본금의 전부 또는 일부(10% 이상)를 출자해 설립한 주식회사입니다.',
        '출연기관': '지방자치단체가 재산의 전부 또는 일부를 출연해 설립한 재단법인입니다.'
      }[x.sub_category] || '';
      b += (profSec(x) || sec('무슨 기관인가', '<p class="t">' +
        (has(x.founder) ? '설립기관이 <b>' + esc(x.founder) + '</b>로 적힌 ' : '') + esc(ptype(x)) + '입니다. ' + how +
        (has(x.type_detail) ? ' 행정안전부 현황에 적힌 업무 유형은 <b>' + esc(x.type_detail) + '</b>입니다.' : '') +
        (has(x.location_sido) ? ' 시·도는 ' + esc(x.location_sido) + '입니다.' : '') + '</p>' +
        '<p class="t fnote">행정안전부 현황은 기관 명칭·구분·지역·설립 지자체·유형만 공개합니다. 매출·직원(정원)·설립일·홈페이지는 원자료에 없어 싣지 않았습니다.</p>', '', '행정안전부 현황 2026.6.30'));
    }
    if (x._c === 'ENT') {
      var rk = x._rev > 0 ? ENTREV.indexOf(x) + 1 : 0;
      var sameInd = has(x.industry) ? ITEMS.filter(function (y) { return y._c === 'ENT' && y.industry === x.industry; }).length : 0;
      var entPar = '<p class="t">' +
        (x._grp.length ? '공정거래위원회 공시대상기업집단 <b>' + esc(x._grp.join(' · ')) + '</b> 소속 법인입니다. ' : '') +
        (has(x.industry) ? '공정위에 신고된 주된 영위업종은 <b>' + esc(x.industry) + '</b>' + (has(x.ksic_code) ? '(KSIC <span class="code">' + esc(x.ksic_code) + '</span>' + (x._k ? ' · ' + esc(KSIC[x._k][0]) : '') + ')' : '') + '입니다. ' : '') +
        (num(x.established_year) ? esc(x.established_year) + '년에 설립했고' + (has(x.listed_date) ? ', 증시에 상장된 법인입니다. ' : ', 비상장 법인입니다. ') : (has(x.listed_date) ? '증시에 상장된 법인입니다. ' : '')) +
        (sameInd > 1 ? '같은 업종을 신고한 대기업 소속 법인이 ' + fmt(sameInd) + '곳 있습니다. ' : '') +
        (rk ? '매출 기준으로 대기업 집단 소속 ' + fmt(ENTREV.length) + '곳 가운데 ' + fmt(rk) + '번째입니다.' : '') + '</p>' +
        '<p class="t fnote">신고 업종은 회사마다 <b>하나</b>만 적히므로, 여러 사업을 하는 회사의 전체 사업을 다 나타내지는 않습니다. 주요 사업·공식 홈페이지·소재지는 원자료 없음.</p>';
      b += profSec(x) + (x._px ? sec('원자료에 적힌 것', entPar, '', '공정위 기업집단포털 · KSIC 기준') : sec('무슨 회사인가', entPar, '', '공정위 기업집단포털 · KSIC 기준'));
    }
    if (x._c === 'MID' && (has(x.industry) || has(x.employees) || x._px)) {
      var midPar = '<p class="t">' +
        (has(x.sector) ? '<b>' + esc(x.sector) + '</b> 분야 중견기업입니다. ' : '') +
        (has(x.industry) ? '국민연금 사업장으로 신고된 업종은 <b>' + esc(x.industry) + '</b>' + (/업$/.test(x.industry) ? '입니다. ' : '입니다 — 업종이 아닌 직업명으로 신고된 값이라 실제 사업과 다를 수 있습니다. ') : '') +
        (has(x.location_sido) ? '사업장 소재지는 ' + esc(x.location_sido) + (x.nps_workplaces > 1 ? ' 등 ' + fmt(x.nps_workplaces) + '곳' : '') + '이고, ' : '') +
        (has(x.employees) ? '2026년 9월 기준 국민연금 가입자는 ' + fmt(x.employees) + '명입니다.' : '') +
        (has(x.stock_code) ? ' ' + esc(x.market || '') + '에 상장된 법인입니다(<span class="code">' + esc(x.stock_code) + '</span>' + (has(x.listed_at) ? ', ' + esc(String(x.listed_at).slice(0, 4)) + '년 상장' : '') + ').' : '') +
        (has(x.market_sector) ? ' 증권업종 분류는 ' + esc(x.market_sector) + '입니다.' : '') + '</p>' +
        (has(x.industry) ? '<p class="t fnote">국민연금 신고 업종은 사업장 하나의 업종이어서, 아웃소싱·고용서비스처럼 여러 사업을 하는 회사는 실제 사업과 다를 수 있습니다.</p>' : '');
      b += profSec(x) + (x._px ? sec('원자료에 적힌 것', midPar, '', '국민연금 가입 사업장 · 상장 종목 정보 기준') : sec('무슨 회사인가', midPar, '', '국민연금 가입 사업장 · 상장 종목 정보 기준'));
    }
    if (x.business_tags_detail && x.business_tags_detail.length) b += sec('고용서비스 허가·등록', '<ul class="btl">' + x.business_tags_detail.map(function (t) {
      var v = TAGV[t.tag] || {}, S = SRC[t.source] || {};
      return '<li><b>' + esc(v.label || t.tag) + '</b><span>' + esc(v.basis || '') + '</span><span>' + [t.license_no ? '허가번호 ' + t.license_no : '', t.office ? t.office + ' 관할' : '', '기준 ' + t.as_of].filter(Boolean).map(esc).join(' · ') + '</span><span class="nt">' + esc(S.name || t.source) + (t.match === 'district' ? ' · 이름과 시·군·구까지 일치' : ' · 이름과 주소 일치') + '</span></li>';
    }).join('') + '</ul>', '', '고용노동부 공개 명단 대조');
    if (x._c === 'MID' && has(x.main_products)) b += sec('주요 사업', '<p class="t">' + esc(x.main_products) + '</p>', '', x.main_products_source === 'WIKI' ? '위키백과 첫 문장에서 확인' : '상장사 기업개요에서 확인');
    if (x._c === 'MID' && has(x.official_url)) b += sec('공식 홈페이지', '<p class="t"><a href="' + esc(safeUrl(x.official_url)) + '" target="_blank" rel="noopener noreferrer">' + esc(safeUrl(x.official_url)) + '</a></p>', '', x.official_url_checked === 'sources' ? '출처 2곳 일치(사이트 직접 접속은 확인 못함)' : '접속해 회사명·사업자번호 대조');
    if (x._c === 'MID') b += sec('목록에 대해', '<p class="t">정부는 중견기업 전체 명단을 공개하지 않습니다. 이 목록은 확인서를 받은 기업만 담은 하한 집합이어서, 법적으로 중견기업이어도 확인서를 받지 않았으면 빠집니다. 업종·가입자수·소재지는 이름과 사업자등록번호 앞 6자리가 같은 국민연금 사업장을 찾아 붙인 값이고, 주요 사업은 위키백과·상장사 기업개요에서 확인된 것만, 홈페이지는 실제로 접속해 회사명이 확인된 것만 실었습니다.</p>');
    /* 옆 칸: 함께 보기 */
    var s2 = '';
    if (x._c === 'ENT') x._grp.forEach(function (g) {
      var L = (GRP[g] || []).slice().sort(byRev);
      s2 += '<section class="box s2 k-ENT" data-run><h2>' + esc(g) + ' 소속회사<small>' + fmt(L.length) + '곳 · 매출 순</small></h2>' + hbars(L, x, '_rev', function (v) { return wonShort(v); }, 6) +
        (L.length > 6 ? '<a class="more" href="' + q1({ c: 'ENT', g: g }) + '">' + fmt(L.length) + '곳 모두 보기 ›</a>' : '') + '</section>';
    });
    if (x._c === 'ENT') {
      /* 같은 집합을 양쪽 화면에 똑같이 보여 준다: A 화면에 B가 있으면 B 화면에도 같은 묶음으로 A가 있다 */
      var relSec = function (L, title, sub, href) {
        L = L.slice().sort(byRev); if (L.length < 2) return '';
        var top = L.slice(0, 6); if (top.indexOf(x) < 0) top = top.slice(0, 5).concat([x]);
        return '<section class="box s2 k-ENT" data-run><h2>' + esc(title) + '<small>' + fmt(L.length) + '곳 · 매출 순' + (sub ? ' · ' + esc(sub) : '') + '</small></h2>' + hbars(top, x, '_rev', function (v) { return wonShort(v); }, top.length) +
          (L.length > top.length ? '<a class="more" href="' + href + '">' + fmt(L.length) + '곳 모두 보기 ›</a>' : '') + '</section>';
      };
      if (has(x.industry)) s2 += relSec(ITEMS.filter(function (y) { return y._c === 'ENT' && y.industry === x.industry; }), '같은 업종 · ' + x.industry, '공정위 주된 업종이 같은 곳', q1({ c: 'ENT', in: x.industry }));
      if (x._k2) s2 += relSec(ITEMS.filter(function (y) { return y._k2 === x._k2; }), '같은 산업 갈래 · KSIC ' + x._k2, '업종 코드 앞 세 자리가 같은 곳', q1({ c: 'ENT', k2: x._k2 }));
    }
    (x.business_tags || []).forEach(function (t) {
      var L = (TAGS[t] || []).slice().sort(function (a, b) { return cmpNum('_emp', 1)(a, b) || ko(a._n, b._n); }); if (L.length < 2) return;
      s2 += '<section class="box s2" data-run><h2>같은 허가·등록 · ' + esc((TAGV[t] || {}).label || t) + '<small>' + fmt(L.length) + '곳 · 대기업·중견·공공 함께 · 인원 순</small></h2>' + hbars(L, x, '_emp', function (v) { return ppl(v); }, 6) +
        (L.length > 6 ? '<a class="more" href="' + q1({ bt: t }) + '">' + fmt(L.length) + '곳 모두 보기 ›</a>' : '') + '</section>';
    });
    if (x._c === 'MID' && has(x.industry)) {
      var MI = ITEMS.filter(function (y) { return y._c === 'MID' && y.industry === x.industry; }).sort(function (a, b) { return cmpNum('_emp', 1)(a, b) || ko(a._n, b._n); });
      if (MI.length > 1) s2 += '<section class="box s2 k-MID" data-run><h2>' + esc(x.industry) + '<small>' + fmt(MI.length) + '곳 · 가입자 순</small></h2>' + hbars(MI, x, '_emp', function (v) { return fmt(v) + '명'; }, 6) +
        (MI.length > 6 ? '<a class="more" href="' + q1({ c: 'MID', in: x.industry }) + '">' + fmt(MI.length) + '곳 모두 보기 ›</a>' : '') + '</section>';
    }
    if (x._c === 'PUB' && has(x.ministry)) {
      var P = ITEMS.filter(function (y) { return y._c === 'PUB' && y.ministry === x.ministry; }).sort(function (a, b) { return cmpNum('_emp', 1)(a, b) || ko(a._n, b._n); });
      if (P.length > 1) s2 += '<section class="box s2 k-PUB" data-run><h2>' + esc(x.ministry) + ' 소관<small>' + fmt(P.length) + '곳 · 정원 순</small></h2>' + hbars(P, x, '_emp', function (v) { return fmt(v) + '명'; }, 6) +
        (P.length > 6 ? '<a class="more" href="' + q1({ c: 'PUB', mi: x.ministry }) + '">' + fmt(P.length) + '곳 모두 보기 ›</a>' : '') + '</section>';
    }
    if (x._c === 'LPI') {
      // 지방공공기관은 매출·정원이 없어 숫자 막대 대신 이름 목록으로 잇는다.
      var bx = function (title, sub, list, href) {
        if (list.length < 2) return '';
        list = list.slice().sort(function (a, b) { return ko(a._n, b._n); });
        var top = list.slice(0, 8);
        return '<section class="box s2 k-LPI"><h2>' + esc(title) + '<small>' + fmt(list.length) + '곳' + (sub ? ' · ' + esc(sub) : '') + '</small></h2><ul class="mates">' + top.map(function (y) {
          return '<li><a href="#' + y.id + '"' + (y.id === x.id ? ' aria-current="page"' : '') + '><span>' + esc(y.name) + '</span><i>' + esc(y.type_detail || y.sub_category) + '</i></a></li>';
        }).join('') + '</ul>' + (list.length > top.length ? '<a class="more" href="' + href + '">' + fmt(list.length) + '곳 모두 보기 ›</a>' : '') + '</section>';
      };
      if (has(x.founder)) s2 += bx(x.founder + ' 설립', '같은 지자체가 세운 기관 · 이름순', ITEMS.filter(function (y) { return y._c === 'LPI' && y.founder === x.founder; }), q1({ c: 'LPI', fd: x.founder }));
      if (has(x.type_detail)) s2 += bx('같은 업무 유형 · ' + x.type_detail, '원자료 유형이 같은 곳 · 이름순', ITEMS.filter(function (y) { return y._c === 'LPI' && y.type_detail === x.type_detail; }), q1({ c: 'LPI', tt: x.type_detail }));
    }
    var same = (SAME[x._c + '|' + x._n] || []).filter(function (y) { return y.id !== x.id; });
    if (same.length) s2 += '<section class="box s2"><h2>이름이 같은 다른 법인<small>' + same.length + '곳</small></h2><ul class="mates">' + same.slice(0, 8).map(function (y) { return '<li><a href="#' + y.id + '"><span>' + esc(y.name) + '</span><i>' + esc(y.id.slice(4)) + '</i></a></li>'; }).join('') + '</ul><p class="src">같은 이름이라도 번호가 다른 별개 회사입니다.</p></section>';
    var near = [];
    if (x._c === 'ENT' && x._k) near.push([q1({ c: 'ENT', k: x._k }), '업종 대분류 · ' + KSIC[x._k][0], ITEMS.filter(function (y) { return y._k === x._k; }).length]);
    if (x._c === 'PUB') near.push([q1({ c: 'PUB', t: x._pt }), ptype(x) + ' 전체', ITEMS.filter(function (y) { return y._pt === x._pt && y._c === 'PUB'; }).length]);
    if (x._c === 'PUB' && has(x.location_sido)) near.push([q1({ c: 'PUB', sd: x.location_sido }), x.location_sido + '의 공공기관', ITEMS.filter(function (y) { return y.location_sido === x.location_sido; }).length]);
    if (x._c === 'MID' && has(x.industry)) near.push([q1({ c: 'MID', in: x.industry }), '같은 업종 · ' + x.industry, ITEMS.filter(function (y) { return y._c === 'MID' && y.industry === x.industry; }).length]);
    if (x._c === 'MID' && x._k) near.push([q1({ c: 'MID', k: x._k }), '업종 갈래 · ' + KSIC[x._k][0], ITEMS.filter(function (y) { return y._c === 'MID' && y._k === x._k; }).length]);
    if (x._c === 'MID' && has(x.location_sido)) near.push([q1({ c: 'MID', sd: x.location_sido }), x.location_sido + '의 중견기업', ITEMS.filter(function (y) { return y._c === 'MID' && y.location_sido === x.location_sido; }).length]);
    if (x._c === 'LPI') {
      if (has(x.location_sido)) near.push([q1({ c: 'LPI', sd: x.location_sido }), sidoS(x.location_sido) + '의 지방공공기관', ITEMS.filter(function (y) { return y._c === 'LPI' && y.location_sido === x.location_sido; }).length]);
      if (has(x.founder)) near.push([q1({ c: 'LPI', fd: x.founder }), x.founder + ' 설립', ITEMS.filter(function (y) { return y._c === 'LPI' && y.founder === x.founder; }).length]);
      if (has(x.type_detail)) near.push([q1({ c: 'LPI', tt: x.type_detail }), '업무 유형 · ' + x.type_detail, ITEMS.filter(function (y) { return y._c === 'LPI' && y.type_detail === x.type_detail; }).length]);
      if (x.sub_category) near.push([q1({ c: 'LPI', t: x.sub_category }), ptype(x) + ' 전체', ITEMS.filter(function (y) { return y._c === 'LPI' && y.sub_category === x.sub_category; }).length]);
    }
    if (x._c === 'MID' && x._eb) near.push([q1({ c: 'MID', em: x._eb }), '가입자 ' + emLab(x._eb), ITEMS.filter(function (y) { return y._c === 'MID' && y._eb === x._eb; }).length]);
    if (x._c === 'MID' && x._ve) near.push([q1({ c: 'MID', ve: x._ve.slice(0, 7) }), x._ve.slice(0, 7).replace('-', '년 ') + '월에 확인서가 끝나는 곳', ITEMS.filter(function (y) { return y._ve && y._ve.slice(0, 7) === x._ve.slice(0, 7); }).length]);
    near = near.filter(function (n) { return n[2] > 1; });
    if (near.length) s2 += '<section class="box s2"><h2>이어서 찾기</h2>' + (x._c !== 'PUB' ? '<p class="fnote">대기업(KSIC)과 중견기업(국민연금 신고 업종)은 업종 코드 체계가 달라 서로 잇지 않습니다.</p>' : '') + '<ul class="mates">' + near.map(function (n) { return '<li><a href="' + n[0] + '"><span>' + esc(n[1]) + '</span><i>' + fmt(n[2]) + '곳</i></a></li>'; }).join('') + '</ul></section>';
    /* 최하단: 미표기 안내 + 공식 홈페이지 + 출처 */
    var u = safeUrl(x.official_url), ids = (x.sources || [x.source]).filter(Boolean), links = '', names = [];
    ids.forEach(function (id) {
      var S = SRC[id] || {}, su = safeUrl(S.url); if (!S.short) S.short = id;
      if (su) links += '<a class="go' + ((u || links) ? ' line' : '') + '" href="' + esc(su) + '" target="_blank" rel="noopener noreferrer">' + IC.out + '<span>원자료 · ' + esc(S.short || host(su)) + '</span></a>';
      if (has(S.name)) names.push(S.name + (has(S.as_of) ? ' (' + S.as_of + ')' : ''));
    });
    var scope = { ENT: '공정위·기업집단포털', PUB: '알리오', MID: '중견기업정보마당·국민연금 가입 사업장 내역', LPI: '행정안전부 지방공기업·출자출연기관 현황' }[x._c] || '공식 공개 데이터';
    var mt = '<section class="miss"><p><b>미표기 항목은 ' + esc(scope) + '에 포함되지 않은 정보입니다.</b></p>' +
      (u ? '<a class="go" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + IC.out + '<span>공식 홈페이지 · ' + esc(host(u)) + '</span></a>' : '') +
      links +
      '<p class="src"><b>이 항목의 출처</b> — ' + esc(names.join(' / ') || x.source) + '. 기업과 기관의 최신 정보는 각 공식 공시로 확인하십시오.</p></section>';
    main.innerHTML = '<nav class="crumbs" aria-label="위치"><a href="' + back + '">' + IC.back + '목록으로</a><span>/</span>' + esc(c.name) +
      (x._c === 'ENT' && x._grp[0] ? ' <span>/</span> ' + esc(x._grp.join(' · ')) : x._c === 'PUB' || x._c === 'LPI' ? ' <span>/</span> ' + esc(ptype(x)) : '') + '</nav>' +
      '<div class="dt"><div class="lead">' + card + tiles(x) + (b ? '<div class="body">' + b + '</div>' : '') + '</div>' + (s2 ? '<div class="side">' + s2 + '</div>' : '') + mt + '</div>';
    arm(main);
    fitSide();
    window.scrollTo(0, 0);
    try { d.title = x.name + ' · 기업 명함첩'; } catch (e) {}
  }
  function onItemClick(e) {
    if (view !== 'item') return;
    var t = e.target.closest('[data-tile]'); if (t) { openTile(t); return; }
    var mb = e.target.closest('[data-more]'); if (mb) { var ol = mb.previousElementSibling; var on = ol.classList.toggle('cut'); mb.textContent = on ? '나머지 ' + (ol.children.length - 3) + '개 더 보기' : '접기'; return; }
    var fb = e.target.closest('[data-flip]'), face = e.target.closest('.face');
    if (fb || (face && !e.target.closest('a,button,dd') && !window.getSelection().toString())) {
      var f = d.getElementById('flip'); if (!f || !f.querySelector('.back')) return;
      var on = !f.classList.contains('on'); f.classList.toggle('on', on);
      var fr = f.querySelector('.front'), bk = f.querySelector('.back');
      if (on) { fr.setAttribute('inert', ''); bk.removeAttribute('inert'); } else { bk.setAttribute('inert', ''); fr.removeAttribute('inert'); }
      if (fb) { var nb = (on ? bk : fr).querySelector('[data-flip]'); if (nb) setTimeout(function () { nb.focus({ preventScroll: true }); }, 30); }
    }
  }
  /* 옆 칸이 화면보다 길면 붙여 두지 않는다(아래가 잘려 보이지 않게) */
  function fitSide() {
    var s = main.querySelector('.dt>.side'); if (!s) return;
    s.classList.remove('tall');
    if (getComputedStyle(s).position !== 'sticky') return;
    if (s.offsetHeight > window.innerHeight - 150) s.classList.add('tall');
  }
  var fitT = 0; window.addEventListener('resize', function () { clearTimeout(fitT); fitT = setTimeout(fitSide, 160); });
  d.addEventListener('jc-immersive', function () { setTimeout(fitSide, 60); });

  /* ---------- 출처와 한계 ---------- */
  function renderAbout() {
    view = 'about'; d.body.removeAttribute('data-home'); tabs('about');
    var m = META, h = '<div class="ab"><h1>출처와 한계</h1><p class="lead">이 명함첩은 공정거래위원회·알리오·중견기업정보마당·국민연금공단·행정안전부가 공개한 사실 정보와, 중견기업에 한해 더한 한국어 위키백과·위키데이터·상장 종목 공개 정보로 만든 자료(company-wiki v' + esc(m.version || '') + ', ' + esc(m.built_at || '') + ' · 지방공공기관은 company-local-public v' + esc((LMETA && LMETA.version) || '') + ', ' + esc((LMETA && LMETA.built_at) || '') + ')를 고치지 않고 읽어 보여 줍니다. 확인되지 않은 값은 화면에 싣지 않았습니다.</p>';
    var F = {
      ENT: [['매출', '_rev'], ['종업원수', '_emp'], ['자산총액', '_ast'], ['업종', 'industry'], ['소재지', 'headquarters']],
      MID: [['국민연금 가입자', '_emp'], ['업종', 'industry'], ['주요 사업', 'main_products'], ['공식 홈페이지', 'official_url'], ['상장 종목코드', 'stock_code'], ['소재지', 'headquarters'], ['확인서', 'certificate_no']],
      PUB: [['매출', '_rev'], ['정원', '_emp'], ['하는 일', 'business_summary'], ['소재지', 'headquarters'], ['홈페이지', 'official_url']],
      LPI: [['세부 유형', 'sub_category'], ['업무 유형', 'type_detail'], ['설립 지자체', 'founder'], ['시·도', 'location_sido'], ['설립 단위', 'region_scope']]
    };
    h += '<h2>4대 분류와 채움 현황</h2><div class="cats">' + CATS.map(function (c) {
      var l = ITEMS.filter(function (x) { return x._c === c.k; }), N = l.length || 1;
      var bars = F[c.k].map(function (b) {
        var n = l.filter(function (x) { return x[b[1]] != null && x[b[1]] !== ''; }).length;
        return '<div><span>' + b[0] + '</span><u><s style="transform:scaleX(' + (n / N).toFixed(3) + ')"></s></u><em>' + fmt(n) + '</em></div>';
      }).join('');
      return '<a class="k-' + c.k + '" href="#list?c=' + c.k + '"><h3>' + esc(c.full || c.name) + '<b>' + fmt(l.length) + '</b></h3><p>' + esc(c.def) + '</p><div class="fill" aria-label="항목별 채운 곳 수(0인 값은 뺌)">' + bars + '</div></a>';
    }).join('') + '</div>';
    /* 공공기관 두 갈래: 왜 이렇게 나뉘는지, 우리 화면이 어디서 온 숫자인지 */
    var pg = ITEMS.filter(function (x) { return x._c === 'PUB'; }), pds = pg.filter(function (x) { return !x._sub; });
    var cntT = function (k) { return pds.filter(function (x) { return x.sub_category === k; }).length; };
    var pc = function (k) { return ITEMS.filter(function (x) { return x._c === 'LPI' && x.sub_category === k; }).length; };
    h += '<h2>공공기관 분류 — 중앙 · 지방</h2><p class="lead">중앙 공공기관은 「공공기관의 운영에 관한 법률」 제5조가 정한 기관 유형으로, 지방 공공기관은 「지방공기업법」과 「지방자치단체 출자·출연기관의 운영에 관한 법률」이 정한 갈래로 나눕니다. 「중앙」·「지방」 탭을 고르면 목록 위에 유형 칩과 분류 기준이 늘 보입니다.</p>' +
      '<h3 class="clf-h3">중앙 — 알리오 공시 단위 ' + fmt(pg.length) + '곳</h3><ul class="clf-l">' +
      PUBT.map(function (t) { return '<li><b>' + esc(t.n) + '</b><em>' + fmt(cntT(t.k)) + '곳</em><span>' + esc(t.b) + '</span></li>'; }).join('') +
      (pg.length > pds.length ? '<li><b>' + PUBSUB + '</b><em>' + fmt(pg.length - pds.length) + '곳</em><span>독립 지정 기관이 아니라 알리오가 모기관과 함께 공시하는 기관</span></li>' : '') + '</ul>' +
      '<h3 class="clf-h3">지방 — 행정안전부 2026-06-30 기준 ' + fmt(ITEMS.filter(function (x) { return x._c === 'LPI'; }).length) + '곳</h3><ul class="clf-l">' +
      LPIT.map(function (t) { return '<li><b>' + esc(t.n) + '</b><em>' + fmt(pc(t.k)) + '곳</em><span>' + esc(t.b) + '</span></li>'; }).join('') + '</ul>' +
      '<ul class="lim"><li><b>중앙 ' + fmt(pg.length) + '곳 = 지정 ' + fmt(pds.length) + '곳 + ' + PUBSUB + ' ' + fmt(pg.length - pds.length) + '곳</b>입니다. 재정경제부가 2026-01-29 발표한 지정 기관은 342곳(시장형 14 · 준시장형 16 · 기금관리형 12 · 위탁집행형 46 · 기타 254)이고, 알리오는 이 기관들과 함께 부설기관 13곳을 따로 공시합니다. 알리오 공시 단위 355곳이 이 화면의 「중앙」과 같습니다.</li>' +
      '<li><b>기관별 유형은 대조한 값</b>입니다. 알리오 기관 정보와 2026년도 공공기관 지정 고시(재정경제부고시 제2026-58호)를 기준으로 342곳의 유형을 맞춰 보아 다른 곳이 없었고(0건), 지정 기관에 없는 13곳만 부설기관으로 표시했습니다. 대조되지 않은 기관을 추측으로 채운 곳은 없습니다.</li>' +
      '<li><b>지방 공공기관</b>은 행정안전부가 2026-06-30 기준으로 공개한 지방공기업·출자출연기관 현황의 구분 그대로입니다. 「지방공기업법」이 적용되는 직영기업·공사·공단과 「지방자치단체 출자·출연기관의 운영에 관한 법률」에 따라 지정·고시된 출자·출연기관을 한 화면에 모았습니다.</li></ul>';
    var en = ENRICH && ENRICH.meta && ENRICH.meta.counts ? ENRICH.meta.counts : null;
    h += '<h2>브랜드·줄임말로 찾기와 「무슨 회사인가」</h2><p class="lead">법인명과 다르게 부르는 이름으로도 찾을 수 있게 별칭을 따로 모았습니다. 예를 들어 「삼전」은 삼성전자, 「해커스」는 (주)챔프스터디, 「파바」는 (주)파리크라상, 「건보」는 국민건강보험공단으로 이어집니다.</p>' +
      '<ul class="lim">' +
      '<li><b>별칭은 지어내지 않았습니다.</b> 이름을 하나하나 원자료에서 조회해 그 법인이 실제로 있는지 확인한 뒤 얶었습니다. 원자료에 없는 법인·기관은 별칭을 만들지 않았습니다' + (en ? ' (별칭 ' + fmt(en.aliases) + '개 · 설명 ' + fmt(en.profiles) + '곳)' : '') + '.</li>' +
      '<li><b>설명·주요 제품·주요 고객은 보강한 값</b>입니다. 공개된 회사·기관 소개(브랜드·제품·사업)와 원자료의 업종·기업집단·설립목적 공시를 바탕으로 적었고, 확인되지 않은 사업은 쓰지 않았습니다. 설명이 없는 기업은 원자료의 업종·소재지·가입자수만으로 문장을 만듭니다.</li>' +
      '<li><b>원자료는 고치지 않았습니다.</b> 별칭과 설명은 <span class="code">data/enrich.json</span> 한 파일에만 있고, 숫자·업종·주소·분류는 모두 원자료 그대로입니다.</li>' +
      '</ul>';
    h += '<h2>원자료</h2><table class="tbl"><thead><tr><th>출처</th><th>무엇을 가져왔나</th><th>기준일 · 이용 조건</th></tr></thead><tbody>' + (m.sources || []).concat((LMETA && LMETA.sources) || []).concat((PMETA && PMETA.sources) || []).map(function (s) {
      var u = safeUrl(s.url);
      return '<tr><td>' + (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(s.name) + '</a>' : esc(s.name)) + ' <span class="code">' + esc(s.id) + '</span></td><td>' + esc(s.used_for || '') + '</td><td>' + esc(s.as_of || '') + ' · ' + esc(s.license || '') + '</td></tr>';
    }).join('') + '</tbody></table>';
    h += '<h2>읽을 때 주의할 점</h2><ul class="lim">' +
      '<li><b>대기업은 2026-05-01 지정 기준</b>입니다. 그 뒤의 계열 편입·제외는 반영되지 않았습니다. 두 집단에 함께 올라 있는 법인은 두 집단 모두에서 보입니다.</li>' +
      '<li><b>단위</b>: 매출·자산총액은 원(원자료 백만 원 × 1,000,000), 직원수는 명입니다. 목록과 숫자 칸은 읽기 쉽게 조·억 단위로 줄여 보이고, 상세에는 원값을 함께 적습니다.</li>' +
      '<li><b>0인 값</b>: 대기업 매출 ' + fmt(ITEMS.filter(function (x) { return x._c === 'ENT' && x.revenue === 0; }).length) + '곳 등은 원자료에 0으로 적혀 있습니다. 값이 없는 경우와 구별되지 않아 숫자를 싣지 않고 미표기로 둡니다.</li>' +
      '<li><b>음수 매출</b>은 사모투자합자회사·투자목적회사 같은 펀드성 법인의 원자료 값(손실)입니다. 오류가 아닙니다.</li>' +
      '<li><b>공공기관 직원수는 정원</b>(임직원 총계 A+B+C)입니다. 현원과 다를 수 있습니다. 매출은 2025년 결산이며, 금융형 기관은 영업수익, 일반 기관은 매출·수익(매출액) 행입니다.</li>' +
      '<li><b>' + PUBSUB + '은 지정 기관과 다릅니다.</b> 알리오 공시 단위 355곳 가운데 13곳이 모기관의 부설기관이고, 2026년 지정 공공기관 342곳에는 따로 세지 않습니다. 그래서 「중앙」 목록의 유형별 숫자는 지정 기관과 부설기관을 합한 값입니다.</li>' +
      '<li><b>공공기관 업종은 비어 있습니다.</b> 알리오는 표준산업분류를 공개하지 않습니다. 기관 유형·주무부처·하는 일로 판단하십시오.</li>' +
      '<li><b>지방공공기관은 행정안전부가 2026-06-30 기준으로 공개한 현황</b>입니다. 지방자치단체가 직접 운영하는 상수도·하수도 사업소(직영기업)도 한 곳으로 세었고, 지방공기업 수 423곳은 그 사무소 수가 아니라 지방공기업법이 적용되는 기업 단위입니다.</li>' +
      '<li><b>지방공공기관 자료에는 매출·정원·설립일·홈페이지가 없습니다.</b> 원자료가 명칭·구분·지역·설립 지자체·유형만 공개하므로 그 밖의 칸은 만들지 않았습니다. 출자·출연기관은 「지방자치단체 출자·출연기관의 운영에 관한 법률」에 따라 지정·고시된 기관이라, 지정이 바뀌면 목록도 바뀝니다.</li>' +
      '<li><b>중견기업은 확인서 발급기업만</b> 공개됩니다(하한 집합). 업종·직원수·소재지는 국민연금 가입 사업장 내역(2026-09)을 사업자번호 앞 6자리와 법인명으로 대조해 붙였고, 대조된 곳은 3,946곳 중 3,725곳입니다(이름 표기가 달라 확신할 수 없는 221곳은 비워 두었습니다). 가입자수는 상시근로자수와 다르고, 사업장업종은 사업주가 신고한 값이라 실제 주력 사업과 다를 수 있으며, 주소는 도로명·법정동 단위까지만 있는 경우가 많습니다.</li>' +
      '<li><b>중견기업의 공식 홈페이지·주요 사업·상장 정보는 보강한 항목</b>입니다. 홈페이지는 위키백과·위키데이터가 가리키는 주소를 실제로 열어 회사명이나 사업자번호가 확인된 경우에만 실었고(3,946곳 중 ' + fmt(ITEMS.filter(function (x) { return x._c === 'MID' && x.official_url; }).length) + '곳), 접속이 막혀 확인하지 못한 주소는 두 출처가 같은 도메인을 가리킬 때만 실었습니다. 그래서 홈페이지가 있는데도 비어 있는 기업이 있습니다. 주요 사업은 위키백과 첫 문장·상장사 기업개요에서 확인된 짧은 명사구이고, 상장 정보는 종목코드가 있는 곳만입니다.</li>' +
      '<li><b>같은 이름의 다른 법인</b>이 있습니다. 주소의 번호(법인등록번호·사업자등록번호)로 구분합니다.</li>' +
      '<li><b>규모 눈금</b>은 같은 분류 안에서 값이 있는 곳만 모아 로그 눈금 24칸으로 나눈 그림입니다. 순위는 원자료 값의 크기 순서일 뿐 기업의 좋고 나쁨이 아닙니다.</li>' +
      '<li>업종 대분류 이름은 통계청 한국표준산업분류(KSIC) 대분류 명칭이며, 코드 첫 글자로 묶었습니다. 중견기업의 <b>업종 갈래</b>는 국민연금 사업장업종코드(6자리) 앞자리로 묶은 화면용 분류이고, 원자료 코드는 카드에 그대로 적었습니다.</li>' +
      (m.limitations || []).slice(0, 2).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>';
    h += '<h2>갱신 주기</h2><ul class="lim"><li><b>공정거래위원회</b> — 해마다 5월 1일 기업집단 지정. 재무·인력은 직전 사업연도 결산.</li><li><b>알리오</b> — 분기 정기공시(1·4·7·10월 중순 마감).</li><li><b>행정안전부 지방공기업·출자출연기관 현황</b> — 분기마다(1·4·7·10월) 기준일로 게시. 이 자료는 2026-06-30 기준입니다.</li><li><b>중견기업정보마당</b> — 확인서 발급 때마다 수시로 바뀝니다.</li><li><b>국민연금 가입 사업장 내역</b> — 매달 갱신. 이 자료는 2026-09분입니다.</li><li><b>위키백과·위키데이터</b> — 수시로 바뀝니다. 이 자료는 2026-11-16에 조회한 값입니다.</li></ul>';
    h += '<h2>저작권과 이용</h2><ul class="lim"><li>명칭·주소·설립일·인원·매출·업종·홈페이지 주소·종목코드·확인서 번호 같은 단순 사실 정보이며, 공공기관이 공개를 전제로 배포하는 정보입니다. 재배포할 때는 위 출처를 밝혀 주십시오.</li><li>지방공공기관은 행정안전부가 공개한 현황 파일에서 기관 명칭·구분·지역·설립 지자체·유형만 옮겼습니다. 같은 항목을 공공데이터포털에서 「이용허락범위 제한 없음」으로도 개방하고 있습니다(15048282 · 15048281). 현황 파일의 서식·문장·로고는 쓰지 않았습니다.</li><li>한국어 위키백과는 CC BY-SA 4.0입니다. 문장을 옮기지 않고 문서 존재·사업 분야·공식 웹사이트 주소만 사실 확인에 썼습니다. 위키데이터는 CC0입니다.</li><li>기업 로고·CI·사진·홈페이지 본문, 캐치프레이즈·인재상·복지 홍보 문구는 수집하지 않았습니다. 명함 가운데 동그라미 글자는 이름 첫 글자일 뿐 기업 표장이 아닙니다.</li><li>잡코리아·사람인·원티드·캐치 같은 민간 채용 플랫폼의 정보는 쓰지 않았습니다. 이 화면은 어떤 기관이나 기업의 공식 자료도, 채용 정보도 아닙니다.</li></ul></div>';
    main.innerHTML = h; window.scrollTo(0, 0);
  }

  /* ---------- 길잡이 ---------- */
  function route() {
    var r = readHash();
    if (view === 'list' && r.v !== 'list') { listY = window.pageYOffset; lastList = listHash(st); }
    if (r.v === 'item') { renderItem(r.id); return; }
    try { d.title = '기업 명함첩 · 대기업·중견기업·중앙·지방 공공기관 기업 위키'; } catch (e) {}
    if (r.v === 'about') { renderAbout(); return; }
    var wasList = view === 'list', from = view;
    st = r.s;
    if (!wasList) { renderList(); if (from === 'item' && listHash(st) === lastList) window.scrollTo(0, listY); else if (from) window.scrollTo(0, 0); }
    else { var q = d.getElementById('q'); if (q && q.value !== st.q) q.value = st.q; updateList(); }
  }

  /* ---------- 불러오기: 두 파일 6.4MB를 받는 동안 진행 막대(transform만) ---------- */
  var EST = 6400000;
  function fetchJson(url, onBytes) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      if (!r.body || !r.body.getReader || !window.TextDecoder) return r.json();
      var rd = r.body.getReader(), dec = new TextDecoder('utf-8'), parts = [], got = 0;
      function pump() {
        return rd.read().then(function (o) {
          if (o.done) { parts.push(dec.decode()); return JSON.parse(parts.join('')); }
          got += o.value.length; parts.push(dec.decode(o.value, { stream: true }));
          if (onBytes) onBytes(got);
          return pump();
        });
      }
      return pump();
    });
  }
  function load() {
    var bar = d.getElementById('ldBar'), done = 0;
    function prog(n) { if (bar) bar.style.transform = 'scaleX(' + Math.min(.98, n / EST).toFixed(3) + ')'; }
    // 지방공공기관 파일은 따로 둔다. 이것만 실패하면 나머지 세 분류는 그대로 연다(분류 탭에서 뺐다).
    var gotL = {};
    Promise.all([
      fetchJson('./data/companies.json', function (n) { done += n - (gotL.main || 0); gotL.main = n; prog(done); }),
      fetchJson('./data/local-public.json', function (n) { done += n - (gotL.lpi || 0); gotL.lpi = n; prog(done); }).catch(function () { return null; }),
      fetchJson('./data/public-2026.json').catch(function () { return null; }),
      fetchJson('./data/enrich.json').catch(function () { return null; })
    ]).then(function (R) {
      var D = R[0], L = R[1], P = R[2], E = R[3];
      META = D.meta || {}; ITEMS = (D.companies || []).slice();
      /* 보강 레이어: 없거나 깨져도 원자료만으로 화면이 열린다(실패는 조용히 넘긴다) */
      if (E && E.aliases && E.profiles) {
        ENRICH = E;
        E.aliases.forEach(function (a) { (a.ids || []).forEach(function (id) { (ALI[id] = ALI[id] || []).push(a); }); });
        PROF = E.profiles;
      }
      if (P) {
        PMETA = P;
        (P.subsidiaries || []).forEach(function (s) { if (s && s.name) SUB[norm(s.name)] = { parent: s.parent || '' }; });
        (P.sources || []).forEach(function (s) { SRC[s.id] = s; });
      }
      if (L) { LMETA = L.meta || {}; ITEMS = ITEMS.concat(L.institutions || []); }
      (META.sources || []).forEach(function (s) { SRC[s.id] = s; });
      ((LMETA && LMETA.sources) || []).forEach(function (s) { SRC[s.id] = s; });
      (META.tag_vocabulary || []).forEach(function (t) { TAGV[t.tag] = t; });
      if (SRC.FTC) SRC.FTC.short = '공정거래위원회'; if (SRC.ALIO) SRC.ALIO.short = '알리오'; if (SRC.MME) SRC.MME.short = '중견기업정보마당'; if (SRC.NPS) SRC.NPS.short = '국민연금공단'; if (SRC.WIKI) SRC.WIKI.short = '위키백과'; if (SRC.WD) SRC.WD.short = '위키데이터'; if (SRC.LIST) SRC.LIST.short = '상장 종목 정보';
      if (SRC.MOIS_LGI) SRC.MOIS_LGI.short = '행정안전부'; if (SRC.MOIS_INV) SRC.MOIS_INV.short = '행정안전부'; if (SRC.PUBDATA_LGI) SRC.PUBDATA_LGI.short = '공공데이터포털'; if (SRC.PUBDATA_INV) SRC.PUBDATA_INV.short = '공공데이터포털';
      if (SRC.ALIO_STATUS) SRC.ALIO_STATUS.short = '알리오 지정현황'; if (SRC.MOFE_NOTICE) SRC.MOFE_NOTICE.short = '재정경제부 고시'; if (SRC.ALIO_LIST) SRC.ALIO_LIST.short = '공공기관 일반현황';
      if (!L) { CATS = CATS.filter(function (c) { return c.k !== 'LPI'; }); delete CK.LPI; }
      for (var i = 0; i < ITEMS.length; i++) { BYID[ITEMS[i].id] = ITEMS[i]; prep(ITEMS[i]); }
      ENTREV = ITEMS.filter(function (x) { return x._c === 'ENT' && x._rev > 0; }).sort(function (a, b) { return b._rev - a._rev; });
      CATS.forEach(function (c) { c.n = ITEMS.filter(function (x) { return x._c === c.k; }).length; });
      dist(); album();
      /* 다른 섹터에서 ?q=로 들어오면 그 이름으로 바로 찾는다(직무·학과·지면에서 넘어오는 길). */
      var uq = '';
      try { uq = (new URLSearchParams(location.search).get('q') || '').trim(); } catch (e) {}
      if (uq) {
        var s0 = blank(); s0.q = uq; st = fix(s0);
        try { history.replaceState(null, '', location.pathname + location.search + listHash(st)); } catch (e) {}
      }
      main.addEventListener('change', onSelect); main.addEventListener('click', onItemClick); route();
      /* 이름이 꼭 한 곳으로 걸리면 목록을 거치지 않고 그 명함을 바로 편다. */
      if (uq) {
        var only = filtered(st, null);
        if (only.length === 1) { try { history.replaceState(null, '', location.pathname + location.search + '#' + only[0].id); } catch (e) {} renderItem(only[0].id); }
      }
      window.addEventListener('hashchange', route);
    }).catch(function () {
      main.innerHTML = '<p class="empty">자료를 불러오지 못했습니다. 잠시 뒤 다시 열어 주십시오.</p>';
    });
  }

  /* 이용 안내 접고 펴기 */
  (function () {
    var pv = d.getElementById('pv'), t = d.getElementById('pvT'), b = d.getElementById('pvB'), l = d.getElementById('pvL');
    t.addEventListener('click', function () {
      var on = !pv.classList.contains('open'); pv.classList.toggle('open', on);
      t.setAttribute('aria-expanded', String(on)); l.textContent = on ? '접기' : '펼치기';
      if (on) b.removeAttribute('inert'); else b.setAttribute('inert', '');
    });
  })();

  load();
})();
