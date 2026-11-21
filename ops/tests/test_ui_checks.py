#!/usr/bin/env python3
"""공통 셸·모션·정렬 기준점 검사의 단위 시험 (2026-11-22).

    python3 -m unittest ops/tests/test_ui_checks.py -v

무엇을 확인하나 — 검사가 «통과시키는 것»이 아니라 **«고의 위반을 실제로 잡는가»**를 본다.
좋은 입력만 통과시키는 시험은 게이트의 일을 확인하지 못한다(ops/CI.md §4와 같은 원칙).
세 검사는 `validate_repo.py` 안의 순수 함수라 저장소 파일을 건드리지 않고 시험한다.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts"))

import validate_repo as vr  # noqa: E402  — 경로를 먼저 넣고 가져온다


class ShellTests(unittest.TestCase):
    """제5조 5-8 — 모든 지면이 공통 셸을 실었는가."""

    GOOD = """<head>
<script src="../assets/core.js"></script>
<meta charset="utf-8">
<title>t</title>
<link rel="stylesheet" href="../assets/brand.css">
</head><body>
<span data-jc-prefs></span>
<script src="../assets/marker.js" defer></script>
<script src="../assets/prefs.js" defer></script>
</body>"""

    def test_good_page_passes(self):
        self.assertEqual(vr.shell_problems(self.GOOD), [])

    def test_missing_prefs_script_is_caught(self):
        bad = self.GOOD.replace('<script src="../assets/prefs.js" defer></script>', "")
        rules = [rule for rule, _why in vr.shell_problems(bad)]
        self.assertIn("prefs.js", rules)

    def test_comment_naming_the_file_does_not_count(self):
        # 주석에 「assets/prefs.js가 맡는다」처럼 적어 둔 지면에서 스크립트를 지우면,
        # 글자만 보는 검사는 조용히 통과한다 — 실제로 실린 src로 봐야 한다.
        bad = self.GOOD.replace('<script src="../assets/prefs.js" defer></script>',
                                "<!-- 글자 크기·테마는 assets/prefs.js가 맡는다 -->")
        rules = [rule for rule, _why in vr.shell_problems(bad)]
        self.assertIn("prefs.js", rules)

    def test_core_js_must_run_first(self):
        # 다른 스크립트보다 먼저 «실행»돼야 한다 — <meta charset> 앞뒤는 상관없고 스크립트 차례가 상관있다.
        bad = self.GOOD.replace('<script src="../assets/core.js"></script>',
                                '<script src="../assets/tools.js"></script>\n<script src="../assets/core.js"></script>')
        rules = [rule for rule, _why in vr.shell_problems(bad)]
        self.assertIn("core.js", rules)

    def test_deferred_core_js_is_caught(self):
        bad = self.GOOD.replace('<script src="../assets/core.js"></script>',
                                '<script defer src="../assets/core.js"></script>')
        rules = [rule for rule, _why in vr.shell_problems(bad)]
        self.assertIn("core.js", rules)

    def test_missing_prefs_slot_is_caught(self):
        rules = [rule for rule, _why in vr.shell_problems(self.GOOD.replace("data-jc-prefs", "x"))]
        self.assertIn("prefs 슬롯", rules)

    def test_missing_marker_is_caught(self):
        rules = [rule for rule, _why in vr.shell_problems(
            self.GOOD.replace('<script src="../assets/marker.js" defer></script>', ""))]
        self.assertIn("marker.js", rules)


class MotionTests(unittest.TestCase):
    """제5조 5-3 — 움직이는 것은 transform·opacity뿐."""

    def test_transform_only_passes(self):
        css = ".a{transition:transform .2s ease,opacity .18s ease}\n.b{transition:opacity .1s}"
        self.assertEqual(vr.layout_motion_problems(css), [])

    def test_height_transition_is_caught(self):
        hits = vr.layout_motion_problems(".a{transition:height .26s cubic-bezier(.25,.8,.25,1)}")
        self.assertEqual([prop for _line, prop, _decl in hits], ["height"])
        self.assertEqual(hits[0][0], 1)

    def test_max_height_and_grid_rows_are_caught(self):
        hits = vr.layout_motion_problems(
            ".a{transition:max-height .3s}\n.b{transition-property:grid-template-rows,opacity}")
        self.assertEqual(sorted(prop for _l, prop, _d in hits), ["grid-template-rows", "max-height"])

    def test_word_inside_value_is_not_confused(self):
        # `line-height`는 레이아웃 속성이지만 `outline-height` 같은 이름이나 값 안의 낱말은 아니다.
        self.assertEqual(vr.layout_motion_problems(".a{transition:--x .2s}"), [])

    def test_animation_declaration_is_not_mistaken_for_transition(self):
        self.assertEqual(vr.layout_motion_problems("@keyframes k{0%{height:0}100%{height:9px}}"), [])


class AnchorTests(unittest.TestCase):
    """제5조 5-7 — 자동 정렬이 뒤쪽 단축 선언에 먹히는가(보조 액션이 제목 길이를 따라 흔들리는 원인)."""

    def test_auto_survives_when_shorthand_keeps_auto(self):
        css = ".h{display:flex}\n.h .go{margin-left:auto;flex:none;margin:-8px -6px -8px auto}"
        self.assertEqual(vr.auto_anchor_problems(css), [])

    def test_auto_killed_by_later_shorthand_is_caught(self):
        # 2026-11-22 casecon 「이론 위키」 단추가 실제로 이 모양이었다.
        css = ".h .go{margin-left:auto;padding:0 11px;margin:-8px -6px -8px 0}"
        hits = vr.auto_anchor_problems(css)
        self.assertEqual([side for _line, side, _why in hits], ["margin-left"])
        self.assertIn("덮었다", hits[0][2])

    def test_shorthand_before_auto_is_fine(self):
        css = ".h .go{margin:-8px -6px -8px 0;margin-left:auto}"
        self.assertEqual(vr.auto_anchor_problems(css), [])

    def test_padding_shorthand_does_not_count(self):
        css = ".h .go{margin-left:auto;padding:0 11px}"
        self.assertEqual(vr.auto_anchor_problems(css), [])

    def test_margin_right_auto_is_also_checked(self):
        css = ".h .back{margin-right:auto;margin:0 4px}"
        self.assertEqual([side for _l, side, _w in vr.auto_anchor_problems(css)], ["margin-right"])


class AllowTests(unittest.TestCase):
    """예외는 위반 «한 건»만 덮는다 — 같은 자리에 하나 더 생기면 실패해야 한다."""

    def test_one_line_allows_one_violation(self):
        allow = {("motion", "a.css", "height"): 1}
        self.assertTrue(vr.allow_take(allow, ("motion", "a.css", "height")))
        self.assertFalse(vr.allow_take(allow, ("motion", "a.css", "height")))

    def test_other_key_is_not_covered(self):
        allow = {("motion", "a.css", "height"): 1}
        self.assertFalse(vr.allow_take(allow, ("motion", "b.css", "height")))


if __name__ == "__main__":
    unittest.main()
