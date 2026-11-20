/* modes.js — 대문의 시드(11) · 매치(12) 모드 전환 경험 (2026-11-17, 2026-11-18 R3, 2026-11-19 R5)
 *
 * 트리거 두 가지
 *   ① 롤링 화면: 반원 다이얼 오른쪽 슬롯 레버 — 1차(2시→1시 장전) → 2차(1시→6시 회전 & 글래스 + 롤링 회전)
 *   ② 목록 화면: 쪽수 아래 심전도 파동 — 1차(심박 빨라짐) → 2차(거친 파형으로 마구 뛰다 + 글래스)
 * 매 분 00초에 5.0초 동안 작동하는 방치 유도(레버 5칸 래칫·심전도 한붓그리기)로 "이게 트리거"임을 알린다.
 * 2026-11-19: 방치 유도 주기를 2분 → **매 분 00초**로 당기고, 심전도 격발은 글래스가 덮이기까지
 *   1.9초 동안 진폭·속도가 점점 커지고 빨라지는 고조(surge)로 바꿨다.
 * 2026-11-19 R6: 방치 유도의 문양을 **0~59분 60분 사이클·19가지 단순 문양**으로 넓히고(이웃한 분끼리
 *   같은 문양이 이어지지 않게 짠 표), 격발은 가로 압축을 풀어 진짜 빠르게(약 7.8배)·더 길게(2.6초)·
 *   진동(셰이크)과 색 그라데이션까지 얹었다. 캔버스 위아래 여백도 4px 이상 확보했다.
 * 방치 유도는 사용자가 만진 것으로 치지 않는다 — 끝나면 롤링이 그 자리에서 이어서 흐른다. 장전·오버레이 중이면 건너뛴다.
 *
 * 모드 재구성은 index.html 안쪽 내비게이션이 맡는다(window.JC_NAV). 이 파일은 기계(트리거·오버레이·연출)만 다룬다.
 * 움직임은 `transform`·`opacity`와 **캔버스 한 장**뿐이다(2026-11-19: SVG path/SMIL 제거). 감속 모드에서는 연출 없이 바로 결과로 간다.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var hoverMQ = window.matchMedia ? window.matchMedia('(hover:hover) and (pointer:fine)') : { matches: false };
  var reduceMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  /* ---------- 심전도 방치 유도: 60분 한 바퀴, 19가지 단순 문양 ----------
   * 2026-11-19: 5분 주기·복잡한 일필휘지 도형을 걷어내고 **0~59분 60분 사이클**로 넓혔다.
   *   · 19가지 단순 문양(전구·달·잎·구름·깃발·꽃…)을 분마다 네 개씩 모핑한다.
   *   · 표는 분(0~59)마다 다른 네 문양으로 짜 두었다. 이웃한 분(59→00 경계 포함)끼리 같은 문양이
   *     이어지지 않고, 한 분 안에서도 같은 문양이 두 번 나오지 않는다(도구·검사가 표를 그대로 확인한다).
   *   · 문양은 모두 점 36개짜리 한붓그리기라 점이 그대로 이어지며 부드럽게 구부러진다.
   *   · 작은 전구·반짝이·점·빛살을 곁들여 문양만으로 밋밋하지 않게 한다.
   *   · 세로 여백: 문양을 캔버스 34px 안에 0.98배로 앉혀 위아래 4px 이상을 늘 비워 둔다(다이아·별이 잘리지 않는다).
   */
  var ECG_SHAPES = {
    ring: 'M22.00 4.00 L24.08 4.18 L26.10 4.72 L28.00 5.61 L29.71 6.81 L31.19 8.29 L32.39 10.00 L33.28 11.90 L33.82 13.92 L34.00 16.00 L33.82 18.08 L33.28 20.10 L32.39 22.00 L31.19 23.71 L29.71 25.19 L28.00 26.39 L26.10 27.28 L24.08 27.82 L22.00 28.00 L19.92 27.82 L17.90 27.28 L16.00 26.39 L14.29 25.19 L12.81 23.71 L11.61 22.00 L10.72 20.10 L10.18 18.08 L10.00 16.00 L10.18 13.92 L10.72 11.90 L11.61 10.00 L12.81 8.29 L14.29 6.81 L16.00 5.61 L17.90 4.72 L19.92 4.18 Z',
    diamond: 'M22.00 3.60 L22.26 3.97 L23.01 5.05 L24.15 6.70 L25.55 8.72 L27.05 10.88 L28.45 12.90 L29.59 14.55 L30.34 15.63 L30.60 16.00 L30.34 16.37 L29.59 17.45 L28.45 19.10 L27.05 21.12 L25.55 23.28 L24.15 25.30 L23.01 26.95 L22.26 28.03 L22.00 28.40 L21.74 28.03 L20.99 26.95 L19.85 25.30 L18.45 23.28 L16.95 21.12 L15.55 19.10 L14.41 17.45 L13.66 16.37 L13.40 16.00 L13.66 15.63 L14.41 14.55 L15.55 12.90 L16.95 10.88 L18.45 8.72 L19.85 6.70 L20.99 5.05 L21.74 3.97 Z',
    tri: 'M22.00 4.00 L23.08 5.92 L24.15 7.84 L25.23 9.76 L26.30 11.68 L27.38 13.59 L28.45 15.51 L29.53 17.43 L30.60 19.35 L31.68 21.27 L32.75 23.19 L33.83 25.11 L34.90 27.03 L33.00 27.20 L30.80 27.20 L28.60 27.20 L26.40 27.20 L24.20 27.20 L22.00 27.20 L19.80 27.20 L17.60 27.20 L15.40 27.20 L13.20 27.20 L11.00 27.20 L9.10 27.03 L10.17 25.11 L11.25 23.19 L12.32 21.27 L13.40 19.35 L14.47 17.43 L15.55 15.51 L16.62 13.59 L17.70 11.68 L18.77 9.76 L19.85 7.84 L20.92 5.92 Z',
    square: 'M22.00 5.00 L28.67 5.05 L30.10 5.19 L31.02 5.44 L31.70 5.81 L32.19 6.30 L32.56 6.98 L32.81 7.90 L32.95 9.33 L33.00 16.00 L32.95 22.67 L32.81 24.10 L32.56 25.02 L32.19 25.70 L31.70 26.19 L31.02 26.56 L30.10 26.81 L28.67 26.95 L22.00 27.00 L15.33 26.95 L13.90 26.81 L12.98 26.56 L12.30 26.19 L11.81 25.70 L11.44 25.02 L11.19 24.10 L11.05 22.67 L11.00 16.00 L11.05 9.33 L11.19 7.90 L11.44 6.98 L11.81 6.30 L12.30 5.81 L12.98 5.44 L13.90 5.19 L15.33 5.05 Z',
    hex: 'M22.00 4.40 L23.67 5.37 L25.35 6.33 L27.02 7.30 L28.70 8.27 L30.37 9.23 L32.05 10.20 L32.05 12.13 L32.05 14.07 L32.05 16.00 L32.05 17.93 L32.05 19.87 L32.05 21.80 L30.37 22.77 L28.70 23.73 L27.02 24.70 L25.35 25.67 L23.67 26.63 L22.00 27.60 L20.33 26.63 L18.65 25.67 L16.98 24.70 L15.30 23.73 L13.63 22.77 L11.95 21.80 L11.95 19.87 L11.95 17.93 L11.95 16.00 L11.95 14.07 L11.95 12.13 L11.95 10.20 L13.63 9.23 L15.30 8.27 L16.98 7.30 L18.65 6.33 L20.33 5.37 Z',
    star5: 'M22.00 3.40 L22.83 5.75 L23.67 8.11 L24.50 10.46 L26.00 11.90 L28.49 11.96 L30.99 12.03 L33.48 12.09 L32.40 13.32 L30.42 14.84 L28.44 16.36 L26.99 18.05 L27.70 20.45 L28.41 22.84 L29.12 25.24 L28.17 25.34 L26.11 23.93 L24.06 22.51 L22.00 21.10 L19.94 22.51 L17.89 23.93 L15.83 25.34 L14.88 25.24 L15.59 22.84 L16.30 20.45 L17.01 18.05 L15.56 16.36 L13.58 14.84 L11.60 13.32 L10.52 12.09 L13.01 12.03 L15.51 11.96 L18.00 11.90 L19.50 10.46 L20.33 8.11 L21.17 5.75 Z',
    star6: 'M22.00 3.60 L23.05 5.91 L24.10 8.23 L25.15 10.54 L27.68 10.30 L30.21 10.05 L32.74 9.80 L31.26 11.87 L29.78 13.93 L28.30 16.00 L29.78 18.07 L31.26 20.13 L32.74 22.20 L30.21 21.95 L27.68 21.70 L25.15 21.46 L24.10 23.77 L23.05 26.09 L22.00 28.40 L20.95 26.09 L19.90 23.77 L18.85 21.46 L16.32 21.70 L13.79 21.95 L11.26 22.20 L12.74 20.13 L14.22 18.07 L15.70 16.00 L14.22 13.93 L12.74 11.87 L11.26 9.80 L13.79 10.05 L16.32 10.30 L18.85 10.54 L19.90 8.23 L20.95 5.91 Z',
    heart: 'M17.25 10.13 L19.20 10.53 L20.68 11.34 L21.58 12.28 L21.94 13.02 L22.00 13.30 L22.06 13.02 L22.42 12.28 L23.32 11.34 L24.80 10.53 L26.75 10.13 L28.86 10.31 L30.76 11.08 L32.09 12.29 L32.56 13.76 L32.09 15.29 L30.76 16.76 L28.86 18.13 L26.75 19.41 L24.80 20.61 L23.32 21.70 L22.42 22.60 L22.06 23.21 L22.00 23.42 L21.94 23.21 L21.58 22.60 L20.68 21.70 L19.20 20.61 L17.25 19.41 L15.14 18.13 L13.24 16.76 L11.91 15.29 L11.44 13.76 L11.91 12.29 L13.24 11.08 L15.14 10.31 Z',
    moon: 'M20.12 4.07 L22.43 4.12 L24.69 4.61 L26.82 5.50 L24.52 5.71 L22.32 6.41 L20.32 7.57 L18.63 9.13 L17.31 11.02 L16.44 13.16 L16.06 15.43 L16.17 17.73 L16.79 19.96 L17.89 21.99 L19.42 23.72 L21.29 25.07 L23.41 25.98 L25.67 26.42 L25.76 26.98 L23.56 27.70 L21.27 27.99 L18.97 27.80 L16.74 27.18 L14.67 26.16 L12.83 24.77 L11.29 23.04 L10.14 21.04 L9.38 18.86 L9.05 16.57 L9.14 14.26 L9.70 12.02 L10.68 9.93 L12.04 8.07 L13.73 6.49 L15.68 5.25 L17.84 4.44 Z',
    bolt: 'M26.40 3.40 L25.77 5.43 L25.15 7.47 L24.52 9.50 L23.90 11.54 L23.27 13.57 L25.09 13.80 L27.22 13.80 L29.35 13.80 L30.00 14.44 L28.55 16.00 L27.10 17.55 L25.65 19.11 L24.20 20.67 L22.75 22.22 L21.30 23.78 L19.84 25.34 L18.39 26.89 L16.94 28.45 L17.44 26.79 L18.14 24.78 L18.85 22.77 L19.55 20.76 L20.25 18.75 L20.32 17.20 L18.19 17.20 L16.06 17.20 L13.93 17.20 L14.82 15.88 L16.27 14.32 L17.72 12.76 L19.16 11.20 L20.61 9.64 L22.06 8.08 L23.51 6.52 L24.95 4.96 Z',
    leaf: 'M22.00 4.00 L23.52 4.75 L24.93 5.70 L26.21 6.82 L27.32 8.10 L28.26 9.51 L29.01 11.03 L29.56 12.64 L29.89 14.31 L30.00 16.00 L29.89 17.69 L29.56 19.36 L29.01 20.97 L28.26 22.49 L27.32 23.90 L26.21 25.18 L24.93 26.30 L23.52 27.25 L22.00 28.00 L20.48 27.25 L19.07 26.30 L17.79 25.18 L16.68 23.90 L15.74 22.49 L14.99 20.97 L14.44 19.36 L14.11 17.69 L14.00 16.00 L14.11 14.31 L14.44 12.64 L14.99 11.03 L15.74 9.51 L16.68 8.10 L17.79 6.82 L19.07 5.70 L20.48 4.75 Z',
    drop: 'M22.00 4.60 L24.20 5.00 L26.21 6.00 L27.89 7.48 L29.19 9.30 L30.11 11.35 L30.64 13.54 L30.79 15.79 L30.56 18.02 L29.97 20.19 L28.99 22.21 L27.63 23.99 L25.90 25.41 L23.86 26.34 L22.25 26.32 L23.75 24.64 L25.25 22.96 L26.74 21.28 L28.24 19.60 L29.74 17.92 L30.30 17.78 L29.05 19.63 L27.28 21.01 L25.23 21.91 L23.02 22.32 L20.78 22.31 L18.58 21.86 L16.55 20.90 L14.80 19.49 L13.63 17.59 L14.25 15.67 L15.54 13.82 L16.83 11.98 L18.13 10.13 L19.42 8.29 L20.71 6.44 Z',
    cloud: 'M18.27 10.62 L20.32 11.15 L22.00 11.95 L23.30 12.71 L24.43 13.20 L25.70 13.38 L27.33 13.42 L29.31 13.58 L31.35 14.11 L33.03 15.11 L33.92 16.49 L33.79 18.00 L32.74 19.36 L31.08 20.38 L29.28 21.02 L27.72 21.45 L26.56 21.92 L25.70 22.62 L24.84 23.62 L23.66 24.77 L22.00 25.77 L19.96 26.32 L17.86 26.19 L16.10 25.35 L14.99 24.01 L14.60 22.47 L14.72 21.02 L14.99 19.84 L15.01 18.89 L14.59 18.00 L13.83 16.96 L13.03 15.65 L12.65 14.11 L13.01 12.57 L14.22 11.33 L16.10 10.65 Z',
    plus: 'M18.10 4.40 L20.68 4.40 L23.26 4.40 L25.83 4.40 L25.90 6.91 L25.90 9.49 L25.90 12.07 L28.44 12.10 L31.02 12.10 L33.60 12.10 L33.60 14.68 L33.60 17.26 L33.60 19.83 L31.09 19.90 L28.51 19.90 L25.93 19.90 L25.90 22.44 L25.90 25.02 L25.90 27.60 L23.32 27.60 L20.74 27.60 L18.17 27.60 L18.10 25.09 L18.10 22.51 L18.10 19.93 L15.56 19.90 L12.98 19.90 L10.40 19.90 L10.40 17.32 L10.40 14.74 L10.40 12.17 L12.91 12.10 L15.49 12.10 L18.07 12.10 L18.10 9.56 L18.10 6.98 Z',
    arrow: 'M23.91 5.07 L24.00 7.10 L24.00 9.31 L24.00 11.52 L25.23 12.50 L27.44 12.50 L29.65 12.50 L31.87 12.50 L34.08 12.50 L35.00 13.79 L35.00 16.00 L35.00 18.21 L34.08 19.50 L31.87 19.50 L29.65 19.50 L27.44 19.50 L25.23 19.50 L24.00 20.48 L24.00 22.69 L24.00 24.90 L23.91 26.93 L22.17 25.56 L20.43 24.20 L18.69 22.83 L16.96 21.46 L15.22 20.10 L13.48 18.73 L11.74 17.37 L10.00 16.00 L11.74 14.63 L13.48 13.27 L15.22 11.90 L16.96 10.54 L18.69 9.17 L20.43 7.80 L22.17 6.44 Z',
    banner: 'M29.00 4.03 L31.58 4.55 L34.02 5.54 L35.00 7.55 L35.00 10.19 L35.00 12.82 L35.00 15.46 L35.00 18.09 L35.00 20.73 L35.00 23.36 L35.00 26.00 L32.60 27.08 L30.08 27.83 L27.46 27.92 L24.90 27.29 L22.49 26.23 L20.10 25.13 L17.61 24.26 L15.00 24.03 L12.42 24.55 L9.98 25.54 L9.00 24.45 L9.00 21.81 L9.00 19.18 L9.00 16.54 L9.00 13.91 L9.00 11.27 L9.00 8.64 L9.00 6.00 L11.40 7.08 L13.92 7.83 L16.54 7.92 L19.10 7.29 L21.51 6.23 L23.90 5.13 L26.39 4.26 Z',
    bulb: 'M22.11 5.01 L23.86 5.24 L25.49 5.91 L26.92 6.93 L28.07 8.26 L28.87 9.82 L29.28 11.52 L29.29 13.27 L28.87 14.98 L28.07 16.54 L26.93 17.87 L25.83 18.99 L26.85 20.43 L27.25 22.00 L26.92 23.74 L26.13 25.26 L25.03 26.65 L23.58 27.51 L21.90 27.97 L20.21 27.45 L18.83 26.48 L17.74 25.09 L17.04 23.52 L16.71 21.79 L17.28 20.25 L18.30 18.81 L16.90 17.73 L15.79 16.36 L15.04 14.77 L14.69 13.06 L14.74 11.31 L15.21 9.62 L16.06 8.09 L17.25 6.80 L18.71 5.82 L20.36 5.22 Z',
    flower: 'M25.61 6.08 L26.56 8.11 L26.25 10.93 L25.71 12.89 L26.38 13.47 L28.69 13.57 L31.39 14.34 L32.60 16.00 L31.39 17.66 L28.69 18.43 L26.38 18.53 L25.71 19.11 L26.25 21.07 L26.56 23.89 L25.61 25.92 L23.72 25.76 L22.00 23.63 L21.07 21.28 L20.39 20.43 L18.93 21.32 L16.44 22.62 L14.02 22.70 L13.16 21.10 L14.34 18.79 L16.36 16.99 L17.34 16.00 L16.36 15.01 L14.34 13.21 L13.16 10.90 L14.02 9.30 L16.44 9.38 L18.93 10.68 L20.39 11.57 L21.07 10.72 L22.00 8.37 L23.72 6.24 Z',
    spark4: 'M22.00 3.20 L22.53 5.51 L23.07 7.82 L23.60 10.13 L24.14 12.44 L25.56 13.86 L27.87 14.40 L30.18 14.93 L32.49 15.47 L34.80 16.00 L32.49 16.53 L30.18 17.07 L27.87 17.60 L25.56 18.14 L24.14 19.56 L23.60 21.87 L23.07 24.18 L22.53 26.49 L22.00 28.80 L21.47 26.49 L20.93 24.18 L20.40 21.87 L19.86 19.56 L18.44 18.14 L16.13 17.60 L13.82 17.07 L11.51 16.53 L9.20 16.00 L11.51 15.47 L13.82 14.93 L16.13 14.40 L18.44 13.86 L19.86 12.44 L20.40 10.13 L20.93 7.82 L21.47 5.51 Z',
  };
  /* 19가지 단순 문양(전구·달·잎·구름·깃발…) — 점 36개짜리 한붓그리기라 어느 문양에서 어느 문양으로도
     점이 그대로 이어지며 부드럽게 구부러진다. 모두 위(12시)에서 시작해 같은 방향으로 도는 순서라
     모핑할 때 선이 꼬이거나 튀지 않는다. */
  var ECG_NAMES = ["ring", "diamond", "tri", "square", "hex", "star5", "star6", "heart", "moon", "bolt", "leaf", "drop", "cloud", "plus", "arrow", "banner", "bulb", "flower", "spark4"];
  /* 60분 한 바퀴 — 0~59분마다 다른 문양 네 개(문양마다 한 시간에 12~13번).
     이웃한 분(59→00 경계 포함)끼리 같은 문양이 이어지지 않고, 한 분 안에서도 겹치지 않게 짠 표다. */
  var ECG_SEQ = [
    [10,6,5,7], [1,14,8,3], [8,4,2,11], [7,8,5,4], [1,8,0,3],
    [13,0,11,15], [6,13,3,14], [18,5,14,2], [3,17,2,9], [15,5,2,6],
    [9,5,3,4], [14,17,18,2], [15,11,9,10], [13,18,5,17], [8,3,18,0],
    [3,10,7,17], [14,18,3,5], [11,16,5,3], [11,0,1,16], [5,4,17,2],
    [8,2,9,12], [0,14,10,12], [14,16,3,1], [0,7,13,6], [9,5,13,6],
    [7,4,1,10], [1,10,4,5], [11,18,4,13], [3,12,18,2], [14,13,4,5],
    [15,6,10,7], [10,6,16,12], [16,1,7,12], [10,4,16,18], [1,9,14,17],
    [11,13,0,2], [6,13,11,12], [14,15,18,0], [12,13,16,11], [15,0,12,1],
    [5,7,17,1], [17,7,4,8], [11,6,2,12], [9,6,8,2], [0,9,4,17],
    [14,8,13,12], [17,4,7,10], [17,16,14,13], [16,11,10,8], [12,8,15,2],
    [15,11,9,0], [16,1,9,7], [6,16,15,11], [6,17,1,9], [8,18,15,9],
    [0,2,3,18], [1,7,10,9], [0,15,4,6], [12,18,10,8], [16,15,7,3],
  ];
  /* 분마다 곁들이는 작은 보조 요소 — 0 전구 · 1 반짝이 · 2 점 셋 · 3 빛살 · 4 없음 */
  var ECG_ACC = [0,4,3,1,2,0,4,0,4,3,1,2,0,4,0,4,3,1,2,0,4,0,4,3,1,2,0,4,0,4,3,1,2,0,4,0,4,3,1,2,0,4,0,4,3,1,2,0,4,0,4,3,1,2,0,4,0,4,3,1];
  var ECG_COLORS = ['#0f766e', '#b4532a', '#8f5f00', '#8a2f45', '#3d5a80', '#5f6b2a'];

  var ARM_IDLE = 9000;      /* 1차만 누른 채 두면 이만큼 뒤 조용히 풀린다 */
  var HINT_MS = 5000;       /* 방치 유도 길이 — 레버·심전도 둘 다 5.0초 */
  var SURGE_MS = 2600;      /* 2차(격발) 고조 길이 — 1.9초→2.6초. 이 동안 진폭·속도가 점점 커지고 화면이 떨린다 */
  /* 2026-11-20 — 심전도 예비동작·복귀·이탈의 세 시간.
     2026-11-20 R2(태화님 지시): 장전과 격발의 **예비동작 뒤 가속**이 눈으로 구분되지 않는다는 지적.
     원인은 격발 고조 앞 30%(약 0.8초)가 장전과 같은 0.62초 주기에서 서서히 올라간 것.
     → ①격발 예비동작을 짧고 깊게(150ms·-1.7 → 110ms·-3.2) ②고조 첫 0.12초에 배속이 곧바로 뛰고
        ③시작 위상 배속을 1+3.6으로 크게 준 뒤 1로 가라앉힌다 ④꼭대기 주기를 0.09 → 0.065초로 당겼다.
     장전 꼭대기 위상속도 5.8박동/초 대비 격발은 0.15초 8.2 · 0.3초 12.2 · 끝 15.4박동/초(2.1~2.7배). */
  var LEAN_ARM = 560;       /* 클릭 직후: 150ms 뒤로 쓱 빠졌다가 410ms 동안 튀어나와 장전에 닿는다 */
  var LEAN_ARM_PULL = 150;
  var LEAN_FIRE = 110;      /* 격발 직전: 110ms 뒤로 당긴 뒤 고조가 시작된다(장전보다 짧고 깊게) */
  var FIRE_PULL = -3.2;     /* 격발 예비동작의 후진 배속(장전 -2.8) — 압축 뒤 폭발 */
  var CALM_MS = 1500;       /* 장전 → 기본: 한 곡선으로 속도↓·진폭↓·파장↑ */
  var EXIT_MS = 880;        /* 격발 → 글래스: 520 → 880ms. 글래스가 완전히 덮이기 전에 알파가 눈에 보이게 빠져나간다 */

  var nav, ov, glass, slot, slotBtn, ecgRow, ecgBtn, cards = [], foot, back;
  var open = false, picking = false, armed = '', armT = 0, timers = [], restFocus = null;

  /* ---------- 0. 정면 슬롯 레버 (2026-11-18 R4) ----------
   * 옆에서 본 팔의 각도 θ를 정면 화면에 3D→2D 원근 투영으로 그린다. 축(22,30.5)은 화면 안쪽을 향하고,
   *   손잡이 머리 y = 30 - 20·cos θ · 막대 길이 = 20.5·|cos θ| · 머리 크기 = 1 + 0.16·sin²θ
   * 이다. 상태가 바뀌어도 각도에서 각도로만 이어 가므로 중간에 끊기거나 튀지 않는다.
   *   · 1차(장전) 2시→1시: 짧은 감속 곡선(260ms)
   *   · 2차(격발) 1시→6시: 스프링(K=430, C=31)의 관성 곡선 하나로 6시까지 내려가 살짝 지나쳤다 안착(≈0.6s)
   *   · 방치 유도: 5칸 래칫으로 90ms 이동 + 90ms 정지를 다섯 번, 2초 정지, 같은 5칸 역방향(총 3.8s)
   * 움직이는 값은 손잡이 translate/scale과 막대 scaleY뿐이다(모두 transform). 다만 감속 모드에서는
   * 곡선 없이 결과 자세로 바로 간다. */
  var LV = { L: 19.5, th: 60, raf: 0, cap: null, shaft: null };
  function lvSet(th) {
    if (LV.th === th) return;                 /* 같은 자세를 프레임마다 다시 쓰지 않는다(래칫 정지 구간 비용 0) */
    var a = th * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    LV.th = th;
    if (LV.cap) LV.cap.style.transform = 'translate3d(0,' + (LV.L * (1 - c)).toFixed(2) + 'px,0) scale(' + (1 + .16 * s * s).toFixed(3) + ')';
    if (LV.shaft) LV.shaft.style.transform = 'scaleY(' + c.toFixed(4) + ')';
  }
  function lvStop() { if (LV.raf) { cancelAnimationFrame(LV.raf); LV.raf = 0; } }
  function lvTween(to, ms) {
    lvStop();
    if (reduce() || !ms) { lvSet(to); return; }
    var from = LV.th, t0 = performance.now();
    function f(now) {
      var p = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - p, 3);
      lvSet(from + (to - from) * e);
      LV.raf = p < 1 ? requestAnimationFrame(f) : 0;
    }
    LV.raf = requestAnimationFrame(f);
  }
  /* 격발: 스프링이 6시(180°)를 향해 가속하고, 끝에서 살짝 지나쳤다 돌아와 무겁게 안착한다(≈0.8s).
     중간 각도에서 걸리는 구간이 없다 — 한 번의 연속 곡선이다. */
  function lvFire() {
    lvStop();
    if (reduce()) { lvSet(180); return; }
    var th = LV.th, v = 0, tgt = 180, last = 0, K = 46, C = 10.5;
    function f(now) {
      if (!last) last = now;
      var dt = Math.min(.05, (now - last) / 1000); last = now;
      v += (K * (tgt - th) - C * v) * dt; th += v * dt;
      lvSet(th);
      if (Math.abs(tgt - th) > .05 || Math.abs(v) > 2) LV.raf = requestAnimationFrame(f);
      else { lvSet(tgt); LV.raf = 0; }
    }
    LV.raf = requestAnimationFrame(f);
  }
  /* 방치 유도(5.0초, 2026-11-20): 손을 놓지 않은 채 **9칸**을 내려갔다가 같은 9칸으로 2시(60°)에 돌아온다.
     · 내려감(0~2.4초): 한 칸씩 끊지 않고 smoothstep 하나로 연속 이동한다 — 뚜벅뚜벅 끊기던 느낌을 없앴다.
       격발(1.2초에 12칸 ≈ 10칸/초)보다 느린 3.75칸/초라 「손을 놓지 않고 감고 있다」로 읽힌다.
     · 멈춤(2.4~2.8초): 3시 30분에서 0.4초.
     · 올라옴(2.8~5.0초): **태엽인형의 래칫** — 한 칸당 244ms(90ms 딸깍 이동 + 154ms 정지)를 9번.
       이동은 easeOut으로 짧게 끊고 곧바로 멈춘다(그 정지가 「딸깍」이다). 롤링도 같은 박자로 되감긴다. */
  var HINT_N = 9;
  function lvHint() {
    lvStop();
    if (reduce()) return false;
    var navi = (nav && nav.hintRollBegin) ? nav : null;
    if (!navi || !navi.hintRollBegin()) return false;   /* 롤링이 도는 중이면 방해하지 않는다 */
    var FWD = 2400, STOP = 2800, t0 = 0;
    function f(now) {
      if (!t0) t0 = now;
      var el = now - t0, th = 60, off = 0;
      if (el < FWD) {                                  /* 내려감: 연속 감속 없이 한 곡선 */
        var p = el / FWD, e = p * p * (3 - 2 * p);
        th = 60 + (105 - 60) * e; off = HINT_N * e;
      } else if (el < STOP) {                          /* 3시 30분에서 잠깐 */
        th = 105; off = HINT_N;
      } else if (el < HINT_MS) {                       /* 래칫: 9번 딸깍딸깍 */
        var q = (el - STOP) / (HINT_MS - STOP) * HINT_N;   /* 0~9 */
        var s = Math.min(HINT_N - 1, Math.floor(q));
        var k = Math.min(1, (q - s) / .37);                /* 한 칸의 앞 37%만 움직이고 나머지는 정지 */
        k = 1 - Math.pow(1 - k, 3);                        /* easeOut — 딱 멈추는 순간이 「딸깍」 */
        var from = HINT_N - s, to = from - 1;
        off = from + (to - from) * k;
        th = 60 + 5 * off;
      } else {
        th = 60; off = 0;
      }
      lvSet(th);
      navi.hintRollTo(off);
      if (el < HINT_MS) { LV.raf = requestAnimationFrame(f); return; }
      lvSet(60); navi.hintRollTo(0); navi.hintRollEnd(); LV.raf = 0;
    }
    LV.raf = requestAnimationFrame(f);
    return true;
  }

  function reduce() { return !!reduceMQ.matches; }
  function hoverOK() { return !!hoverMQ.matches; }
  function cur() { return (nav && nav.getMode && nav.getMode()) || 'all'; }
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function clearTimers() { while (timers.length) clearTimeout(timers.pop()); }
  /* ---------- 1. 트리거 상태 ---------- */
  /* 장전만 푼다 — 발동(pulled)의 연출은 각자의 타이머가 끝까지 보여 준다.
     레버 장전을 풀면(바깥 클릭·ESC·타임아웃) 뒤로 감아 둔 롤링도 한 칸 되돌아온다. */
  function disarm(keepWheel) {
    var was = armed;
    clearTimeout(armT); armT = 0; armed = '';
    if (slot && slot.getAttribute('data-st') === 'armed') slot.removeAttribute('data-st');
    if (ecgRow && ecgRow.getAttribute('data-st') === 'armed') ecgRow.removeAttribute('data-st');
    if (was === 'lever') lvTween(60, 340);          /* 장전을 풀면 2시로 천천히 돌아온다 */
    if (was === 'ecg') ecgCalm();                   /* 장전 풀림: 멈칫 없이 한 곡선으로 기본에 돌아간다 */
    if (!keepWheel && was === 'lever' && nav && nav.spin) nav.spin(1, 240);
  }
  /* 장전 → 기본 복귀의 시작값을 붙잡는다(2026-11-20). 여러 값이 각자의 시상수로 따로 줄어들면
     중간에 한 번 멈칫하는 것처럼 보인다 — 하나의 진행도(ce)로 모든 값을 함께 줄인다. */
  function ecgCalm() {
    ECG.lean = -1;
    ECG.calmFrom = { sp: ECG.sp, amp: ECG.amp, beat: ECG.beat, tone: ECG.tone,
      lw: ECG.lw, echo: ECG.echo, jit: ECG.jit, ceil: ECG.ceil, arm: ECG.arm };
    ECG.calm = 0;
  }
  /* 장전 직후의 예비동작을 걸어 둔다 — 실제 위상·진폭 처리는 ecgFrame이 한다 */
  function ecgLeanArm() {
    ECG.calm = -1; ECG.exit = -1;
    if (reduce()) { ECG.lean = -1; return; }
    ECG.lean = 0; ECG.leanDur = LEAN_ARM; ECG.leanPull = LEAN_ARM_PULL;
    ECG.leanT = ECG_T.idle; ECG.leanStep = -2.8;
  }
  function arm(which) {
    if (armed === which) return true;
    cancelHint();
    disarm();
    armed = which;
    (which === 'lever' ? slot : ecgRow).setAttribute('data-st', 'armed');
    if (which === 'ecg') { ECG.chg = 1; ecgLeanArm(); }   /* 장전: 후진 예비동작 + 파형 위를 훑는 빛 */
    if (which === 'lever') {
      lvTween(30, 260);                             /* 1차: 2시 → 1시 */
      if (nav && nav.spin) nav.spin(-1, 260);       /* 장전: 롤링을 한 칸 뒤로 감아 둔다 */
    }
    armT = setTimeout(disarm, ARM_IDLE);
    return false;
  }
  function leverTap() {
    if (cur() !== 'all' || open) return;
    if (arm('lever')) pullLever();
  }
  function ecgTap() {
    if (cur() !== 'all' || open) return;
    if (arm('ecg')) pulseEcg();
  }
  /* 당김 → 바퀴가 620ms 동안 빙글빙글 도는 것을 먼저 보여 주고, 560ms에 불투명 글래스가 페이드인한다. */
  function pullLever() {
    clearTimeout(armT); armed = '';
    slot.setAttribute('data-st', 'pulled');
    lvFire();                                            /* 스프링 하나로 1시 → 6시 */
    if (nav && nav.spin) nav.spin(12, 1200);              /* 감아 둔 한 칸을 풀고 여러 바퀴, 감속하며 정차 */
    setTimeout(function () { slot.removeAttribute('data-st'); lvTween(60, 420); }, 1340);
    openOv(slotBtn, reduce() ? 0 : 1060);
  }
  /* 2차(격발): 누른 순간 150ms 뒤로 쓱 빠졌다가(예비동작) 2.6초 고조로 몰아친 뒤 무대가 페이드인한다.
     글래스가 덮이는 순간 파형을 세우지 않고, 왼쪽으로 더 빠르게 흐르며 알파로 빠져나간 뒤에야 루프를 세운다. */
  function pulseEcg() {
    clearTimeout(armT); armed = '';
    var lead = reduce() ? 0 : LEAN_FIRE;
    ECG.calm = -1; ECG.exit = -1; ECG.surge = -1;
    ECG.lean = 0; ECG.leanDur = lead; ECG.leanPull = lead;
    ECG.leanT = ECG_T.armed; ECG.leanStep = FIRE_PULL;   /* 장전(-2.8)보다 더 깊게 당긴 뒤 폭발한다 */
    if (!lead) ECG.lean = -1;
    ecgSync();
    setTimeout(function () {
      ecgRow.setAttribute('data-st', 'pulled');
      ECG.lean = -1; ECG.surge = 0; ecgSync();
    }, lead);
    openOv(ecgBtn, reduce() ? 0 : lead + SURGE_MS + 60);
    if (lead) ecgRow.setAttribute('data-st', 'armed');   /* 예비동작 동안은 장전 자세 그대로(천장선이 깜빡이지 않는다) */
    setTimeout(function () {
      ecgRow.removeAttribute('data-st');
      if (ECG.exit < 0) { ECG.surge = -1; ecgSync(); }
    }, lead + SURGE_MS + 60 + EXIT_MS + 40);
  }
  /* ---------- 2. 방치 유도 — 매 분 00초에 5.0초 ----------
   * 시각(Date)으로 다음 정각을 계산해 한 번씩 깨어난다. 1초마다 세던 방식은 드리프트가 쌓여 홀수분 50초에
   * 작동했다(2026-11-19 수정). 작동 중에는 사용자가 만진 것으로 치지 않고, 다 끝나면 롤링이 원래 자리에서
   * 이어서 흐른다. 장전·오버레이·가려진 화면·감속 모드에서는 거르고 다음 정각을 잡는다. */
  function listOpen() { var lv = $('listView'); return !!lv && !lv.hidden; }
  var hintOn = false, hintTimer = 0, hintEndT = 0;
  function cancelHint() {
    if (!hintOn) return false;
    hintOn = false;
    clearTimeout(hintEndT); hintEndT = 0;
    if (ecgRow && ecgRow.getAttribute('data-st') === 'hint') ecgRow.removeAttribute('data-st');
    if (slot && slot.getAttribute('data-st') === 'hint') slot.removeAttribute('data-st');
    HINT.on = false;
    if (LV.raf) { lvStop(); lvSet(60); }
    if (nav && nav.hintRollEnd) nav.hintRollEnd();
    ecgSync();
    return true;
  }
  /* 이번 분(0~59)의 네 문양과 곁들이는 보조 요소. 표(ECG_SEQ)가 60분 한 바퀴를 정해 두었다. */
  function ecgPattern(minute) {
    var m = ((minute | 0) % 60 + 60) % 60, row = ECG_SEQ[m] || ECG_SEQ[0];
    return {
      min: m,
      s: [ECG_NAMES[row[0]], ECG_NAMES[row[1]], ECG_NAMES[row[2]], ECG_NAMES[row[3]]],
      c: [row[0] % 6, row[1] % 6, row[2] % 6, row[3] % 6],
      a: (ECG_ACC[m] === undefined ? 4 : ECG_ACC[m])
    };
  }
  function hint(forceMinute) {
    if (hintOn || open || armed || picking || reduce() || cur() !== 'all' || document.hidden) return false;
    if (listOpen()) {
      if (!ecgRow || !ecgRow.offsetParent) return false;
      if (!ecgVis) return false;                     /* 파형이 화면 밖이면 방치 유도를 걸지 않는다 */
      var pat = ecgPattern(forceMinute === undefined ? new Date().getMinutes() : forceMinute);
      HINT.on = true; HINT.t = 0; HINT.pat = pat; HINT.min = pat.min;
      hintOn = true;
      ecgRow.setAttribute('data-st', 'hint');
      ecgSync();
    } else {
      if (!slot || !slot.offsetParent) return false;
      if (nav && nav.rollVisible && !nav.rollVisible()) return false; /* 롤링 무대가 화면 밖이면 건너뛴다 */
      hintOn = true;
      slot.setAttribute('data-st', 'hint');
      if (!lvHint()) { cancelHint(); return false; }
    }
    /* 끝 시계는 시간표(hintTimer)와 다른 그릇에 둔다 — 다음 정각을 잡을 때 함께 지워지면 안 된다 */
    hintEndT = setTimeout(function () { if (hintOn) cancelHint(); }, HINT_MS + 40);
    return true;
  }
  /* 다음 「매 분 00초」의 시각(ms). 이미 지난 정각은 잡지 않는다. */
  function nextMinute(from) {
    var d = new Date(from); d.setSeconds(0, 0);
    var t = d.getTime();
    while (t <= from) t += 60000;
    return t;
  }
  function scheduleHint() {
    clearTimeout(hintTimer); hintTimer = 0;
    var now = Date.now(), at = nextMinute(now + 400);
    hintTimer = setTimeout(function () {
      hintTimer = 0;
      var late = Date.now() - at;
      /* 정각에서 -0.1~+3초 사이에 깨어났을 때만 작동한다(잠들었다 깨어난 탭은 건너뛴다) */
      if (late > -100 && late < 3000) hint();
      scheduleHint();
    }, Math.max(60, at - now));
  }

  /* ---------- 2. 심전도 — 캔버스 한 장의 연속 파형 + 방치 유도 한붓그리기 (2026-11-19 R5) ----------
   * 2026-11-19: SVG path의 `d` 문자열 재작성과 SMIL 모핑을 걷어내고 **캔버스 168×34 한 장**으로 통일했다.
   *   · 평상·장전·격발은 한 줄이 끊기지 않고 위상(ph) 그대로 이어지며 속도·진폭·굵기·톤이 변한다.
   *     평상 1.9초·2박동·1배·1.5px → 장전 0.62초·3박동·2.05배·2.4px+겹선+천장선 → 격발 0.26초·6.5박동·2.6배·2.7px.
   *   · 장전으로 넘어가면 0.9초 동안 한 줄기 빛이 파형을 왼쪽에서 오른쪽으로 훑고, R꼭대기마다 잔불이 튄다.
   *     위쪽에 천장 헤어라인이 나타나 R이 닿기 직전까지 차오른다 — 한 번 더 눌러 터뜨리고 싶게 하는 장치다.
   *   · 방치 유도(5.0초)도 같은 캔버스가 그린다: 파동이 가운데로 오므라들며(0.7초)
   *     한붓그리기 4개 모양으로 0.9초씩 구부러지고(3.6초), 다시 파동으로 풀린다(0.7초).
   *   · 프레임마다 DOM·SVG·레이아웃을 건드리지 않는다(캔버스 픽셀만). 감속 모드에서는 한 장만 그린다.
   *   · 2026-11-19: 창 양 끝이 뚝 잘려 보이던 것을 **알파 페이드**로 없앴다. 파형 색은 그대로 두고
   *     그린 픽셀의 알파만 좌우 20% 구간에서 0 → .08 → .25 → .55 → .85 → 1로 점점 진해지게 깎는다.
   */
  var ECG = { cv: null, cx: null, on: false, raf: 0, last: 0, dpr: 1,
    ph: 0, sp: 1 / 1.9, amp: 1, tone: 0, beat: 84, lw: 1.5, echo: 0, ceil: 0, chg: 0, arm: 0, jit: 0, surge: -1, mask: null,
    shk: 0, bob: null, gkey: '', grad: null, shakeT: '', tailT: 0, step: 1,
    lean: -1, leanDur: 0, leanPull: 0, leanT: null, leanStep: -2.8, preAmp: 1,
    calm: -1, calmFrom: null, exit: -1,
    c1: [15, 118, 110], c2: [180, 83, 42], c3: [162, 100, 0], dark: false };
  var ECG_W = 168, ECG_H = 34, ECG_BASE = 20, ECG_R = 8, ECG_CX = ECG_W / 2;
  /* 3단계: 주기(초/회) · 진폭(배) · 박동 폭(px — 작을수록 창 안에 박동이 다닥다닥 붙는다) · 색 톤(0=청록 … 1=벽돌)
     · 선 굵기 · 겹선(장전의 두 겹 박동) · 천장선(장전의 목표 헤어라인) · 흔들림(R 높이가 박동마다 흔들리는 폭)
     · jit는 v에 곱하는 폭이다(0.30이면 ±15%). 캔버스 34px 밖으로 찢어지지 않는 선에서 묶어 둔다. */
  var ECG_T = {
    idle:   { sp: 1 / 1.9, amp: 1,    tone: 0,   beat: 84, lw: 1.5, echo: 0,   ceil: 0, jit: 0 },
    armed:  { sp: 1 / .62, amp: 2.05, tone: .5,  beat: 58, lw: 2.4, echo: .55, ceil: 1, jit: .12 },
    /* 격발 자리: 박동 폭을 26px로 좁혀 가로로 압축하니 오히려 느려 보였다(2026-11-19 지적).
       박동 폭은 오히려 넓히고(70px) 흐르는 속도로 빠름을 낸다. 진폭 2.15는 흔들림을 곱해도
       기준선 20px에서 19.4px까지만 올라가 캔버스 위쪽을 넘지 않는다. */
    pulled: { sp: 1 / .14, amp: 2.15, tone: 1,   beat: 70, lw: 3.0, echo: 0,   ceil: 0, jit: .26 }
  };
  /* 격발 고조(2.6초) — 2026-11-20 R2: 장전의 「예비동작 → 튀어나옴」과 확실히 갈라지게 다시 짰다.
     · 이전: e가 3차+완만곡선이라 앞 30%(0.8초)가 장전과 거의 같은 0.62초 주기였다 — 차이가 안 보였다.
     · 지금: 첫 0.12초에 배속 목표가 곧바로 뛰고(kick), 남은 구간에서 가파르게 조인다.
     · 꼭대기 주기 0.62 → 0.065초(장전의 9.5배). 진폭·박동폭·색 톤도 함께 올라간다. */
  function ecgSurgeT(p) {
    var kick = Math.min(1, p / .12); kick = 1 - Math.pow(1 - kick, 2);   /* 0~0.12초에 0→1로 튄다 */
    var e = .52 * kick + .48 * (p * p * p * .35 + (p * p * (3 - 2 * p)) * .65);
    return {
      sp: 1 / (.62 - .555 * e),
      amp: 1.96 + .44 * e,
      tone: .5 + .5 * e,
      beat: 58 + 8 * e,
      lw: 2.4 + .6 * e,
      echo: .55 * (1 - e),
      ceil: 0,
      jit: .12 + .16 * e
    };
  }
  var ECG_TAB = (function () {
    var t = new Float32Array(256), i, u, g = function (x, m, s, h) { var d = (x - m) / s; return h * Math.exp(-d * d); };
    for (i = 0; i < 256; i++) {
      u = i / 256;
      t[i] = g(u, .165, .030, .22) + g(u, .300, .012, -.16) + g(u, .345, .014, 1) + g(u, .390, .016, -.30) + g(u, .545, .055, .24);
    }
    return t;
  })();
  function ecgRGB(v, fb) {
    v = (v || '').trim();
    if (v.charAt(0) !== '#') return fb;
    if (v.length === 4) v = '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
    return [parseInt(v.substr(1, 2), 16), parseInt(v.substr(3, 2), 16), parseInt(v.substr(5, 2), 16)];
  }
  function ecgColors() {
    try {
      var cs = getComputedStyle(document.documentElement);
      /* 파형의 세 색은 modes.css가 테마별로 정한다 — 평상 · 장전 · 격발 */
      ECG.c1 = ecgRGB(cs.getPropertyValue('--ecg-a'), ECG.c1);
      ECG.c3 = ecgRGB(cs.getPropertyValue('--ecg-b'), ECG.c3);
      ECG.c2 = ecgRGB(cs.getPropertyValue('--ecg-c'), ECG.c2);
      ECG.dark = document.documentElement.getAttribute('data-theme') === 'dark';
      ECG.gkey = ''; ECG.grad = null;          /* 테마가 바뀌면 그라데이션도 다시 만든다 */
      /* 한붓그리기 기호 색: 어두운 테마에서는 종이 위 잉크색이 묻히므로 밝게 띄운다 */
      ECG_KC = (ECG.dark ? ['#2dd4bf', '#f4715e', '#fbbf24', '#e6a6c2', '#93b4e0', '#c3d47a'] : ECG_COLORS)
        .map(function (h) { return ecgRGB(h, [15, 118, 110]); });
    } catch (e) { }
  }
  var ECG_KC = [];
  /* 파형이 화면 안에 있는가 — 화면 밖으로 스크롤된 동안은 루프를 세운다(2026-11-20 60fps).
     목록(전체 목록)이 닫히면 이미 ecgWanted의 cur()==='all' 조건에서 멎고, 이 값은 그 위에 한 겹 더 얹는다. */
  var ecgVis = true;
  function ecgState() {
    var st = ecgRow ? ecgRow.getAttribute('data-st') : '';
    return ECG_T[st === 'pulled' ? 'pulled' : (st === 'armed' ? 'armed' : 'idle')];
  }
  function ecgFit() {
    /* 3배 화면(iPhone)에서도 캔버스는 2배까지만 그린다 — 34px 높이의 가는 선이라 눈에 띄는 차이는 없고,
       프레임마다 칠하는 픽셀은 44% 줄어든다(iPhone XS 실측 대상, 2026-11-20 60fps). */
    var dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    if (dpr !== ECG.dpr || ECG.cv.width !== Math.round(ECG_W * dpr)) {
      ECG.dpr = dpr;
      ECG.cv.width = Math.round(ECG_W * dpr);
      ECG.cv.height = Math.round(ECG_H * dpr);
      ECG.cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }
  /* 색은 세 정거장을 지난다 — 평상 청록(--a1) → 장전 황토(--a3) → 격발 벽돌(--a2).
     두 색만 섞으면 장전 중간이 탁한 올리브가 되므로, 채도가 살아 있는 황토를 경유한다. */
  /* 색의 세 정거장: 평상 청록(--ecg-a) → 장전 주황 → 격발 붉은.
     2026-11-20 R2(태화님 지시): 「장전과 격발의 그라데이션이 차이가 없다」 → 장전은 **주황 단색(그라데이션 없음)**,
     격발은 **붉은 계열의 강한 그라데이션**으로 둘을 색만으로도 구분되게 바꿨다.
     장전 주황은 테마의 황토(--ecg-b)를 #ff7a00 쪽으로 42% 밀어 만든다(밝은·어두운 테마 모두 주황으로 읽힘). */
  var ECG_HOT = [255, 122, 0];
  function ecgMix(a, b, p) { return [a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p, a[2] + (b[2] - a[2]) * p]; }
  function ecgArmRGB() { return ecgMix(ECG.c3, ECG_HOT, .42); }
  function ecgFireRGB() { return ecgMix(ECG.c2, ECG.dark ? [255, 58, 70] : [196, 14, 34], .60); }
  function ecgToneRGB(tone) {
    var a, b, p;
    if (tone <= .5) { a = ECG.c1; b = ecgArmRGB(); p = tone * 2; }
    else { a = ecgArmRGB(); b = ecgFireRGB(); p = (tone - .5) * 2; }
    return [a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p, a[2] + (b[2] - a[2]) * p];
  }
  function ecgTone(tone) {
    var c = ecgToneRGB(tone);
    return 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')';
  }
  /* 장전·격발의 결 — 2026-11-20 R2에서 상태별로 갈랐다(태화님 지시).
     · 평상·장전: **단색**. 장전은 주황 한 색으로 「아직 안 터졌다」를 보여 준다(그라데이션 없음).
     · 격발: 진한 크림슨 → 붉은색 → 밝은 주홍으로 가로지르는 **강한 그라데이션**(왼쪽은 알파까지 빼서 불꼬리 결).
       톤이 오를수록 붉어지고, 같은 톤 구간에서는 한 번 만든 것을 다시 쓴다(프레임마다 만들지 않는다). */
  function ecgStrokeStyle(cx) {
    var fire = (ECG.surge >= 0) || (ecgRow && ecgRow.getAttribute('data-st') === 'pulled');
    var key = (fire ? 'f' : 'a') + Math.round(ECG.tone * 20) + (ECG.dark ? 'd' : 'l');
    if (ECG.gkey === key && ECG.grad) return ECG.grad;
    var v, hot, deep, mid;
    if (!fire) {
      hot = ecgToneRGB(ECG.tone);
      v = 'rgb(' + Math.round(hot[0]) + ',' + Math.round(hot[1]) + ',' + Math.round(hot[2]) + ')';
    } else {
      hot = ecgToneRGB(ECG.tone);                 /* 격발 초반은 주홍 → 꼭대기에서 진홍 */
      deep = ecgMix(hot, [58, 0, 12], .82);       /* 왼쪽(지나간 박동)은 거의 검붉게 */
      mid = ecgMix(deep, hot, .72);
      var head = ecgMix(hot, [255, 120, 60], .5); /* 오른쪽 끝(방금 지나간 박동)은 밝은 주홍 — 불티 */
      v = cx.createLinearGradient(0, 0, ECG_W, 0);
      v.addColorStop(0, 'rgba(' + Math.round(deep[0]) + ',' + Math.round(deep[1]) + ',' + Math.round(deep[2]) + ',.30)');
      v.addColorStop(.26, 'rgb(' + Math.round(deep[0]) + ',' + Math.round(deep[1]) + ',' + Math.round(deep[2]) + ')');
      v.addColorStop(.56, 'rgb(' + Math.round(mid[0]) + ',' + Math.round(mid[1]) + ',' + Math.round(mid[2]) + ')');
      v.addColorStop(.84, 'rgb(' + Math.round(hot[0]) + ',' + Math.round(hot[1]) + ',' + Math.round(hot[2]) + ')');
      v.addColorStop(1, 'rgb(' + Math.round(head[0]) + ',' + Math.round(head[1]) + ',' + Math.round(head[2]) + ')');
    }
    ECG.gkey = key; ECG.grad = v;
    return v;
  }
  /* 파형 한 점의 y — 256칸 표를 선형 보간하고, 격발의 거칠기는 박동마다 R 높이를 흔든다 */
  function ecgY(x, ampMul) {
    var pa = ECG.ph - (ECG_W - x) / ECG.beat, bi = Math.floor(pa), u = pa - bi;
    var uu = u * 256, i0 = uu | 0, fr = uu - i0;
    var v = ECG_TAB[i0] * (1 - fr) + ECG_TAB[(i0 + 1) & 255] * fr;
    if (ECG.jit > .002) { var r = ((bi * 2654435761) >>> 0) % 997 / 997; v *= 1 + (r - .5) * ECG.jit; }
    var y = ECG_BASE - v * ECG_R * ECG.amp * (ampMul || 1) * ECG.preAmp;
    /* 격발의 큰 진폭·흔들림이 캔버스 위(0)나 아래(34)를 넘지 않게 1.5~32.5px에서 묶는다 */
    return y < 1.5 ? 1.5 : (y > 32.5 ? 32.5 : y);
  }
  /* 가로 배율 kx: 1이면 창 전체를 흐르고, 작을수록 가운데로 오므라든다(방치 유도의 물결) */
  function ecgPath(cx, kx) {
    var stp = Math.max(.6, Math.min(1.7, ECG.beat / 50)), x, px;
    cx.beginPath();
    for (x = 0; x <= ECG_W + .01; x += stp) {
      px = ECG_CX + (x - ECG_CX) * kx;
      if (x === 0) cx.moveTo(px, ecgY(x, 1)); else cx.lineTo(px, ecgY(x, 1));
    }
  }
  /* R꼭대기 잔불 — 장전에서 박동이 지나간 자리에 작은 점이 잠깐 남는다 */
  function ecgSparks(cx) {
    var tone = ECG.tone, beat = ECG.beat, bi, x, age, a;
    for (bi = Math.floor(ECG.ph) - 2; bi <= Math.floor(ECG.ph) + 1; bi++) {
      x = ECG_W - (ECG.ph - (bi + .345)) * beat;
      if (x < 0 || x > ECG_W) continue;
      age = (ECG.ph - (bi + .345)) / ECG.sp;
      if (age < 0 || age > .34) continue;
      a = (1 - age / .34) * .8;
      cx.globalAlpha = a;
      cx.beginPath();
      cx.arc(x, ecgY(x, 1) - 2.6, 1.15 + .9 * (1 - age / .34), 0, 6.2832);
      cx.fill();
    }
    cx.globalAlpha = 1;
  }
  function ecgPaint() {
    var cx = ECG.cx; if (!cx) return;
    cx.globalCompositeOperation = 'source-over';
    cx.clearRect(0, 0, ECG_W, ECG_H);
    if (HINT.on) ecgPaintHint(cx); else ecgPaintWave(cx);
    ecgEdgeFade(cx);
  }
  /* ---------- 좌우 끝 알파 페이드 (2026-11-19) ----------
   * 창 가장자리에서 파형이 뚝 끊기지 않고 배경으로 스며들며 사라지게, **그린 픽셀의 알파만** 깎는다.
   * 색(평상 청록·장전 황토·격발 벽돌)은 한 톤도 섞지 않는다 — 색이 아니라 투명도만 변한다.
   * 스톱은 왼쪽 0~20%를 0 → .08 → .25 → .55 → .85 → 1로 잇고, 오른쪽 80~100%는 그 거울이다.
   * 완전 투명에서 본체로 넘어가는 구간이 곧바로 밝아지지 않게 중간 스톱을 촘촘히 둔 것이 핵심이다.
   * 그라데이션은 한 번 만들어 캐시하고, 프레임마다 destination-in으로 한 번 채운다(168×34 한 판). */
  var ECG_FADE = [[0, 0], [.032, .08], [.072, .25], [.118, .55], [.164, .85], [.20, 1]];
  function ecgFadeMask(cx) {
    if (ECG.mask) return ECG.mask;
    var g = cx.createLinearGradient(0, 0, ECG_W, 0), i, s;
    for (i = 0; i < ECG_FADE.length; i++) { s = ECG_FADE[i]; g.addColorStop(s[0], 'rgba(0,0,0,' + s[1] + ')'); }
    for (i = ECG_FADE.length - 1; i >= 0; i--) { s = ECG_FADE[i]; g.addColorStop(1 - s[0], 'rgba(0,0,0,' + s[1] + ')'); }
    ECG.mask = g; return g;
  }
  function ecgEdgeFade(cx) {
    cx.globalCompositeOperation = 'destination-in';
    cx.fillStyle = ecgFadeMask(cx);
    cx.fillRect(0, 0, ECG_W, ECG_H);
    cx.globalCompositeOperation = 'source-over';
  }
  function ecgPaintWave(cx) {
    var main = ecgTone(ECG.tone);
    /* 장전: 천장 헤어라인 — R 꼭대기가 닿기 직전의 목표선.
       장전 3초 동안 4.6px → 2.6px로 내려와 「숨이 차오르고 있다」를 보여 주고,
       박동이 치솟을 때마다 그 선이 밝아진다(격발하면 이 선을 뚫는다). */
    if (ECG.ceil > .01) {
      var cy = 4.6 - 2 * ease(Math.min(1, ECG.arm / 3));
      var bp = ECG.ph - Math.floor(ECG.ph), bd = (bp - .345) / .075;
      var glow = Math.exp(-bd * bd);
      cx.save();
      cx.globalAlpha = (.22 + .55 * glow) * ECG.ceil; cx.strokeStyle = main; cx.lineWidth = 1;
      if (cx.setLineDash) cx.setLineDash([2, 3]);
      cx.beginPath(); cx.moveTo(6, cy); cx.lineTo(ECG_W - 6, cy); cx.stroke();
      cx.restore();
    }
    cx.lineJoin = 'round'; cx.lineCap = 'round';
    /* 장전: 2.4px 위에 옅은 같은 선을 겹쳐 박동이 두 겹으로 아린다 */
    if (ECG.echo > .02) {
      cx.save(); cx.globalAlpha = .34 * ECG.echo; cx.strokeStyle = main;
      cx.lineWidth = Math.max(1, ECG.lw - .9); cx.translate(0, -2.4);
      ecgPath(cx, 1); cx.stroke(); cx.restore();
    }
    cx.lineWidth = ECG.lw; cx.strokeStyle = ecgStrokeStyle(cx);
    ecgPath(cx, 1); cx.stroke();
    /* 격발의 결: 오른쪽 끝(가장 새로 그린 박동)에서 밝은 머리가 차오른다 — 그라데이션 위에 얹는 한 겹.
       클립 상자의 가장자리가 보이지 않게, 획 색 자체를 투명 → 밝은 색 → 투명 그라데이션으로 준다. */
    if (ECG.tone > .18) {
      var hc = ecgToneRGB(ECG.tone), hx = ECG_W - 58;
      var ha = .30 * Math.min(1, (ECG.tone - .1) / .6);
      var hg = cx.createLinearGradient(hx, 0, ECG_W, 0);
      hg.addColorStop(0, 'rgba(' + Math.round(hc[0]) + ',' + Math.round(hc[1]) + ',' + Math.round(hc[2]) + ',0)');
      hg.addColorStop(.55, 'rgba(' + Math.round(hc[0]) + ',' + Math.round(hc[1]) + ',' + Math.round(hc[2]) + ',' + ha.toFixed(3) + ')');
      hg.addColorStop(1, 'rgba(' + Math.round(hc[0]) + ',' + Math.round(hc[1]) + ',' + Math.round(hc[2]) + ',0)');
      cx.save(); cx.beginPath(); cx.rect(hx, 0, 58, ECG_H); cx.clip();
      /* 같은 색의 넓은 번짐을 한 번 더 그린다 — 흰빛을 섞으면 종이 위에서 오히려 바래 보인다 */
      cx.lineWidth = ECG.lw + 3.4; cx.strokeStyle = hg;
      ecgPath(cx, 1); cx.stroke(); cx.restore();
    }
    /* 장전: 넘어간 직후 0.9초 동안 한 줄기 빛이 파형을 훑고 지나간다 */
    if (ECG.chg > 0) {
      var bw = 34, x0 = -bw + (ECG_W + bw) * ECG.chg;
      var sc = ecgToneRGB(Math.min(1, ECG.tone + .45));
      var sg = cx.createLinearGradient(x0, 0, x0 + bw, 0);
      sg.addColorStop(0, 'rgba(' + Math.round(sc[0]) + ',' + Math.round(sc[1]) + ',' + Math.round(sc[2]) + ',0)');
      sg.addColorStop(.5, 'rgba(' + Math.round(sc[0]) + ',' + Math.round(sc[1]) + ',' + Math.round(sc[2]) + ',.85)');
      sg.addColorStop(1, 'rgba(' + Math.round(sc[0]) + ',' + Math.round(sc[1]) + ',' + Math.round(sc[2]) + ',0)');
      cx.save(); cx.beginPath(); cx.rect(x0, 0, bw, ECG_H); cx.clip();
      cx.lineWidth = ECG.lw + .7;
      cx.strokeStyle = sg;
      ecgPath(cx, 1); cx.stroke(); cx.restore();
    }
    if (ECG.tone > .3) { cx.fillStyle = main; ecgSparks(cx); }
  }
  /* ---------- 방치 유도: 한붓그리기 기호 4개(점 36개)를 캔버스에서 직접 구부린다 ---------- */
  var HINT = { on: false, t: 0, pat: null, min: null };
  var SHAPE_PTS = {};
  function shapePts(name) {
    if (SHAPE_PTS[name]) return SHAPE_PTS[name];
    var m = (ECG_SHAPES[name] || '').match(/-?\d+(?:\.\d+)?/g) || [], a = [], i;
    for (i = 0; i + 1 < m.length; i += 2) a.push([+m[i], +m[i + 1]]);
    SHAPE_PTS[name] = a; return a;
  }
  function mixColor(a, b, p) {
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * p) + ',' + Math.round(a[1] + (b[1] - a[1]) * p) + ',' + Math.round(a[2] + (b[2] - a[2]) * p) + ')';
  }
  var SSC = 0.98;                       /* 캔버스 34px 안에 위아래 4px씩 여백을 두는 배율(다이아·별이 잘리지 않게) */
  function ease(p) { p = p <= 0 ? 0 : (p >= 1 ? 1 : p); return p * p * (3 - 2 * p); }
  function easeOut(p) { p = p <= 0 ? 0 : (p >= 1 ? 1 : p); return 1 - Math.pow(1 - p, 3); }
  function ecgPaintHint(cx) {
    var t = HINT.t, pat = HINT.pat, kx = .16, wa = 0, sa = 0, sc = 1, mp = 0;
    var A = null, B = null, ca = null, cb = null;
    if (t < 700) {                                   /* 0.7초: 파동이 가운데로 오므라들며 모양을 준비한다 */
      var p = t / 700;
      kx = 1 - .84 * ease(p); wa = 1 - .45 * ease(p);
      sa = ease((t - 380) / 320) * .9; sc = SSC * (.7 + .3 * ease((t - 380) / 320));
      A = B = shapePts(pat.s[0]); ca = cb = ECG_KC[pat.c[0]];
    } else if (t < 4300) {                           /* 3.6초: 모양 하나당 0.9초(0.26초 정지 + 0.64초 morph) */
      var lt = t - 700, slot = Math.min(3, Math.floor(lt / 900)), local = lt - slot * 900;
      var nm = pat.s, ci = pat.c;
      A = shapePts(nm[slot]);
      B = slot < 3 ? shapePts(nm[slot + 1]) : A;
      ca = ECG_KC[ci[slot]];
      cb = ECG_KC[ci[slot < 3 ? slot + 1 : slot]];
      mp = slot < 3 ? ease((local - 420) / 480) : 0;   /* 0.42초는 또렷이 머물고 0.48초에 구부러진다 */
      sa = 1; sc = SSC * (.95 + .05 * ease(Math.min(1, (lt - slot * 900) / 320)));
      kx = .16; wa = 0;
    } else {                                         /* 0.7초: 모양이 풀리며 파동이 다시 창을 채운다 */
      var q = Math.min(1, (t - 4300) / 700);
      kx = .16 + .84 * easeOut(q); wa = .55 + .45 * ease(q);
      sa = 1 - ease(Math.min(1, q * 1.8)); sc = SSC * (1 - .32 * ease(q));
      A = B = shapePts(pat.s[3]); ca = cb = ECG_KC[pat.c[3]];
    }
    if (wa > 0) {
      cx.globalAlpha = wa; cx.lineWidth = 1.6; cx.strokeStyle = ecgTone(0);
      cx.lineJoin = 'round'; cx.lineCap = 'round';
      ecgPath(cx, kx); cx.stroke();
      cx.globalAlpha = 1;
    }
    if (sa > .01 && A && A.length) {
      var n = Math.min(A.length, B.length), i, x, y, sx = 62, sy = 1;
      cx.globalAlpha = sa; cx.lineWidth = 2; cx.lineJoin = 'round'; cx.lineCap = 'round';
      cx.strokeStyle = mixColor(ca, cb, mp);
      cx.beginPath();
      for (i = 0; i < n; i++) {
        x = A[i][0] + (B[i][0] - A[i][0]) * mp;
        y = A[i][1] + (B[i][1] - A[i][1]) * mp;
        x = sx + 22 + (x - 22) * sc; y = sy + 16 + (y - 16) * sc;
        if (i === 0) cx.moveTo(x, y); else cx.lineTo(x, y);
      }
      cx.closePath(); cx.stroke();
      cx.globalAlpha = 1;
      /* 곁들이는 작은 보조 요소 — 문양 오른쪽 위에 전구·반짝이·점·빛살을 옅게 */
      if (pat.a !== 4) ecgAccent(cx, pat.a, sa, mixColor(ca, cb, mp));
    }
  }
  /* 보조 요소는 캔버스 168×34 안쪽(오른쪽 위)에서만 그린다 — 문양과 겹치지도, 밖으로 새지도 않는다. */
  function ecgAccent(cx, kind, alpha, color) {
    var a = Math.min(1, alpha) * .58;
    if (a <= .02) return;
    var X = 141, Y = 9;
    cx.save();
    cx.globalAlpha = a; cx.strokeStyle = color; cx.fillStyle = color;
    cx.lineWidth = 1.1; cx.lineCap = 'round'; cx.lineJoin = 'round';
    if (kind === 0) {                                /* 전구: 유리 + 나사 + 빛살 */
      cx.beginPath(); cx.arc(X, Y, 2.5, 0, 6.2832); cx.stroke();
      cx.beginPath();
      cx.moveTo(X - 1.5, Y + 2.8); cx.lineTo(X - 1.5, Y + 4.1);
      cx.moveTo(X + 1.5, Y + 2.8); cx.lineTo(X + 1.5, Y + 4.1);
      cx.stroke();
      cx.beginPath();
      cx.moveTo(X - 3.3, Y - 4.2); cx.lineTo(X - 2.2, Y - 3.5);
      cx.moveTo(X, Y - 5.2); cx.lineTo(X, Y - 4.0);
      cx.moveTo(X + 3.3, Y - 4.2); cx.lineTo(X + 2.2, Y - 3.5);
      cx.stroke();
    } else if (kind === 1) {                         /* 반짝이 */
      cx.beginPath();
      cx.moveTo(X, Y - 4.4); cx.lineTo(X, Y + 4.4);
      cx.moveTo(X - 4.4, Y); cx.lineTo(X + 4.4, Y);
      cx.moveTo(X - 2.4, Y - 2.4); cx.lineTo(X + 2.4, Y + 2.4);
      cx.moveTo(X - 2.4, Y + 2.4); cx.lineTo(X + 2.4, Y - 2.4);
      cx.stroke();
    } else if (kind === 2) {                         /* 점 셋 */
      cx.beginPath(); cx.arc(X - 3.6, Y + 1.2, 1.0, 0, 6.2832); cx.fill();
      cx.beginPath(); cx.arc(X, Y - 1.8, 1.25, 0, 6.2832); cx.fill();
      cx.beginPath(); cx.arc(X + 3.6, Y + 1.2, 0.95, 0, 6.2832); cx.fill();
    } else {                                         /* 빛살 */
      cx.beginPath();
      cx.moveTo(X - 4.0, Y + 3.0); cx.lineTo(X - 2.0, Y - 2.0);
      cx.moveTo(X, Y + 3.4); cx.lineTo(X, Y - 3.6);
      cx.moveTo(X + 4.0, Y + 3.0); cx.lineTo(X + 2.0, Y - 2.0);
      cx.stroke();
    }
    cx.restore();
  }
  function ecgFrame(now) {
    if (!ECG.on) return;
    var dt = ECG.last ? Math.min(.05, (now - ECG.last) / 1000) : 0; ECG.last = now;
    var t = ecgState(), phStep = 1, lag = .20, lagb = .30;
    ECG.preAmp = 1;
    /* (1) 예비동작 — 누른 순간 진행 방향에서 살짝 후진했다가 튀어나온다(2026-11-20).
       카툰의 「달리기 전 뒤로 쓱」과 같은 결: 위상이 역방향으로 0.15박동 남짓 흐르고,
       진폭은 20% 눌린다. 그 뒤 위상을 1+2.6배로 밀어 한 번에 장전 자세로 들어간다.
       후진 구간에서는 색·속도 목표를 건드리지 않아(leanT) 선이 끊기지 않고 그대로 이어진다. */
    if (ECG.lean >= 0) {
      ECG.lean += dt * 1000;
      if (ECG.lean >= ECG.leanDur) {
        ECG.lean = -1;                     /* 예비동작 끝 — 여기서 반드시 빠져나온다(위상 배율이 계속 커지지 않게) */
      } else {
        var pull = ECG.leanPull || 1;
        if (ECG.lean < pull) {
          var lp = ECG.lean / pull;
          t = ECG.leanT || ecgState();
          phStep = ECG.leanStep || -2.8;   /* 진행 방향에서 뒤로 쓱 — 카툰의 예비동작 */
          ECG.preAmp = 1 - .22 * Math.sin(Math.PI * lp);
          lag = .26; lagb = .34;
        } else {
          var u = (ECG.lean - pull) / Math.max(1, ECG.leanDur - pull);
          t = ECG_T.armed;
          phStep = 1 + 2.6 * Math.pow(1 - u, 2);   /* 튀어나오는 앞 구간일수록 크게 */
          ECG.preAmp = 1 + .10 * Math.sin(Math.PI * u);
          lag = .075; lagb = .11;
        }
      }
    }
    if (ECG.surge >= 0) {                          /* 격발 고조: 목표값이 프레임마다 위로 올라간다 */
      ECG.surge = Math.min(SURGE_MS, ECG.surge + dt * 1000);
      var sq = ECG.surge / SURGE_MS;
      t = ecgSurgeT(sq);
      /* 위상 배속은 **속도 곡선**을 먼저 정하고 주기로 나눠 얻는다(2026-11-20 R2).
         장전은 「주기 목표 + 배속 가산」을 따로 움직여 중간에 한 번 느려지는 봉우리가 생겼다.
         격발은 목표 위상속도 V를 단조 증가(9.5 → 15.4박동/초)로 잡고, phStep = V ÷ 주기속도.
         → 시작 9.5(장전 꼭대기 5.8의 1.6배) · 0.3초 10.6 · 끝 15.4(2.65배), 중간에 꺽이는 곳이 없다. */
      var V = 9.5 + 5.9 * Math.pow(sq, .75);
      phStep = V / t.sp;
      lag = .07; lagb = .10;
    }
    if (ECG.calm >= 0) {                           /* (2) 장전 → 기본: 멈칫 없는 하나의 곡선 */
      ECG.calm += dt * 1000;
      var cp = Math.min(1, ECG.calm / CALM_MS);
      var ce = cp * cp * (3 - 2 * cp);             /* 앞뒤가 평평한 smoothstep */
      var F = ECG.calmFrom, I = ECG_T.idle;
      ECG.sp = F.sp + (I.sp - F.sp) * ce;
      ECG.amp = F.amp + (I.amp - F.amp) * ce;
      ECG.beat = F.beat + (I.beat - F.beat) * ce;  /* 파장이 길어진다 */
      ECG.tone = F.tone + (I.tone - F.tone) * ce;
      ECG.lw = F.lw + (I.lw - F.lw) * ce;
      ECG.echo = F.echo * (1 - ce);
      ECG.ceil = F.ceil * (1 - ce);
      ECG.jit = F.jit * (1 - ce);
      ECG.arm = F.arm;                             /* 천장선은 자리에 둔 채 옅어지기만 한다 */
      if (cp >= 1) ECG.calm = -1;
    } else {
      var k = 1 - Math.exp(-dt / lag), kt = 1 - Math.exp(-dt / lagb), kc = 1 - Math.exp(-dt / .16);
      ECG.sp += (t.sp - ECG.sp) * k;
      ECG.amp += (t.amp - ECG.amp) * k;
      ECG.beat += (t.beat - ECG.beat) * kt;
      ECG.tone += (t.tone - ECG.tone) * kc;        /* 색은 빠르게 — 두 색 사이 탁한 중간색을 오래 보이지 않게 */
      ECG.lw += (t.lw - ECG.lw) * k;
      ECG.echo += (t.echo - ECG.echo) * kt;
      ECG.ceil += (t.ceil - ECG.ceil) * kt;
      ECG.jit += (t.jit - ECG.jit) * kt;
    }
    if (ECG.chg > 0) ECG.chg = Math.max(0, ECG.chg - dt / .9);
    ECG.arm = (ECG.calm >= 0) ? ECG.arm : ((ecgRow && ecgRow.getAttribute('data-st') === 'armed') ? Math.min(4, ECG.arm + dt) : 0);
    /* (3) 격발 → 글래스: 글래스가 불투명해질 때까지 왼쪽으로 더 빠르게 흐르며 옅어진다.
       예전에는 revealOv가 그 자리에서 rAF를 세워 파형이 고진폭으로 얼어붙었다(「가다가 걸린 듯」).
       2026-11-20 R2(태화님 지시): 520 → 880ms. 알파는 smoothstep(앞뒤가 평평)으로 — 중간에서 가장 빨리
       옅어져 「페이드 아웃한다」가 눈에 남는다. 글래스도 이탈 시작 0.26초 뒤에야 오르기 시작한다(revealOv). */
    if (ECG.exit >= 0) {
      ECG.exit += dt * 1000;
      var ep = Math.min(1, ECG.exit / EXIT_MS);
      phStep = 1 + 2.6 * ep;
      /* 마지막 22%는 캔버스를 더 그리지 않고 CSS 알파로 넘긴다(2026-11-20 R2).
         그 순간 무대 카드가 자리잡는 전환과 겹쳐도 프레임이 끊기지 않는다 — 22% 이하의 얼은 한 장은 눈에 띄지 않는다. */
      if (ep >= .78) { ECG.surge = -1; ecgExitTo0(ECG.cv, Math.max(.08, (EXIT_MS - ECG.exit) / 1000)); return; }
      if (ECG.cv) ECG.cv.style.opacity = (1 - (ep * ep * (3 - 2 * ep))).toFixed(3);
    }
    ECG.ph += ECG.sp * dt * phStep;
    ECG.step = phStep;                            /* 감독·검수용: 이 프레임의 위상 배속 */
    if (HINT.on) HINT.t = Math.min(HINT_MS, HINT.t + dt * 1000);
    ecgPaint();
    ecgShake(now, dt);
    ECG.raf = requestAnimationFrame(ecgFrame);
  }
  /* ---------- 격발의 진동(셰이크) — 2026-11-19 ----------
   * 고조가 올라갈수록 파형 캔버스가 손떨림처럼 떨리고(.a-ecg-bob의 translate3d), 격발 자리에서도
   * 잠깐 남는다. 레이아웃은 건드리지 않고 transform만 쓴다. 감속 모드에서는 부르지 않는다. */
  function ecgShake(now, dt) {
    var bob = ECG.bob;
    if (!bob) return;
    var want = 0;
    if (ECG.surge >= 0) want = 2.4 * (ECG.surge / SURGE_MS);
    else if (ecgRow && ecgRow.getAttribute('data-st') === 'pulled') want = 1.0;
    ECG.shk += (want - ECG.shk) * (1 - Math.exp(-dt / .09));
    if (ECG.shk < .06) { ecgShakeReset(); return; }
    var dx = (Math.sin(now * .11) * .85 + Math.sin(now * .037) * .35) * ECG.shk;
    var dy = Math.sin(now * .163 + 1.2) * ECG.shk;
    var tr = 'translate3d(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px,0)';
    if (tr !== ECG.shakeT) { bob.style.transform = tr; ECG.shakeT = tr; }
  }
  function ecgShakeReset() {
    ECG.shk = 0;
    if (ECG.bob && ECG.shakeT) { ECG.bob.style.transform = ''; ECG.shakeT = ''; }
  }
  /* 이탈의 마지막 구간 — rAF를 세우고 남은 알파만 CSS로 마무리한다. 끝나면 다음에 열 때를 위해 원상복구.
     (ecgStop과 달리 곧바로 되돌리지 않는다: 되돌리면 페이드가 그 자리에서 끊긴다.) */
  function ecgExitTo0(cv, sec) {
    ECG.on = false; if (ECG.raf) { cancelAnimationFrame(ECG.raf); ECG.raf = 0; }
    ECG.exit = -1; ECG.lean = -1; ECG.preAmp = 1;
    ecgShakeReset();
    if (!cv) return;
    var ms = Math.round(sec * 1000);
    cv.style.transition = 'opacity ' + sec.toFixed(2) + 's linear';
    cv.style.opacity = '0';
    clearTimeout(ECG.tailT);
    ECG.tailT = setTimeout(function () {
      ECG.tailT = 0;
      cv.style.transition = 'none'; cv.style.opacity = '';
      void cv.offsetWidth;
      cv.style.transition = '';
    }, ms + 60);
  }
  function ecgStop() {
    ECG.on = false; if (ECG.raf) { cancelAnimationFrame(ECG.raf); ECG.raf = 0; }
    ECG.exit = -1; ECG.lean = -1; ECG.preAmp = 1;
    if (ECG.cv) {                                  /* 알파를 애니메이션 없이 즉시 되돌린다(다음에 열 때 깜빡임 0) */
      clearTimeout(ECG.tailT); ECG.tailT = 0;
      ECG.cv.style.transition = 'none'; ECG.cv.style.opacity = ''; ECG.cv.style.willChange = '';
      void ECG.cv.offsetWidth;
      ECG.cv.style.transition = '';
    }
    ecgShakeReset();
  }
  function ecgWanted() {
    /* 이탈(exit) 중에는 무대가 열렸어도(open=true) 파형을 계속 그린다 — 글래스가 불투명해지기 전까지.
       고조(surge)도 마찬가지다: openOv는 미리 open을 세우고 연출 뒤에 무대를 열기 때문이다. */
    return !!(ECG.cx && ecgRow && ecgRow.offsetParent && !document.hidden && ecgVis && !reduce() && cur() === 'all'
      && (!open || ECG.exit >= 0 || ECG.surge >= 0));
  }
  /* 감속 모드·가려진 화면: 루프 없이 지금 자세의 한 장만 그려 둔다 */
  function ecgStill() {
    if (!ECG.cx || !ecgRow || !ecgRow.offsetParent) return;
    var t = ecgState();
    ECG.sp = t.sp; ECG.amp = t.amp; ECG.tone = t.tone; ECG.beat = t.beat;
    ECG.lw = t.lw; ECG.echo = t.echo; ECG.ceil = t.ceil; ECG.jit = t.jit; ECG.chg = 0; ECG.arm = 0;
    ECG.lean = -1; ECG.calm = -1; ECG.exit = -1; ECG.preAmp = 1;
    if (ECG.cv) { ECG.cv.style.opacity = ''; ECG.cv.style.transition = ''; }
    if (reduce()) { ECG.sp = 1 / 1.9; ECG.amp = 1; ECG.tone = 0; ECG.beat = 84; ECG.lw = 1.5; ECG.echo = 0; ECG.ceil = 0; ECG.jit = 0; ECG.surge = -1; }
    ecgShakeReset();
    ecgFit(); ecgPaint();
  }
  function ecgSync() {
    if (ecgWanted()) {
      if (ECG.on) return;
      ecgFit(); ecgColors();
      ECG.on = true; ECG.last = 0;
      ECG.exit = -1;
      if (ECG.cv) { ECG.cv.style.opacity = ''; ECG.cv.style.transition = ''; }
      ECG.raf = requestAnimationFrame(ecgFrame);
    } else { ecgStop(); ecgStill(); }
  }

  /* ---------- 3. 오버레이 ---------- */
  /* 카드에 바로 초점을 주면 열자마자 강조 테두리가 켜져 「네온 상자」처럼 보인다. 무대 자체에 초점을 둔다. */
  function focusFirst() {
    var c = ov && ov.querySelector('.a-modes-in');
    if (c && c.focus) { try { c.focus({ preventScroll: true }); } catch (e) { c.focus(); } }
  }
  function openOv(src, delay) {
    if (open || !ov) return;
    open = true; picking = false;
    restFocus = src || document.activeElement;
    disarm();
    clearTimers();
    if (delay) { later(revealOv, delay); return; }   /* 발동 연출을 먼저 보여 준 뒤 무대가 열린다 */
    revealOv();
  }
  function revealOv() {
    if (!open || !ov) return;
    /* 글래스가 덮이는 순간 파형을 얼리지 않는다(2026-11-20) — 격발 파형은 계속 왼쪽으로 흐르며
       캔버스 알파만 옅어지고, 다 빠져나간 뒤 ecgFrame이 스스로 루프를 세운다. */
    if (ECG.on && ECG.surge >= 0 && ECG.exit < 0 && !reduce()) {
      ECG.exit = 0;
      if (ECG.cv) { ECG.cv.style.transition = 'none'; ECG.cv.style.willChange = 'opacity'; }
      /* 글래스는 파형이 먼저 옅어지기 시작한 뒤에 오른다(0.24초 늦게, 0.62초 동안).
         예전에는 베일 0.3초 + 캔버스 0.52초가 같은 순간에 시작해, 캔버스가 덮여 버려 페이드가 보이지 않았다. */
      if (glass) glass.style.transition = 'opacity .62s cubic-bezier(.36,.02,.34,1) .24s';
    } else {
      ecgStop();
      ECG.surge = -1;                            /* 고조는 글래스가 덮는 순간 끝난다(닫고 나서 다시 올라가지 않게) */
    }
    resetCards();
    ov.hidden = false;
    document.documentElement.setAttribute('data-jc-modeov', '');
    if (slotBtn) slotBtn.setAttribute('aria-expanded', 'true');
    if (ecgBtn) ecgBtn.setAttribute('aria-expanded', 'true');
    document.documentElement.style.overflow = 'hidden';
    if (reduce()) { ov.classList.add('a-open', 'a-in', 'a-settled'); focusFirst(); return; }
    requestAnimationFrame(function () { ov.classList.add('a-open'); });
    later(function () { ov.classList.add('a-in'); }, 200);                   /* 블록이 제자리로 — 파형이 옅어지는 동안 카드는 조금 늦게 온다 */
    later(function () { ov.classList.add('a-settled'); }, 200 + 560);        /* 글자·도해가 따라온다 */
    later(focusFirst, 70);
  }
  function closeOv(back2) {
    if (!open || !ov) return;
    open = false; picking = false; clearTimers();
    ov.classList.remove('a-open', 'a-in', 'a-settled', 'a-pick', 'a-pick-seed', 'a-pick-match');
    ov.hidden = true;
    document.documentElement.removeAttribute('data-jc-modeov');
    if (slotBtn) slotBtn.setAttribute('aria-expanded', 'false');
    if (ecgBtn) ecgBtn.setAttribute('aria-expanded', 'false');
    document.documentElement.style.overflow = '';
    if (glass) glass.style.transition = '';
    resetCards();
    if (back2 !== false && restFocus && restFocus.focus && restFocus.offsetParent !== null) {
      try { restFocus.focus({ preventScroll: true }); } catch (e) { }
    } else if (back && back.offsetParent !== null) {
      try { back.focus({ preventScroll: true }); } catch (e) { }
    }
    restFocus = null;
    ecgSync();                                  /* 무대가 걷히면 파도를 다시 흘린다 */
  }
  function resetCards() {
    for (var i = 0; i < cards.length; i++) { cards[i].removeAttribute('data-step'); cards[i].classList.remove('a-on'); }
  }
  function resetOther(m) {
    for (var i = 0; i < cards.length; i++) if (cards[i].getAttribute('data-mode') !== m) cards[i].removeAttribute('data-step');
  }
  function setStep(card, n) {
    if (card.getAttribute('data-step') === String(n)) return;
    card.setAttribute('data-step', String(n));
  }
  /* 고름: 고른 카드가 잠기는 한 박자(맞물림·색인 줄) 뒤에 **무대 전체를 한 번에** 페이드아웃한다.
     카드·오브제·글래스·바닥이 따로 사라지던 잔상과 프레임드랍을 없앴다(2026-11-18 밤).
     덱 화면은 **무대가 투명해진 뒤**【0.45s】에 세운다 — 덱을 만드는 한 프레임(33~50ms)이
     화면 변화가 없는 순간에 묻혀, 누를 때의 반응과 페이드가 끊기지 않는다. */
  function pick(m) {
    if (!open || picking) return;
    picking = true;
    var c = byMode(m); if (c) setStep(c, 2);       /* 시드: 색인 줄 · 매치: 잠금 표시 */
    if (reduce()) { apply(m); closeOv(false); return; }
    later(function () { ov.classList.add('a-pick'); }, 120);
    later(function () { apply(m); }, 450);            /* 무대가 투명해진 뒤에 덱을 세운다 — 덱 생성 프레임이 보이지 않는다 */
    later(function () { closeOv(false); }, 520);
  }
  function pickAll() {
    if (!open || picking) return;
    picking = true;
    if (reduce()) { apply('all'); closeOv(false); return; }
    ov.classList.add('a-pick');
    later(function () { apply('all'); }, 360);
    later(function () { closeOv(false); }, 430);
  }
  function apply(m) {
    if (nav && nav.applyMode) nav.applyMode(m);
  }
  function byMode(m) { for (var i = 0; i < cards.length; i++) if (cards[i].getAttribute('data-mode') === m) return cards[i]; return null; }

  /* ---------- 4. 붙이기 ---------- */
  function init() {
    nav = window.JC_NAV || null;
    ov = $('modeOv'); glass = $('modeGlass'); slot = $('slot'); slotBtn = $('slotBtn');
    ecgRow = $('ecgRow'); ecgBtn = $('ecgBtn'); back = $('modeBack');
    ECG.cv = $('ecgCv');
    if (ECG.cv) { try { ECG.cx = ECG.cv.getContext('2d'); ECG.bob = ECG.cv.parentElement; } catch (e) { ECG.cx = null; } }
    ecgColors();
    LV.cap = $('leverCap'); LV.shaft = $('leverShaft'); lvSet(60);
    var seeds = document.querySelectorAll('.a-mode');
    for (var i = 0; i < seeds.length; i++) cards.push(seeds[i]);

    /* 개수 배지: 11 · 12 · 23 (섹터 개수는 장부에서 센다) */
    var c = (nav && nav.counts) ? nav.counts() : { all: 0, seed: 0, match: 0 };
    var cnt = { seed: $('seedCnt'), match: $('matchCnt') };
    if (cnt.seed) cnt.seed.textContent = c.seed + '칸';
    if (cnt.match) cnt.match.textContent = c.match + '칸';
    var fa = $('modeAllN'); if (fa) fa.textContent = c.all;

    if (slotBtn) slotBtn.addEventListener('click', leverTap);
    if (ecgBtn) {
      ecgBtn.addEventListener('click', ecgTap);
      /* 마우스에서는 올려 두기만 해도 1차 장전(심박 1초) — 내려가면 풀린다 */
      if (hoverOK()) {
        ecgBtn.addEventListener('mouseenter', function () { if (cur() === 'all' && !open && !armed) arm('ecg'); });
        ecgBtn.addEventListener('mouseleave', function () { if (armed === 'ecg') disarm(); });
      }
    }

    for (var k = 0; k < cards.length; k++) (function (card) {
      var m = card.getAttribute('data-mode');
      card.addEventListener('click', function (e) {
        if (open === false) return;
        e.preventDefault();
        if (card.getAttribute('data-step') === '1') { pick(m); return; }
        if (!card.getAttribute('data-step')) { resetOther(m); setStep(card, 1); }
      });
      if (hoverOK()) {
        card.addEventListener('mouseenter', function () {
          if (!open || picking) return;
          if (!card.getAttribute('data-step')) { resetOther(m); setStep(card, 1); }
        });
        card.addEventListener('mouseleave', function () {
          if (card.getAttribute('data-step') === '1') card.removeAttribute('data-step');
        });
      }
    })(cards[k]);

    var ma = $('modeAll'); if (ma) ma.addEventListener('click', pickAll);
    var mx = $('modeX'); if (mx) mx.addEventListener('click', function () { closeOv(); });
    if (back) back.addEventListener('click', function () { if (nav && nav.applyMode) nav.applyMode('all'); });
    if (ov) ov.addEventListener('click', function (e) {
      if (e.target === ov || e.target === glass) closeOv();
    });

    /* 1차만 누른 채 다른 곳을 누르면 조용히 풀린다 */
    document.addEventListener('pointerdown', function (e) {
      if (hintOn) cancelHint();            /* 방치 유도 중에 손이 닿으면 그 자리에서 넘겨받는다 */
      if (!armed) return;
      var t = e.target;
      if (armed === 'lever' && slot && slot.contains(t)) return;
      if (armed === 'ecg' && ecgRow && ecgRow.contains(t)) return;
      disarm();
    }, true);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (open && !picking) { e.preventDefault(); closeOv(); }
        else if (armed) { e.preventDefault(); disarm(); }
        else if (hintOn) { e.preventDefault(); cancelHint(); }
        return;
      }
      if (!open || e.key !== 'Tab') return;
      var f = [], all = ov.querySelectorAll('button, a[href]');
      for (var i = 0; i < all.length; i++) if (all[i].offsetParent !== null) f.push(all[i]);
      if (!f.length) return;
      var at = f.indexOf(document.activeElement);
      if (e.shiftKey) { if (at <= 0) { e.preventDefault(); f[f.length - 1].focus(); } }
      else if (at === f.length - 1 || at < 0) { e.preventDefault(); f[0].focus(); }
    });

    /* 다른 탭·가려진 화면에서는 심전도를 멈춘다(배터리·프레임 0) */
    function ecgPause() {
      if (document.hidden) document.documentElement.setAttribute('data-ecg-off', '');
      else document.documentElement.removeAttribute('data-ecg-off');
      ecgSync();
      if (document.hidden) cancelHint();
      else scheduleHint();                 /* 돌아오면 다음 매 분 정각을 다시 잡는다 */
    }
    document.addEventListener('visibilitychange', ecgPause); ecgPause();

    /* 화면 밖으로 스크롤된 동안은 파형 루프를 세운다(2026-11-20 60fps). 보이는 자리로 돌아오면 그때 다시 흐른다.
       스크롤 이벤트로 매번 재지 않고 관찰자에게 맡긴다(목록 화면에서 위아래로 오갈 때 비용 0). */
    if (ecgRow && window.IntersectionObserver) {
      try {
        new IntersectionObserver(function (es) {
          var v = !!(es.length && es[es.length - 1].isIntersecting);
          if (v === ecgVis) return;
          ecgVis = v;
          ecgSync();
        }, { rootMargin: '120px 0px' }).observe(ecgRow);
      } catch (e) { }
    }

    /* 목록이 열리고 닫힐 때(index.html setList) 파형을 켜고 끈다 */
    document.addEventListener('jc-list', ecgSync);
    /* 테마가 바뀌면 파형 색을 다시 읽는다 */
    try {
      new MutationObserver(function (rec) {
        var theme = false;
        for (var i = 0; i < rec.length; i++) if (rec[i].attributeName === 'data-theme') theme = true;
        if (theme) ecgColors(); else cancelHint();          /* 모드가 바뀌면 방치 유도를 접는다(덱으로 넘어가므로) */
        requestAnimationFrame(function () { ecgSync(); });   /* 모드가 바뀌면(덱 → 대문) 파도를 다시 흘린다 */
      }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-jc-mode'] });
    } catch (e) { }
    window.addEventListener('resize', function () { if (!ECG.on) ecgStill(); });

    scheduleHint();
    /* 감독·검수용: 정각을 기다리지 않고 방치 유도를 한 번 돌려 본다 */
    window.JC_HINT = {
      run: hint, cancel: cancelHint, next: function () { return nextMinute(Date.now()); }, active: function () { return hintOn; },
      /* 감독·검수용: 몇 분짜리 문양인지, 60분 표가 어떤 순서인지 그대로 읽어 본다 */
      minute: function () { return new Date().getMinutes(); },
      pattern: function (m) { return ecgPattern(m === undefined ? new Date().getMinutes() : m); },
      seq: function () { return ECG_SEQ.map(function (row, i) { return { minute: i, shapes: row.map(function (k) { return ECG_NAMES[k]; }), accent: ECG_ACC[i] }; }); },
      state: function () { return { on: hintOn, t: HINT.t, min: HINT.min, pat: HINT.pat }; }
    };
    /* 감독·검수용: 격발 고조의 지금 값(진폭·속도·흔들림)을 읽어 본다 */
    window.JC_ECG = { state: function () { return { sp: ECG.sp, amp: ECG.amp, beat: ECG.beat, lw: ECG.lw, jit: ECG.jit, surge: ECG.surge, ph: ECG.ph, tone: ECG.tone, preAmp: ECG.preAmp, lean: ECG.lean, calm: ECG.calm, exit: ECG.exit, on: ECG.on, step: ECG.step || 1, vel: (ECG.sp || 0) * (ECG.step || 1) }; } };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
