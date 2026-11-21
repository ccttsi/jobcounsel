#!/usr/bin/env python3
"""수집 게이트 단위 검사 — `ops/scripts/collect_gate.py`

    python3 -m unittest discover -s ops/tests -p "test_*.py" -v

정상 자료가 통과하는지, 그리고 **일부러 만든 불량 샘플**이 실제로 막히는지를 함께 본다.
게이트는 「통과시키는 것」보다 「막아야 할 것을 막는 것」이 일이므로, 불량 샘플 없이
통과만 확인하는 시험은 의미가 없다. 마지막에는 저장소의 실제 자료를 그대로 통과시켜
오탐(정상 자료를 막는 일)이 없는지도 확인한다.
"""
from __future__ import annotations

import glob
import json
import os
import subprocess
import sys
import tempfile
import unittest
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
SCRIPTS = os.path.join(REPO, "ops", "scripts")
sys.path.insert(0, SCRIPTS)

from collect_gate import (  # noqa: E402
    GateRejected,
    canonical_license,
    check_document,
    check_items,
    parse_effective,
    require,
)

TODAY = date(2026, 11, 22)


def envelope(items, **source):
    meta = {
        "name": "테스트 수집원",
        "official_url": "https://www.data.go.kr/data/15125273/openapi.do",
        "license": "이용허락범위 제한 없음",
    }
    meta.update(source)
    return {
        "schema": "jobcounsel.openapi.v1",
        "source": meta,
        "fetched_at": "2026-11-22T06:00:00+09:00",
        "count": len(items),
        "items": items,
    }


def briefing_card(**overrides):
    card = {
        "id": "c01",
        "order": 1,
        "track": "A",
        "title": "제목",
        "three_step": {"what": "무슨 일", "evidence": "수치 2개 2026년 10월", "implication": "할 일 하나"},
        "source": {
            "source_id": "src_x",
            "source_name": "국가데이터처",
            "source_url": "https://www.korea.kr/briefing/x",
            "published_at": "2026-11-20",
            "license": {"type": "KOGL-1", "name": "공공누리 제1유형(출처표시)", "verified": True},
            "usage": "수치만 재구성",
        },
    }
    card.update(overrides)
    return card


def briefing(cards, **root):
    doc = {
        "schema_version": "1.4.0",
        "updated_at": "2026-11-22T07:05:00+09:00",
        "edition": {"date": "2026-11-22"},
        "cards": cards,
        "sources": [card["source"] | {"id": card["source"]["source_id"]} for card in cards],
    }
    doc.update(root)
    return doc


class LicenseTest(unittest.TestCase):
    def test_allowed_licenses_are_recognized(self):
        for text in (
            "공공누리 제1유형(출처표시)",
            "KOGL-1",
            "공공누리 0유형(자유이용)",
            "퍼블릭 도메인",
            "CC BY 4.0",
            "CC-BY-4.0",
            "이용허락범위 제한 없음",
            "OpenDART 공식 OpenAPI(이용약관)",
            "법령 원문(저작권법 제7조)",
        ):
            self.assertIn(canonical_license(text), {
                "KOGL-0", "KOGL-1", "PUBLIC-DOMAIN", "CC-BY-4.0",
                "이용허락범위 제한 없음", "OPENDART", "LAW",
            }, text)

    def test_restricted_licenses_are_recognized(self):
        for text, expect in (
            ("공공누리 제2유형(출처표시+상업적 이용금지)", "KOGL-2"),
            ("공공누리 제3유형", "KOGL-3"),
            ("공공누리 제4유형(출처표시+상업적 이용금지+변경금지)", "KOGL-4"),
            ("공공누리 미부착(사전 협의 필요)", "KOGL-NONE"),
            ("언론사 기사", "PRESS"),
            ("CC BY-NC 4.0", "CC-BY-NC"),
            ("CC BY-ND 4.0", "CC-BY-ND"),
            ("사실·수치만 인용", "FACTS-ONLY"),
            ("All rights reserved", "ALL-RIGHTS-RESERVED"),
            ("무단 복제 금지", "ALL-RIGHTS-RESERVED"),
        ):
            self.assertEqual(canonical_license(text), expect, text)

    def test_normal_envelope_passes(self):
        result = check_document(envelope([{"id": "1"}]), today=TODAY)
        self.assertTrue(result.ok, result.blocked)
        self.assertEqual(result.counts["track_a"], 1)

    def test_missing_license_is_blocked(self):
        doc = envelope([{"id": "1"}], license="")
        result = check_document(doc, today=TODAY)
        self.assertFalse(result.ok)
        self.assertTrue(any("판정할 수 없다" in line or "표기가 없다" in line for line in result.blocked),
                        result.blocked)

    def test_unknown_license_is_blocked(self):
        result = check_document(envelope([{"id": "1"}], license="담당자 문의"), today=TODAY)
        self.assertFalse(result.ok)
        self.assertTrue(any("판정할 수 없다" in line for line in result.blocked), result.blocked)

    def test_kogl4_as_track_a_is_blocked(self):
        doc = briefing([briefing_card(source=briefing_card()["source"] | {
            "license": {"type": "KOGL-4", "name": "공공누리 제4유형"}
        })])
        result = check_document(doc, today=TODAY)
        self.assertFalse(result.ok)
        self.assertTrue(any("Track A" in line for line in result.blocked), result.blocked)

    def test_kogl4_as_track_b_with_facts_only_passes(self):
        card = briefing_card(track="B", source=briefing_card()["source"] | {
            "license": {"type": "KOGL-4", "name": "공공누리 제4유형"},
            "usage": "원문을 옮기지 않고 사실·수치만 새로 썼다",
        })
        result = check_document(briefing([card]), today=TODAY)
        self.assertTrue(result.ok, result.blocked)
        self.assertEqual(result.counts["track_b"], 2)  # 카드 + sources[] 레코드

    def test_all_rights_reserved_is_blocked_even_as_track_b(self):
        card = briefing_card(track="B", source=briefing_card()["source"] | {
            "license": {"type": "ALL-RIGHTS-RESERVED", "name": "All rights reserved"},
            "usage": "사실만 인용",
        })
        result = check_document(briefing([card]), today=TODAY)
        self.assertFalse(result.ok)
        self.assertTrue(any("재사용이 허락되지 않는다" in line for line in result.blocked), result.blocked)

    def test_track_b_with_copied_body_is_blocked(self):
        doc = {
            "schema_version": "1.1.0",
            "updated_at": "2026-11-22T23:02:00+09:00",
            "date": "2026-11-22",
            "items": [{
                "id": "n1",
                "track": "B",
                "body_original": "원문 문장을 그대로 옮긴 본문",
                "rights": {"full_text_allowed": True},
                "source": {"source_name": "언론사", "source_url": "https://example.com/a",
                           "license": {"type": "PRESS", "name": "언론사 기사"}},
            }],
        }
        result = check_document(doc, today=TODAY)
        self.assertFalse(result.ok)
        self.assertTrue(any("원문 몸통" in line for line in result.blocked), result.blocked)


class EffectiveDateTest(unittest.TestCase):
    def test_future_date_20280101_is_blocked(self):
        doc = envelope([{"id": "1", "efYd": "20280101"}])
        result = check_document(doc, today=TODAY)
        self.assertFalse(result.ok)
        self.assertTrue(any("2028-01-01" in line and "아직 시행되지 않은" in line for line in result.blocked),
                        result.blocked)

    def test_future_date_in_korean_field_is_blocked(self):
        doc = envelope([{"법령명한글": "고용보험법", "시행일자": "2028-01-01"}])
        self.assertFalse(check_document(doc, today=TODAY).ok)

    def test_broken_date_shape_is_blocked(self):
        for value in ("2026-13-01", "2026. 2. 30.", "2026/01/01"):
            result = check_document(envelope([{"id": "1", "effective": value}]), today=TODAY)
            self.assertFalse(result.ok, value)
            self.assertTrue(any("날짜 모양" in line for line in result.blocked), result.blocked)

    def test_past_and_today_dates_pass(self):
        self.assertTrue(check_document(envelope([{"id": "1", "efYd": "20261008"}]), today=TODAY).ok)
        self.assertTrue(check_document(envelope([{"id": "1", "effective": "2026. 11. 22."}]), today=TODAY).ok)
        self.assertTrue(check_document(envelope([{"id": "1", "effective_date": "2026-11-22"}]), today=TODAY).ok)

    def test_parse_effective_accepts_three_shapes(self):
        self.assertEqual(parse_effective("20261008"), date(2026, 10, 8))
        self.assertEqual(parse_effective("2026-10-08"), date(2026, 10, 8))
        self.assertEqual(parse_effective("2026. 10. 8."), date(2026, 10, 8))


class MetadataTest(unittest.TestCase):
    def test_missing_source_url_is_blocked(self):
        result = check_document(envelope([{"id": "1"}], official_url=""), today=TODAY)
        self.assertFalse(result.ok)
        self.assertTrue(any("공식 URL" in line for line in result.blocked), result.blocked)

    def test_missing_as_of_date_is_blocked(self):
        doc = envelope([{"id": "1"}])
        doc.pop("fetched_at")
        result = check_document(doc, today=TODAY)
        self.assertFalse(result.ok)
        self.assertTrue(any("기준일" in line for line in result.blocked), result.blocked)

    def test_count_mismatch_is_blocked(self):
        doc = envelope([{"id": "1"}, {"id": "2"}])
        doc["count"] = 1
        result = check_document(doc, today=TODAY)
        self.assertFalse(result.ok)
        self.assertTrue(any("count" in line for line in result.blocked), result.blocked)

    def test_briefing_requires_three_step(self):
        card = briefing_card(three_step={"what": "", "evidence": "", "implication": ""})
        result = check_document(briefing([card]), today=TODAY)
        self.assertFalse(result.ok)
        self.assertTrue(any("three_step" in line for line in result.blocked), result.blocked)

    def test_briefing_requires_track(self):
        card = briefing_card()
        card.pop("track")
        # sources[]는 라이선스가 허용이므로 통과하지만, 카드의 track 누락은 막힌다.
        result = check_document(briefing([card]), today=TODAY)
        self.assertFalse(result.ok)
        self.assertTrue(any("track" in line for line in result.blocked), result.blocked)

    def test_news_requires_track_a_and_body(self):
        doc = {
            "schema_version": "1.1.0",
            "updated_at": "2026-11-22T07:05:00+09:00",
            "date": "2026-11-22",
            "items": [{
                "id": "n1",
                "track": "A",
                "rights": {"full_text_allowed": True},
                "source": {"source_name": "중소벤처기업부", "source_url": "https://example.com/b",
                           "country": "KR",
                           "license": {"type": "KOGL-1", "name": "공공누리 제1유형"}},
            }],
        }
        result = check_document(doc, today=TODAY)
        self.assertFalse(result.ok)
        self.assertTrue(any("body_original" in line for line in result.blocked), result.blocked)

    def test_law_requires_url_effective_and_paras(self):
        doc = {
            "version": "1.0.0",
            "updated": "2026-11-22",
            "kind": "index",
            "notice": {"rights": "저작권법 제7조", "source": "국가법령정보센터", "limit": "자문 아님"},
            "situations": [{"id": "s1", "label": "수습", "terms": ["수습"],
                            "laws": [{"id": "labor-standards", "articles": ["제23조"]}]}],
            "laws": [{
                "id": "labor-standards",
                "name": "근로기준법",
                "kind": "법률",
                "law_url": "https://www.law.go.kr/LSW/lsInfoR.do?lsiSeq=1&efYd=20261008",
                "effective": "2026. 10. 8.",
                "articles": [{"no": "제23조", "title": "해고 등의 제한", "paras": ["① 사용자는 …"]}],
            }],
        }
        self.assertTrue(check_document(doc, today=TODAY).ok)
        doc["laws"][0]["articles"][0]["paras"] = []
        result = check_document(doc, today=TODAY)
        self.assertFalse(result.ok)
        self.assertTrue(any("paras" in line for line in result.blocked), result.blocked)

    def test_law_future_effective_is_blocked(self):
        doc = {
            "updated": "2026-11-22",
            "notice": {"rights": "r", "source": "s", "limit": "l"},
            "situations": [],
            "laws": [{
                "id": "x", "name": "고용보험법", "kind": "법률",
                "law_url": "https://www.law.go.kr/x",
                "effective": "2028. 1. 1.",
                "articles": [{"no": "제40조", "paras": ["① …"]}],
            }],
        }
        result = check_document(doc, today=TODAY)
        self.assertFalse(result.ok)
        self.assertTrue(any("2028-01-01" in line for line in result.blocked), result.blocked)


class CollectorHookTest(unittest.TestCase):
    def test_check_items_passes_with_clean_items(self):
        result = check_items(
            [{"id": "1", "시행일자": "20260918"}],
            license="공공누리 제1유형",
            source_url="https://www.data.go.kr/data/15000115/openapi.do",
            fetched_at="2026-11-22T04:00:00+09:00",
            today=TODAY,
        )
        self.assertTrue(result.ok, result.blocked)

    def test_check_items_blocks_future_revision(self):
        with self.assertRaises(GateRejected) as caught:
            require(
                [{"법령명한글": "고용보험법", "시행일자": "20280101"}],
                license="공공누리 제1유형",
                source_url="https://www.data.go.kr/data/15000115/openapi.do",
                fetched_at="2026-11-22T04:00:00+09:00",
                today=TODAY,
            )
        self.assertTrue(any("2028-01-01" in line for line in caught.exception.problems))


class CliTest(unittest.TestCase):
    def _run(self, path, *args):
        return subprocess.run(
            [sys.executable, os.path.join(SCRIPTS, "collect_gate.py"), path, *args],
            capture_output=True, text=True,
        )

    def test_cli_exit_codes(self):
        with tempfile.TemporaryDirectory() as folder:
            good = os.path.join(folder, "good.json")
            bad = os.path.join(folder, "bad.json")
            with open(good, "w", encoding="utf-8") as handle:
                json.dump(envelope([{"id": "1"}]), handle, ensure_ascii=False)
            with open(bad, "w", encoding="utf-8") as handle:
                json.dump(envelope([{"id": "1", "efYd": "20280101"}]), handle, ensure_ascii=False)
            self.assertEqual(self._run(good).returncode, 0)
            blocked = self._run(bad)
            self.assertEqual(blocked.returncode, 1)
            self.assertIn("2028-01-01", blocked.stdout)
            machine = self._run(bad, "--json")
            payload = json.loads(machine.stdout)
            self.assertFalse(payload["reports"][0]["ok"])
            self.assertTrue(payload["reports"][0]["blocked"])
            self.assertEqual(self._run(os.path.join(folder, "missing.json")).returncode, 2)


class RealDataTest(unittest.TestCase):
    """저장소의 실제 자료가 오탐 없이 통과하는지 — 규칙이 정상 자료를 막으면 게이트를 끄게 된다."""

    def _check(self, relative):
        path = os.path.join(REPO, relative)
        with open(path, encoding="utf-8") as handle:
            result = check_document(json.load(handle))
        self.assertTrue(result.ok, f"{relative}: {result.blocked[:3]}")

    def test_repository_data_passes(self):
        for relative in (
            "briefing/data/briefing.json",
            "briefing/data/news.json",
            "briefing/data/chain.json",
            "briefing/data/labor-walk.json",
            "emerging/data/emerging.json",
            "law/data/laws.json",
        ):
            if os.path.exists(os.path.join(REPO, relative)):
                self._check(relative)
        for path in sorted(glob.glob(os.path.join(REPO, "data", "openapi", "*", "*.json"))):
            relative = os.path.relpath(path, REPO)
            self._check(relative)

    def test_briefing_archives_pass(self):
        paths = sorted(glob.glob(os.path.join(REPO, "briefing", "data", "archive", "*.json")))
        self.assertTrue(paths, "브리핑 보관본이 없다")
        for path in paths[-20:]:   # 최근 20호만(전수는 CLI로 돌린다)
            with open(path, encoding="utf-8") as handle:
                result = check_document(json.load(handle))
            self.assertTrue(result.ok, f"{os.path.basename(path)}: {result.blocked[:2]}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
