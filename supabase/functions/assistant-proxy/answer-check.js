/* 자료실 비서 — AUP-5 답 검사기 (assistant/answer-check.js)

   모델이 답을 다 쓴 **뒤**, 화면에 닿기 전에 두 가지를 본다.
     ① 법정 수치 — 답 속 금액·요율이 `data/legal-constants.json`(단일 원천)과 같은가.
        · 이름표가 숫자 바로 앞에 붙은 것(「최저임금 시급 9,860원」)만 원천 값으로 고친다.
        · 계산 중간값·예시 금액(내담자 시급 12,000원, 3개월, 180일)은 건드리지 않는다.
        · 어긋난 값이 보이면 답 끝에 「※ 자료실 기준 값」 한 줄을 붙인다(고치지 못한 것도 안내가 남는다).
     ② 자료실 안 링크 — `/sector/`·`./sector/`·`witw.pages.dev/sector/` 를 `assets/tools.js` 의 섹터 장부와
        대조해, 없는 폴더를 가리키는 주소는 지운다(본문·references 둘 다).

   한 파일을 세 곳이 함께 쓴다(guard.js·scope.js 와 같은 방식).
     · 서버      supabase/functions/assistant-proxy/answer-check.js — 바이트까지 같은 사본(최종 관문)
     · 성적표    ops/eval/aup_eval.mjs — 사용자가 받는 답 그대로를 채점한다
     · 시험      assistant/test/answer-check-cases.json (validate_repo.py --only answercheck)

   규칙(값·이름표·허용 금액 범위)은 이 파일에 없다 — `check-data.js`(생성물, 원천 data/legal-constants.json +
   assets/tools.js)가 들고 있다. 값을 손으로 다시 적는 자리를 만들지 않으려는 것이다.

   지키는 선
     · 답 내용을 로그에 남기지 않는다 — 돌려주는 것은 «몇 개를 고쳤는지»뿐이다.
     · 규칙에 없는 숫자는 절대 건드리지 않는다(오탐 0). 확신이 없으면 «고치지 않고 안내만» 한다.
     · 자료실 밖 주소(http/https·앵커)는 그대로 둔다 — 이 검사기는 자료실 안 주소만 본다.
*/
(function (root) {
  'use strict';

  var VERSION = 'witw-assist-check/1.0.0';
  var MAX_ANSWER = 4000;          // 서버·기록함이 받는 답 길이(넘으면 저장 때 잘린다)

  /* 금액·요율·시간 한 덩이 — 10,320 / 1,234,567 / 215만 / 215만 6,880 / 4.75% / 209시간 */
  var NUM = '((?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\s*만(?:\\s*(?:\\d{1,3}(?:,\\d{3})+|\\d+))?)?)';
  var NUM_PCT = '((?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?)';          // 4.75% · 0.9% — 요율은 소수점이 있다
  var UNITS = { won: '원', pct: '%', hours: '시간' };

  /* 자료실 안 주소로 보는 모양 — 앞이 / 또는 ./ 이거나, 자료실 도메인으로 시작. */
  var HOST = /^(?:https?:\/\/)?(?:www\.)?(?:witw\.pages\.dev|ccttsi\.github\.io|ccttsi\.pages\.dev)(?=$|[\/?#])/i;

  function data() {
    var d = root.JCAssistCheckData;
    return d && Array.isArray(d.rules) && Array.isArray(d.sectors) ? d : null;
  }

  function numOf(text) {
    var s = String(text == null ? '' : text).replace(/\s+/g, '');
    if (!s) return null;
    var cut = s.indexOf('만');
    if (cut >= 0) {
      var big = Number(s.slice(0, cut).replace(/,/g, '') || '0');
      var rest = Number(s.slice(cut + 1).replace(/,/g, '') || '0');
      if (isNaN(big) || isNaN(rest)) return null;
      return big * 10000 + rest;
    }
    var n = Number(s.replace(/,/g, ''));
    return isNaN(n) ? null : n;
  }

  function pctOf(value) { return Math.round(Number(value) * 100 * 1e6) / 1e6; }

  /* ── ① 법정 수치 ─────────────────────────────────────────── */

  function sentenceAt(text, index) {
    var start = 0, end = text.length;
    for (var i = index; i > 0; i--) {
      var ch = text.charAt(i - 1);
      if (ch === '\n' || ch === '.' || ch === '?' || ch === '!' || ch === '。' || ch === '？' || ch === '！') { start = i; break; }
    }
    for (var j = index; j < text.length; j++) {
      var c2 = text.charAt(j);
      if (c2 === '\n' || c2 === '.' || c2 === '?' || c2 === '!' || c2 === '。' || c2 === '？' || c2 === '！') { end = j; break; }
    }
    return text.slice(start, end);
  }

  function accepted(rule, groupValues, n) {
    var list = rule.fix ? [rule.value] : groupValues;
    for (var i = 0; i < list.length; i++) {
      var v = list[i];
      if (rule.kind === 'pct') {
        if (Math.abs(Number(n) - pctOf(v)) <= 0.01) return true;
      } else if (Math.abs(Number(n) - Number(v)) < 1e-9) return true;
    }
    return false;
  }

  function fixNumbers(text, d) {
    var out = text, fixed = 0, hitGroups = {};

    /* 그룹마다 «맞다»로 볼 수 있는 값들 — 이름표가 짧은 요율 규칙은 같은 그룹 값을 모두 인정한다. */
    var byGroup = {};
    d.rules.forEach(function (r) {
      (byGroup[r.group] = byGroup[r.group] || []).push(r.value);
    });

    d.rules.forEach(function (r) {
      var unit = UNITS[r.kind] || '원';
      var re;
      try {
        re = new RegExp('(?:' + r.pre + ')' + (unit === '%' ? NUM_PCT : NUM) + '\\s*(' + (unit === '%' ? '%' : unit) + ')', 'g');
      } catch (e) { return; }
      var hits = [], m;
      while ((m = re.exec(out))) {
        var numberText = m[1], unitText = m[2];
        if (!numberText) continue;
        if (unitText !== unit) continue;
        var offset = m.index + m[0].lastIndexOf(numberText);
        var n = numOf(numberText);
        if (n == null) continue;
        var before = out.slice(Math.max(0, m.index - 40), m.index);
        if (r.guard && new RegExp(r.guard).test(before)) continue;
        if (r.need && !new RegExp(r.need).test(sentenceAt(out, m.index))) continue;
        if (r.kind === 'won' && (r.lo != null) && (n < r.lo || n > r.hi)) continue;
        hits.push({ start: offset, len: numberText.length, raw: numberText, n: n });
      }
      /* 뒤에서부터 고친다 — 앞을 고치면 뒤의 위치가 밀린다. */
      for (var i = hits.length - 1; i >= 0; i--) {
        var h = hits[i];
        if (accepted(r, byGroup[r.group] || [], h.n)) continue;
        if (r.fix && h.raw.indexOf('만') < 0) {
          var fmt = r.kind === 'pct' ? String(r.display).replace('%', '') : Number(r.value).toLocaleString('en-US');
          out = out.slice(0, h.start) + fmt + out.slice(h.start + h.len);
          fixed++;
        }
        hitGroups[r.group] = true;       // 고쳤든 못 고쳤든 «기준 값» 줄은 남긴다
      }
    });

    if (!Object.keys(hitGroups).length) return { text: out, fixed: fixed, groups: [] };
    var lines = [];
    Object.keys(d.groups || {}).forEach(function (key) {
      if (hitGroups[key] && d.groups[key]) lines.push('※ 자료실 기준 값 — ' + d.groups[key]);
    });
    if (!lines.length) return { text: out, fixed: fixed, groups: [] };
    var footer = '\n\n' + lines.join('\n');
    var body = out;
    if (body.length + footer.length > MAX_ANSWER) body = body.slice(0, Math.max(0, MAX_ANSWER - footer.length - 3)).replace(/\s+$/, '');
    return { text: body + footer, fixed: fixed, groups: Object.keys(hitGroups) };
  }

  /* ── ② 자료실 안 링크 ────────────────────────────────────── */

  function internal(u) {
    var s = String(u == null ? '' : u).trim();
    if (!s) return false;
    if (HOST.test(s)) return true;
    if (s.slice(0, 2) === './' || s.slice(0, 3) === '../') return true;
    if (s.charAt(0) !== '/') return false;
    return s.slice(0, 2) !== '//';        // //example.com 은 바깥 주소
  }

  function firstSegment(u, sectors) {
    var s = String(u == null ? '' : u).trim();
    var host = HOST.exec(s);
    if (host) s = s.slice(host[0].length);
    s = s.split('#')[0].split('?')[0];
    s = s.replace(/^(?:\.{0,2}\/)+/, '');        // / ./ ../ 를 모두 떼고 첫 칸을 본다
    if (!s || s === 'index.html') return '';
    var seg = s.split('/')[0];
    if (!seg || seg === 'index.html') return '';
    return seg;
  }

  function linkOk(u, sectors) {
    if (!internal(u)) return true;                 // 바깥 주소·앵커는 건드리지 않는다
    var seg = firstSegment(u, sectors);
    if (!seg) return true;
    return sectors.indexOf(seg) >= 0;
  }

  function tidy(text) {
    return text
      .replace(/\(\s*\)/g, '')
      .replace(/\[\s*\]/g, '')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/([가-힣A-Za-z0-9)\]」』])\s+([,!?])(?=\s|$)/g, '$1$2')
      .replace(/자료실\s*(을|를|은|는|이|가|와|과|으로|로|의|에서|에|도|만|부터|까지)/g, function (all, p) {
        var map = { '을': '을', '를': '을', '은': '은', '는': '은', '이': '이', '가': '이', '와': '과', '과': '과', '로': '로', '으로': '로' };
        return '자료실' + (map[p] || p);          // 「자료실」은 받침 ㄹ로 끝난다 — 조사를 그에 맞춘다
      })
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^[ \t]+|[ \t]+$/gm, '')
      .replace(/^\s*[-•*·]\s*$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\n+|\n+$/g, '');
  }

  function fixLinks(text, sectors) {
    var out = String(text == null ? '' : text);
    var removed = 0;

    /* ① 마크다운 링크 [이름](주소) — 주소가 없으면 이름만 남긴다. */
    out = out.replace(/(!?)\[([^\]\n]{0,160})\]\(\s*([^()\s]{1,300})\s*\)/g, function (all, bang, label, url) {
      if (linkOk(url, sectors)) return all;
      removed++;
      return bang ? '' : label;
    });

    /* ② 맨 주소 — ./pay-calc/ · /law/ · witw.pages.dev/… . 앞 글자가 단어 안이면 건드리지 않는다.
       지운 자리에 「자료실」을 남겨 「…은 를 보세요」처럼 조사만 남는 문장을 막는다(이미 「자료실」이면 겹치지 않게 비운다). */
    out = out.replace(/(^|[\s(\[「『"'<>])((?:https?:\/\/)?(?:www\.)?(?:witw\.pages\.dev|ccttsi\.github\.io|ccttsi\.pages\.dev)?\.?\/[A-Za-z0-9._~!$&'()*+,;=:@%\/?#\[\]-]*)/g,
      function (all, pre, url, offset, whole) {
        if (linkOk(url, sectors)) return all;
        removed++;
        var before = String(whole).slice(Math.max(0, offset - 14), offset);
        if (/자료실[의]?\s*$/.test(before)) return pre;
        return pre + '자료실';
      });

    return { text: removed ? tidy(out) : out, removed: removed };
  }

  /* ── 공개 API ────────────────────────────────────────────── */

  function check(answer, references) {
    var text = String(answer == null ? '' : answer);
    var refs = Array.isArray(references) ? references.slice(0, 3) : [];
    var d = data();
    if (!d) return { v: VERSION, answer: text, references: refs, fixed: { numbers: 0, links: 0 }, groups: [] };

    var numbers = fixNumbers(text, d);
    var links = fixLinks(numbers.text, d.sectors);
    var kept = refs.filter(function (x) { return x && linkOk(x.url, d.sectors); });
    var dropped = refs.length - kept.length;
    return {
      v: VERSION,
      answer: links.text,
      references: kept,
      fixed: { numbers: numbers.fixed, links: links.removed + dropped },
      groups: numbers.groups,
    };
  }

  var api = { version: VERSION, check: check, linkOk: function (u) { var d = data(); return d ? linkOk(u, d.sectors) : true; },
    enabled: function () { return !!data(); } };
  root.JCAssistCheck = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
