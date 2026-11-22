#!/usr/bin/env python3
"""내부 문서 차단 검사의 단위 시험 (2026-11-22).

    python3 -m unittest ops/tests/test_exposure_rules.py -v

무엇을 확인하나 — `validate_repo.py --only expose`가 쓰는 두 도구가 **고의로 어긋난 입력에서 실제로 틀리는지**.
좋은 입력만 통과시키는 시험은 게이트의 일을 확인하지 못한다(ops/CI.md §4와 같은 원칙).

  · `_js_string_array` — middleware의 규칙 배열을 읽는가, 규칙 이름이 사라지면 None인가
  · `internal_decision` — middleware `internalPath()`를 옮긴 사본. 폴더·확장자·루트 점 파일을 막고,
    공개 화면·데이터는 통과시킨다. `//ops`·`/./ops`·`/%6Fps` 같은 표기도 같은 자리로 본다
  · `_routes_covers` — `_routes.json`의 `*`가 폴더를 넘어 잡는가

실제 middleware가 같은 판정을 내리는지는 `validate_repo.py --only expose`가 node로 직접 불러 대조한다.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts"))

import validate_repo as vr  # noqa: E402  — 경로를 먼저 넣고 가져온다

DIRS = ["ops", "design", "docs", "drafts", ".claude", ".github", "supabase", "functions"]
EXTS = ["md", "py", "sql", "tsv", "yml", "yaml", "sh", "toml", "cfg", "ini"]
ALWAYS = ["/robots.txt"]


def decide(path):
    return vr.internal_decision(path, DIRS, EXTS, ALWAYS)


class RuleParsingTests(unittest.TestCase):
    def test_reads_export_arrays(self):
        source = 'export const INTERNAL_DIRS = ["ops", "design"];\nexport const INTERNAL_EXTS = ["md"];'
        self.assertEqual(vr._js_string_array(source, "INTERNAL_DIRS"), ["ops", "design"])
        self.assertEqual(vr._js_string_array(source, "INTERNAL_EXTS"), ["md"])

    def test_missing_rule_reads_as_none(self):
        # 규칙 이름이 바뀌면 조용히 «전부 통과»가 아니라 실패해야 한다
        self.assertIsNone(vr._js_string_array("export const OTHER = [];", "INTERNAL_DIRS"))


class BlockedTests(unittest.TestCase):
    def test_internal_dirs_are_blocked(self):
        for path in ("/ops", "/ops/", "/ops/ROLES.md", "/design/HANDOFF.md", "/docs/기록",
                     "/drafts/pr-body.md", "/.claude/settings.json", "/.github/workflows/ci-gate.yml",
                     "/supabase/functions/assistant-proxy/README.md", "/functions/_middleware.js"):
            with self.subTest(path=path):
                self.assertIsNotNone(decide(path))

    def test_internal_extensions_anywhere(self):
        for path, ext in (("/CLAUDE.md", "md"), ("/taxonomy/data/SCHEMA.md", "md"),
                          ("/assets/supabase-setup.sql", "sql"), ("/company/build_companies.py", "py"),
                          ("/data/text-lint-allow.tsv", "tsv")):
            with self.subTest(path=path):
                self.assertEqual(decide(path), f"ext:{ext}")

    def test_root_dotfiles(self):
        self.assertEqual(decide("/.nojekyll"), "root-file:.nojekyll")
        self.assertEqual(decide("/.gitignore"), "root-file:.gitignore")

    def test_pages_config_files(self):
        # Cloudflare Pages 설정 파일은 배포 뒤에도 /_headers·/_routes.json으로 200이었다
        for path in ("/_headers", "/_routes.json", "/_redirects"):
            with self.subTest(path=path):
                self.assertIsNotNone(decide(path))

    def test_lookalike_paths_are_normalized(self):
        # URL 표기를 바꿔 피해 가려는 경우 — 같은 자리로 본다
        for path in ("//ops/ROLES.md", "/./ops/ROLES.md", "/OPS/ROLES.md", "/%6Fps/ROLES.md", "/ops/../ops/ROLES.md"):
            with self.subTest(path=path):
                self.assertIsNotNone(decide(path))


class OpenTests(unittest.TestCase):
    def test_public_pages_and_data(self):
        for path in ("/", "/index.html", "/briefing/", "/casecon/", "/theory/", "/first-year/data/laws.json",
                     "/flow/data/graph.json", "/assets/core.js", "/assets/brand.css", "/admin/", "/verify/",
                     "/nonexistent-xyz/", "/assets/fonts/OFL-JosefinSans.txt"):
            with self.subTest(path=path):
                self.assertIsNone(decide(path))

    def test_robots_txt_survives_a_txt_rule(self):
        # 검색엔진 안내문은 .txt 규칙을 더해도 살아 있어야 한다(ALWAYS_PUBLIC의 이유)
        with_txt = vr.internal_decision("/robots.txt", DIRS, EXTS + ["txt"], ALWAYS)
        self.assertIsNone(with_txt)
        self.assertEqual(vr.internal_decision("/assets/fonts/OFL-JosefinSans.txt", DIRS, EXTS + ["txt"], ALWAYS), "ext:txt")


class RouteCoverageTests(unittest.TestCase):
    def test_splat_crosses_folders(self):
        self.assertTrue(vr._routes_covers("/ops/*", "/ops/scripts/validate_repo.py"))
        self.assertTrue(vr._routes_covers("/*", "/taxonomy/data/SCHEMA.md"))

    def test_pattern_does_not_overreach(self):
        self.assertFalse(vr._routes_covers("/ops/*", "/design/HANDOFF.md"))
        self.assertFalse(vr._routes_covers("/ops/*", "/opsx/ROLES.md"))


if __name__ == "__main__":
    unittest.main()
