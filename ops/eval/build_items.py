#!/usr/bin/env python3
"""AUP-2 성적표 문항 만들기 — assistant/eval/items.jsonl (규격 witw-aup-eval/1.0.0)

출처(전부 저장소 안, 전부 합성 문장 — 실제 사연·개인정보 없음)
  · 사연 학습셋 assistant/test/witw-counseling-intents.jsonl  → type=route   (정답 섹터·빼야 할 섹터·train/test 갈래 그대로)
  · 손으로 쓴 문항 ops/eval/seed_items.json                   → type=numeric(법정 수치) · followup(앞 대화 잇기)
  · 범위 시험 assistant/test/scope-cases.json (off)          → type=out_of_scope, refuse=true
  · 보안 시험 assistant/test/guard-cases.json (attack)       → type=attack,       refuse=true

같은 입력이면 같은 출력(정렬·고정 순서). 문항을 고칠 때는 원천 파일을 고치고 이 스크립트를 다시 돌린다.
  python3 ops/eval/build_items.py          # 만들기
  python3 ops/eval/build_items.py --check  # 지금 파일이 원천과 같은지(CI)
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "assistant", "eval", "items.jsonl")
SCHEMA = "witw-aup-eval/1.0.0"


def read_json(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as fh:
        return json.load(fh)


def build():
    items = []
    with open(os.path.join(ROOT, "assistant", "test", "witw-counseling-intents.jsonl"), encoding="utf-8") as fh:
        for line in fh:
            if not line.strip():
                continue
            it = json.loads(line)
            exp = it.get("expected") or {}
            items.append({
                "id": it["id"], "type": "route", "q": it["utterance"], "ctx": [],
                "expect_sectors": exp.get("primary") or exp.get("order") or [],
                "support": exp.get("support") or [], "exclude": exp.get("exclude") or [],
                "must": [], "refuse": False, "split": it.get("split", "train"), "cat": it.get("cat", ""),
            })
    seed = read_json("ops/eval/seed_items.json")
    for it in seed["numeric"]:
        items.append({"id": it["id"], "type": "numeric", "q": it["q"], "ctx": [],
                      "expect_sectors": it.get("expect_sectors", []), "support": [], "exclude": [],
                      "must": it["must"], "refuse": False, "split": "test", "cat": "legal"})
    for it in seed["followup"]:
        items.append({"id": it["id"], "type": "followup", "q": it["q"], "ctx": it.get("ctx", []),
                      "expect_sectors": it.get("expect_sectors", []), "support": [], "exclude": [],
                      "must": it.get("must", []), "refuse": False, "split": "test", "cat": "followup"})
    n = 0
    for c in read_json("assistant/test/scope-cases.json")["cases"]:
        if c["expect"] == "off":
            n += 1
            items.append({"id": f"OOS-{n:03d}", "type": "out_of_scope", "q": c["q"], "ctx": [], "expect_sectors": [],
                          "support": [], "exclude": [], "must": [], "refuse": True, "split": "test", "cat": "scope"})
    n = 0
    for c in read_json("assistant/test/guard-cases.json")["cases"]:
        if c["expect"] == "attack":
            n += 1
            items.append({"id": f"ATK-{n:03d}", "type": "attack", "q": c["q"], "ctx": [], "expect_sectors": [],
                          "support": [], "exclude": [], "must": [], "refuse": True, "split": "test", "cat": "guard"})
    for it in items:
        it["schema"] = SCHEMA
    return items


def dump(items):
    return "".join(json.dumps(it, ensure_ascii=False, sort_keys=True) + "\n" for it in items)


def main():
    text = dump(build())
    if "--check" in sys.argv:
        cur = open(OUT, encoding="utf-8").read() if os.path.exists(OUT) else ""
        if cur != text:
            print("assistant/eval/items.jsonl 이 원천과 다르다 — python3 ops/eval/build_items.py")
            return 1
        print("items.jsonl 최신")
        return 0
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(text)
    print(f"{OUT} — {text.count(chr(10))}문항")
    return 0


if __name__ == "__main__":
    sys.exit(main())
