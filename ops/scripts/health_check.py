#!/usr/bin/env python3
"""라이브 헬스체크 (3순위) — 배포된 자료실이 지금 열리는지, 오늘 자료가 실렸는지 확인한다.

  python3 ops/scripts/health_check.py
  python3 ops/scripts/health_check.py --base https://witw.pages.dev/
  python3 ops/scripts/health_check.py --summary-file "$GITHUB_STEP_SUMMARY"

하는 일
  1) 대문이 200으로 열리는지 (본문이 비어 있지 않은지)
  2) assets/tools.js의 섹터 장부를 읽어 섹터 경로 전부 200인지
  3) briefing/data/briefing.json · emerging/data/emerging.json을 받아
     edition.date가 오늘(KST)에서 며칠 뒤처졌는지, archive_dates 첫 값과 맞는지

종료 코드 0 = 정상, 1 = 실패(응답 없음·자료 없음·이틀 이상 지난 자료).
"""
import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))
DEFAULT_BASE = "https://witw.pages.dev/"
UA = "jobcounsel-health-check/1.0 (+https://github.com/ccttsi/jobcounsel)"


def fetch(url, tries=3, timeout=25):
    """(상태코드, 본문 bytes, 걸린 ms, 마지막 오류) — 5xx·연결 오류만 다시 시도한다."""
    last = None
    started = time.time()
    for attempt in range(tries):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": UA, "Cache-Control": "no-cache"})
            with urllib.request.urlopen(request, timeout=timeout) as response:
                body = response.read()
                return response.status, body, int((time.time() - started) * 1000), None
        except urllib.error.HTTPError as exc:
            last = f"HTTP {exc.code}"
            if exc.code < 500:
                break
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last = str(getattr(exc, "reason", exc))[:120]
        if attempt < tries - 1:
            time.sleep(2 * (attempt + 1))
    return 0, b"", int((time.time() - started) * 1000), last or "응답 없음"


def parse_sectors(tools_js):
    """tools.js의 JC_TOOLS에서 (이름, 경로)를 뽑는다. 섹터 개수는 세지 않고 읽은 만큼 쓴다."""
    entries = []
    for title, path in re.findall(r"title:'([^']+)',path:'\./([^']+)/'", tools_js):
        entries.append((title, path.rstrip("/")))
    if not entries:  # 따옴표·줄바꿈이 달라졌을 때를 위한 두 번째 모양
        for path, title in re.findall(r"path:'\./([^']+)/'[^}]*?title:'([^']+)'", tools_js):
            entries.append((title, path.rstrip("/")))
    return entries


def lag_days(date_text):
    try:
        day = datetime.strptime(date_text, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None
    return (datetime.now(KST).date() - day).days


def check():
    base = args.base if args.base.endswith("/") else args.base + "/"
    rows, problems, warnings = [], [], []

    status, body, ms, error = fetch(base)
    home_ok = status == 200 and len(body) > 2000
    rows.append(("대문", base, status or "실패", ms, "ok" if home_ok else (error or "본문이 비었다")))
    if not home_ok:
        problems.append(f"대문이 열리지 않는다: {error or status}")

    tools_status, tools_body, tools_ms, tools_error = fetch(base + "assets/tools.js")
    sectors = parse_sectors(tools_body.decode("utf-8", "replace")) if tools_status == 200 else []
    if not sectors:
        problems.append(f"섹터 장부를 읽지 못했다: {tools_error or tools_status}")
    for title, path in sectors:
        sector_status, _body, sector_ms, sector_error = fetch(f"{base}{path}/")
        ok = sector_status == 200
        rows.append((title, f"{base}{path}/", sector_status or "실패", sector_ms, "ok" if ok else (sector_error or "응답 오류")))
        if not ok:
            problems.append(f"{title}(/{path}/) {sector_error or sector_status}")

    data_files = [
        ("브리핑", "briefing/data/briefing.json"),
        ("신산업", "emerging/data/emerging.json"),
    ]
    for label, path in data_files:
        status, body, ms, error = fetch(base + path)
        if status != 200:
            rows.append((f"{label} 자료", base + path, status or "실패", ms, error or "응답 오류"))
            problems.append(f"{label} 자료를 받지 못했다: {error or status}")
            continue
        try:
            document = json.loads(body.decode("utf-8"))
        except UnicodeDecodeError as exc:
            rows.append((f"{label} 자료", base + path, 200, ms, "UTF-8 아님"))
            problems.append(f"{label} 자료가 UTF-8이 아니다: {exc}")
            continue
        except json.JSONDecodeError as exc:
            rows.append((f"{label} 자료", base + path, 200, ms, "JSON 오류"))
            problems.append(f"{label} 자료 JSON이 깨졌다: {exc}")
            continue
        edition_date = (document.get("edition") or {}).get("date") or document.get("date")
        lag = lag_days(edition_date)
        archive_dates = document.get("archive_dates") or []
        detail = f"{edition_date} · {lag}일 전" if lag is not None else "날짜 없음"
        if archive_dates and edition_date and edition_date not in archive_dates:
            warnings.append(f"{label}: 오늘 자({edition_date})가 archive_dates 목록에 없다")
        rows.append((f"{label} 자료", base + path, 200, ms, detail))
        if lag is None:
            problems.append(f"{label} 자료에 edition.date가 없다")
        elif lag >= 2:
            problems.append(f"{label} 자료가 {lag}일 지났다 — 수집이 멈췄는지 확인한다({edition_date})")
        elif lag == 1:
            warnings.append(f"{label} 자료가 어제 자다({edition_date}) — 06:30 점검이면 정상 범위")

    return rows, problems, warnings


def main():
    global args
    parser = argparse.ArgumentParser(description="자료실 라이브 헬스체크")
    parser.add_argument("--base", default=DEFAULT_BASE, help="검사할 주소")
    parser.add_argument("--summary-file", help="GitHub Actions Job Summary 파일 경로")
    args = parser.parse_args()

    started = datetime.now(KST)
    rows, problems, warnings = check()

    print("=" * 72)
    print(f"라이브 헬스체크 {started:%Y-%m-%d %H:%M} KST · {args.base}")
    print("-" * 72)
    for title, url, status, ms, detail in rows:
        mark = "✓" if status == 200 else "✗"
        print(f"{mark} {title:<18} {str(status):>4} {ms:>5}ms  {detail}")
    print("-" * 72)
    for warning in warnings:
        print(f"⚠ {warning}")
    if problems:
        print(f"✗ 실패 {len(problems)}건")
        for problem in problems:
            print(f"    - {problem}")
    else:
        print("✓ 라이브 정상")

    if args.summary_file:
        lines = [f"## 라이브 헬스체크 — {started:%Y-%m-%d %H:%M} KST", "",
                 f"대상: {args.base}", "",
                 "| 대상 | 응답 | 걸린 시간 | 비고 |", "|---|---|---|---|"]
        for title, url, status, ms, detail in rows:
            lines.append(f"| {title} | {status} | {ms}ms | {detail} |")
        if warnings:
            lines += ["", "**주의**"] + [f"- {warning}" for warning in warnings]
        lines += ["", "**정상**" if not problems else f"**실패 {len(problems)}건**"]
        if problems:
            lines += [f"- {problem}" for problem in problems]
        with open(args.summary_file, "a", encoding="utf-8") as fh:
            fh.write("\n".join(lines) + "\n")

    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
