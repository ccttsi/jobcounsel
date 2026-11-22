#!/usr/bin/env python3
"""Jina Reader(r.jina.ai)로 웹문서 본문을 Markdown으로 받아 오는 도구 (2026-11-22)

JS로 그려지는 지면·보도자료처럼 `urllib`로는 본문이 비어 오는 문서를, **계정도 API 키도 없이**
깨끗한 Markdown으로 받아 오려고 만든 수집 보조 CLI다. 화면 코드가 아니라 `ops/` 쪽 수집·초안
작업에서만 쓴다(ROLES.md — 정적 앱 코드 안에 외부 수집·API 호출을 넣지 않는다).

    python3 ops/scripts/jina_fetch.py https://example.com
    python3 ops/scripts/jina_fetch.py https://example.com --json
    python3 ops/scripts/jina_fetch.py https://example.com --timeout 30 > draft.md

부르는 법
  fetch_markdown(url, timeout=20) -> str   # 응답 전문(머리글 + 본문)
  parse_reader_response(text) -> dict      # 제목·원본 주소·게시 시각·본문으로 나눈다

종료 코드
  0  받아 왔다
  1  받지 못했다(HTTP 오류·시간 초과·빈 응답·연결 실패)
  2  쓸 수 없는 입력(주소 모양·스킴·내부 호스트) — 요청을 보내지 않는다

지키는 선 — 이 도구는 «가져오기»까지만 한다
  · **저작권** — 받아 온 글은 수집·초안의 참고 자료다. 원문을 그대로 싣는 근거가 되지 않는다.
    자료실에 넣기 전에 `collect_gate.py`의 라이선스·시행일 관문을 그대로 통과해야 하고
    (이 도구는 그 관문을 **우회하지 않는다**), 항목마다 `license`·`source_url`·기준일을 적는 일은
    부르는 쪽 몫이다. 재가공이 확인되지 않은 자료는 Track B(사실·수치 요약)로만 쓰고,
    원문을 15단어 넘게 옮기지 않는다(CONSTITUTION.md 제1조 1-1).
  · **제3자 전송** — `r.jina.ai`는 우리가 아닌 남의 서비스다. 넘긴 주소는 그쪽 서버가 열어 본다.
    그래서 내부망·기기 안을 가리키는 주소(`localhost`·사설 IP·도트 없는 내부 호스트 이름)는
    요청을 보내기 전에 막는다(제3조 3-2). 개인정보가 주소에 담긴 문서는 넘기지 않는다.
  · **정중한 호출** — 키 없이 쓰는 무료 한도는 **분당 20회(20 RPM, IP 기준)** 다
    (jina.ai/reader 확인, 2026-11-22). 한 번 실행에 한 번만 부르고, 몰아 부를 때는 간격을 둔다.
    `429`(한도 초과)·`503`(일시 장애)은 `Retry-After`를 지켜 **한 번만** 다시 시도한다.
"""
from __future__ import annotations

import argparse
import ipaddress
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

READER_BASE = "https://r.jina.ai/"
USER_AGENT = "jobcounsel-jina-fetch/1.0 (+https://witw.pages.dev/)"
ALLOWED_SCHEMES = ("http", "https")
KST = timezone(timedelta(hours=9))

EXIT_OK = 0
EXIT_FETCH = 1
EXIT_USAGE = 2

# 다시 시도할 만한 응답 — 한도 초과(429)와 일시 장애(503)뿐이다.
RETRY_STATUSES = (429, 503)
RETRY_WAIT_MAX = 10.0   # Retry-After가 이보다 크면 기다리지 않고 실패로 끝낸다(수집이 멈춰 서지 않게)
BODY_SNIPPET = 300      # 오류 메시지에 붙이는 응답 본문 길이

# 내부망을 가리키는 호스트 이름 — 도트가 없어도 이 이름들은 막는다.
BLOCKED_HOSTS = {"localhost", "localhost.localdomain", "ip6-localhost", "metadata"}
BLOCKED_SUFFIXES = (".local", ".internal", ".localdomain", ".home.arpa", ".lan", ".intra")


class JinaFetchError(Exception):
    """본문을 받아 오지 못했다. `status`는 HTTP 상태(모르면 None), `url`은 요청한 원본 주소."""

    def __init__(self, message: str, url: str = "", status: int | None = None):
        super().__init__(message)
        self.url = url
        self.status = status


class InvalidURLError(JinaFetchError):
    """주소가 http/https가 아니거나 내부망을 가리킨다 — 요청을 보내지 않았다."""


# ---------------------------------------------------------------- 주소 다루기
def _host_is_public(host: str) -> bool:
    """남의 서비스에 넘겨도 되는(공개 인터넷) 호스트인가. 애매하면 False."""
    host = host.strip().strip("[]").rstrip(".").lower()
    if not host or host in BLOCKED_HOSTS:
        return False
    if any(host.endswith(suffix) for suffix in BLOCKED_SUFFIXES):
        return False
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        ip = None
    if ip is not None:
        return not (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved
                    or ip.is_multicast or ip.is_unspecified)
    # 도트 없는 이름(intranet 처럼)은 공개 DNS에 없는 내부 이름으로 본다.
    return "." in host


def normalize_url(url: str) -> str:
    """http/https 주소인지, 공개 호스트인지 확인하고 다듬은 주소를 돌려준다."""
    text = (url or "").strip()
    if not text:
        raise InvalidURLError("주소가 비어 있다 — https://로 시작하는 문서 주소가 필요하다")
    if any(ch.isspace() or ord(ch) < 32 for ch in text):
        raise InvalidURLError(f"주소에 공백·제어 문자가 있다 — 한 줄로 된 주소만 받는다: {text[:80]}")
    parts = urllib.parse.urlsplit(text)
    scheme = parts.scheme.lower()
    if scheme not in ALLOWED_SCHEMES:
        raise InvalidURLError(f"http:// 또는 https:// 주소만 받는다(받은 스킴: {scheme or '없음'})", text)
    if not parts.netloc:
        raise InvalidURLError(f"호스트가 없는 주소다: {text}", text)
    host = parts.hostname or ""
    if not _host_is_public(host):
        raise InvalidURLError(
            f"내부망·기기 안을 가리키는 호스트는 넘기지 않는다: {host} "
            "(r.jina.ai는 남의 서비스라 넘긴 주소를 그쪽이 열어 본다)", text)
    return text


def reader_url(url: str) -> str:
    """`https://r.jina.ai/{원본 주소}` — 한글·비ASCII 글자만 퍼센트로 바꾼다(구조는 그대로)."""
    composed = READER_BASE + url
    return urllib.parse.quote(composed, safe=":/?#[]@!$&'()*+,;=%~")


# ---------------------------------------------------------------- 응답 다루기
def parse_reader_response(text: str) -> dict:
    """Reader 응답을 머리글(제목·원본 주소·게시 시각)과 본문으로 나눈다.

    머리글이 없거나 모양이 다르면 **본문을 지어내지 않고** 받은 글 전체를 본문으로 둔다.
    본문 앞뒤의 빈 줄은 지운다(받아 온 글자를 고치지는 않는다).
    """
    raw = text or ""
    marker = "Markdown Content:"
    head, body = "", raw
    index = raw.find(marker)
    if index >= 0:
        head = raw[:index]
        body = raw[index + len(marker):]
    body = body.strip("\r\n")
    fields = {}
    for line in head.splitlines():
        name, sep, value = line.partition(":")
        if not sep:
            continue
        key = name.strip().lower()
        if key in ("title", "url source", "published time"):
            fields[key] = value.strip()
    return {
        "title": fields.get("title", ""),
        "source_url": fields.get("url source", ""),
        "published_time": fields.get("published time", ""),
        "content": body,
    }


def _open(request: urllib.request.Request, timeout: float):
    """실제 요청 — 시험이 갈아 끼우는 자리(네트워크를 부르지 않고 시험한다)."""
    return urllib.request.urlopen(request, timeout=timeout)


def _retry_after(headers) -> float:
    value = ""
    try:
        value = (headers or {}).get("Retry-After") or ""
    except Exception:  # 헤더가 없는 가짜 응답도 있다
        value = ""
    try:
        # 0이나 음수는 «바로 다시»가 아니라 짧게라도 쉬라는 뜻으로 본다(같은 분에 다시 걸리지 않게).
        return max(0.5, min(float(str(value).strip()), RETRY_WAIT_MAX))
    except ValueError:
        return 1.0   # Retry-After가 없거나 초 단위가 아니면 1초 쉰다


def fetch_markdown(url: str, timeout: int = 20, retries: int = 1) -> str:
    """웹문서를 Jina Reader로 Markdown으로 받아 온다(머리글 + 본문 전문).

    `timeout`은 소켓 시간 초과(초)다. `retries`는 429·503에서 다시 시도하는 횟수(기본 1회).
    받지 못했거나(HTTP 오류·시간 초과·빈 응답·본문 0자) `JinaFetchError`,
    주소가 쓸 수 없는 모양이면 `InvalidURLError`(요청을 보내지 않는다)를 던진다.
    """
    target = normalize_url(url)
    request = urllib.request.Request(reader_url(target), headers={
        "User-Agent": USER_AGENT,
        "Accept": "text/plain",
        "X-Return-Format": "markdown",
    })
    attempt = 0
    while True:
        try:
            with _open(request, timeout) as response:
                payload = response.read()
                charset = "utf-8"
                try:
                    charset = response.headers.get_content_charset() or "utf-8"
                except Exception:
                    charset = "utf-8"
                text = payload.decode(charset, errors="replace")
            if not text.strip():
                raise JinaFetchError(
                    f"빈 응답을 받았다 — 그 주소의 본문을 Reader가 얻지 못했다: {target}", target)
            # 제목만 오고 본문이 0자인 경우(200)가 실제로 있다 — 빈 글로 넘기지 않고 실패로 본다.
            if not parse_reader_response(text)["content"].strip():
                raise JinaFetchError(
                    f"본문이 0자다(제목·주소만 왔다) — 그 사이트가 자동 접근을 막았거나(robots·로그인)"
                    f" 본문을 그림·스크립트로만 그리는 지면일 수 있다. 브라우저로 직접 열어 본문을 확인한다: {target}",
                    target)
            return text
        except urllib.error.HTTPError as error:
            detail = ""
            try:
                detail = error.read().decode("utf-8", errors="replace").strip()[:BODY_SNIPPET]
            except Exception:
                detail = ""
            if error.code in RETRY_STATUSES and attempt < retries:
                time.sleep(_retry_after(error.headers))
                attempt += 1
                continue
            reason = f"{error.code} {error.reason}".strip()
            hint = " (무료 한도는 분당 20회다 — 잠시 뒤 다시 부른다)" if error.code == 429 else ""
            raise JinaFetchError(
                f"Reader가 {reason}로 응답했다: {target}{hint}"
                + (f" · 응답: {detail}" if detail else ""), target, error.code) from error
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            reason = getattr(error, "reason", error)
            raise JinaFetchError(
                f"Reader에 닿지 못했다(시간 초과 {timeout}초 또는 연결 실패): {target} · {reason}",
                target) from error


# ---------------------------------------------------------------- CLI
def _result(url: str, text: str) -> dict:
    parsed = parse_reader_response(text)
    return {
        "url": url,
        "reader_url": reader_url(url),
        "status": 200,
        "title": parsed["title"],
        "source_url": parsed["source_url"] or url,
        "published_time": parsed["published_time"],
        "chars": len(parsed["content"]),
        "fetched_at": datetime.now(KST).isoformat(timespec="seconds"),
        "content": parsed["content"],
    }


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description="웹문서를 Jina Reader(r.jina.ai)로 Markdown으로 받아 온다. "
                    "받아 온 글은 수집·초안 참고용이며 저작권·시행일 관문(collect_gate.py)을 우회하지 않는다.")
    parser.add_argument("url", help="http/https로 시작하는 문서 주소")
    parser.add_argument("--json", action="store_true", help="제목·원본 주소·게시 시각·본문을 JSON 하나로 낸다")
    parser.add_argument("--timeout", type=int, default=20, help="소켓 시간 초과(초, 기본 20)")
    args = parser.parse_args(argv)

    if args.timeout <= 0:
        print("--timeout은 1초 이상이어야 한다", file=sys.stderr)
        return EXIT_USAGE
    try:
        text = fetch_markdown(args.url, timeout=args.timeout)
    except InvalidURLError as error:
        print(f"주소를 쓸 수 없다 — {error}", file=sys.stderr)
        return EXIT_USAGE
    except JinaFetchError as error:
        print(f"본문을 받지 못했다 — {error}", file=sys.stderr)
        return EXIT_FETCH

    result = _result(args.url, text)
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(result["content"])
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
