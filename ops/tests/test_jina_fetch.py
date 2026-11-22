#!/usr/bin/env python3
"""Jina Reader 수집 보조 시험 — `ops/scripts/jina_fetch.py`

    python3 -m unittest ops/tests/test_jina_fetch.py -v
    python3 -m unittest discover -s ops/tests -p "test_*.py" -v

CI(`static-checks` → `validate_repo.py`의 단위 검사)가 `ops/tests/test_*.py`를 모두 돌린다.
**네트워크를 부르지 않는다** — `jina_fetch._open`을 갈아 끼워 요청 모양과 실패 처리를 본다.
무료 한도(분당 20회)를 시험으로 소진하지 않으려는 것이고, 그래서 «무엇을 보냈는지»는
가짜 응답이 받은 `Request`에서 확인한다.
"""
import io
import json
import os
import socket
import sys
import unittest
import urllib.error
from contextlib import redirect_stderr, redirect_stdout
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
SCRIPTS = os.path.join(REPO, "ops", "scripts")
if SCRIPTS not in sys.path:
    sys.path.insert(0, SCRIPTS)

import jina_fetch  # noqa: E402

OK_BODY = (
    "Title: 예시 문서\n\n"
    "URL Source: https://example.com/\n\n"
    "Published Time: Thu, 19 Nov 2026 22:11:52 GMT\n\n"
    "Markdown Content:\n"
    "# 예시\n\n본문 첫 줄\n둘째 줄\n"
)


class FakeHeaders:
    def __init__(self, charset="utf-8", extra=None):
        self.charset = charset
        self.extra = dict(extra or {})

    def get_content_charset(self):
        return self.charset

    def get(self, name, default=None):
        return self.extra.get(name, default)


class FakeResponse:
    def __init__(self, body=OK_BODY, status=200, charset="utf-8"):
        self.body = body.encode(charset)
        self.status = status
        self.headers = FakeHeaders(charset)

    def read(self, *args):
        return self.body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def http_error(code, body="", retry_after=None):
    extra = {"Retry-After": str(retry_after)} if retry_after is not None else {}
    return urllib.error.HTTPError(
        "https://r.jina.ai/https://example.com/", code, "err", FakeHeaders(extra=extra),
        io.BytesIO(body.encode("utf-8")))


class Recorder:
    """`_open` 대역 — 받은 요청을 모으고 정해 둔 응답을 차례로 돌려준다."""

    def __init__(self, *responses):
        self.responses = list(responses)
        self.requests = []

    def __call__(self, request, timeout):
        self.requests.append((request, timeout))
        item = self.responses.pop(0) if len(self.responses) > 1 else self.responses[0]
        if isinstance(item, BaseException):
            raise item
        return item


def fetch_with(recorder, url="https://example.com/", **kwargs):
    with mock.patch.object(jina_fetch, "_open", recorder):
        return jina_fetch.fetch_markdown(url, **kwargs)


class RequestShapeTests(unittest.TestCase):
    """무엇을 어디로 보내는가 — 주소·머리글·한글 경로."""

    def test_reader_url_and_headers(self):
        recorder = Recorder(FakeResponse())
        text = fetch_with(recorder)
        self.assertEqual(text, OK_BODY)
        request, timeout = recorder.requests[0]
        self.assertEqual(request.full_url, "https://r.jina.ai/https://example.com/")
        headers = {key.lower(): value for key, value in request.header_items()}
        self.assertEqual(headers.get("user-agent"), jina_fetch.USER_AGENT)
        self.assertEqual(headers.get("x-return-format"), "markdown")
        self.assertEqual(timeout, 20)

    def test_timeout_is_passed_through(self):
        recorder = Recorder(FakeResponse())
        fetch_with(recorder, timeout=7)
        self.assertEqual(recorder.requests[0][1], 7)

    def test_korean_path_is_percent_encoded(self):
        recorder = Recorder(FakeResponse())
        fetch_with(recorder, url="https://www.example.com/뉴스/기사?q=최저임금")
        sent = recorder.requests[0][0].full_url
        self.assertTrue(sent.startswith(jina_fetch.READER_BASE))
        self.assertNotIn("뉴스", sent)
        self.assertIn("%EB%89%B4%EC%8A%A4", sent)      # 뉴스
        self.assertTrue(sent.isascii())
        self.assertIn("q=", sent)                      # 쿼리는 그대로 살아 있다

    def test_query_and_fragment_kept(self):
        self.assertEqual(
            jina_fetch.reader_url("https://example.com/a?b=1&c=2#top"),
            "https://r.jina.ai/https://example.com/a?b=1&c=2#top")


class RejectTests(unittest.TestCase):
    """쓸 수 없는 주소는 **요청을 보내지 않고** 거절한다(남의 서비스로 내부 주소가 새지 않게)."""

    def assert_rejected(self, url):
        recorder = Recorder(FakeResponse())
        with self.assertRaises(jina_fetch.InvalidURLError):
            fetch_with(recorder, url=url)
        self.assertEqual(recorder.requests, [], f"{url!r} 는 요청을 보내면 안 된다")

    def test_other_schemes(self):
        for url in ("ftp://example.com/x", "file:///etc/passwd", "javascript:alert(1)",
                    "data:text/html,<b>x</b>", "example.com", "//example.com/x", ""):
            self.assert_rejected(url)

    def test_internal_hosts(self):
        for url in ("http://localhost:8000/x", "http://127.0.0.1/x", "http://10.0.0.5/x",
                    "http://192.168.0.10/x", "http://172.16.0.1/x", "http://169.254.169.254/latest",
                    "http://[::1]/x", "http://intranet/x", "http://nas.local/x",
                    "http://printer.internal/x"):
            self.assert_rejected(url)

    def test_public_hosts_pass(self):
        for url in ("https://example.com/", "https://www.moel.go.kr/info.do",
                    "http://8.8.8.8/x"):
            recorder = Recorder(FakeResponse())
            fetch_with(recorder, url=url)
            self.assertTrue(recorder.requests[0][0].full_url.startswith(jina_fetch.READER_BASE))

    def test_whitespace_rejected(self):
        self.assert_rejected("https://example.com/a b")
        self.assert_rejected("https://example.com/\nX-Inject: 1")


class FailureTests(unittest.TestCase):
    """실패는 조용히 빈 글로 지나가지 않고, 이유와 상태를 붙여 멈춘다."""

    def test_http_error_carries_status_and_url(self):
        recorder = Recorder(http_error(403, "forbidden by site"))
        with self.assertRaises(jina_fetch.JinaFetchError) as caught:
            fetch_with(recorder)
        error = caught.exception
        self.assertEqual(error.status, 403)
        self.assertIn("403", str(error))
        self.assertIn("https://example.com/", str(error))
        self.assertIn("forbidden by site", str(error))   # 응답 본문이 단서로 붙는다

    def test_403_is_not_retried(self):
        recorder = Recorder(http_error(403))
        with self.assertRaises(jina_fetch.JinaFetchError):
            fetch_with(recorder, retries=3)
        self.assertEqual(len(recorder.requests), 1)

    def test_empty_body_is_failure(self):
        recorder = Recorder(FakeResponse("   \n\n"))
        with self.assertRaises(jina_fetch.JinaFetchError) as caught:
            fetch_with(recorder)
        self.assertIn("빈 응답", str(caught.exception))

    def test_header_only_body_is_failure(self):
        """제목만 오고 본문이 0자인 200이 있다 — 빈 글로 넘기면 수집이 조용히 비어 버린다."""
        header_only = "Title: 내일을 위한 고용노동부\n\nURL Source: https://www.moel.go.kr/\n\nMarkdown Content:\n"
        recorder = Recorder(FakeResponse(header_only))
        with self.assertRaises(jina_fetch.JinaFetchError) as caught:
            fetch_with(recorder)
        self.assertIn("본문이 0자", str(caught.exception))
        self.assertEqual(caught.exception.status, None)

    def test_timeout_is_failure(self):
        recorder = Recorder(urllib.error.URLError(socket.timeout("timed out")))
        with self.assertRaises(jina_fetch.JinaFetchError) as caught:
            fetch_with(recorder, timeout=3)
        self.assertIn("시간 초과 3초", str(caught.exception))
        self.assertIsNone(caught.exception.status)

    def test_connection_refused_is_failure(self):
        recorder = Recorder(urllib.error.URLError(ConnectionRefusedError(111, "refused")))
        with self.assertRaises(jina_fetch.JinaFetchError):
            fetch_with(recorder)


class RateLimitTests(unittest.TestCase):
    """무료 한도(분당 20회) — 429는 Retry-After를 지켜 한 번만 다시 부른다."""

    def test_429_waits_then_succeeds(self):
        recorder = Recorder(http_error(429, retry_after=2), FakeResponse())
        slept = []
        with mock.patch.object(jina_fetch.time, "sleep", slept.append):
            text = fetch_with(recorder)
        self.assertEqual(text, OK_BODY)
        self.assertEqual(slept, [2.0])
        self.assertEqual(len(recorder.requests), 2)

    def test_429_without_retry_after_waits_short(self):
        recorder = Recorder(http_error(429), FakeResponse())
        slept = []
        with mock.patch.object(jina_fetch.time, "sleep", slept.append):
            fetch_with(recorder)
        self.assertEqual(len(slept), 1)
        self.assertGreaterEqual(slept[0], 0.5)

    def test_429_gives_up_after_retry(self):
        recorder = Recorder(http_error(429, retry_after=1))
        slept = []
        with mock.patch.object(jina_fetch.time, "sleep", slept.append), \
                self.assertRaises(jina_fetch.JinaFetchError) as caught:
            fetch_with(recorder, retries=1)
        self.assertEqual(caught.exception.status, 429)
        self.assertIn("분당 20회", str(caught.exception))
        self.assertEqual(len(recorder.requests), 2)
        self.assertEqual(len(slept), 1)

    def test_long_retry_after_is_capped(self):
        recorder = Recorder(http_error(429, retry_after=600), FakeResponse())
        slept = []
        with mock.patch.object(jina_fetch.time, "sleep", slept.append):
            fetch_with(recorder)
        self.assertLessEqual(slept[0], jina_fetch.RETRY_WAIT_MAX)

    def test_no_retry_when_retries_zero(self):
        recorder = Recorder(http_error(429))
        with self.assertRaises(jina_fetch.JinaFetchError):
            fetch_with(recorder, retries=0)
        self.assertEqual(len(recorder.requests), 1)


class ParseTests(unittest.TestCase):
    """머리글과 본문을 나눈다 — 없는 값은 지어내지 않고 빈 칸으로 둔다."""

    def test_fields_split(self):
        parsed = jina_fetch.parse_reader_response(OK_BODY)
        self.assertEqual(parsed["title"], "예시 문서")
        self.assertEqual(parsed["source_url"], "https://example.com/")
        self.assertEqual(parsed["published_time"], "Thu, 19 Nov 2026 22:11:52 GMT")
        self.assertEqual(parsed["content"], "# 예시\n\n본문 첫 줄\n둘째 줄")

    def test_without_header_keeps_whole_text(self):
        parsed = jina_fetch.parse_reader_response("그냥 본문\n둘째 줄")
        self.assertEqual(parsed["title"], "")
        self.assertEqual(parsed["source_url"], "")
        self.assertEqual(parsed["content"], "그냥 본문\n둘째 줄")

    def test_result_falls_back_to_requested_url(self):
        result = jina_fetch._result("https://example.com/x", "제목 없는 본문")
        self.assertEqual(result["source_url"], "https://example.com/x")
        self.assertEqual(result["chars"], len("제목 없는 본문"))


class CliTests(unittest.TestCase):
    """CLI — 표준 출력에는 본문만, `--json`에는 출처와 함께, 실패는 종료 코드로."""

    def run_cli(self, argv, recorder):
        out, err = io.StringIO(), io.StringIO()
        with mock.patch.object(jina_fetch, "_open", recorder), \
                redirect_stdout(out), redirect_stderr(err):
            code = jina_fetch.main(argv)
        return code, out.getvalue(), err.getvalue()

    def test_plain_prints_body_only(self):
        code, out, err = self.run_cli(["https://example.com/"], Recorder(FakeResponse()))
        self.assertEqual(code, jina_fetch.EXIT_OK)
        self.assertEqual(out, "# 예시\n\n본문 첫 줄\n둘째 줄\n")
        self.assertEqual(err, "")

    def test_json_has_source_and_content(self):
        code, out, _ = self.run_cli(["https://example.com/", "--json"], Recorder(FakeResponse()))
        self.assertEqual(code, 0)
        data = json.loads(out)
        self.assertEqual(data["url"], "https://example.com/")
        self.assertEqual(data["reader_url"], "https://r.jina.ai/https://example.com/")
        self.assertEqual(data["title"], "예시 문서")
        self.assertEqual(data["source_url"], "https://example.com/")
        self.assertIn("본문 첫 줄", data["content"])
        self.assertEqual(data["chars"], len(data["content"]))
        self.assertTrue(data["fetched_at"].endswith("+09:00"))

    def test_bad_url_exits_2_without_request(self):
        recorder = Recorder(FakeResponse())
        code, out, err = self.run_cli(["ftp://example.com/x"], recorder)
        self.assertEqual(code, jina_fetch.EXIT_USAGE)
        self.assertEqual(out, "")
        self.assertIn("주소를 쓸 수 없다", err)
        self.assertEqual(recorder.requests, [])

    def test_http_failure_exits_1(self):
        code, out, err = self.run_cli(["https://example.com/"], Recorder(http_error(500)))
        self.assertEqual(code, jina_fetch.EXIT_FETCH)
        self.assertEqual(out, "")
        self.assertIn("본문을 받지 못했다", err)

    def test_bad_timeout_exits_2(self):
        recorder = Recorder(FakeResponse())
        code, _, err = self.run_cli(["https://example.com/", "--timeout", "0"], recorder)
        self.assertEqual(code, jina_fetch.EXIT_USAGE)
        self.assertIn("--timeout", err)
        self.assertEqual(recorder.requests, [])

    def test_timeout_flag_reaches_socket(self):
        recorder = Recorder(FakeResponse())
        code, _, _ = self.run_cli(["https://example.com/", "--timeout", "30"], recorder)
        self.assertEqual(code, 0)
        self.assertEqual(recorder.requests[0][1], 30)


if __name__ == "__main__":
    unittest.main(verbosity=2)
