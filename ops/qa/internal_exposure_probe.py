#!/usr/bin/env python3
"""라이브 내부 문서 차단 확인 — 저장소 문서가 URL만 알면 열리던 것을 막았는지 배포본에서 잰다.

  python3 ops/qa/internal_exposure_probe.py                              # 운영 https://witw.pages.dev/
  python3 ops/qa/internal_exposure_probe.py --base https://chore-internal-docs-guard.witw.pages.dev/
  python3 ops/qa/internal_exposure_probe.py --list                       # 무엇을 재는지만 본다
  python3 ops/qa/internal_exposure_probe.py --json out.json              # 결과를 파일로 남긴다

무엇을 재나 (`functions/_middleware.js`의 차단 규칙이 실제 배포본에서 서는지)
  막혀야 하는 것 — 내부 폴더(`ops`·`design`·`docs`·`drafts`·`.claude`·`.github`·`supabase`),
    어느 폴더에 있든 `.md`·`.py`·`.sql`·`.tsv`·`.yml`, 저장소 루트의 마크다운·점 파일.
    **404가 아니면 실패**다. 200·403도 실패로 본다 — 200은 문서가 그대로 열린 것이고,
    403은 «있다»는 신호이며, 이 사이트는 없는 경로에 대문을 200으로 돌려주는 설정이라
    «대문이 왔다»도 차단 실패로 읽어야 한다.
  열려야 하는 것 — 대문·섹터 화면·화면이 읽는 공개 자산(.js·.css·.json)·`robots.txt`.
    **200이 아니면 실패**다(차단이 과해 화면이 깨진 경우).

종료 코드 0 = 전부 기대대로, 1 = 어긋난 것이 있음.
"""
import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_BASE = "https://witw.pages.dev/"
UA = "jobcounsel-internal-exposure/1.0 (+https://github.com/ccttsi/jobcounsel)"

# 차단이 서야 하는 자리 — 저장소에 실제로 있는 파일에서 뽑는다(아래 build_internal_targets).
FIXED_INTERNAL = [
    "ops/ROLES.md",
    "ops/CONNECTORS.md",
    "ops/scripts/validate_repo.py",
    "ops/tests/test_ui_checks.py",
    "ops/css-allow.tsv",
    "design/HANDOFF.md",
    "design/patterns/hub-landing.md",
    "docs/openapi-workflows/openapi-daily.yml",
    "drafts/pr-body.md",
    ".claude/settings.json",
    ".claude/hooks/session-start.sh",
    ".github/workflows/ci-gate.yml",
    "supabase/functions/assistant-proxy/README.md",
    "CLAUDE.md",
    "CONSTITUTION.md",
    "DESIGN.md",
    "README.md",
    "assets/supabase-setup.sql",
    "taxonomy/data/SCHEMA.md",
    "company/[company 파일]",  # build_internal_targets가 실제 .py 하나로 바꾼다
    ".nojekyll",
    "_headers",
    "_routes.json",
]

# 열려 있어야 하는 자리 — 화면이 실제로 읽는 자산. 섹터 경로는 tools.js에서 읽어 더한다.
FIXED_PUBLIC = [
    "",
    "admin/",
    "verify/",
    "flow/",
    "assets/core.js",
    "assets/tools.js",
    "assets/brand.css",
    "assets/fonts/OFL-JosefinSans.txt",
    "robots.txt",
    "flow/data/graph.json",
    "data/legal-constants.json",
    "taxonomy/data/taxonomy.json",
]


def fetch(url, timeout=25):
    request = urllib.request.Request(url, headers={"User-Agent": UA, "Cache-Control": "no-cache"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read(4096), None
    except urllib.error.HTTPError as exc:
        return exc.code, b"", None
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return 0, b"", str(getattr(exc, "reason", exc))[:120]


def sector_paths():
    """assets/tools.js의 섹터 장부에서 화면 경로를 읽는다(개수를 적어 두지 않는다)."""
    text = (ROOT / "assets" / "tools.js").read_text(encoding="utf-8")
    found = re.findall(r"path:'\./([^']+)/'", text)
    return sorted({path.strip("/") + "/" for path in found if path})


def build_internal_targets():
    targets = []
    for item in FIXED_INTERNAL:
        if item == "company/[company 파일]":
            scripts = sorted((ROOT / "company").glob("*.py"))
            if scripts:
                targets.append(scripts[0].relative_to(ROOT).as_posix())
            continue
        if (ROOT / item).exists() or item == ".nojekyll":
            targets.append(item)
    # 규칙이 새 문서를 놓치지 않는지 — 내부 확장자 파일을 폴더마다 하나씩 더 본다
    public_dirs = {path.split("/")[0] for path in sector_paths()} | {"assets", "data", "admin"}
    for path in sorted(ROOT.rglob("*.md")):
        rel = path.relative_to(ROOT).as_posix()
        if rel.split("/")[0] == "design" or rel in targets:
            continue
        if rel.split("/")[0] not in public_dirs:
            continue
        if rel.count("/") == 2 and rel not in targets:
            targets.append(rel)
    return sorted(set(targets))


def main():
    parser = argparse.ArgumentParser(description="배포본의 내부 문서 차단 확인")
    parser.add_argument("--base", default=DEFAULT_BASE, help="재는 주소(끝에 /)")
    parser.add_argument("--list", action="store_true", help="무엇을 재는지만 보여 준다")
    parser.add_argument("--json", help="결과를 남길 파일 경로")
    args = parser.parse_args()

    base = args.base if args.base.endswith("/") else args.base + "/"
    must_block = build_internal_targets()
    must_open = FIXED_PUBLIC + sector_paths()

    if args.list:
        print(f"막혀야 하는 것 {len(must_block)}개")
        for path in must_block:
            print(f"  404  /{path}")
        print(f"열려야 하는 것 {len(must_open)}개")
        for path in must_open:
            print(f"  200  /{path}")
        return 0

    results, failures = [], []
    print(f"재는 곳: {base}")
    for path in must_block:
        status, body, error = fetch(base + path)
        ok = status == 404
        if not ok:
            failures.append(f"/{path} — 404가 아니라 {status or error}")
        results.append({"path": "/" + path, "expect": 404, "status": status, "ok": ok})
        print(f"  {'✓' if ok else '✗'} {status:>3} /{path}")
    for path in must_open:
        status, body, error = fetch(base + path)
        ok = status == 200 and len(body) > 0
        if not ok:
            failures.append(f"/{path} — 200이 아니라 {status or error}")
        results.append({"path": "/" + path, "expect": 200, "status": status, "ok": ok})
        print(f"  {'✓' if ok else '✗'} {status:>3} /{path}")

    blocked, opened = sum(1 for r in results if r["expect"] == 404 and r["ok"]), sum(
        1 for r in results if r["expect"] == 200 and r["ok"]
    )
    print("-" * 64)
    print(f"막힘 {blocked}/{len(must_block)} · 열림 {opened}/{len(must_open)} · 실패 {len(failures)}")
    for line in failures:
        print(f"  ✗ {line}")
    if args.json:
        Path(args.json).write_text(
            json.dumps({"base": base, "ok": not failures, "results": results, "failures": failures},
                       ensure_ascii=False, indent=1),
            encoding="utf-8",
        )
        print(f"결과 파일: {args.json}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
