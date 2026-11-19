/* assistant/search.js — 자료실 통합 검색 엔진 (키 없이도 도는 쪽)
 *
 * 자료실 색인(assistant/data/index.json + index-dirs.json)을 읽어, 불완전한 입력에서도
 * 상관성 높은 순으로 자료를 늘어놓는다. AI(키 등록) 없이도 이 엔진만으로 쓸 수 있다.
 *
 * 다루는 입력
 *   - 띄어쓰기·조사·어미가 어긋난 문장        「수습인데 짤렸어요」 → 수습 / 짤리
 *   - 초성만 친 말                            「ㅂㄷㅊ」 → 반도체, 「ㄱㅊㅈ」 → 공기업
 *   - 구어체·동의어                           「막막해」 → 취업 현위치, 「뜨는 직업」 → 산업 온도계
 *   - 어순이 다른 말                          「자격증 시험 일정」 = 「시험 일정 자격증」
 *   - 현장 약어·쓰다 만 줄임말                「경단녀」「경단」 → 경력단절여성,
 *                                             「국취제」「국취」 → 국민취업지원제도, 「내배」 → 국민내일배움카드
 *
 * 먼저 보는 것 — 선참조 지도(assistant/data/rag-preface.json, 약 30KB)
 *   섹터 27장의 핵심 낱말·약어 사전만 담은 작은 지도다. index.json(500KB)보다 먼저 받아
 *   ① 약어를 정식 용어로 펼치고 ② 어느 섹터부터 볼지 좁힌 뒤(route) ③ 색인 전체에서 순위를 매긴다.
 *   약어 때문에 점수를 올리는 섹터는 근거가 보이게 하는 것이 아니라 순위만 살짝 민다.
 *
 * 원칙: 색인에 있는 말만 근거로 삼는다. 없는 내용을 만들어 내지 않는다.
 */
(function () {
  'use strict';

  var BASE = window.JCA_BASE || '';
  var INDEX_URL = BASE + 'assistant/data/index.json';
  var DIRS_URL = BASE + 'assistant/data/index-dirs.json';
  var PREFACE_URL = BASE + 'assistant/data/rag-preface.json';
  var COMPANIES_URL = BASE + 'assistant/data/index-companies.json';

  /* ---------- 글자 다루기 ---------- */

  var CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  var JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

  function isHangul(c) {
    var n = c.charCodeAt(0);
    return n >= 0xac00 && n <= 0xd7a3;
  }

  /* 한글 음절의 첫소리(초성)만 뽑는다. 한글 음절이 아닌 글자는 그대로 둔다. */
  function toChoseong(s) {
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (isHangul(c)) out += CHO[Math.floor((c.charCodeAt(0) - 0xac00) / 588)];
      else out += c;
    }
    return out;
  }

  /* 소리나는 대로 적은 초성(ㅂㄷㅊ)과, 한글을 초성으로 바꾼 것(반도체→ㅂㄷㅊ)을 같은 모양으로 만든다. */
  function normalizeChoseong(s) {
    return s.replace(/[ㄱ-ㅎ]/g, function (c) { return c; }).replace(/[^ㄱ-ㅎa-z0-9]/g, '');
  }

  function norm(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .replace(/[\u2018\u2019\u201c\u201d]/g, '')
      .replace(/[^0-9a-z가-힣ㄱ-ㅎ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function compact(s) {
    return norm(s).replace(/ /g, '');
  }

  /* 조사·어미 — 낱말 끝에서 떼어 낸다. 남는 말이 2글자 이상일 때만 뗀다. */
  var TAIL = ['에서는', '에게서', '이라고', '이라고는', '으로서', '으로써', '이랑은', '한테서',
    '에서', '에게', '한테', '으로', '라고', '라는', '이라', '이며', '이고', '이랑', '부터', '까지',
    '보다', '처럼', '만큼', '조차', '마저', '밖에', '하고', '이나', '라도', '라서',
    '은', '는', '이', '가', '을', '를', '의', '에', '와', '과', '도', '만', '로', '랑', '나', '든',
    '했다', '한다', '하면', '해서', '하는', '할', '된', '된다', '되는', '되어', '인데', '이고', '인',
    '이야', '이에요', '예요', '이죠', '는데', '지만', '으면', '으니', '아서', '어서'];

  function stripTail(t) {
    for (var i = 0; i < TAIL.length; i++) {
      var tail = TAIL[i];
      if (t.length > tail.length + 1 && t.slice(-tail.length) === tail) return t.slice(0, -tail.length);
    }
    return t;
  }

  /* 물음말·군더더기 — 검색어로 쓰지 않는다. */
  var STOP = { '뭐': 1, '뭔가': 1, '뭐가': 1, '무엇': 1, '어떤': 1, '어떻게': 1, '어떡': 1, '알려줘': 1, '알려': 1,
    '알려주세요': 1, '있어': 1, '있나요': 1, '있는': 1, '할까': 1, '해야': 1, '하나요': 1, '싶어요': 1, '싶다': 1,
    '거야': 1, '건가요': 1, '인가요': 1, '좀': 1, '그': 1, '이': 1, '저': 1, '및': 1, '그리고': 1, '경우': 1,
    '때': 1, '것': 1, '게': 1, '더': 1, '잘': 1, '제발': 1, '궁금': 1, '궁금해': 1, '검색': 1, '찾아': 1, '찾아줘': 1, '추천': 1, '추천해': 1,
    '받았어요': 1, '받았는데': 1, '있는데': 1, '하는데': 1, '한데': 1, '해요': 1, '입니다': 1 };

  function tokens(q) {
    var raw = norm(q).split(' ');
    var out = [], seen = {};
    for (var i = 0; i < raw.length; i++) {
      var t = raw[i];
      if (!t || STOP[t]) continue;
      if (/^[ㄱ-ㅎ]+$/.test(t)) {                 // 초성만 친 말은 그대로 둔다
        if (!seen[t]) { seen[t] = 1; out.push(t); }
        continue;
      }
      var s = stripTail(t);
      if (s.length >= 2 && !seen[s]) { seen[s] = 1; out.push(s); }
      if (t !== s && t.length >= 2 && !seen[t] && !STOP[t]) { seen[t] = 1; out.push(t); }
    }
    return out;
  }

  /* 초성만 쳐도 뜻이 분명한 말 — 사전에 있는 것으로 바로 펼친다. */
  var CHO_ALIAS = {
    'ㅂㄷㅊ': ['반도체'],
    'ㄱㅊㅈ': ['공기업', '공공기관'],
    'ㅈㅇㅅㄷㅅ': ['직업상담사'],
    'ㅅㅇㄱㅇ': ['실업급여'],
    'ㄱㅊ': ['국취', '국민취업지원제도'],
    'ㅈㅇㅈ': ['직업전망'],
    'ㅎㄱ': ['해고'],
    'ㅁㅈ': ['면접'],
    'ㅈㄱㅈ': ['자격증'],
    'ㄴㅊ': ['노동통계'],
    'ㅅㅅ': ['상담']
  };

  /* ---------- 구어체·동의어 사전 ----------
     왼쪽 말이 들어 있으면 오른쪽 낱말도 같이 찾고, 그 섹터를 조금 더 위로 올린다. */
  var SYN = [
    { k: ['짤리', '짤림', '짤렸', '잘리', '잘림', '해고', '수습', '권고사직', '정리해고', '계약만료', '부당해고'],
      t: ['해고', '수습', '근로기준법', '해고예고', '부당해고'], s: { law: 1.5, manual: 1.15, labor: 1.1 } },
    { k: ['막막', '자신감', '자존감', '뭐부터', '모르겠', '의욕', '방향', '진로', '취업이 안', '안 되'],
      t: ['취업 현위치', '진로', '의사결정', '자기효능감'], s: { reality: 1.5, theory: 1.2, hud: 1.1 } },
    { k: ['공기업', '공사', '공단', '지방', '공무원', '공공기관'],
      t: ['공공기관', '지방공기업'], s: { company: 1.5, portals: 1.15 } },
    { k: ['뜨는', '유망', '전망', '핫', '신산업', '미래', '요즘'],
      t: ['산업', '전망', '신산업', '직무'], s: { thermometer: 1.45, emerging: 1.45, briefing: 1.1 } },
    { k: ['실업급여', '구직급여', '수급', '실업'],
      t: ['구직급여', '수급자격', '실업'], s: { manual: 1.3, labor: 1.25, hud: 1.3 } },
    { k: ['국취', '국민취업', '취업지원', '내일배움', '카드'],
      t: ['국민취업지원제도', '취업지원', '훈련'], s: { manual: 1.5, hud: 1.4, transit: 1.1 } },
    { k: ['이력서', '자소서', '자기소개', '포트폴리오', '경력기술', '서류'],
      t: ['이력서', '자기소개서', '포트폴리오', '공고'], s: { surgery: 1.4, portfolio: 1.4, interview: 1.1 } },
    { k: ['면접', '질문', '압박', '꼬리'],
      t: ['면접', '질문', '역질문'], s: { interview: 1.5, surgery: 1.15 } },
    { k: ['자격증', '자격', '기사', '기능사', '면허'],
      t: ['자격', '시험', '종목'], s: { cert: 1.5 } },
    { k: ['학과', '전공', '대학', '진학', '대학원'],
      t: ['학과', '전공', '대학원', '계열'], s: { univ: 1.4, grad: 1.4, decalcomania: 1.3 } },
    { k: ['직업분류', '코드', '직종', '세분류', '분류'],
      t: ['분류', '코드', 'KECO', 'KSCO'], s: { taxonomy: 1.5 } },
    { k: ['이론', '상담기법', '파슨스', '홀랜드', '수퍼'],
      t: ['이론', '상담'], s: { theory: 1.4 } },
    { k: ['심리검사', '흥미', 'L형', '검사', 'RIASEC', '해석'],
      t: ['검사', '흥미', '해석', 'L형'], s: { vpi: 1.5, theory: 1.1 } },
    { k: ['데이컴', '직무분석', '과업', '책무'],
      t: ['데이컴', '직무분석', '과업', '책무'], s: { dacum: 1.5 } },
    { k: ['실업률', '고용률', '통계', '경제활동', '착시', '비경제'],
      t: ['실업률', '고용률', '통계', '경제활동인구'], s: { labor: 1.4, reality: 1.4 } },
    { k: ['채용', '구인', '사이트', '플랫폼', '어디서'],
      t: ['채용', '구인', '포털'], s: { portals: 1.5, transit: 1.2 } },
    { k: ['노선', '환승', '준비물', '절차', '순서'],
      t: ['노선', '환승', '절차', '준비물'], s: { transit: 1.5 } },
    { k: ['책', '보고서', '논문', '자료', '서재'],
      t: ['서재', '보고서', '자료'], s: { library: 1.5 } },
    { k: ['법', '조문', '법령', '규정', '시행령'],
      t: ['법', '조문', '법령'], s: { law: 1.45, manual: 1.2 } },
    { k: ['기업', '회사', '매출', '직원수', '재무'],
      t: ['기업', '회사', '매출', '직원'], s: { company: 1.45 } },
    { k: ['주휴수당', '임금체불', '체불', '월급', '최저임금', '연장수당', '야근수당', '퇴직금', '급여', '해고예고', '근로계약'],
      t: ['임금', '최저임금', '근로기준법', '퇴직금', '해고'], s: { law: 1.5, labor: 1.2, manual: 1.15 } },
    { k: ['가족관계', '부모', '결혼', '출산', '종교', '신체', '몸무게', '출신', '재산', '나이', '키가'],
      t: ['면접', '차별', '질문'], s: { interview: 1.45, law: 1.35 } },
    { k: ['번아웃', '소진', '퇴사', '이직', '그만두', '그만둘', '지쳐', '회사 때려'],
      t: ['소진', '전환', '이직', '스트레스'], s: { theory: 1.35, labor: 1.2, interview: 1.15, reality: 1.1 } },
    { k: ['뭐부터', '어디서부터', '어떻게 시작', '처음인데', '첫 단계', '준비하려면', '준비하는데'],
      t: ['절차', '노선', '준비'], s: { transit: 1.45, reality: 1.25, portals: 1.15 } },
    { k: ['기온', '온도', '업황', '호황', '불황', '지표'],
      t: ['온도', '업황', '지표'], s: { thermometer: 1.45 } }
  ];

  /* ---------- 선참조 지도 · 약어 사전 ----------
     rag-preface.json 의 dict 가 원본이다(assistant/aliases.json → build_index.py).
     여기서는 «찾는 법»만 둔다: 같은 말 · 앞부분 · 쓰다 만 줄임말(글자가 차례대로). */

  var PREF = null;                 // 선참조 지도 전체

  function isSubseq(short, long) {
    var i = 0;
    for (var k = 0; k < long.length && i < short.length; k++) {
      if (long.charAt(k) === short.charAt(i)) i++;
    }
    return i === short.length;
  }

  function dictEntries() { return (PREF && PREF.dict) || []; }

  /* 낱말 하나가 사전의 어느 항목과 맞는지 — ①같은 말 ②앞부분 ③쓰다 만 줄임말 */
  function dictHits(tok) {
    var list = dictEntries(), out = [];
    if (!tok || tok.length < 2) return out;
    var t = tok.replace(/ /g, '');
    for (var i = 0; i < list.length; i++) {
      var e = list[i], forms = [String(e.c || '')].concat(e.a || []), kind = '';
      for (var j = 0; j < forms.length; j++) {
        var w = norm(forms[j]).replace(/ /g, '');
        if (!w) continue;
        if (w === t) { kind = 'same'; break; }
        if (w.indexOf(t) === 0) kind = kind || 'prefix';
      }
      if (!kind) {
        for (var g = 0; g < forms.length; g++) {
          var w2 = norm(forms[g]).replace(/ /g, '');
          if (w2.length > t.length && isSubseq(t, w2)) { kind = 'part'; break; }
        }
      }
      if (kind) out.push({ c: e.c, a: e.a || [], s: e.s || [], x: e.x || '', kind: kind, q: tok });
      if (out.length >= 3) break;      // 한 낱말이 너무 많은 곳으로 펼쳐지지 않게
    }
    return out;
  }

  function dictAll(toks) {
    var out = [], seen = {};
    (toks || []).forEach(function (t) {
      dictHits(t).forEach(function (h) {
        if (seen[h.c]) return;
        seen[h.c] = 1;
        out.push(h);
      });
    });
    return out;
  }

  /* ---------- 색인 ---------- */

  var S = { index: null, dirs: null, ready: false, err: '', loading: null };
  var D = [];     // 문서(정규화된 검색용 필드 포함)
  var DIRROWS = []; // 직업분류

  /* 기업 명함첩(9,137곳)은 따로 — 검색을 처음 할 때만 받는다.
     대문 첫 화면과 비서를 여는 순간에는 내려받지 않는다(휴대폰 데이터·첫 그리기 보호). */
  var COMP = { rows: [], ready: false, loading: null, err: '' };
  var UPD = [];   // 기업 색인이 늦게 도착하면 화면에 다시 그리라고 알린다
  var CAT_NAME = { E: '대기업', M: '중견기업', P: '중앙 공공기관', L: '지방 공공기관' };
  var CAT_HEAD = { E: 'ENT-', M: 'MID-', P: 'PUB-', L: 'LPI-' };
  function prepDoc(d) {
    var title = d.t || '';
    var kws = d.k || '';
    return {
      kind: 'doc', id: d.i, sector: d.s, title: title, snippet: d.x || '', url: d.u || './',
      nt: compact(title), nk: compact(kws), nx: compact(d.x || ''),
      cs: toChoseong(compact(title)), ck: toChoseong(compact(kws)),
      raw: d
    };
  }

  /* 기업 한 줄 색인 → 검색용 행. 형식은 assistant/build_index.py 의 index-companies.json 머리말 참고. */
  function parseCompanies(d) {
    var out = [], lines = String((d && d.rows) || '').split('\n');
    for (var i = 0; i < lines.length; i++) {
      var p = lines[i].split('|');
      if (p.length < 5 || !p[1]) continue;
      var cat = CAT_HEAD[p[3]] ? p[3] : 'E';
      var ind = p[2] || '', kw = p[6] || '', al = (p[5] || '').split(';');
      var row = { kind: 'company', id: CAT_HEAD[cat] + p[0], cat: cat, title: p[1],
        industry: ind, emp: parseInt(p[4], 10) || 0, kw: kw, al: [], na: [], cas: [],
        nt: compact(p[1]), ni: compact(ind), nk: compact(kw), cs: toChoseong(compact(p[1])),
        sector: 'company' };
      for (var j = 0; j < al.length; j++) {
        var a = al[j].trim();
        if (!a) continue;
        row.al.push(a);
        row.na.push(compact(a));
        row.cas.push(toChoseong(compact(a)));   // 「ㅎㅋㅅ」으로 해커스까지
      }
      out.push(row);
    }
    return out;
  }

  function loadCompanies() {
    if (COMP.ready) return Promise.resolve(COMP);
    if (COMP.loading) return COMP.loading;
    COMP.loading = fetch(COMPANIES_URL, { cache: 'default' })
      .then(function (r) { if (!r.ok) throw new Error('companies ' + r.status); return r.json(); })
      .then(function (d) {
        COMP.rows = parseCompanies(d);
        COMP.ready = true;
        UPD.forEach(function (fn) { try { fn('companies'); } catch (e) {} });
        return COMP;
      })
      .catch(function (e) {
        COMP.err = String(e && e.message || e);
        COMP.loading = null;      // 다음 검색에서 다시 시도한다
        throw e;
      });
    return COMP.loading;
  }

  function load() {
    if (S.ready) return Promise.resolve(S);
    if (S.loading) return S.loading;
    S.loading = Promise.all([
      fetch(INDEX_URL, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('index ' + r.status); return r.json(); }),
      fetch(DIRS_URL, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
      fetch(PREFACE_URL, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
    ]).then(function (res) {
      S.index = res[0];
      S.dirs = res[1];
      PREF = res[2] || null;
      D = (S.index.docs || []).map(prepDoc);
      DIRROWS = [];
      if (S.dirs) {
        /* 기업은 index-companies.json 이 맡는다(예전 판의 index-dirs.company 는 빈 배열). */
        (S.dirs.company || []).forEach(function (c) {
          if (!c || !c[0]) return;
          var catWo = c[3] === 2 ? '공공기관 공기업' : c[3] === 1 ? '중견기업' : '대기업';
          DIRROWS.push({ kind: 'company', title: c[0], name: c[0], industry: c[1] || '', emp: c[2] || 0, cat: c[3],
            nt: compact(c[0]), nk: compact((c[1] || '') + ' ' + catWo + ' 기업 회사'),
            cs: toChoseong(compact(c[0])), ck: '', sector: 'company' });
        });
        var tx = S.dirs.taxonomy || '';
        if (tx) {
          var lines = tx.split('\n');
          for (var i = 0; i < lines.length; i++) {
            var p = lines[i].split('|');
            if (!p[0]) continue;
            DIRROWS.push({ kind: 'job', title: p[0], keco: p[1] || '', ksco: p[2] || '',
              nt: compact(p[0]), nk: '', nx: '', cs: toChoseong(compact(p[0])), ck: '', sector: 'taxonomy' });
          }
        }
      }
      S.ready = true;
      return S;
    }).catch(function (e) {
      S.err = String(e && e.message || e);
      S.loading = null;
      throw e;
    });
    return S.loading;
  }

  function sectorOf(id) {
    var arr = (S.index && S.index.sectors) || [];
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return { id: id, title: id, url: './' + id + '/', no: '' };
  }

  /* ---------- 점수 ---------- */

  /* 흔한 말(직업·상담·자료)은 가볍게, 드문 말(ㅂㄷㅊ·수습·KECO)은 무겁게 — 색인에서 몇 번 나오는지로 잰다. */
  var DFCACHE = {};
  function dfOf(t) {
    var key = String(t || '').replace(/ /g, '');
    if (DFCACHE[key] != null) return DFCACHE[key];
    var n = 0, i;
    for (i = 0; i < D.length; i++) if (D[i].nt.indexOf(key) >= 0 || D[i].nk.indexOf(key) >= 0) n++;
    for (i = 0; i < DIRROWS.length; i++) if (DIRROWS[i].nt.indexOf(key) >= 0 || DIRROWS[i].nk.indexOf(key) >= 0) n++;
    DFCACHE[key] = n;
    return n;
  }

  function weightsOf(toks) {
    var total = D.length + DIRROWS.length || 1, w = [], max = 0.001;
    for (var i = 0; i < toks.length; i++) {
      var x = 1 + Math.log(1 + total / (1 + dfOf(toks[i])));
      w.push(x);
      if (x > max) max = x;
    }
    for (var j = 0; j < w.length; j++) w[j] = 0.42 + 0.58 * (w[j] / max);
    return w;
  }

  /* 왜 이 자료가 떴는지 — 화면에 그대로 적는 짧은 이름표. */
  var WHY = { same: '이름이 같음', prefix: '이름 앞부분', name: '이름에 있음', key: '찾기 낱말', body: '본문', cho: '초성',
    alias: '별칭', brand: '대표 브랜드', industry: '업종', product: '제품·서비스' };

  /* 반환값 {s:점수, why:근거 이름표, mw:걸린 낱말} — 근거를 같이 돌려줘 화면이 «왜 떴는지»를 적는다. */
  function scoreFields(nt, nk, nx, cs, ck, toks, phrase, isDir, w) {
    var s = 0, hit = 0, why = '', mw = '';
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      var got = 0, wy = '';
      if (nt.indexOf(t) >= 0) {
        got = nt === t ? 12 : nt.indexOf(t) === 0 ? 10 : 7.5;
        wy = nt === t ? WHY.same : nt.indexOf(t) === 0 ? WHY.prefix : WHY.name;
      } else if (nk && nk.indexOf(t) >= 0) { got = 5.5; wy = WHY.key; }
      else if (nx && nx.indexOf(t) >= 0) { got = 2.2; wy = WHY.body; }
      else if (t.length >= 2 && nt.indexOf(t.slice(0, 2)) >= 0) { got = 1.6; wy = WHY.name; }
      if (got) { s += got * (w ? w[i] : 1); hit++; if (!why) { why = wy; mw = t; } continue; }
      /* 초성: 「ㅂㄷㅊ」로 반도체를, 「공ㄱㅊ」처럼 섞인 입력도 받는다 */
      /* 초성 검색은 사용자가 실제로 초성(ㄱ·ㅊ 같은 자모)을 쳤을 때만 — 일반 낱말을 초성으로 바꿔
         맞추면 「번아웃」이 「바이오」와 걸리는 식의 오탐이 난다. */
      var ct = /[ㄱ-ㅎ]/.test(t) ? toChoseong(t) : '';
      if (ct && ct.length >= 2) {
        if (cs.indexOf(ct) >= 0) { s += 6.5 * (w ? w[i] : 1); hit++; if (!why) { why = WHY.cho; mw = t; } }
        else if (ck && ck.indexOf(ct) >= 0) { s += 4.5 * (w ? w[i] : 1); hit++; if (!why) { why = WHY.cho; mw = t; } }
      }
    }
    if (phrase && nt.indexOf(phrase) >= 0) { s += 9; if (!why) { why = WHY.same; mw = phrase; } }
    if (!hit) return { s: 0, why: '', mw: '' };
    var cov = hit / Math.max(1, toks.length);
    s *= 0.5 + 0.5 * cov;
    if (isDir) s *= 0.9;   // 이름 한 줄짜리 색인은 문서보다 살짝 아래로
    return { s: s, why: why, mw: mw };
  }

  /* 기업 한 곳 — 이름·별칭·업종·대표 제품 순으로 본다.
     이름이 같거나 부르는 별칭이 같으면(해커스·삼전·파바) 섹터 문보다도 위로 올린다. */
  function scoreCompany(c, toks, phrase, w) {
    var s = 0, hit = 0, why = '', mw = '';
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i], got = 0, wy = '', m = '';
      if (/[ㄱ-ㅎ]/.test(t)) {
        /* 초성은 «앞머리»만 본다 — 『ㅎㅋㅅ』이 한국능률협회컨설팅까지 끌어오면 안 된다. */
        var ct = toChoseong(t);
        if (ct.length >= 2 && c.cs.indexOf(ct) === 0) { got = 11; wy = WHY.cho; m = t; }
        else if (ct.length >= 2) {
          for (var z = 0; z < c.cas.length; z++) {
            if (c.cas[z].indexOf(ct) === 0) { got = 10; wy = WHY.cho + ' · ' + WHY.alias; m = c.al[z]; break; }
          }
        }
      } else if (c.nt === t) { got = 26; wy = WHY.same; m = t; }
      else if (c.nt.indexOf(t) === 0) { got = 16; wy = WHY.prefix; m = t; }
      else if (c.nt.indexOf(t) >= 0) { got = 9; wy = WHY.name; m = t; }
      if (!got) {
        var best = 0, bi = -1;
        for (var j = 0; j < c.na.length; j++) {
          var a = c.na[j];
          if (!a) continue;
          if (a === t) { best = 24; bi = j; break; }
          if (a.indexOf(t) === 0) { best = Math.max(best, 15); bi = j; }
          else if (a.indexOf(t) > 0) { best = Math.max(best, 8); bi = j; }
        }
        if (best) { got = best; wy = WHY.alias; m = bi >= 0 ? c.al[bi] : t; }
      }
      if (!got && c.nk && c.nk.indexOf(t) >= 0) { got = 5; wy = WHY.brand; m = t; }
      if (!got && c.ni && c.ni.indexOf(t) >= 0) { got = 4; wy = WHY.industry; m = t; }
      if (got) { s += got * (w ? w[i] : 1); hit++; if (!why) { why = wy; mw = m; } }
    }
    if (phrase && phrase.length >= 3) {
      if (c.nt === phrase) s += 14;
      else if (c.nt.indexOf(phrase) >= 0) s += 6;
    }
    if (!hit) return { s: 0, why: '', mw: '' };
    var cov = hit / Math.max(1, toks.length);
    s *= 0.55 + 0.45 * cov;
    if (c.emp) s += Math.log10(1 + c.emp) * 0.35;   // 이름값이 비기면 큰 기관이 위로(아주 살짝)
    return { s: s, why: why, mw: mw };
  }

  var SITU = /(내담자|내담|고객|학생|분이|분은|사람이|친구가|동생이|엄마|아빠|와이프|남편|저는|제가|저희|상담|사례|상황|고민|힘들|막막|모르겠|어떡|어떻게 해|뭐부터)/;

  /* 이 문장을 어떻게 읽었는지 — 화면에 낱말 칩으로 보여 준다. */
  function analyze(q) {
    var toks = tokens(q), added = [], seen = {};
    toks.forEach(function (t) { seen[t] = 1; });
    function add(w, why) {
      w = norm(w);
      if (!w || seen[w]) return;
      if (!dfOf(w)) return;          // 색인에 없는 말은 더하지 않는다(순위만 흔든다)
      seen[w] = 1; added.push({ word: w, why: why });
    }
    var nq = norm(q);
    /* 초성 별칭 */
    toks.forEach(function (t) {
      if (CHO_ALIAS[t]) CHO_ALIAS[t].forEach(function (w) { add(w, '초성'); });
    });
    /* 구어체·동의어 */
    SYN.forEach(function (g) {
      if (!g.k.some(function (w) { return nq.indexOf(norm(w)) >= 0; })) return;
      g.t.forEach(function (w) { add(w, '비슷한 말'); });
    });
    /* 현장 약어·쓰다 만 줄임말 → 정식 용어 (선참조 지도 dict) */
    var dh = dictAll(toks);
    dh.forEach(function (d) {
      var q = String(d.q || '').replace(/ /g, '');
      var canon = norm(d.c).replace(/ /g, '');
      var isAliasQuery = q !== canon;      // 사용자가 별칭(경단녀·니트)을 쳤다
      var canonAdded = !isAliasQuery;     // 정식 용어를 직접 쳤으면 있는 셈
      var forms = [d.c].concat(d.a || []);
      var n = 0;
      for (var i = 0; i < forms.length && n < 3; i++) {
        var f = norm(forms[i]).replace(/ /g, '');
        if (!f || f === q) continue;
        /* 별칭을 쳤고 정식 용어가 색인에 있으면 그것만 더한다(철자만 다른 별칭은 뺀다).
           정식 용어가 색인에 없으면 별칭 중 색인에 있는 것으로 잇는다(니트 → NEET). */
        if (isAliasQuery && i > 0 && canonAdded) continue;
        if (i > 0 && f.indexOf(q) >= 0 && f.length > q.length) continue;
        var before = added.length;
        add(forms[i], '약어');
        if (added.length > before) { n++; if (i === 0) canonAdded = true; }
      }
    });
    var situation = SITU.test(nq) && (toks.length >= 2 || added.length > 0);
    /* 초성 별칭이 있으면 초성 자체는 점수에서 뺀다(ㄱㅊㅈ → 공기업·공공기관).
       짧은 현장말(경단·니트·실급)도 같은 이유로 뺀다 — 그 글자만으로는 엉뚱한 이름에 걸린다
       (예: 니트 → 코오롱베니트). 펼친 말이 있을 때만 뺴고, 없으면 그대로 쓴다. */
    var drop = {};
    if (added.length) {
      dh.forEach(function (d) {
        var q = String(d.q || '').replace(/ /g, '');
        if (d.kind === 'same' && q.length <= 2 && norm(d.c).replace(/ /g, '') !== q) drop[d.q] = 1;
      });
    }
    var strong = toks.filter(function (t) {
      if (CHO_ALIAS[t] && /^[ㄱ-ㅎ]+$/.test(t)) return false;
      return !drop[t];
    });
    return { tokens: toks, added: added, dict: dh, situation: situation, dropped: Object.keys(drop),
             all: strong.concat(added.map(function (a) { return a.word; })) };
  }

  /* ---------- 선참조: 질문 → 먼저 볼 섹터 ----------
     색인 전체를 뒤지기 전에 작은 지도만으로 후보 섹터를 좁힌다.
     약어(경단·국취)나 섹터 이름이 걸리면 그 섹터를 앞에 두고, 추측이 약하면 빈 손으로 돌아온다. */
  function route(q, opt) {
    opt = opt || {};
    if (!PREF) return [];
    var nq = norm(q);
    if (!nq) return [];
    var toks = tokens(q), sc = {}, why = {};
    function bump(id, w, label) {
      if (!id) return;
      sc[id] = (sc[id] || 0) + w;
      if (label) {
        var arr = why[id] || (why[id] = []);
        if (arr.indexOf(label) < 0 && arr.length < 4) arr.push(label);
      }
    }
    dictAll(toks).forEach(function (d) {
      var base = d.kind === 'part' ? 2 : 3;
      /* 사전에 적힌 차례가 곧 우선순위 — 첫 자리에 적힌 섹터부터 앞으로. */
      (d.s || []).forEach(function (id, i) {
        bump(id, Math.max(1.6, base - i * 0.45), d.c);
      });
    });
    var terms = PREF.terms || {};
    Object.keys(terms).forEach(function (k) {
      if (k.length < 2 || nq.indexOf(norm(k)) < 0) return;
      terms[k].forEach(function (id) { bump(id, 1.2, k); });
    });
    var secs = PREF.sectors || [], byId = {};
    secs.forEach(function (s) { byId[s.id] = s; });
    var flat = nq.replace(/ /g, '');
    secs.forEach(function (s) {
      var t = compact(s.title);
      if (t && flat.indexOf(t) >= 0) bump(s.id, 4, s.title);
      for (var j = 0; j < toks.length; j++) {
        if (toks[j].length >= 2 && t.indexOf(compact(toks[j])) >= 0) { bump(s.id, 1.5, ''); break; }
      }
    });
    var out = [];
    Object.keys(sc).forEach(function (id) {
      if (!byId[id] || sc[id] < 1.2) return;
      out.push({ id: id, no: byId[id].no || '', title: byId[id].title, url: byId[id].url,
                 desc: byId[id].d || '', score: sc[id], why: why[id] || [] });
    });
    out.sort(function (x, y) { return y.score - x.score; });
    return out.slice(0, opt.limit || 3);
  }

  function search(q, opt) {
    opt = opt || {};
    if (!S.ready) return [];
    var a = analyze(q);
    var all = a.all;
    var phrase = compact(q);
    if (!all.length) return [];
    var boost = {}, nq = norm(q);
    SYN.forEach(function (g) {
      if (!g.k.some(function (w) { return nq.indexOf(norm(w)) >= 0; })) return;
      Object.keys(g.s || {}).forEach(function (k) { boost[k] = Math.max(boost[k] || 1, g.s[k]); });
    });
    /* 선참조 지도가 집은 섹터를 살짝 앞으로 — 섹터를 꿰뚫지 않고 순위만 민다. */
    var rt = route(q, { limit: 4 });
    rt.forEach(function (r) {
      boost[r.id] = Math.max(boost[r.id] || 1, 1 + Math.min(0.3, 0.06 * r.score));
    });
    if (a.situation) {
      ['law', 'manual', 'interview', 'surgery', 'reality', 'hud', 'labor', 'preset'].forEach(function (k) {
        boost[k] = Math.max(boost[k] || 1, 1.22);
      });
    }
    var w = weightsOf(all);
    /* 펼쳐서 더한 말은 살짝 낮춘다 — 사용자가 적은 말과 같은 무게는 아니다. */
    var addedFrom = all.length - a.added.length;
    for (var wi = addedFrom; wi < all.length; wi++) w[wi] *= 0.62;
    var out = [], i;

    for (i = 0; i < D.length; i++) {
      var d = D[i];
      var r0 = scoreFields(d.nt, d.nk, d.nx, d.cs, d.ck, all, phrase, false, w);
      if (!r0.s) continue;
      var sc = r0.s;
      if (boost[d.sector]) {
        sc *= boost[d.sector];
        /* 섹터를 콕 집은 말이면 그 섹터의 «문»(섹터 문서)을 앞에 세운다 — 들어가서 더 찾도록 */
        if (d.id && d.id.indexOf('sector:') === 0) sc *= 1.3;
      }
      out.push({ d: d, s: sc, why: r0.why, mw: r0.mw });
    }
    for (i = 0; i < DIRROWS.length; i++) {
      var r = DIRROWS[i];
      var r1 = scoreFields(r.nt, r.nk, '', r.cs, '', all, phrase, true, w);
      if (!r1.s) continue;
      var s1 = r1.s;
      if (boost[r.sector]) s1 *= boost[r.sector];
      /* 「공기업」처럼 섹터를 콕 집은 말이면 그 섹터의 해당 갈래를 더 위로 */
      if (r.kind === 'company' && r.cat === 2 && boost.company) s1 *= 1.5;
      if (r.kind === 'company' && r.emp) s1 += Math.log10(1 + r.emp) * 0.7;   // 같은 이름값이면 큰 기관이 위로
      out.push({ d: r, s: s1, why: r1.why, mw: r1.mw });
    }
    /* 기업 명함첩 — 색인이 아직 없으면 지금 받아 두고(다음 검색·다시 그리기에 반영), 있으면 함께 줄 세운다. */
    if (!COMP.ready) { try { loadCompanies(); } catch (e) {} }
    for (i = 0; i < COMP.rows.length; i++) {
      var c = COMP.rows[i];
      var r2 = scoreCompany(c, all, phrase, w);
      if (!r2.s) continue;
      if (boost.company) r2.s *= boost.company;
      out.push({ d: c, s: r2.s, why: r2.why, mw: r2.mw });
    }
    out.sort(function (x, y) { return y.s - x.s || x.d.title.length - y.d.title.length; });

    var limit = opt.limit || 14, seen = {}, res = [], rest = [];
    /* 한 섹터가 목록을 다 차지하지 않게 — 「국취」에 실무 가이드 장만 일곱 줄 깔리면 다른 곳을 못 본다. */
    var cap = opt.perSector || 3, per = {};
    for (var k = 0; k < out.length && (res.length < limit || rest.length < limit * 2); k++) {
      var it = out[k].d;
      var key = it.kind + ':' + it.title;
      if (seen[key]) continue;
      seen[key] = 1;
      var rr = toResult(it, out[k].s, out[k].why, out[k].mw);
      rr.situation = a.situation;
      per[it.sector] = per[it.sector] || 0;
      if (per[it.sector] < cap && res.length < limit) { per[it.sector]++; res.push(rr); }
      else rest.push(rr);
    }
    /* 자리가 남으면 막아 둔 것부터 채운다(결과가 모자라지 않게). */
    for (var q2 = 0; q2 < rest.length && res.length < limit; q2++) res.push(rest[q2]);
    return res;
  }

  function encodeQ(s) { return encodeURIComponent(String(s || '')); }

  function toResult(it, score, why, mw) {
    var sec = sectorOf(it.sector);
    var reason = why ? String(why) + (mw ? ' “' + mw + '”' : '') : '';
    if (it.kind === 'company') {
      /* 한 곳을 바로 연다 — 목록으로 보내면 다시 찾아야 한다. */
      return { kind: 'company', title: it.title, sector: 'company', sectorTitle: sec.title,
        snippet: [CAT_NAME[it.cat] || '', it.industry,
          it.emp ? '직원 ' + it.emp.toLocaleString('ko-KR') + '명' : ''].filter(Boolean).join(' · '),
        url: './company/#' + encodeQ(it.id), why: reason, reason: why || '', score: score };
    }
    if (it.kind === 'job') {
      var codes = [it.keco ? 'KECO ' + it.keco : '', it.ksco ? 'KSCO ' + it.ksco : ''].filter(Boolean).join(' · ');
      return { kind: 'job', title: it.title, sector: 'taxonomy', sectorTitle: sec.title,
        snippet: codes, url: './taxonomy/?q=' + encodeQ(it.title), why: reason, reason: why || '', score: score };
    }
    var url = it.url;
    if (url && url.indexOf('./') !== 0) url = './' + url;
    var door = it.id && it.id.indexOf('sector:') === 0;
    return { kind: 'doc', type: door ? 'sector' : 'doc', title: it.title, sector: it.sector, sectorTitle: sec.title,
      snippet: it.snippet, url: url, why: reason, reason: why || '', score: score };
  }

  /* ---------- 바깥에 내놓는 것 ---------- */

  window.JCAssistSearch = {
    load: load,
    loadCompanies: loadCompanies,
    companiesReady: function () { return COMP.ready; },
    /* 기업 색인이 늦게 도착하면 화면을 다시 그린다 — hub 팔레트·비서 찾기가 같이 쓴다. */
    onUpdate: function (fn) { if (typeof fn === 'function') UPD.push(fn); },
    search: search,
    ready: function () { return S.ready; },
    error: function () { return S.err; },
    count: function () { return D.length + DIRROWS.length + COMP.rows.length; },
    sectors: function () { return (S.index && S.index.sectors) || []; },
    tokenize: tokens,
    analyze: analyze,
    route: route,
    /* 선참조 지도 — 비서가 AI 지침에 넘기거나, 화면에 후보 섹터를 바로 보일 때 쓴다. */
    preface: function () { return PREF; },
    map: function (limit) {
      var secs = (PREF && PREF.sectors) || [];
      return secs.slice(0, limit || secs.length).map(function (s) {
        return { no: s.no || '', title: s.title, url: s.url };
      });
    },
    choseong: toChoseong
  };
})();
