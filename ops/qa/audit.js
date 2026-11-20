#!/usr/bin/env node
/* 공용 실화면 검수 (ops/ROLES.md — Playwright 역할)
   사용: node ops/qa/audit.js [경로…]    예) node ops/qa/audit.js reality/ briefing/
   경로를 주지 않으면 대문만 잰다. 저장소 루트를 정적 서버로 띄워 폭·테마별로 잰다.
   잰 것: 콘솔·페이지 오류(외부 글꼴 CDN 차단 제외), 가로 넘침, 44px 미달, 화면 분량(문서 높이 ÷ 화면 높이), 대기 rAF.
   기준: 오류 0 · 넘침 0 · 44px 미달 0 · 화면 분량 큰 화면 ≤ 1.5, 휴대폰 ≤ 2.5(긴글 읽기 화면은 예외로 기록).
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
        document.querySelectorAll('a,button,select,input,summary,[role=button],[role=tab]').forEach(el => {
          if (el.closest('#jc-marker-ui,#jc-imm-dock')) return; const q = el.getBoundingClientRect(); if (!q.width || !q.height) return;
          const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline';
          if (!inline && (q.width < 43.5 || q.height < 43.5)) small.push((el.id || String(el.className).split(' ')[0] || el.tagName) + ' ' + Math.round(q.width) + 'x' + Math.round(q.height));
        });
        return { screens: +(document.documentElement.scrollHeight / innerHeight).toFixed(1), overflow: document.documentElement.scrollWidth - innerWidth, small: small.slice(0, 6), smallCount: small.length };
      });
      const idle = await p.evaluate(() => new Promise(res => { let n = 0; const o = requestAnimationFrame; window.requestAnimationFrame = f => { n++; return o(f); }; setTimeout(() => { window.requestAnimationFrame = o; res(n); }, 3000); }));
      const bad = errs.length || r.overflow > 0 || r.smallCount || r.screens > LIMIT[kind] || idle > 10;
      if (bad) fail++;
      console.log(`${bad ? '✗' : '✓'} /${pg} ${w}x${h} ${theme}  오류 ${errs.length} · 넘침 ${r.overflow} · 44px 미달 ${r.smallCount} · 화면 ${r.screens}(기준 ${LIMIT[kind]}) · 대기 rAF ${idle}` +
        (errs.length ? '\n    ' + errs.join('\n    ') : '') + (r.smallCount ? '\n    ' + r.small.join(' | ') : ''));
      await c.close();
    }
  }
  await b.close(); srv.close();
  console.log(fail ? `\n기준을 넘은 조합 ${fail}개 — 고친 뒤 다시 재고, 예외(긴글 읽기 등)는 HANDOFF에 사유를 남긴다.` : '\n모든 조합 통과.');
  process.exit(fail ? 1 : 0);
})();
