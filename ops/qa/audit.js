#!/usr/bin/env node
/* 공용 실화면 검수 (ops/ROLES.md — Playwright 역할)
   사용: node ops/qa/audit.js [경로…]    예) node ops/qa/audit.js reality/ briefing/
   경로를 주지 않으면 대문만 잰다. 저장소 루트를 정적 서버로 띄워 폭·테마별로 잰다.
   잰 것: 콘솔·페이지 오류(외부 글꼴 CDN 차단 제외), 가로 넘침, 44px 미달, 도표 숫자(폰트·tabular-nums·자간), 화면 분량(문서 높이 ÷ 화면 높이), 대기 rAF.
   기준: 오류 0 · 넘침 0 · 44px 미달 0 · 도표숫자 0 · 화면 분량 큰 화면 ≤ 1.5, 휴대폰 ≤ 2.5(긴글 읽기 화면은 예외로 기록).
   일회성 시험·가짜 데이터는 이 폴더에 넣지 않는다(세션 작업 폴더에서 브라우저 안으로만 주입). */
'use strict';
const path = require('path');
const http = require('http');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('playwright를 찾지 못했습니다. 클라우드 세션에는 미리 설치돼 있습니다.'); process.exit(2); }

const ROOT = path.resolve(__dirname, '..', '..');
const PAGES = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!PAGES.length) PAGES.push('');
const SIZES = [[390, 844, 'phone'], [360, 780, 'phone'], [820, 1180, 'tablet'], [1024, 768, 'tablet'], [1280, 800, 'desktop'], [1600, 900, 'desktop']];
const LIMIT = { phone: 2.5, tablet: 1.6, desktop: 1.5 };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.md': 'text/plain; charset=utf-8' };

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
      let f = path.join(ROOT, p);
      if (!f.startsWith(ROOT)) { rsp.writeHead(403); return rsp.end(); }
      if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
      if (!fs.existsSync(f)) { rsp.writeHead(404); return rsp.end(); }
      rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rsp);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

(async () => {
  const srv = await serve(); const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const b = await chromium.launch(); let fail = 0;
  for (const pg of PAGES) {
    for (const [w, h, kind] of SIZES) for (const theme of ['light', 'dark']) {
      const c = await b.newContext({ viewport: { width: w, height: h } });
      await c.addInitScript(t => { try { localStorage.setItem('jc-theme', t); } catch (e) {} }, theme);
      await c.route(/cdn\.jsdelivr|unpkg\.com|fonts\.g(oogleapis|static)\.com/, r => r.abort());
      const p = await c.newPage(); const errs = [];
      p.on('pageerror', e => errs.push(String(e).slice(0, 120)));
      p.on('console', m => { if (m.type() === 'error' && !/jsdelivr|unpkg|fonts\.g/.test((m.location() || {}).url || '')) errs.push(m.text().slice(0, 120)); });
      await p.goto(base + pg, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1800);
      const r = await p.evaluate(() => {
        const small = [];
        /* ── 칩·단추 안 글자 중앙 오차 + 같은 줄 그림자 일관성 (2026-11-24) ──
           · 글자 상자(잉크)와 단추 상자의 위/아래·좌/우 여백이 1.5px 넘게 갈리면 «치우침»
           · 같은 부모에 같은 모양으로 나란한 단추의 손맛 그림자(.jc-pop) 유무가 갈리면 «불일치»
           · 글꼴 잉크는 줄 상자 안에서 1px 남짓 비대칭이라 허용치는 1.5px로 둔다 */
        const chipBad = [];
        const _vis = el => { const s = getComputedStyle(el); if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) < .05) return false; const q = el.getBoundingClientRect(); return q.width > 1 && q.height > 1; };
        const _rad = v => (String(v).indexOf('%') >= 0 ? 99 : parseFloat(v) || 0);
        const _pad = v => { const a = v.split(' ').map(x => parseFloat(x) || 0); return a.length === 1 ? [a[0], a[0], a[0], a[0]] : a.length === 2 ? [a[0], a[1], a[0], a[1]] : a.length === 3 ? [a[0], a[1], a[2], a[1]] : a; };
        const _ink = el => {
          let l = 1e9, t = 1e9, r = -1e9, b = -1e9, lines = 0;
          const add = q => { if (q.width < 1 || q.height < 1) return; l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom); };
          const walk = n => n.childNodes.forEach(k => {
            if (k.nodeType === 3) { if (!k.textContent.trim()) return; lines++; const rg = document.createRange(); rg.selectNodeContents(k); [...rg.getClientRects()].forEach(add); }
            else if (k.nodeType === 1) {
              const s2 = getComputedStyle(k); if (s2.display === 'none' || s2.visibility === 'hidden' || s2.position === 'absolute') return;
              const hasText = [...k.childNodes].some(x => x.nodeType === 3 && x.textContent.trim());
              if (!hasText && !k.children.length) { add(k.getBoundingClientRect()); return; }
              walk(k);
            }
          });
          walk(el); return r < l ? null : { l, t, r, b, lines };
        };
        const _rows = {};
        document.querySelectorAll('a,button,summary,[role=button]').forEach(el => {
          if (el.closest('#jc-marker-ui,#jc-imm-dock,[data-jc-ignore]') || !_vis(el)) return;
          const q = el.getBoundingClientRect(); const cs = getComputedStyle(el);
          if (cs.position === 'fixed' || cs.position === 'sticky') return;
          const bg = cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)';
          const bd = (parseFloat(cs.borderTopWidth) || 0) > 0;
          const name = el.id || String(el.className).split(' ')[0] || el.tagName;
          /* 그림자 무리: 같은 부모 + 같은 모양 */
          const pKey = (el.parentElement ? (el.parentElement.id || String(el.parentElement.className).split(' ')[0] || el.parentElement.tagName) : 'body') + '|' + String(el.className).replace(/\s*jc-(pop|pop-l|in|boing)\b/g, '') + '|' + bg + bd;
          (_rows[pKey] = _rows[pKey] || []).push(el.classList.contains('jc-pop'));
          /* 글자 중앙 */
          if (_rad(cs.borderTopLeftRadius) < 6 || !(bg || bd) || q.height < 24 || q.height > 64) return;
          const ink = _ink(el); if (!ink || ink.b - ink.t > 28) return;
          const pd = _pad(cs.padding);
          const top = ink.t - q.top - (parseFloat(cs.borderTopWidth) || 0), bot = q.bottom - (parseFloat(cs.borderBottomWidth) || 0) - ink.b;
          const lf = ink.l - q.left - (parseFloat(cs.borderLeftWidth) || 0), rt = q.right - (parseFloat(cs.borderRightWidth) || 0) - ink.r;
          const leftish = /^(left|start|right|end)/.test(cs.textAlign || '');
          if (Math.abs(pd[0] - pd[2]) < .6 && Math.abs(top - bot) > 1.5) chipBad.push('세로 ' + Math.round(Math.abs(top - bot) * 10) / 10 + 'px ' + name + ' 「' + (el.textContent || '').trim().slice(0, 10) + '」');
          else if (Math.abs(pd[1] - pd[3]) < .6 && !leftish && Math.abs(lf - rt) > 1.5) chipBad.push('가로 ' + Math.round(Math.abs(lf - rt) * 10) / 10 + 'px ' + name + ' 「' + (el.textContent || '').trim().slice(0, 10) + '」');
        });
        Object.keys(_rows).forEach(k => { const a = _rows[k]; if (a.length > 1 && a.some(Boolean) && a.some(x => !x)) chipBad.push('그림자 불일치 ' + k.split('|')[1] + ' ' + a.filter(x => !x).length + '/' + a.length); });
        /* 도표 숫자 — 폰트·고정폭·자간 (DESIGN.md §8-2, 2026-11-24).
           상속에 맡기면 body의 letter-spacing(-.16px)이 10.5px 숫자까지 내려가고,
           Pretendard의 비례 숫자는 커닝으로 「00」이 2px쯤 좁아져 Y축 500이 「5 00」으로 벌어진다. */
        const nums = [];
        document.querySelectorAll('svg.chs text').forEach(el => {
          const s = getComputedStyle(el), txt = (el.textContent || '').trim();
          if (!/\d/.test(txt)) return;
          const who = '도표숫자「' + txt.slice(0, 12) + '」';
          if (!/Pretendard/.test(s.fontFamily)) nums.push(who + ' 폰트 ' + s.fontFamily.slice(0, 18));
          if (!/tabular-nums/.test(s.fontVariantNumeric)) nums.push(who + ' tabular-nums 없음');
          if (!/^(normal|0px|0)$/.test(s.letterSpacing)) nums.push(who + ' 자간 ' + s.letterSpacing);
          /* 숫자만 있는 이름표는 글자 사이 간격이 모두 같아야 한다(다른 글자·쉼표는 뺀다) */
          if (!/^\d{2,}$/.test(txt)) return;
          const adv = [];
          for (let i = 1; i < txt.length; i++) {
            try { adv.push(+(el.getStartPositionOfChar(i).x - el.getStartPositionOfChar(i - 1).x).toFixed(2)); } catch (e) {}
          }
          /* 1px 안쪽 차이는 글자 위치의 소수점 반올림이라 문제가 아니다(7.33px 자리를 7·8로 그린다).
             커닝으로 한 글자가 좁아지면 2px 안팎으로 벌어지므로 1.2px를 넘을 때만 실패로 본다. */
          if (adv.length > 1 && Math.max(...adv) - Math.min(...adv) > 1.2) nums.push(who + ' 자간 불균일 ' + adv.join('/'));
        });
        document.querySelectorAll('a,button,select,input,summary,[role=button],[role=tab]').forEach(el => {
          if (el.closest('#jc-marker-ui,#jc-imm-dock')) return; const q = el.getBoundingClientRect(); if (!q.width || !q.height) return;
          const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline';
          /* 체크박스·라디오를 감싼 <label>이 44px 이상이면 그 라벨 전체가 누르는 칸이다(2026-11-22, C3-25 — 상담 HUD 조건 칸) */
          const lab = el.tagName === 'INPUT' && /^(checkbox|radio)$/.test(el.type) && el.closest('label'); if (lab) { const lq = lab.getBoundingClientRect(); if (lq.width >= 43.5 && lq.height >= 43.5) return; }
          if (!inline && (q.width < 43.5 || q.height < 43.5)) small.push((el.id || String(el.className).split(' ')[0] || el.tagName) + ' ' + Math.round(q.width) + 'x' + Math.round(q.height));
        });
        return { screens: +(document.documentElement.scrollHeight / innerHeight).toFixed(1), overflow: document.documentElement.scrollWidth - innerWidth, small: small.slice(0, 6), smallCount: small.length, chip: chipBad.slice(0, 6), chipCount: chipBad.length, nums };
      });
      const idle = await p.evaluate(() => new Promise(res => { let n = 0; const o = requestAnimationFrame; window.requestAnimationFrame = f => { n++; return o(f); }; setTimeout(() => { window.requestAnimationFrame = o; res(n); }, 3000); }));
      const bad = errs.length || r.overflow > 0 || r.smallCount || r.chipCount || r.nums.length || r.screens > LIMIT[kind] || idle > 10;
      if (bad) fail++;
      console.log(`${bad ? '✗' : '✓'} /${pg} ${w}x${h} ${theme}  오류 ${errs.length} · 넘침 ${r.overflow} · 44px 미달 ${r.smallCount} · 칩 정렬 ${r.chipCount} · 도표숫자 ${r.nums.length} · 화면 ${r.screens}(기준 ${LIMIT[kind]}) · 대기 rAF ${idle}` +
        (errs.length ? '\n    ' + errs.join('\n    ') : '') + (r.smallCount ? '\n    ' + r.small.join(' | ') : '') + (r.chipCount ? '\n    ' + r.chip.join(' | ') : '') + (r.nums.length ? '\n    ' + r.nums.slice(0, 6).join(' | ') : ''));
      await c.close();
    }
  }
  await b.close(); srv.close();
  console.log(fail ? `\n기준을 넘은 조합 ${fail}개 — 고친 뒤 다시 재고, 예외(긴글 읽기 등)는 HANDOFF에 사유를 남긴다.` : '\n모든 조합 통과.');
  process.exit(fail ? 1 : 0);
})();
