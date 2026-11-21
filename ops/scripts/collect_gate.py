#!/usr/bin/env python3
"""원천 수집 사전 검증 게이트 (MLC 보완 4순위) — **자료를 적재하기 전에** 거른다.

무엇을 하나
-----------
수집·가공 스크립트가 JSON을 파일로 쓰기 **직전**에 부른다. 세 가지를 본다.

  1) `license` — 저작권·재가공 허용 여부 표기가 있는지, 그 표기가 실제로 우리가 하려는
     이용(재가공 = Track A / 사실·수치 인용 = Track B)과 맞는지.
     · 재가공 허용: 공공누리 제0·1유형, 퍼블릭 도메인, CC BY, 공공데이터포털 이용허락범위
       제한 없음, OpenDART 공식 OpenAPI, 법령 원문(저작권법 제7조)
     · 재가공 불허: 공공누리 제2~4유형, 공공누리 미부착, 언론사 기사, CC BY-NC/ND,
       사실·수치만 인용(FACTS-ONLY) — **Track B로만** 통과한다. Track A로 실리면 차단.
     · 차단: 표기 없음, 판정할 수 없는 표기, All Rights Reserved·무단 복제 금지,
       Track B인데 원문 몸통을 그대로 담은 경우
  2) `efYd`·`effective`·`effective_date`·`enforced_at`·`시행일자` — 오늘(KST) 기준
     **아직 시행되지 않은** 개정본이 현행 자료에 섞이는 것을 막는다. 날짜 모양이 아니어도 막는다.
  3) 형식·메타 — 출처 URL, 기준일(수집·확인 시각), 문서 종류별 필수 항목
     (openapi `count`·`source`, briefing `cards[].three_step`, news Track A·`rights`,
     law `laws[].effective`·`articles[].paras`, emerging `edition.date`).

왜 CI와 따로 두나
----------------
`ops/scripts/validate_repo.py`의 `dates`·`json`·`license` 검사는 **이미 커밋된 자료**를
사후에 훑는 그물이다. 이 게이트는 그보다 앞단, 수집 스크립트가 파일을 쓰기 전에 도는
관문이다. 그래야 잘못된 자료가 저장소에 한 번도 들어오지 않고, Actions 요약에는
「실패」가 아니라 「차단」으로 이유가 남는다. 두 검사는 같은 규칙을 각자의 자리에서 지킨다.

쓰는 곳
-------
  · `ops/scripts/sync_openapi_common.py` — `write_source()`가 쓰기 직전에 `check_items()`,
    `validate_outputs()`가 산출물 전체를 `check_document()`로 다시 본다.
  · 밖에서 만드는 자료(브리핑·신산업·법전 JSON)는 커밋 전에 CLI로 통과시킨다.

쓰는 법
-------
    python3 ops/scripts/collect_gate.py briefing/data/briefing.json
    python3 ops/scripts/collect_gate.py briefing/data/briefing.json --json
    python3 ops/scripts/collect_gate.py law/data/laws.json emerging/data/emerging.json
    python3 ops/scripts/collect_gate.py data/openapi/law/revisions.json --kind openapi

종료코드: 0 통과 · 1 차단 · 2 파일을 읽지 못함(사용법 오류)
표준 라이브러리만 쓴다(러너에 pip 설치 없음).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import date, datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))
GATE_VERSION = "1.0.0"
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ------------------------------------------------------------------ 라이선스 정책
# 위에서부터 먼저 맞는 것을 쓴다(「공공누리 제1유형」이 「공공누리」보다, 「CC-BY-NC」가
# 「CC-BY」보다 먼저 와야 한다).
LICENSE_PATTERNS = (
    (re.compile(r"KOGL[-\s]?0|공공누리\s*제?\s*0\s*유형|자유\s*이용"), "KOGL-0"),
    (re.compile(r"KOGL[-\s]?1|공공누리\s*제?\s*1\s*유형"), "KOGL-1"),
    (re.compile(r"KOGL[-\s]?2|공공누리\s*제?\s*2\s*유형"), "KOGL-2"),
    (re.compile(r"KOGL[-\s]?3|공공누리\s*제?\s*3\s*유형"), "KOGL-3"),
    (re.compile(r"KOGL[-\s]?4|공공누리\s*제?\s*4\s*유형"), "KOGL-4"),
    (re.compile(r"KOGL[-\s]?NONE|공공누리\s*미부착|공공누리\s*표시\s*미확인"), "KOGL-NONE"),
    (re.compile(r"CC[-\s]?BY[-\s]?NC[-\s]?SA", re.I), "CC-BY-NC-SA"),
    (re.compile(r"CC[-\s]?BY[-\s]?NC[-\s]?ND", re.I), "CC-BY-NC-ND"),
    (re.compile(r"CC[-\s]?BY[-\s]?NC", re.I), "CC-BY-NC"),
    (re.compile(r"CC[-\s]?BY[-\s]?ND", re.I), "CC-BY-ND"),
    (re.compile(r"CC[-\s]?BY[-\s]?4\.0", re.I), "CC-BY-4.0"),
    (re.compile(r"CC[-\s]?BY[-\s]?3\.0", re.I), "CC-BY-3.0"),
    (re.compile(r"CC[-\s]?0\b|CC0", re.I), "PUBLIC-DOMAIN"),
    (re.compile(r"퍼블릭\s*도메인|PUBLIC[-\s]?DOMAIN", re.I), "PUBLIC-DOMAIN"),
    (re.compile(r"이용\s*허락\s*범위\s*제한\s*없음|이용\s*허락\s*제한\s*없음"), "이용허락범위 제한 없음"),
    (re.compile(r"OpenDART", re.I), "OPENDART"),
    (re.compile(r"저작권법\s*제\s*7\s*조|법령\s*원문"), "LAW"),
    (re.compile(r"\bPRESS\b|언론\s*사?|언론사\s*기사"), "PRESS"),
    (re.compile(r"FACTS[-\s]?ONLY|사실[·\s]*수치만"), "FACTS-ONLY"),
    (re.compile(r"\bOECD\b"), "OECD"),
    (re.compile(r"\bWEF\b"), "WEF"),
    (re.compile(r"\bIAEA\b"), "IAEA"),
    (re.compile(r"All\s*rights\s*reserved|무단\s*복제|복제\s*금지", re.I), "ALL-RIGHTS-RESERVED"),
)

# 재가공(요약·번역·도표화·카드뉴스)을 해도 되는 표기 — Track A
A_TYPES = {
    "KOGL-0",
    "KOGL-1",
    "PUBLIC-DOMAIN",
    "CC-BY-4.0",
    "CC-BY-3.0",
    "이용허락범위 제한 없음",
    "OPENDART",
    "LAW",
}
# 재가공은 안 되고 사실·수치만 새로 써야 하는 표기 — Track B만 허용
B_TYPES = {
    "KOGL-2",
    "KOGL-3",
    "KOGL-4",
    "KOGL-NONE",
    "PRESS",
    "FACTS-ONLY",
    "CC-BY-NC",
    "CC-BY-NC-SA",
    "CC-BY-NC-ND",
    "CC-BY-ND",
    "OECD",
    "WEF",
    "IAEA",
}
# 어떤 트랙으로도 싣지 않는 표기
BLOCKED_TYPES = {"ALL-RIGHTS-RESERVED"}

LICENSE_KEYS = ("license", "licence")
URL_KEYS = ("source_url", "official_url", "url", "law_url", "link", "sourceUrl")
# 기준일로 인정하는 칸 — 문서 뿌리에 하나는 있어야 한다.
AS_OF_KEYS = ("fetched_at", "updated_at", "updated", "as_of", "date", "generated_at")
# 원문 몸통을 그대로 담았는지 보는 칸(Track B에서는 금지).
COPIED_BODY_KEYS = ("body", "body_original", "full_text", "raw_text", "original_text")

EFFECTIVE_KEYS = {"efYd", "effective", "effective_date", "enforced_at", "시행일자"}
EFFECTIVE_FORMATS = (
    re.compile(r"^(\d{4})(\d{2})(\d{2})$"),
    re.compile(r"^(\d{4})-(\d{2})-(\d{2})$"),
    re.compile(r"^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?$"),
    re.compile(r"^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})$"),
)


class GateRejected(RuntimeError):
    """게이트가 막았다. `problems`에 이유가 사람이 읽을 문장으로 들어 있다."""

    def __init__(self, problems):
        self.problems = list(problems)
        super().__init__(
            f"수집 게이트 차단 {len(self.problems)}건 — " + " / ".join(self.problems[:3])
        )


class GateResult:
    """게이트 판정. `blocked`가 비어 있어야 통과다."""

    def __init__(self):
        self.blocked: list[str] = []
        self.noted: list[str] = []
        self.counts = {"records": 0, "licensed": 0, "dates": 0, "track_a": 0, "track_b": 0}

    # -- 기록
    def block(self, where: str, message: str):
        self.blocked.append(f"{where or '(뿌리)'}: {message}")

    def note(self, where: str, message: str):
        self.noted.append(f"{where or '(뿌리)'}: {message}")

    # -- 판정
    @property
    def ok(self) -> bool:
        return not self.blocked

    def summary(self) -> str:
        parts = [
            f"기록 {self.counts['records']:,}건",
            f"라이선스 {self.counts['licensed']:,}건"
            f"(A {self.counts['track_a']:,}·B {self.counts['track_b']:,})",
            f"시행일 {self.counts['dates']:,}개",
        ]
        text = " · ".join(parts)
        if self.blocked:
            text += f" · 차단 {len(self.blocked)}건"
        if self.noted:
            text += f" · 참고 {len(self.noted)}건"
        return text


# ------------------------------------------------------------------ 도우미
def _walk(node, path: str = ""):
    """모든 (경로, 값)을 깊이 우선으로. 목록 원소의 경로는 `]`로 끝난다."""
    if isinstance(node, dict):
        yield path, node
        for key, value in node.items():
            yield from _walk(value, f"{path}.{key}" if path else str(key))
    elif isinstance(node, list):
        for index, value in enumerate(node):
            yield from _walk(value, f"{path}[{index}]" if path else f"[{index}]")


def kst_today() -> date:
    return datetime.now(KST).date()


def parse_effective(value):
    """`20261008`·`2026-10-08`·`2026. 10. 8.` → date. 그 밖의 모양은 None."""
    if not isinstance(value, str):
        return None
    text = value.strip()
    for pattern in EFFECTIVE_FORMATS:
        match = pattern.match(text)
        if match:
            try:
                return date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
            except ValueError:
                return None
    return None


def canonical_license(value):
    """라이선스 표기(문자열·dict) → 표준 이름. 판정할 수 없으면 None."""
    if isinstance(value, dict):
        for key in ("type", "name", "license", "title"):
            found = canonical_license(value.get(key))
            if found:
                return found
        return None
    if not isinstance(value, str) or not value.strip():
        return None
    for pattern, name in LICENSE_PATTERNS:
        if pattern.search(value):
            return name
    return None


def license_of(node):
    """레코드에서 (라이선스 원값, track, 라이선스가 적힌 dict)을 꺼낸다. `source` 안도 본다.

    라이선스 칸이 **있지만 비어 있는** 경우와 **칸 자체가 없는** 경우를 구분해야 한다.
    뒤엣것은 출처 목록·지표처럼 라이선스를 `sources[]`가 들고 있는 정상 구조이고,
    앞엣것은 표기를 빠뜨린 것이다(세 번째 값이 dict면 칸이 있다는 뜻).
    """
    for holder in (node, node.get("source") if isinstance(node.get("source"), dict) else {}):
        if not isinstance(holder, dict):
            continue
        for key in LICENSE_KEYS:
            if key in holder:
                track = node.get("track") or holder.get("track")
                return holder[key], track, holder
    return None, node.get("track"), None


def url_of(node):
    """레코드의 출처 URL. `source`·`rights` 안까지 본다."""
    for holder in (node, node.get("source"), node.get("rights")):
        if not isinstance(holder, dict):
            continue
        for key in URL_KEYS:
            value = holder.get(key)
            if isinstance(value, str) and value.startswith(("http://", "https://")):
                return value
    return None


def usage_of(node) -> str:
    """이용 범위를 적은 문장(`usage`·`rights.usage`·`license.scope`)."""
    parts = []
    if isinstance(node.get("usage"), str):
        parts.append(node["usage"])
    rights = node.get("rights")
    if isinstance(rights, dict) and isinstance(rights.get("usage"), str):
        parts.append(rights["usage"])
    license_node, _track, _holder = license_of(node)
    if isinstance(license_node, dict) and isinstance(license_node.get("scope"), str):
        parts.append(license_node["scope"])
    return " ".join(parts)


def copied_body_of(node):
    """원문 몸통을 그대로 담은 칸의 이름들."""
    return [
        key
        for key in COPIED_BODY_KEYS
        if isinstance(node.get(key), str) and len(node[key].strip()) > 0
    ]


# ------------------------------------------------------------------ 검사: 라이선스
def _judge_license(result: GateResult, where: str, node: dict):
    raw, track, holder = license_of(node)
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        if holder is not None:
            result.counts["licensed"] += 1
            result.block(where, "라이선스 칸이 비었다 — 공공누리 유형·퍼블릭 도메인·CC BY처럼 "
                                "재가공 허용 여부를 판정할 수 있는 표기를 적는다")
        elif track:
            # track만 있고 라이선스가 없는 레코드(headline_metrics 등)는 sources[]가 라이선스를
            # 들고 있는 정상 구조다 — 여기서는 표기 누락으로 보지 않는다.
            result.note(where, f"track 「{track}」만 있고 이 레코드에는 라이선스 표기가 없다"
                               " — sources[]의 표기를 확인한다")
        return
    result.counts["licensed"] += 1

    canonical = canonical_license(raw)
    shown = raw if isinstance(raw, str) else json.dumps(raw, ensure_ascii=False)[:80]
    if canonical is None:
        result.block(where, f"라이선스 「{shown[:60]}」의 재가공 허용 여부를 판정할 수 없다"
                            " — 공공누리 유형·퍼블릭 도메인·CC BY처럼 판정 가능한 표기로 적는다")
        return

    if canonical in BLOCKED_TYPES:
        result.block(where, f"라이선스 「{canonical}」은 재사용이 허락되지 않는다 — 싣지 않는다")
        return

    if canonical in A_TYPES:
        result.counts["track_a"] += 1
        if isinstance(raw, dict) and raw.get("verified") is False:
            result.note(where, "라이선스 표기는 재가공 허용이지만 verified=false(이번 수집에서 확인하지 않음)")
        return

    if canonical in B_TYPES:
        result.counts["track_b"] += 1
        usage = usage_of(node)
        facts_only = bool(re.search(r"사실|수치|인용|요약", usage))
        explicit = str(track or "").upper()
        if explicit == "A":
            result.block(where, f"라이선스 「{canonical}」는 재가공이 허락되지 않았는데 Track A로 실린다"
                                " — Track B(사실·수치만)로 내리거나 뺀다")
            return
        if explicit != "B":
            # 출처 목록(sources[])처럼 track을 카드가 들고 있는 구조가 있다. 그 자리에는
            # 이용 범위(usage)가 사실·수치 인용이라고 말하고 있어야 통과시킨다.
            if not facts_only:
                result.block(where, f"라이선스 「{canonical}」는 재가공이 허락되지 않는데 트랙도 "
                                    "이용 범위(usage)도 없다 — Track B로 표시하고 사실·수치만 인용한다고 적는다")
                return
            result.note(where, f"Track B({canonical}) 출처 목록 레코드 — 이 출처를 쓰는 카드가 Track B인지 확인한다")
            return
        copied = copied_body_of(node)
        if copied:
            result.block(where, f"Track B인데 원문 몸통({', '.join(copied)})을 그대로 담았다"
                                " — 본문·번역문은 싣지 않고 사실·수치만 새로 쓴다")
            return
        if not facts_only:
            result.note(where, f"Track B({canonical})인데 이용 범위(usage)에 사실·수치 인용이라는 설명이 없다")
        return

    result.block(where, f"라이선스 「{canonical}」은 이 게이트가 모르는 표기다 — 정책표에 근거를 더한다")


# ------------------------------------------------------------------ 검사: 시행일
def _check_effective_dates(result: GateResult, doc, today: date):
    for where, node in _walk(doc):
        if not isinstance(node, dict):
            continue
        for key in EFFECTIVE_KEYS:
            if key not in node:
                continue
            value = node[key]
            field = f"{where}.{key}" if where else key
            if value is None or (isinstance(value, str) and not value.strip()):
                result.note(field, "시행일이 비어 있다 — 현행 시행본의 날짜를 적는다")
                continue
            result.counts["dates"] += 1
            day = parse_effective(value)
            if day is None:
                result.block(field, f"시행일 「{str(value)[:20]}」이 날짜 모양(YYYYMMDD·YYYY-MM-DD·YYYY. M. D.)이 아니다")
                continue
            if day > today:
                result.block(field, f"시행일 {day.isoformat()}은 오늘(KST {today.isoformat()})보다 "
                                    f"{(day - today).days}일 뒤다 — 아직 시행되지 않은 개정본이다"
                                    " (현행 시행본으로 바꾸거나 그 항목을 뺀다)")
            elif (day - today).days >= -30 and day != today:
                result.note(field, f"시행 {(-(day - today).days)}일 지난 시행본이다 — 최신 개정이 있는지 확인한다")


# ------------------------------------------------------------------ 검사: 레코드(라이선스·출처)
def _record_nodes(doc):
    """라이선스 칸을 가진 레코드만 — 목록 원소와 뿌리."""
    if isinstance(doc, dict):
        _raw, _track, holder = license_of(doc)
        if holder is not None:
            yield "", doc
    for where, node in _walk(doc):
        if not where.endswith("]") or not isinstance(node, dict):
            continue
        _raw, _track, holder = license_of(node)
        if holder is not None:
            yield where, node


def _check_records(result: GateResult, doc):
    for where, node in _record_nodes(doc):
        result.counts["records"] += 1
        _judge_license(result, where, node)
        if url_of(node) is None:
            result.block(where, "출처 URL이 없다 — 원문을 확인할 수 있는 http(s) 주소를 적는다")


# ------------------------------------------------------------------ 검사: 문서 종류별
def detect_kind(doc) -> str:
    if not isinstance(doc, dict):
        return "unknown"
    if str(doc.get("schema", "")).startswith("jobcounsel.openapi"):
        return "openapi"
    if "cards" in doc:
        return "briefing"
    if "laws" in doc:
        return "law"
    if "archive_index" in doc or ("items" in doc and "copyright_policy" in doc):
        return "emerging"
    if "items" in doc and ("date" in doc or "edition" in doc):
        return "news"
    if "indicators" in doc or "industries" in doc:
        return "thermometer"
    return "unknown"


def _check_meta(result: GateResult, doc, kind: str):
    if not isinstance(doc, dict):
        result.block("", "문서가 JSON 객체가 아니다")
        return
    if not any(doc.get(key) for key in AS_OF_KEYS):
        result.block("", f"기준일(수집·확인 시각)이 없다 — {'·'.join(AS_OF_KEYS[:4])} 중 하나를 적는다")
    date_keys = {"date": "이 호의 기준일", "updated": "마지막 수집·검수 날", "as_of": "기준일"}
    for key, label in date_keys.items():
        value = doc.get(key)
        if not isinstance(value, str) or not value.strip():
            continue
        # `as_of`는 날짜만(`2026-11-21`)일 수도, 시각까지(`2026-11-21T01:33:32+09:00`)일 수도 있다.
        if not re.match(r"^\d{4}-\d{2}-\d{2}([T ].*)?$", value.strip()):
            result.block(key, f"{label}「{value[:24]}」이 YYYY-MM-DD(또는 ISO 8601 시각)가 아니다")

    if kind == "openapi":
        source = doc.get("source")
        if not isinstance(source, dict):
            result.block("source", "출처 메타(source)가 없다")
            return
        if not any(source.get(key) for key in URL_KEYS):
            result.block("source", "공식 URL(official_url)이 없다")
        if not any(source.get(key) for key in LICENSE_KEYS):
            result.block("source", "라이선스 표기가 없다 — 공공데이터포털 이용허락범위·공공누리 유형을 적는다")
        items = doc.get("items")
        if not isinstance(items, list):
            result.block("items", "items가 배열이 아니다")
            return
        if doc.get("count") != len(items):
            result.block("count", f"count({doc.get('count')})와 items({len(items)})가 다르다")
        if not items:
            result.note("items", "받은 항목이 0건이다 — 응답이 비었는지 확인한다")

    elif kind == "briefing":
        cards = doc.get("cards")
        if not isinstance(cards, list) or not cards:
            result.block("cards", "카드가 하나도 없다")
            return
        seen = set()
        for index, card in enumerate(cards):
            where = f"cards[{index}]"
            if not isinstance(card, dict):
                result.block(where, "카드가 객체가 아니다")
                continue
            card_id = card.get("id")
            if not card_id:
                result.block(where, "id가 없다")
            elif card_id in seen:
                result.block(where, f"id 「{card_id}」가 중복이다")
            else:
                seen.add(card_id)
            if str(card.get("track") or "").upper() not in ("A", "B"):
                result.block(where, f"track이 A·B가 아니다({card.get('track')!r})")
            steps = card.get("three_step")
            if not isinstance(steps, dict) or not all(
                isinstance(steps.get(key), str) and steps[key].strip() for key in ("what", "evidence", "implication")
            ):
                result.block(where, "three_step의 what·evidence·implication이 비었다")

    elif kind == "news":
        items = doc.get("items")
        if not isinstance(items, list):
            result.block("items", "items가 배열이 아니다")
            return
        for index, item in enumerate(items):
            where = f"items[{index}]"
            if str(item.get("track") or "").upper() != "A":
                result.block(where, "원문 뉴스는 Track A(원문 재게시·번역 허용)만 싣는다")
            rights = item.get("rights") if isinstance(item.get("rights"), dict) else {}
            if rights.get("full_text_allowed") is not True:
                result.block(where, "rights.full_text_allowed가 true가 아니다")
            country = (item.get("source") or {}).get("country")
            if country and country != "KR" and rights.get("ai_translation_allowed") is not True:
                result.block(where, "해외 자료인데 rights.ai_translation_allowed가 true가 아니다")
            if not isinstance(item.get("body_original"), str) or not item["body_original"].strip():
                result.block(where, "body_original이 비었다")

    elif kind == "law":
        laws = doc.get("laws")
        if not isinstance(laws, list) or not laws:
            result.block("laws", "법령이 하나도 없다")
            return
        notice = doc.get("notice")
        if not isinstance(notice, dict) or not all(notice.get(key) for key in ("rights", "source", "limit")):
            result.block("notice", "저작권·출처·한계 고지(notice.rights·source·limit)가 빠졌다")
        seen = set()
        for index, law in enumerate(laws):
            where = f"laws[{index}]"
            law_id = law.get("id")
            if not law_id:
                result.block(where, "id가 없다")
            elif law_id in seen:
                result.block(where, f"id 「{law_id}」가 중복이다")
            else:
                seen.add(law_id)
            for key in ("name", "kind", "law_url"):
                if not law.get(key):
                    result.block(where, f"{key}가 없다")
            law_url = law.get("law_url")
            if isinstance(law_url, str) and not law_url.startswith(("http://", "https://")):
                result.block(where, f"law_url 「{law_url[:40]}」이 http(s) 주소가 아니다")
            articles = law.get("articles") or []
            if not isinstance(articles, list) or not articles:
                result.block(where, "articles가 비었다")
                continue
            for article_index, article in enumerate(articles):
                if not isinstance(article, dict) or not article.get("no"):
                    result.block(f"{where}.articles[{article_index}]", "조문 번호(no)가 없다")
                elif not any(isinstance(para, str) and para.strip() for para in (article.get("paras") or [])):
                    result.block(f"{where}.articles[{article_index}]", "조문 본문(paras)이 비었다")
        for index, situation in enumerate(doc.get("situations") or []):
            for link in situation.get("laws") or []:
                if link.get("id") not in seen:
                    result.block(f"situations[{index}]", f"없는 법령 id 「{link.get('id')}」를 가리킨다")

    elif kind == "emerging":
        edition = doc.get("edition")
        if not isinstance(edition, dict) or not edition.get("date"):
            result.block("edition", "edition.date가 없다")
        sources = {source.get("id") for source in doc.get("sources") or [] if isinstance(source, dict)}
        for index, item in enumerate(doc.get("items") or []):
            where = f"items[{index}]"
            if item.get("source_id") not in sources:
                result.block(where, f"없는 출처 id 「{item.get('source_id')}」를 가리킨다")
            if not re.match(r"^\d{4}-\d{2}-\d{2}$", str(item.get("date") or "")):
                result.block(where, f"기사 날짜 「{item.get('date')}」가 YYYY-MM-DD가 아니다")


# ------------------------------------------------------------------ 공개 API
def check_document(document, kind: str = "auto", today: date | None = None) -> GateResult:
    """문서 하나를 검사한다. `kind`가 `auto`면 구조로 알아낸다."""
    result = GateResult()
    day = today or kst_today()
    resolved = detect_kind(document) if kind in (None, "", "auto") else kind
    if resolved == "unknown":
        result.note("", "문서 종류를 알아내지 못해 라이선스·시행일·기준일만 본다"
                        " — 필요하면 --kind로 지정한다")
    if isinstance(document, list):
        document = {"items": document}
    _check_meta(result, document, resolved)
    _check_records(result, document)
    _check_effective_dates(result, document, day)
    result.counts["kind"] = resolved  # type: ignore[assignment]
    return result


def check_items(items, *, license, source_url, fetched_at, source_name="", today: date | None = None) -> GateResult:
    """수집 스크립트가 **쓰기 직전**에 부르는 형태 — 파일 봉투 없이 항목들만 검사한다."""
    envelope = {
        "schema": "jobcounsel.openapi.v1",
        "source": {"name": source_name or "수집원", "official_url": source_url, "license": license},
        "fetched_at": fetched_at,
        "count": len(items),
        "items": items,
    }
    return check_document(envelope, kind="openapi", today=today)


def require(doc_or_items, **kwargs) -> GateResult:
    """검사하고, 하나라도 막히면 GateRejected를 던진다(수집 스크립트용)."""
    if isinstance(doc_or_items, list):
        result = check_items(doc_or_items, **kwargs)
    else:
        result = check_document(doc_or_items, **kwargs)
    if not result.ok:
        raise GateRejected(result.blocked + [f"참고 — {note}" for note in result.noted[:5]])
    return result


# ------------------------------------------------------------------ CLI
def _read(path: str):
    if path == "-":
        return json.load(sys.stdin)
    with open(path, encoding="utf-8") as handle:
        raw = handle.read()
    if raw.startswith("\ufeff"):
        raise ValueError("UTF-8 BOM이 붙어 있다(BOM 없이 저장해야 한다)")
    return json.loads(raw)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description="원천 수집 사전 검증 게이트 — 자료를 적재하기 전에 라이선스·시행일·메타를 본다",
    )
    parser.add_argument("paths", nargs="+", help="검사할 JSON 파일(여러 개, `-`는 표준입력)")
    parser.add_argument("--kind", default="auto",
                        choices=["auto", "openapi", "briefing", "news", "emerging", "law", "thermometer"],
                        help="문서 종류(기본 auto — 구조로 알아낸다)")
    parser.add_argument("--json", action="store_true", dest="as_json", help="기계가 읽는 JSON으로 낸다")
    parser.add_argument("--quiet", action="store_true", help="통과한 문서의 문장을 줄인다")
    parser.add_argument("--max-report", type=int, default=40, help="문서당 보여 줄 차단 사유 수(기본 40)")
    args = parser.parse_args(argv)

    reports, worst = [], 0
    for path in args.paths:
        try:
            document = _read(path)
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            print(f"✗ {path}: 읽지 못했다 — {exc}", file=sys.stderr)
            worst = max(worst, 2)
            reports.append({"path": path, "ok": False, "error": str(exc), "blocked": [], "noted": []})
            continue
        result = check_document(document, kind=args.kind)
        worst = max(worst, 0 if result.ok else 1)
        reports.append({
            "path": path,
            "kind": result.counts.get("kind"),
            "ok": result.ok,
            "blocked": result.blocked,
            "noted": result.noted,
            "summary": result.summary(),
        })
        if args.as_json:
            continue
        mark = "✓" if result.ok else "✗"
        if not args.quiet or not result.ok:
            print(f"{mark} {path} — {result.counts.get('kind')} · {result.summary()}")
            for line in result.blocked[: args.max_report]:
                print(f"    차단 · {line}")
            if len(result.blocked) > args.max_report:
                print(f"    … 차단 {len(result.blocked) - args.max_report}건 더(같은 규칙)")
            # 참고는 통과한 문서에서도 한 줄씩만 보여 준다(소음 방지).
            if result.ok:
                for line in result.noted[:5]:
                    print(f"    참고 · {line}")

    if args.as_json:
        print(json.dumps({"version": GATE_VERSION, "reports": reports}, ensure_ascii=False, indent=1))
    return worst


if __name__ == "__main__":
    raise SystemExit(main())
