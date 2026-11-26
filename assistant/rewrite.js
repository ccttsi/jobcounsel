/* 자료실 비서 — 이어지는 질문 다시 쓰기 (assistant/rewrite.js · AUP-4)

   «최저임금이 올해 얼마예요?» 다음의 «그럼 수습 기간엔요?»는 혼자서는 무엇을 묻는지 모른다.
   검색·근거 조각은 지금 문장만 보므로, 앞 질문의 주제어를 이어 붙여 «혼자 읽어도 통하는 질문»을 만든다.

   한 파일을 두 곳이 함께 쓴다 — 브라우저(assets/assistant.js → window.JCAssistRewrite)와
   AUP-2 성적표 러너(ops/eval/aup_eval.mjs). 규칙이 하나라야 성적표 점수가 라이브와 같다.

   지키는 선
     · 규칙만 쓴다(모델 호출 없음, 네트워크 없음). 사실·수치를 새로 보태지 않는다 — 앞 질문에 있던 낱말만 옮긴다.
     · 다시 쓴 문장은 «검색·근거 고르기»에만 쓴다. 화면에 보이는 질문과 비서에게 가는 질문은 사용자가 쓴 그대로다.
     · 이어지는 질문이 아니면 손대지 않는다(되돌린 값 = 원문).

   rewrite(q, prev) → { q: 검색용 질문, follow: 이어지는 질문인가, topic: 옮겨 온 낱말 }
     prev — 앞 질문 문자열 배열(오래된 것 → 최근 것). 최근 2개만 본다. */
(function (root) {
  'use strict';

  var VERSION = 'witw-rewrite/1.0.0';

  /* 앞 대화를 가리키는 말 — 문장 앞에 오면 이어지는 질문이다 */
  var LEAD = /^(그럼|그러면|그렇다면|그럼요|그러니까|그런데|근데|그리고|그래서|그건|그거|그게|그걸|그거는|그건요|이건|이거|이게|이걸|저건|저거|거기|거기서|그때|그\s*경우|그\s*다음|그\s*중에?|그\s*중에서|또|아\s*그럼|아니면)(\s|,|$)/;
  /* 문장 어디에 있어도 앞 대화를 가리키는 말 */
  var POINT = /(그거|그건|그게|이거|이건|이게|거기|그\s*경우|그\s*제도|그\s*검사|그\s*돈|그\s*기간|위에서|아까)/;
  /* 짧은 꼬리 질문 — «~는요?» «~면요?» «달라져요?»처럼 앞 질문과 견줘야 뜻이 서는 끝 */
  var TAIL = /(은요|는요|이면요|면요|라면요|우는요|엔요|에선요|에서는요|도요|달라져요|달라지나요|달라지죠|바뀌나요|바뀌어요|어떻게\s*돼요|어떻게\s*되나요|되나요|돼요|가능해요|가능한가요)\s*[?？.!]*$/;

  /* 앞 질문에서 주제어만 남기기 — 서술어·의문사·조사를 떼고 낱말(2자 이상)만 */
  var DROP = /^(올해|지금|요즘|혹시|제가|저는|저도|좀|정말|진짜|그냥|어떻게|어디|어디서|어디에|언제|얼마|얼마나|얼마예요|무엇|뭐|뭐예요|뭔가요|왜|몇|어느|하는|있는|없는|같은|대한|관련|대해|대해서|궁금해요|알려|알려줘|알려주세요|도와주세요|싶어요|있나요|있어요|돼요|되나요|해요|하나요|인가요|일까요|건가요)$/;
  var PRED = /(요|까|죠|니|나|다|고|서|면|데|게|지|며|라|자|해|돼|함|음|야)$/;   /* 서술어 끝 — 주제어로 옮기지 않는다 */
  var ADJ = /(찮|같|많|좋|없|있|싶|혀|져|워|해|돼|되|하)$/;                 /* «괜찮은»·«적혀» 같은 꾸밈말 조각 */
  var JOSA = /(으로|에서|에게|한테|이랑|하고|까지|부터|처럼|보다|이나|이란|란|은|는|이|가|을|를|에|의|로|도|만|과|와|랑)$/;

  var ASKNUM = /(얼마|몇\s*(퍼센트|%|프로|시간|원)|요율|상한액?|하한액?)/;
  var OWNQ = /(어떻게|어디|언제|왜|뭐|무엇|누구|얼마|몇|요율|상한|하한|퍼센트)/;

  function words(text) {
    return String(text || '').replace(/[?？!.,…·「」『』“”"'()\[\]]/g, ' ').split(/\s+/).filter(Boolean);
  }
  function stem(w) {
    var s = w;
    for (var i = 0; i < 2 && s.length > 2 && JOSA.test(s); i++) s = s.replace(JOSA, '');
    return s;
  }
  function topicOf(text) {
    var out = [];
    words(text).forEach(function (w) {
      w = w.replace(/(이라고|라고|이라는|라는)$/, '');                         /* «포괄임금이라고» → 포괄임금 */
      if (!w || DROP.test(w) || PRED.test(w)) return;
      if (w.length === 2 && /[는은을를이가에도로의]$/.test(w)) return;           /* «칸이»·«수를» — 두 글자에 조사가 붙은 말은 뜻이 약하다 */
      var s = stem(w);
      if (s.length < 2 || DROP.test(s) || ADJ.test(s) || /^\d+$/.test(s)) return;
      if (out.indexOf(s) < 0) out.push(s);
    });
    return out.slice(0, 4);
  }

  function isFollow(q) {
    var t = String(q || '').trim();
    if (!t) return false;
    if (LEAD.test(t)) return true;
    var n = t.replace(/\s+/g, '').length;
    /* 시작어 없이 지시어·꼬리만 있을 때는 제 주제가 모자란 짧은 질문만 — «전기기사 필기랑 실기 과목이 어떻게 돼요?»는 혼자 선다 */
    if (topicOf(t).length > 2) return false;
    if (n <= 24 && POINT.test(t)) return true;
    if (n <= 22 && TAIL.test(t)) return true;
    return false;
  }

  function rewrite(q, prev) {
    var raw = String(q == null ? '' : q).trim();
    var list = (Array.isArray(prev) ? prev : []).map(function (p) { return String(p || '').trim(); }).filter(Boolean).slice(-2);
    if (!list.length || !isFollow(raw)) return { q: raw, follow: false, topic: [] };
    /* 가장 최근 질문의 주제어 → 모자라면 그 앞 질문에서 보탠다 */
    var topic = topicOf(list[list.length - 1]);
    if (topic.length < 2 && list.length > 1) topicOf(list[0]).forEach(function (w) { if (topic.length < 4 && topic.indexOf(w) < 0) topic.push(w); });
    /* 앞 질문이 금액·요율을 물었고 이번 질문에 제 물음말이 없으면 그 물음말도 옮긴다
       («최저임금 얼마예요?» → «그럼 수습 기간엔요?» = 수습 기간의 «얼마»). 근거 조각이 법정 수치를 앞세우는 신호가 된다. */
    var ask = (list[list.length - 1].match(ASKNUM) || [''])[0];
    if (ask && !OWNQ.test(raw) && topic.indexOf(ask) < 0) topic.push(ask.replace(/\s+/g, ' '));
    var body = raw.replace(LEAD, '').trim() || raw;
    var flat = body.replace(/\s+/g, '');
    topic = topic.filter(function (w) { return flat.indexOf(w) < 0; });     /* 지금 질문에 이미 있는 말은 다시 붙이지 않는다 */
    if (!topic.length) return { q: raw, follow: true, topic: [] };
    return { q: (topic.join(' ') + ' ' + body).slice(0, 200), follow: true, topic: topic };
  }

  var api = { version: VERSION, rewrite: rewrite, isFollow: isFollow, topicOf: topicOf };
  root.JCAssistRewrite = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
