#!/usr/bin/env node
/* 통일성 검수 — 섹터 첫 화면의 「겉틀」이 규격(assets/shell.css 머리말, DESIGN.md §3 토큰)과 같은지 잰다.
   사용: node ops/qa/look.js [경로…]     경로가 없으면 대문을 뺀 모든 섹터.
   잰 것(390·1280, 밝게): 첫 화면 단추 44×44·모서리 12px / 본문 글꼴 Pretendard / 바탕 #faf6ef / 첫 화면 큰 제목(.hero h1) 28px·42px, 굵기 850.
   audit.js가 「고장」을 잰다면 이 도구는 「어긋남」을 잰다. 어긋난 항목은 ops/TODO.md의 이관 목록과 맞춘다. */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..');
let PAGES = process.argv.slice(2);
if (!PAGES.length) PAGES = fs.readdirSync(ROOT).filter(d => fs.existsSync(path.join(ROOT, d, 'index.html')) && !/^(admin|assets|design|docs|drafts|ops)$/.test(d)).map(d => d + '/');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const serve = () => new Promise(res => { const s = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0].split('#')[0])); if (!f.startsWith(ROOT)) { r.writeHead(403); return r.end(); } if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }); s.listen(0, '127.0.0.1', () => res(s)); });

(async () => {
  const srv = await serve(), base = 'http://127.0.0.1:' + srv.address().port + '/', b = await chromium.launch(); let off = 0;
  for (const pg of PAGES) {
    const notes = [];
    for (const [w, h] of [[390, 844], [1280, 800]]) {
      const c = await b.newContext({ viewport: { width: w, height: h } });
      await c.addInitScript(() => { window.__JC_QA__ = 1; });   // 회원 전용 게이트 건너뛰기(검사용)
      await c.addInitScript(() => { try { localStorage.setItem('jc-theme', 'light'); } catch (e) {} });
      const p = await c.newPage(); await p.goto(base + pg, { waitUntil: 'load' }).catch(() => {}); await p.waitForTimeout(1200);
      const r = await p.evaluate(() => {
        const cs = el => getComputedStyle(el), home = document.querySelector('a[href="../"],a[href="../index.html"]'), q = home && home.getBoundingClientRect(), body = cs(document.body);
        const hh = document.querySelector('.hero h1'), hc = hh && cs(hh);
        return { h1: hc ? [Math.round(parseFloat(hc.fontSize)), hc.fontWeight, hc.fontFamily] : null, font: body.fontFamily.split(',')[0].replace(/"/g, '').trim(), bg: body.backgroundColor, home: q ? [Math.round(q.width), Math.round(q.height), Math.round(q.left), Math.round(q.top + q.height / 2)] : null, rad: home ? parseFloat(cs(home).borderRadius) : null };
      });
      const t = w + ': ';
      if (!/^Pretendard/.test(r.font)) notes.push(t + '글꼴 ' + r.font);
      if (r.bg !== 'rgb(250, 246, 239)') notes.push(t + '바탕 ' + r.bg);
      if (!r.home) notes.push(t + '첫 화면 단추 없음');
      else { if (r.home[0] !== 44 || r.home[1] !== 44) notes.push(t + '첫 화면 단추 ' + r.home[0] + '×' + r.home[1]); if (r.rad !== 12) notes.push(t + '단추 모서리 ' + r.rad); if (r.home[3] < 26 || r.home[3] > 34) notes.push(t + '단추 세로 중심 ' + r.home[3] + '(기준 26~34)'); }
      const want = w === 390 ? 28 : 42;   // 첫 화면 큰 제목: clamp(28px,1.9vw + 20.5px,42px) · 굵기 850
      if (r.h1 && (r.h1[0] !== want || (r.h1[1] !== '850' && !/Hahmlet|Serif/.test(r.h1[2])))) notes.push(t + '큰 제목 ' + r.h1[0] + 'px/' + r.h1[1] + '(기준 ' + want + 'px/850)');
      await c.close();
    }
    if (notes.length) off++;
    console.log((notes.length ? '△ ' : '✓ ') + '/' + pg + (notes.length ? '\n    ' + notes.join('\n    ') : ''));
  }
  console.log('\n' + (off ? '규격과 어긋난 섹터 ' + off + '곳 — ops/TODO.md 이관 목록과 맞춘다.' : '모든 섹터가 규격과 같다.'));
  await b.close(); srv.close();
})();
