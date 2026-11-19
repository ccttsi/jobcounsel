/* mydeck-diy.js — 마이덱 「공간 꾸미기」의 여섯 가지 요소 × 요소마다 여섯 가지 조건 (2026-11-20)
 *
 * 마이덱 화면(mydeck/)의 덱 공간을 사용자가 직접 꾸민다. 테마(밝게·세피아·어둡게)마다 따로 저장한다.
 *   1) 배경 색·톤   6가지 팔레트 + 자유 색상표(<input type="color">·HEX)
 *   2) 글자 색     6가지 팔레트 + 자유 색상표 + 대비 경고
 *   3) 덱 카드 스타일      6가지
 *   4) 서체 분위기         6가지
 *   5) 배치·밀도           6가지
 *   6) 장식·강조 포인트    6가지
 *
 * 고른 값은 공간 요소의 data-속성과 CSS 변수(--d-bg·--d-ink)로만 붙는다. 그래서 화면 코드를 건드리지 않고
 * 색·서체·배치가 즉시 바뀌고, CSS는 mydeck/index.html 안에 있다. 값은 mydeck-store.js가 저장한다.
 *
 * 대비는 WCAG 계산식(상대휘도)으로 재서 4.5:1 아래면 경고만 하고, 고른 값은 그대로 쓴다(사용자의 선택).
 */
(function () {
  'use strict';
  if (window.JCDiy) return;

  var ELEMENTS = [
    {
      id: 'bg', name: '배경 색·톤', short: '배경', kind: 'color',
      note: '덱이 놓이는 바탕입니다. 팔레트 여섯 가지 중에 고르거나, 색상표에서 직접 고릅니다.',
      options: [
        { id: 'paper', name: '종이', light: '#faf6ef', dark: '#14181f' },
        { id: 'cream', name: '크림', light: '#fdf2dd', dark: '#1a1509' },
        { id: 'sage', name: '세이지', light: '#eef2e6', dark: '#0f1a14' },
        { id: 'mist', name: '안개', light: '#eaf0f7', dark: '#0d1520' },
        { id: 'blush', name: '연분홍', light: '#f9ecea', dark: '#1c1013' },
        { id: 'slate0', name: '잉크', light: '#22262e', dark: '#05070a' }
      ]
    },
    {
      id: 'ink', name: '글자 색', short: '글자', kind: 'color',
      note: '덱 카드의 글자 색입니다. 바탕과 대비가 4.5:1보다 낮으면 읽기 어렵다고 알려 드립니다.',
      options: [
        { id: 'ink', name: '잉크', light: '#2a2521', dark: '#e6e9ef' },
        { id: 'black', name: '먹', light: '#111318', dark: '#f6f7fa' },
        { id: 'slate', name: '슬레이트', light: '#33415c', dark: '#c3d0e8' },
        { id: 'brown', name: '갈색', light: '#4a3524', dark: '#e6d3bd' },
        { id: 'forest', name: '숲', light: '#20453a', dark: '#b6e0cf' },
        { id: 'plum', name: '자주', light: '#4a2f4e', dark: '#e3c8ea' }
      ]
    },
    {
      id: 'card', name: '덱 카드 스타일', short: '카드', kind: 'style',
      note: '덱 한 장의 겉모양입니다.',
      options: [
        { id: 'paper', name: '기본 종이', desc: '종이 카드에 얇은 테두리와 옅은 그림자' },
        { id: 'tape', name: '마스킹테이프', desc: '카드 위에 테이프 한 줄을 붙인 손맛' },
        { id: 'clean', name: '클린 보더', desc: '그림자 없이 또렷한 테두리만' },
        { id: 'glass', name: '글래스', desc: '반투명 유리 — 뒤 배경이 비칩니다' },
        { id: 'mono', name: '터미널', desc: '고정폭 글꼴과 위쪽 창 막대' },
        { id: 'neon', name: '네온', desc: '어두운 판에 테두리가 빛나는 카드' }
      ]
    },
    {
      id: 'font', name: '서체 분위기', short: '서체', kind: 'style',
      note: '덱 제목과 본문의 서체입니다.',
      options: [
        { id: 'gothic', name: '기본 고딕', desc: '읽기 편한 본문 고딕' },
        { id: 'serif', name: '세리프 명조', desc: '책 같은 명조체' },
        { id: 'mono', name: '코딩 모노', desc: '고정폭 — 번호·코드가 나란히' },
        { id: 'editorial', name: '에디토리얼 믹스', desc: '제목은 명조, 본문은 고딕' },
        { id: 'round', name: '둥근 톤', desc: '부드러운 둥근 글꼴' },
        { id: 'bold', name: '고대비 볼드', desc: '굵고 촘촘하게 조인 제목' }
      ]
    },
    {
      id: 'layout', name: '배치·밀도', short: '배치', kind: 'style',
      note: '덱을 몇 줄로, 얼마나 촘촘하게 놓을지입니다.',
      options: [
        { id: 'grid2', name: '2열 카드', desc: '넓은 화면에서 두 줄로' },
        { id: 'list1', name: '1열 리스트', desc: '한 줄에 하나씩, 위에서 아래로' },
        { id: 'rail', name: '가로 레일', desc: '옆으로 밀어 보는 한 줄' },
        { id: 'tiles', name: '컴팩트 타일', desc: '작은 타일을 촘촘히' },
        { id: 'board', name: '여유 보드', desc: '넉넉한 여백의 한 장씩' },
        { id: 'timeline', name: '타임라인형', desc: '왼쪽 선을 따라 순서대로' }
      ]
    },
    {
      id: 'deco', name: '장식·강조 포인트', short: '장식', kind: 'style',
      note: '번호·연결선·그림자 같은 강조 방식입니다.',
      options: [
        { id: 'badge', name: '번호 뱃지', desc: '동그란 번호 뱃지를 앞에' },
        { id: 'rail', name: '연결선 강조', desc: '카드 사이를 잇는 선을 세웁니다' },
        { id: 'shadow', name: '그림자 깊이', desc: '카드가 떠 보이게' },
        { id: 'bar', name: '좌측 컬러바', desc: '카드 왼쪽에 색 띠' },
        { id: 'emoji', name: '이모지 태그', desc: '분류마다 작은 표시' },
        { id: 'plain', name: '미니멀 무장식', desc: '번호도 선도 없이 글자만' }
      ]
    }
  ];

  var BY_ID = {};
  ELEMENTS.forEach(function (g) { BY_ID[g.id] = g; });

  function option(groupId, optId) {
    var g = BY_ID[groupId];
    if (!g) return null;
    for (var i = 0; i < g.options.length; i++) if (g.options[i].id === optId) return g.options[i];
    return null;
  }

  function defaults(theme) {
    return { bg: 'paper', ink: 'ink', card: 'paper', font: 'gothic', layout: 'grid2', deco: 'badge', custom: {} };
  }

  function isHex(v) { return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v); }

  /* 저장된 값을 지금 테마에 맞는 모양으로 다듬는다 — 모르는 값은 기본값으로 되돌린다. */
  function normalize(theme, raw) {
    var out = defaults(theme), src = (raw && typeof raw === 'object') ? raw : {};
    var light = theme !== 'dark';
    ['card', 'font', 'layout', 'deco'].forEach(function (k) {
      if (option(k, src[k])) out[k] = src[k];
    });
    if (option('bg', src.bg)) out.bg = src.bg;
    else if (src.bg_custom && isHex(src.bg_custom)) out.bg = 'custom';
    if (option('ink', src.ink)) out.ink = src.ink;
    else if (src.ink_custom && isHex(src.ink_custom)) out.ink = 'custom';
    out.custom = {};
    if (src.bg_custom && isHex(src.bg_custom)) out.custom.bg = src.bg_custom.toUpperCase();
    if (src.ink_custom && isHex(src.ink_custom)) out.custom.ink = src.ink_custom.toUpperCase();
    out.bgHex = (out.bg === 'custom' && out.custom.bg) ? out.custom.bg
      : ((option('bg', out.bg) || {}).hex || (option('bg', out.bg) || {})[light ? 'light' : 'dark'] || '#faf6ef');
    out.inkHex = (out.ink === 'custom' && out.custom.ink) ? out.custom.ink
      : ((option('ink', out.ink) || {})[light ? 'light' : 'dark'] || '#2a2521');
    return out;
  }

  function toSaved(values) {
    var v = values || {};
    return {
      bg: v.bg || 'paper', ink: v.ink || 'ink',
      card: v.card || 'paper', font: v.font || 'gothic',
      layout: v.layout || 'grid2', deco: v.deco || 'badge',
      bg_custom: (v.custom && v.custom.bg) || '',
      ink_custom: (v.custom && v.custom.ink) || ''
    };
  }

  /* ---------- 대비 (WCAG 상대휘도) ---------- */
  function lum(hex) {
    var h = String(hex || '').replace('#', '');
    if (h.length !== 6) return 0;
    var c = [0, 2, 4].map(function (i) { return parseInt(h.slice(i, i + 2), 16) / 255; });
    var f = function (v) { return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  }
  function contrast(a, b) {
    var la = lum(a), lb = lum(b);
    var hi = Math.max(la, lb), lo = Math.min(la, lb);
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
  }

  /* ---------- 공간에 붙이기 ---------- */
  function apply(el, values) {
    if (!el) return;
    el.setAttribute('data-diy-bg', values.bg || 'paper');
    el.setAttribute('data-diy-card', values.card || 'paper');
    el.setAttribute('data-diy-font', values.font || 'gothic');
    el.setAttribute('data-diy-layout', values.layout || 'grid2');
    el.setAttribute('data-diy-deco', values.deco || 'badge');
    el.style.setProperty('--d-bg', values.bgHex);
    el.style.setProperty('--d-ink', values.inkHex);
  }

  window.JCDiy = {
    elements: ELEMENTS, byId: BY_ID, option: option,
    defaults: defaults, normalize: normalize, toSaved: toSaved,
    contrast: contrast, apply: apply, isHex: isHex
  };
})();
