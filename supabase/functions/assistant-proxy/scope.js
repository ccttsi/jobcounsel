/* 자료실 비서 — 질문 범위 판정기 (assistant/scope.js)

   자료실과 관계없는 요청(코드 짜 줘·주가 알려 줘·날씨·로또 번호 …)을 모델에 넘기기 전에 거른다.
   웹 교차 확인을 켰든 껐든 똑같이 돈다 — 웹을 켠 채 주가를 물으면 모델이 실제로 시세를 찾아오기 때문이다.

   한 파일을 세 곳이 함께 쓴다.
     · 브라우저  assets/assistant.js 가 불러 window.JCAssistScope 로 쓴다(보내기 전에 거르고, 네트워크 0).
     · 서버      supabase/functions/assistant-proxy/scope.js — 이 파일과 **바이트까지 같은 사본**.
                 서버가 최종 관문이다(브라우저 판정은 건너뛸 수 있으므로). 사본 동기는 validate_repo.py 가 본다.
     · 시험      assistant/test/scope-cases.json + 사연 학습셋 168건·검색 시험 질의(오탐 0이어야 통과).

   판정 셋
     in     자료실 질문이다 → 그대로 답한다.
     mixed  관계없는 요청(주가·코드 작성 등)이 자료실 질문과 섞였다
            → 서버가 웹 확인을 끄고, «관계없는 부분은 답하지 않는다»는 지시를 붙여 자료실 부분만 답한다.
     off    자료실과 관계없는 요청이다 → 모델을 부르지 않고 안내문을 돌려준다(키 한도도 쓰지 않는다).

   원칙
     · 확실한 것만 거른다. 애매하면 in — 모델 지침(SYS ■ 범위)이 두 번째 그물이다.
     · 자료실 낱말(직업·취업·채용·자격·훈련·근로·상담 …)이 있으면 함부로 off 하지 않는다.
       「개발자 되려면 파이썬 배워야 하나요」·「증권사 채용 일정」·「자기소개서 써 줘」는 자료실 질문이다.
     · 지시 무시·지침 공개 요구(프롬프트 주입·탈옥)는 assistant/guard.js 몫이다(이 판정보다 먼저 돈다).
     · 질문 내용을 어디에도 남기지 않는다(판정 결과만 돌려준다). */
(function (root) {
  'use strict';

  var VERSION = 'witw-assist-scope/1.0.0';

  /* 자료실 낱말 — 하나라도 있으면 자료실 질문으로 본다. 넓게 잡는다(오탐을 줄이는 쪽). */
  var ANCHOR = new RegExp([
    '직업', '진로', '취업', '취직', '구직', '이직', '전직', '재취업', '채용', '구인', '공고', '입사', '퇴사', '해고', '권고사직',
    '실업', '실직', '고용', '근로', '노동', '노무', '임금', '월급', '연봉', '최저임금', '퇴직', '수당', '급여', '처우', '보험료',
    '4대\\s*보험', '산재', '자격', '훈련', '국비', '내일배움', '국취', '국민취업', '직무', '커리어', '경력', '이력서', '자소서',
    '자기소개', '포트폴리오', '면접', '상담', '내담자', '라포', '회기', '사례개념화', 'ncs', '인턴', '알바', '아르바이트',
    '계약직', '정규직', '비정규', '프리랜서', '플랫폼\\s*노동', '연차', '휴가', '휴직', '육아휴직', '근무', '야근', '수습',
    '진학', '학과', '전공', '대학원', '적성', '흥미\\s*(검사|유형)', '홀랜드', '강점', '가치관', '은퇴', '중장년', '청년', '경단', '경력단절',
    '새일', '고용센터', '워크넷', '고용24', '일자리', '직장', '회사', '기업', '업무', '승진', '복지', '직종', '산업\\s*전망',
    '유망', '신직업', '개발자', '프로그래머', '엔지니어', '애널리스트', '공무원', '공채', '공기업', '자료실', '마이덱', '섹터'
  ].join('|'), 'i');

  /* 관계없는 요청의 갈래.
     hard  자료실 낱말이 있어도 그 부분은 답하지 않는다(섞이면 mixed).
     soft  자료실 낱말이 있으면 자료실 질문으로 본다(「영문 이력서 번역」·「면접 답변 써 줘」).
     지침 무시·공개 요구(프롬프트 주입·탈옥)는 이 파일이 아니라 assistant/guard.js 가 따로 본다. */
  var CATS = [
    /* 코드 — 프로그래밍 언어·도구 이름 + 만들기 동사, 또는 «코드/코딩» + 짜기 동사.
       「면접 스크립트 짜 줘」·「집단 프로그램 만들어 줘」·「직업 코드 알려 줘」는 상담 일이라 이름 목록에서 뺐다. */
    { id: 'code', kind: 'hard', label: '코드 작성·수정',
      re: /(파이썬|python|자바\s*스크립트|javascript|타입\s*스크립트|typescript|자바(?!\s*스크립트)|\bjava\b|c\+\+|c#|\bhtml\b|\bcss\b|\bsql\b|리액트|\breact\b|node\.?js|\bphp\b|러스트|\brust\b|golang|코틀린|kotlin|스위프트|\bswift\b|\bvba\b|정규\s*식|regex|크롤러|크롤링)[^.?!\n]{0,24}(짜\s*(줘|주|달|라)|작성해|만들어|구현|고쳐|수정해|디버그|디버깅|리팩터|최적화해|변환해|예제|샘플|돌려\s*줘|실행해)|(코드|코딩|소스\s*코드)[^.?!\n]{0,12}(짜\s*(줘|주|달|라)|작성해|구현해|고쳐|디버그|디버깅|리팩터)|(write|fix|debug|refactor|make|create)\s+(me\s+)?(a\s+|an\s+|the\s+|this\s+)?((python|javascript|typescript|java|sql|c\+\+|php|bash|shell)\s+)?(code|script|function|program|query|regex)/i },
    { id: 'code', kind: 'hard', label: '코드 작성·수정',
      re: /```|^\s*(def|class|import|from\s+\S+\s+import|function|const|let|var|#include|public\s+static|select\s+.+\s+from)\b|console\.log\(|System\.out\.print|=>\s*\{|\)\s*\{\s*$/im },
    { id: 'market', kind: 'hard', label: '주가·시세·투자 종목',
      re: /주가|주식[^.?!\n]{0,12}(살\s*만|사도\s*돼|사야|팔아야|팔까|살까|투자해도)|주식\s*(시세|가격|추천|전망|매수|매도|종목|차트)|종목\s*(추천|분석|전망)|시가\s*총액|코스피|코스닥|나스닥|다우\s*지수|s&p\s*500|환율|비트\s*코인|이더리움|도지\s*코인|코인\s*(시세|가격|추천|전망)|가상\s*(화폐|자산)\s*(시세|가격|추천)|암호\s*화폐|금\s*시세|국제\s*유가|유가\s*(전망|시세|얼마)|공매도|매수\s*(타이밍|추천|할까)|매도\s*(타이밍|할까)|etf\s*(추천|전망)|선물\s*옵션|목표\s*주가|배당\s*(주|금\s*얼마)/i },
    { id: 'gamble', kind: 'hard', label: '로또·도박 번호',
      re: /로또\s*(번호|추천|당첨)|복권\s*(번호|당첨\s*번호)|토토\s*(픽|추천|분석)|스포츠\s*토토|경마\s*(예상|추천)|카지노|바카라|도박\s*(필승|방법)/i },
    { id: 'weather', kind: 'soft', label: '날씨',
      re: /날씨|기온|강수\s*확률|비\s*(오나|올까)|눈\s*(오나|올까)|미세\s*먼지\s*(오늘|내일|어때|농도)|일기\s*예보|weather\s+(today|tomorrow|in)/i },
    { id: 'entertain', kind: 'soft', label: '연예·스포츠·게임',
      re: /(야구|축구|농구|배구|롤|lol|e스포츠|올림픽)\s*(경기|결과|스코어|일정|순위|중계)|경기\s*결과|몇\s*대\s*몇|아이돌|연예인|드라마\s*(추천|결말|줄거리)|영화\s*(추천|결말|줄거리)|웹툰\s*추천|게임\s*(공략|추천|치트)|티어\s*올리|가챠|노래\s*추천/i },
    { id: 'food', kind: 'soft', label: '요리·맛집',
      re: /레시피|요리\s*(법|방법)|만드는\s*법\s*(알려|좀)|맛집|메뉴\s*추천|뭐\s*먹(지|을까)|칼로리/i },
    { id: 'travel', kind: 'soft', label: '여행·예약',
      re: /여행\s*(일정|코스|추천|계획)|항공권|비행기\s*표|호텔\s*추천|숙소\s*추천|관광지/i },
    { id: 'homework', kind: 'soft', label: '숙제·문제 풀이',
      re: /(수학|물리|화학|미적분|방정식|적분|미분|확률)\s*(문제)?\s*(풀어|풀이|답)|숙제\s*(해|풀어|대신)|과제\s*대신|리포트\s*대신\s*써/i },
    { id: 'writing', kind: 'soft', label: '창작 글쓰기',
      re: /(?:^|[\s,])(시|소설|가사|랩|동화|시나리오|축사|연애\s*편지|러브\s*레터)\s*(를|을|한\s*편)?\s*(써|지어|만들어|작성)|농담\s*(해|좀|하나)|유머\s*(해|좀)|아재\s*개그|삼행시|끝말잇기/i },
    { id: 'translate', kind: 'soft', label: '일반 번역',
      re: /(영어|일어|일본어|중국어|한국어|영문|불어|독일어)\s*(로|으로)\s*(번역|바꿔|옮겨)|번역\s*(해\s*줘|해\s*주세요|좀)|translate\s+(this|to|into)/i }
  ];

  /* 갈래별 안내 — 기능적인 문구만(드립·위트 없이). 자료실로 이어 묻는 예를 하나씩 붙인다. */
  var TRY = {
    code: '개발 직무나 코딩 훈련이 궁금하시면 「개발자 국비 훈련 어떻게 찾아요?」처럼 물어봐 주세요.',
    market: '금융권 채용이나 금융 직무가 궁금하시면 「증권사 애널리스트가 되려면?」처럼 물어봐 주세요.',
    gamble: '진로·취업·고용 제도처럼 자료실과 관련된 질문을 적어 주세요.',
    weather: '날씨 때문에 일을 못 했다면 「폭염·폭우로 쉬면 휴업수당 받나요?」처럼 물어봐 주세요.',
    entertain: '그 분야 직업이 궁금하시면 「스포츠 마케터는 어떤 일을 해요?」처럼 물어봐 주세요.',
    food: '그 분야 직업이 궁금하시면 「조리사 자격증 어떻게 따요?」처럼 물어봐 주세요.',
    travel: '그 분야 직업이 궁금하시면 「여행 가이드가 되려면?」처럼 물어봐 주세요.',
    homework: '진학·전공이 궁금하시면 「수학 잘하면 어떤 직업이 맞아요?」처럼 물어봐 주세요.',
    writing: '자기소개서·면접 답변이라면 「자기소개서 첫 문장 고쳐 줘」처럼 물어봐 주세요.',
    translate: '영문 이력서·직무 영어라면 「영문 이력서 경력 문장 다듬어 줘」처럼 물어봐 주세요.'
  };

  var SCOPE_LINE = '이 비서는 직업상담 자료실 안의 일(진로·취업·고용 제도·근로조건·자격·훈련·상담 실무)만 돕습니다.';

  /* 받침에 맞춰 «은/는»을 붙인다(「날씨는」·「주가·시세·투자 종목은」). */
  function topic(w) {
    var c = w.charCodeAt(w.length - 1);
    if (c < 0xAC00 || c > 0xD7A3) return w + '은(는)';
    return w + (((c - 0xAC00) % 28) ? '은' : '는');
  }

  function norm(q) {
    return String(q == null ? '' : q).replace(/\s+/g, ' ').trim().slice(0, 2000);
  }

  /* 판정 — { verdict, cats:[id…], label, anchor, message, note, v } */
  function check(q) {
    var s = norm(q);
    var hits = [];
    for (var i = 0; i < CATS.length; i++) {
      var c = CATS[i];
      if (c.re.test(s) && !hits.some(function (h) { return h.id === c.id; })) hits.push(c);
    }
    var anchor = ANCHOR.test(s);
    var out = { v: VERSION, verdict: 'in', cats: [], label: '', anchor: anchor, message: '', note: '' };
    if (!hits.length) return out;

    var hard = hits.filter(function (h) { return h.kind === 'hard'; });
    var pick = hard.length ? hard : hits;
    out.cats = pick.map(function (h) { return h.id; });
    out.label = pick.map(function (h) { return h.label; }).join(' · ');

    if (!anchor) out.verdict = 'off';
    else if (hard.length) out.verdict = 'mixed';
    else { out.verdict = 'in'; out.cats = []; out.label = ''; return out; }

    if (out.verdict === 'off') {
      out.message = SCOPE_LINE + '\n' + topic(out.label) + ' 답하지 않아요.\n' + (TRY[pick[0].id] || TRY.gamble);
    } else {
      /* 서버가 모델 지시에 붙이는 한 줄 — 관계없는 부분은 답하지 않고 그 사실을 한 문장으로만 알린다. */
      out.note = '이 질문에는 자료실과 관계없는 요청(' + out.label + ')이 섞여 있습니다. ' +
        '그 부분은 답하지 말고 "' + topic(out.label) + ' 자료실 범위 밖이라 답하지 않아요"라고 한 문장으로만 알린 뒤, ' +
        '자료실과 관련된 부분만 답합니다. 시세·수치·코드를 지어내거나 웹에서 찾아 적지 않습니다.';
    }
    return out;
  }

  var api = { version: VERSION, check: check, scopeLine: SCOPE_LINE };
  root.JCAssistScope = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
