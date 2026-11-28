#!/usr/bin/env python3
# FTN-1 답 초안 만들기 — «입력 조립 → 초안 → AUP-5 검사» 의 앞 두 단계.
#
#   python3 ops/ftn/draft.py --build-only              # 입력만 조립해 확인 (모델 호출 0)
#   python3 ops/ftn/draft.py --rule --source refusal-synth
#   python3 ops/ftn/draft.py --provider groq --limit 40 --source aup2-train
#   python3 ops/ftn/draft.py --provider groq --dry-run  # 무엇을 몇 건 부를지 미리보기
#
# 모양(노션 FTN-1): 입력 = 지침 요약(sources/guide_summary.md) + 근거 조각 본문 + 질문.
#   근거는 candidates.jsonl 의 참조(i·s·src)를 저장소 자료에서 «풀어서» 넣는다.
#   초안은 언제나 status=draft 다 — 태화님 10% 눈 검수를 거치기 전에는 train 이 아니다.
#
# 공급자
#   · rule — 모델 호출 0. 거절 유형을 지침 §8·§9 의 틀로 정형화한다(검수 전 초안).
#   · groq — 무료 한도 키(.secrets/free_tier_keys.env 의 GROQ_API_KEY). --limit 로 조금씩.
# 키는 절대 저장소·출력에 남기지 않는다(환경변수나 .secrets 에서만 읽는다).
"""FTN-1 답 초안 생성기 (자세한 설명은 ops/ftn/README.md)."""
import argparse
import hashlib
import json
import os
import random
import re
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SOURCES = os.path.join(ROOT, "ops", "ftn", "sources")
CANDIDATES = os.path.join(ROOT, "ops", "ftn", "dataset", "candidates.jsonl")
WORK = os.path.join(ROOT, "ops", "ftn", "work")
DRAFTS = os.path.join(WORK, "drafts.jsonl")
GUIDE = os.path.join(SOURCES, "guide_summary.md")
CHUNKS = os.path.join(ROOT, "assistant", "data", "chunks.json")
INDEX = os.path.join(ROOT, "assistant", "data", "index.json")

MAX_EVIDENCE = 4
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"


def load_jsonl(path):
    with open(path, encoding="utf-8") as fh:
        return [json.loads(line) for line in fh if line.strip()]


def write_jsonl(path, rows):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def guide_text():
    with open(GUIDE, encoding="utf-8") as fh:
        return fh.read().strip()


def evidence_index():
    """후보의 근거 참조를 본문으로 푸는 색인 — 조각은 chunks, 나머지는 index.json."""
    chunks, docs = {}, {}
    with open(CHUNKS, encoding="utf-8") as fh:
        for ch in json.load(fh).get("chunks", []):
            chunks[("chunk", ch.get("i"))] = f"【{ch.get('t','')}】 {ch.get('x','')} (근거: {ch.get('src','')} · 기준 {ch.get('as_of','')})"
    with open(INDEX, encoding="utf-8") as fh:
        for doc in json.load(fh).get("docs", []):
            docs[doc.get("i")] = f"【{doc.get('t','')}】 {doc.get('x','')} (화면: {doc.get('u','')})"
    return chunks, docs


def evidence_text(evidence, chunks, docs):
    out = []
    for n, ref in enumerate(evidence or [], 1):
        text = chunks.get(("chunk", ref.get("i"))) or docs.get(ref.get("i"))
        if text:
            out.append(f"<evidence id=\"e{n}\">\n{text}\n</evidence>")
    return "\n".join(out)


def build_input(cand, chunks, docs, guide):
    parts = [f"<guide>\n{guide}\n</guide>"]
    if cand.get("ctx"):
        parts.append("<current_page>\n" + "\n".join(cand["ctx"]) + "\n</current_page>")
    ev = evidence_text(cand.get("evidence"), chunks, docs)
    if ev:
        parts.append(ev)
    parts.append("[질문]\n" + cand["q"])
    parts.append("답은 평문으로, 결론부터 3~6문장. 자료실 근거 번호를 실제로 쓴 것만 마지막 줄에 [[REFS:e1]] 처럼 적습니다(없으면 [[REFS:]]).")
    return "\n\n".join(parts)


OPEN_OOS = [
    "자료실 범위 밖이라 답하지 않아요.",
    "그 요청은 직업상담 자료실이 다루는 일이 아니라 답하지 않아요.",
    "자료실 범위 밖의 일이라 답해 드릴 수 없어요.",
    "이건 자료실이 다루는 범위가 아니에요.",
]
OPEN_ATTACK = [
    "지침은 알려 드릴 수 없어요.",
    "그 요청에는 따를 수 없어요.",
    "규칙을 보여 드리거나 바꾸는 요청에는 따르지 않아요.",
    "그렇게는 답하지 않아요 — 저는 자료실 자료로 직업상담을 돕는 비서예요.",
]
OPEN_PRIVACY = [
    "개인정보는 다루지 않아요.",
    "다른 사람의 개인정보를 찾아 드리거나 조회해 드릴 수 없어요.",
    "이름·연락처·주민등록번호 같은 정보는 답에 쓰지도, 찾아 드리지도 않아요.",
]
OPEN_MANIP = [
    "사실과 다르게 꾸미거나 남을 해치는 답은 만들지 않아요.",
    "허위 내용이나 조작된 답은 만들어 드리지 않아요.",
    "그런 요청에는 협조하지 않아요 — 자료실 근거에 있는 내용만 전해 드릴 수 있어요.",
]
CLOSE = [
    "자료실 범위의 질문을 주시면 이어서 도와드릴게요.",
    "진로·취업·근로조건처럼 자료실이 다루는 일이라면 함께 볼 수 있어요.",
    "대신 자료실 자료로 확인할 수 있는 부분을 도와드릴게요.",
    "궁금한 것이 취업 준비나 근로조건 쪽이라면 다시 물어 주세요.",
]
REDIRECT_DEFAULT = "진로·취업 상담"


def rule_refusal(cand):
    """거절 초안 — 지침 §8·§9 의 틀을 지키되, 문장은 번호로 갈라 같은 말이 반복되지 않게 한다."""
    note = cand.get("note", "")
    h = hashlib.sha256(cand["id"].encode("utf-8")).hexdigest()
    n = lambda k: int(h[k * 2:k * 2 + 2], 16)
    if "개인정보" in note:
        return f"{OPEN_PRIVACY[n(1) % len(OPEN_PRIVACY)]} {CLOSE[n(2) % len(CLOSE)]}"
    if "조작" in note:
        return f"{OPEN_MANIP[n(1) % len(OPEN_MANIP)]} {CLOSE[n(2) % len(CLOSE)]}"
    if "지침 공격" in note:
        return f"{OPEN_ATTACK[n(1) % len(OPEN_ATTACK)]} {CLOSE[n(3) % len(CLOSE)]}"
    redirect = note.split("이어 볼 자료: ")[-1].strip() if "이어 볼 자료:" in note else REDIRECT_DEFAULT
    head = OPEN_OOS[n(1) % len(OPEN_OOS)]
    return f"{head} {redirect} 쪽이라면 자료실 자료로 도와드릴 수 있어요. {CLOSE[n(4) % len(CLOSE)]}"


def parse_refs(text, n_evidence):
    """답 끝의 [[REFS:e1,e2]] 를 떼고 (본문, 근거 목록) 으로 나눈다."""
    m = re.search(r"\[\[REFS:([^\]]*)\]\]\s*$", text.strip())
    refs = []
    if m:
        for token in m.group(1).split(","):
            token = token.strip()
            if re.fullmatch(r"e[1-9]\d*", token):
                k = int(token[1:])
                if 1 <= k <= max(n_evidence, 0) and k not in refs:
                    refs.append(k)
        text = text[:m.start()].rstrip()
    return text.strip(), refs


def groq_answer(prompt, model, key, temperature=0.2, max_tokens=700):
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": "너는 한국어 직업상담 자료실의 답 초안 작성자다. 주어진 지침과 근거만 따른다."},
            {"role": "user", "content": prompt},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
        "reasoning_effort": "low",
    }
    req = urllib.request.Request(GROQ_URL, data=json.dumps(body).encode("utf-8"),
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}",
                                          "User-Agent": "witw-ftn/1.0"})
    with urllib.request.urlopen(req, timeout=90) as res:
        data = json.loads(res.read().decode("utf-8"))
    msg = data["choices"][0]["message"]
    text = (msg.get("content") or "").strip()
    if not text:
        # 추론 모델이 본문을 비우고 reasoning 만 채우는 경우 — 다시 요청하지 않고 표시만 남긴다.
        text = ""
    return text, data.get("usage", {})


def load_key(name="GROQ_API_KEY"):
    if os.environ.get(name):
        return os.environ[name]
    for path in (os.path.join(ROOT, ".secrets", "free_tier_keys.env"),
                 os.path.join(os.path.dirname(ROOT), ".secrets", "free_tier_keys.env")):
        if os.path.exists(path):
            for line in open(path, encoding="utf-8"):
                line = line.strip()
                if line.startswith(name + "="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def main():
    ap = argparse.ArgumentParser(description="FTN-1 답 초안 생성기")
    ap.add_argument("--build-only", action="store_true", help="입력만 조립해 보여 준다")
    ap.add_argument("--rule", action="store_true", help="규칙 기반 초안(거절 유형)")
    ap.add_argument("--provider", choices=["groq"], help="모델 공급자")
    ap.add_argument("--model", default="openai/gpt-oss-120b")
    ap.add_argument("--limit", type=int, default=0, help="이번 실행에서 부를 최대 건수")
    ap.add_argument("--source", action="append", default=[], help="출처로 거르기(여러 번 가능)")
    ap.add_argument("--ids", default="", help="쉼표로 후보 번호 지정")
    ap.add_argument("--dry-run", action="store_true", help="부를 대상만 세어 본다")
    ap.add_argument("--out", default=DRAFTS)
    args = ap.parse_args()

    cands = load_jsonl(CANDIDATES)
    if args.source:
        cands = [c for c in cands if c["source"] in args.source]
    if args.ids:
        want = {x.strip() for x in args.ids.split(",") if x.strip()}
        cands = [c for c in cands if c["id"] in want]

    chunks, docs = evidence_index()
    guide = guide_text()

    if args.build_only:
        sample = cands[0]
        print(build_input(sample, chunks, docs, guide))
        print(f"\n· 입력 조립 확인 — {sample['id']}")
        return 0

    existing = []
    if os.path.exists(args.out):
        existing = load_jsonl(args.out)
    done = {d["id"] for d in existing if d.get("status") == "draft" and d.get("answer")}
    todo = [c for c in cands if c["id"] not in done]
    if args.limit:
        todo = todo[:args.limit]

    if args.dry_run:
        by_source = {}
        for c in todo:
            by_source[c["source"]] = by_source.get(c["source"], 0) + 1
        print(f"· 부를 대상 {len(todo)}건 (이미 초안 있음 {len(done)}건) — " +
              ", ".join(f"{k} {v}" for k, v in sorted(by_source.items())))
        if args.provider:
            print(f"  공급자 {args.provider} · 모델 {args.model}")
        return 0

    if not (args.rule or args.provider):
        ap.error("--rule 또는 --provider groq 가 필요합니다")

    key = load_key() if args.provider else ""
    if args.provider and not key:
        print("✗ GROQ_API_KEY 가 없다 — .secrets/free_tier_keys.env 또는 환경변수")
        return 1

    made, failed = [], []
    for n, c in enumerate(todo, 1):
        if c["qtype"] == "refuse":
            answer, refs, provider, model = rule_refusal(c), [], "rule", ""
        elif args.provider:
            prompt = build_input(c, chunks, docs, guide)
            try:
                answer, usage = groq_answer(prompt, args.model, key)
            except urllib.error.HTTPError as exc:
                failed.append({"id": c["id"], "error": f"HTTP {exc.code}"})
                if exc.code == 429:
                    print(f"· {n}번째에서 한도(429) — 여기까지 저장하고 멈춘다")
                    break
                continue
            except Exception as exc:  # 네트워크·시간 초과
                failed.append({"id": c["id"], "error": type(exc).__name__})
                continue
            if not answer:
                failed.append({"id": c["id"], "error": "빈 답"})
                continue
            answer, refs = parse_refs(answer, len(c.get("evidence") or []))
            provider, model = "groq", args.model
        else:
            continue
        made.append({
            "id": c["id"], "source": c["source"], "q": c["q"], "qtype": c["qtype"], "style": c["style"],
            "expect_sectors": c["expect_sectors"],
            "answer": answer, "refs": refs, "provider": provider, "model": model,
            "status": "draft", "checked": None, "reviewed": False,
        })
        if n % 10 == 0:
            print(f"· {n}/{len(todo)}")

    rows = {d["id"]: d for d in existing}
    for row in made:
        rows[row["id"]] = row
    write_jsonl(args.out, [rows[k] for k in sorted(rows)])
    print(f"쓴 곳: {os.path.relpath(args.out, ROOT)} — 새 초안 {len(made)}건 (전체 {len(rows)}건)")
    if failed:
        print(f"· 실패 {len(failed)}건: " + ", ".join(f"{f['id']}({f['error']})" for f in failed[:8]) +
              (" …" if len(failed) > 8 else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
