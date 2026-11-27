#!/usr/bin/env python3
# FTN-1 시험용 분리 검사 — 학습 후보가 시험(test) 문항과 2-gram으로 겹치면 걸러 낸다.
#
#   python3 ops/ftn/overlap_check.py                 # ops/ftn/dataset/candidates.jsonl 검사
#   python3 ops/ftn/overlap_check.py --file 다른.jsonl  # «q» 칸이 있는 아무 jsonl이나
#   python3 ops/ftn/overlap_check.py --self-test     # 자기시험
#
# 노션 FTN-1 「시험용 분리」: 시험 문항은 학습에 절대 넣지 않는다 — 같은 문장·근소한 변형도
# 제외하며 2-gram 겹침으로 검사한다. 시험 문항 전체(assistant/eval/items.jsonl 의 split=test,
# 질문 q + 앞 대화 ctx)를 말뭉치로 삼고, 겹침은 글자 수준 2-gram으로 잰다(조사·어미 변형까지 잡기 위해).
#
# 판정:
#   · exact    — 정규화한 문장이 시험 문장과 똑같다 → 실패
#   · near     — 후보 2-gram 가운데 시험 말뭉치와 겹치는 비율이 0.6 이상 → 실패(근소 변형)
#   · shared   — 겹치는 2-gram이 0.6 미만으로 있다 → 기록만(법정 용어는 자연스레 겹친다)
#
# 종료 코드: 통과 0 · 겹침 실패 1. 파이썬 표준 라이브러리만, 네트워크 0.
"""FTN-1 시험용 분리(2-gram 겹침) 검사기."""

import argparse
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EVAL_ITEMS = os.path.join(ROOT, "assistant", "eval", "items.jsonl")
DEFAULT_FILE = os.path.join(ROOT, "ops", "ftn", "dataset", "candidates.jsonl")

NEAR_RATIO = 0.6  # 이 비율 이상 겹치면 «근소한 변형»으로 본다

_TOKEN = re.compile(r"[가-힣a-z0-9]+")


def normalize(text):
    """소문자로 바꾸고 한글·영문·숫자 토큰만 남긴다(띄어쓰기·조사 오탐을 줄인다)."""
    return _TOKEN.findall(str(text).lower())


def joined(tokens):
    """토큰을 공백 없이 이어 한 줄로 만든다 — 띄어쓰기 변형이 같은 말로 모이게."""
    return "".join(tokens)


def ngrams(tokens, n=2):
    """글자 수준 2-gram. 조사·어미 변형(얼마→얼마예요)도 낱말 수준보다 잘 잡는다."""
    text = joined(tokens)
    if len(text) < n:
        return {text} if text else set()
    return {text[i:i + n] for i in range(len(text) - n + 1)}


def load_test_pool():
    """시험 문항을 낱개(번호·문장 집합·2-gram 집합)로 모은다.

    겹침은 «어느 한 시험 문항»과의 비교로만 판정한다 — 전체를 합친 풀과 비교하면
    흔한 어미(«모르겠어요» 등)가 여러 문항에 흩어져 있어 오탐이 된다."""
    pool = []
    with open(EVAL_ITEMS, encoding="utf-8") as fh:
        for line in fh:
            if not line.strip():
                continue
            it = json.loads(line)
            if it.get("split") != "test":
                continue
            sentences, grams = set(), set()
            for text in [it.get("q", "")] + list(it.get("ctx") or []):
                tokens = normalize(text)
                if not tokens:
                    continue
                sentences.add(joined(tokens))
                grams |= ngrams(tokens)
            pool.append((it.get("id", "?"), sentences, grams))
    return pool


def check_line(q, ctx, pool):
    """한 후보를 시험 문항 낱낱과 비교해 (판정, 최고 겹침 비율) 을 돌려준다."""
    verdict = "pass"
    worst = 0.0
    for text in [q] + list(ctx or []):
        tokens = normalize(text)
        if not tokens:
            continue
        grams = ngrams(tokens)
        for _tid, sentences, test_grams in pool:
            if joined(tokens) in sentences:
                return "exact", 1.0
            if not grams:
                continue
            shared = len(grams & test_grams)
            ratio = shared / len(grams)
            worst = max(worst, ratio)
            if ratio >= NEAR_RATIO:
                verdict = "near"
            elif shared and verdict == "pass":
                verdict = "shared"
    return verdict, worst


def run(path):
    pool = load_test_pool()
    failures, notes, n = [], 0, 0
    with open(path, encoding="utf-8") as fh:
        for line_no, line in enumerate(fh, 1):
            if not line.strip():
                continue
            n += 1
            it = json.loads(line)
            verdict, ratio = check_line(it.get("q", ""), it.get("ctx") or [], pool)
            label = it.get("id", f"{line_no}번 줄")
            if verdict in ("exact", "near"):
                failures.append(f"{label}: 시험 문항과 겹침({verdict}, 비율 {ratio:.2f}) — «{str(it.get('q'))[:30]}»")
            elif verdict == "shared":
                notes += 1
    return n, failures, notes


def self_test():
    pool = []
    for i, t in enumerate(["최저임금 얼마", "수습 기간 감액 되나요"]):
        tokens = normalize(t)
        pool.append((f"T-{i}", {joined(tokens)}, ngrams(tokens)))
    cases = [
        # (질문, 기대 판정)
        ("최저임금 얼마", "exact"),                       # 시험 문장 그대로
        ("최저임금 얼마예요", "near"),                    # 근소 변형 — 2-gram 중 상당수 겹침
        ("수습 기간 감액 되나요", "exact"),
        ("연차수당 계산 방법 알려줘", "pass"),            # 완전히 다른 주제
        ("최저임금 관련 자료 어디 있어?", "shared"),      # 용어 하나만 겹침 — 기록만
    ]
    bad = []
    for q, want in cases:
        got, _ = check_line(q, [], pool)
        if got != want:
            bad.append(f"«{q}» — 기대 {want}, 실제 {got}")
    if bad:
        print("✗ 자기시험 실패")
        for line in bad:
            print(f"  - {line}")
        return 1
    print(f"· 자기시험 통과 ({len(cases)}건)")
    return 0


def main():
    parser = argparse.ArgumentParser(description="FTN-1 시험용 분리(2-gram 겹침) 검사기")
    parser.add_argument("--file", default=DEFAULT_FILE, help="검사할 jsonl («q» 칸 필요)")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        return self_test()

    if not os.path.exists(args.file):
        print(f"✗ {args.file} 이 없다 — python3 ops/ftn/collect.py")
        return 1
    n, failures, notes = run(args.file)
    for line in failures:
        print(f"✗ {line}")
    if notes:
        print(f"· 용어 수준 겹침 {notes}건 — 기록만(법정 용어는 자연스레 겹친다)")
    if failures:
        print(f"실패 {len(failures)}건 / {n}건 — 시험 문항과 근소한 변형까지 학습에 넣을 수 없다")
        return 1
    print(f"· 시험용 분리 통과 — {n}건 모두 시험 문항과 겹치지 않는다")
    return 0


if __name__ == "__main__":
    sys.exit(main())
