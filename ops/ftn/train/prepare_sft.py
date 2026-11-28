#!/usr/bin/env python3
"""FTN-3 학습 입력 만들기 — FTN-1 문답(질문+근거+모범 답)을 ChatML `messages` 로 바꾼다.

    python3 ops/ftn/train/prepare_sft.py --dry-run                 # 지금 무엇이 몇 건인지(파일 안 씀)
    python3 ops/ftn/train/prepare_sft.py --dry-run --allow-draft   # 미리보기(draft)까지 세어 보기
    python3 ops/ftn/train/prepare_sft.py --from mlc/qa --out ops/ftn/train/data
    python3 ops/ftn/train/prepare_sft.py --check                   # 커밋된 산출물이 지금과 같은지(CI)

지키는 선(노션 FTN-3 · FTN-1):
  · 태화님 눈검수 전에는 학습 입력을 만들지 않는다 — `status` 가 `train`/`valid` 인 것만 받는다.
    (미리보기로 연습할 때만 `--allow-draft`. 그래도 산출물에는 «draft» 표시가 남는다.)
  · 시험 문항은 넣지 않는다 — `ops/ftn/overlap_check.py` 의 2-gram 규칙 그대로 exact·near 를 실패로 본다.
  · 개인정보 모양(전화·메일·주민번호) 0건. 하나라도 있으면 멈춘다.
  · 지침(system)은 언제나 `ops/ftn/sources/guide_summary.md` 한 벌이다 — 레코드마다 다르면 맞춘다.
  · 모양은 `sft_format.py` 한 곳에서만 만든다(학습 = 서빙).
"""
import argparse
import hashlib
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, "ops", "ftn"))

import sft_format  # noqa: E402

SCHEMA = "witw-ftn-sft/1.0.0"
DEFAULT_IN = [os.path.join(ROOT, "mlc", "qa"), os.path.join(ROOT, "mlc", "qa", "preview")]
MIN_ANSWER = 40
MAX_CHARS_DEFAULT = 4200          # 지침+근거+질문 글자 상한(넘으면 자르지 않고 뺀다 — 질문이 잘리면 학습이 망가진다)
PII = re.compile(r"01[016789][-\s]?\d{3,4}[-\s]?\d{4}|\d{6}[-\s]?[1-4]\d{6}|[\w.+-]+@[\w-]+\.[\w.]+")
KEEP_STATUS = {"train", "valid"}


def load_jsonl(path):
    rows = []
    with open(path, encoding="utf-8") as fh:
        for line_no, line in enumerate(fh, 1):
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as exc:
                raise SystemExit(f"{path}:{line_no} JSON 오류 — {exc}")
    return rows


def write_jsonl(path, rows):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def find_split(base):
    """`<base>/train.jsonl`·`<base>/valid.jsonl` 짝이 있는 곳을 찾는다(미리보기 폴백 포함)."""
    for root in base:
        train, valid = os.path.join(root, "train.jsonl"), os.path.join(root, "valid.jsonl")
        if os.path.exists(train) and os.path.exists(valid):
            return root
    return ""


def leak_pool():
    """시험 문항 2-gram 풀 — `ops/ftn/overlap_check.py` 를 그대로 쓴다(규칙 한 벌)."""
    try:
        import overlap_check
        return overlap_check.load_test_pool(), overlap_check.check_line
    except Exception:
        return None, None


def prepare(base=None, allow_draft=False, max_chars=MAX_CHARS_DEFAULT, limit=0, check_leak=True):
    """(조립된 레코드, 보고서) — 파일은 쓰지 않는다. 노트북·시험이 이 함수를 부른다."""
    base = base or DEFAULT_IN
    if isinstance(base, str):
        base = [base]
    root = find_split(base)
    if not root:
        raise SystemExit("train.jsonl·valid.jsonl 짝을 찾지 못했다 — " + ", ".join(base))

    guide = sft_format.guide_text()
    pool, check_line = (leak_pool() if check_leak else (None, None))
    out, dropped, seen_ids, seen_q = [], [], set(), set()

    for split in ("train", "valid"):
        path = os.path.join(root, f"{split}.jsonl")
        for record in load_jsonl(path):
            ident = record.get("id", "?")
            status = record.get("status", "")
            if not allow_draft and status not in KEEP_STATUS:
                dropped.append((ident, f"status={status or '없음'} — 눈검수 전"))
                continue
            check = record.get("check") or {}
            if check and check.get("ok") is False:
                dropped.append((ident, "AUP-5 검사 통과 못함"))
                continue
            if status == "needs-fix":
                dropped.append((ident, "검사기가 고칠 것을 남김"))
                continue
            answer = (record.get("answer") or "").strip()
            if len(answer) < MIN_ANSWER:
                dropped.append((ident, f"답이 {len(answer)}자 — 너무 짧다"))
                continue
            if PII.search(answer) or PII.search(record.get("q", "") or ""):
                dropped.append((ident, "개인정보 모양"))
                continue
            if ident in seen_ids:
                dropped.append((ident, "번호 중복"))
                continue
            question = (record.get("q") or "").strip()
            if question in seen_q:
                dropped.append((ident, "같은 질문 중복"))
                continue
            messages = sft_format.build_messages(record, guide=guide)
            inputs = sft_format.to_serve_inputs(record)
            if not inputs["question"]:
                dropped.append((ident, "질문을 풀지 못했다(input 모양 확인)"))
                continue
            size = len(messages[0]["content"]) + len(messages[1]["content"])
            if size > max_chars:
                dropped.append((ident, f"지침+근거+질문 {size}자 — 상한 {max_chars}자"))
                continue
            if check_line and pool is not None:
                verdict, ratio = check_line(question, [], pool)
                if verdict in ("exact", "near"):
                    dropped.append((ident, f"시험 문항과 겹침({verdict} {ratio:.2f})"))
                    continue
            seen_ids.add(ident)
            seen_q.add(question)
            out.append({
                "id": ident,
                "split": split,
                "messages": messages,
                "meta": {
                    "style": record.get("style", ""),
                    "qtype": record.get("qtype", ""),
                    "source": record.get("source", ""),
                    "status": status or "draft",
                    "evidence": len(inputs["evidence"].split("\n")) if inputs["evidence"] else 0,
                    "refs": sft_format.refs_list(record.get("refs")),
                    "answer_chars": len(answer),
                    "prompt_chars": size,
                },
            })
            if limit and len(out) >= limit:
                break
        if limit and len(out) >= limit:
            break

    report = {
        "schema": SCHEMA,
        "source": os.path.relpath(root, ROOT),
        "guide_chars": len(guide),
        "kept": len(out),
        "dropped": len(dropped),
        "split": {s: sum(1 for r in out if r["split"] == s) for s in ("train", "valid")},
        "style": histogram(r["meta"]["style"] for r in out),
        "qtype": histogram(r["meta"]["qtype"] for r in out),
        "source_kind": histogram(r["meta"]["source"] for r in out),
        "evidence": histogram(str(r["meta"]["evidence"]) for r in out),
        "answer_chars": stats([r["meta"]["answer_chars"] for r in out]),
        "prompt_chars": stats([r["meta"]["prompt_chars"] for r in out]),
        "refusal_share": round(
            sum(1 for r in out if r["meta"]["style"] == "거절") / len(out), 3) if out else 0.0,
        "drafts_included": sum(1 for r in out if r["meta"]["status"] == "draft"),
        "why_dropped": histogram(reason.split(" — ")[0] for _i, reason in dropped),
        "dropped_sample": dropped[:20],
    }
    return out, report


def histogram(values):
    counts = {}
    for value in values:
        counts[value] = counts.get(value, 0) + 1
    return dict(sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])))


def stats(numbers):
    if not numbers:
        return {}
    ordered = sorted(numbers)
    return {
        "count": len(ordered),
        "min": ordered[0],
        "median": ordered[len(ordered) // 2],
        "max": ordered[-1],
        "avg": round(sum(ordered) / len(ordered), 1),
    }


def token_lengths(rows, tokenizer_id, max_seq_len):
    """정확한 토큰 길이 — 토크나이저를 부를 수 있을 때만(없으면 글자 수로 대신 본다)."""
    from transformers import AutoTokenizer
    tok = AutoTokenizer.from_pretrained(tokenizer_id)
    lengths = []
    for row in rows:
        text = tok.apply_chat_template(row["messages"], tokenize=False, add_generation_prompt=False)
        lengths.append(len(tok(text)["input_ids"]))
    over = sum(1 for n in lengths if n > max_seq_len)
    return {"tokenizer": tokenizer_id, "max_seq_len": max_seq_len,
            "tokens": stats(lengths), "over_limit": over}


def digest(rows):
    raw = json.dumps(rows, ensure_ascii=False, sort_keys=True).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:16]


def main(argv=None):
    ap = argparse.ArgumentParser(description="FTN-1 문답 → FTN-3 SFT 입력(messages)")
    ap.add_argument("--from", dest="frm", action="append",
                    help="train.jsonl·valid.jsonl 이 있는 폴더(여러 번 줄 수 있다). 기본: mlc/qa → mlc/qa/preview")
    ap.add_argument("--out", default=os.path.join(HERE, "data"), help="산출물 폴더")
    ap.add_argument("--allow-draft", action="store_true", help="눈검수 전(draft)도 넣는다 — 연습용")
    ap.add_argument("--max-chars", type=int, default=MAX_CHARS_DEFAULT, help="지침+근거+질문 글자 상한")
    ap.add_argument("--limit", type=int, default=0, help="앞에서 n건만(마른 실행)")
    ap.add_argument("--tokenizer", default="", help="정확한 토큰 길이를 재려면 모델 이름(예: Qwen/Qwen3-4B-Instruct-2507)")
    ap.add_argument("--max-seq-len", type=int, default=2048)
    ap.add_argument("--no-leak-check", action="store_true", help="시험 문항 겹침 검사를 건너뛴다(권장하지 않음)")
    ap.add_argument("--dry-run", action="store_true", help="세어 보기만(파일 안 씀)")
    ap.add_argument("--check", action="store_true", help="커밋된 산출물이 지금 입력과 같은지(CI)")
    args = ap.parse_args(argv)

    base = [os.path.join(ROOT, p) for p in args.frm] if args.frm else None
    rows, report = prepare(base, allow_draft=args.allow_draft, max_chars=args.max_chars,
                           limit=args.limit, check_leak=not args.no_leak_check)
    report["fingerprint"] = digest(rows)
    if args.tokenizer:
        report["tokens"] = token_lengths(rows, args.tokenizer, args.max_seq_len)

    if args.dry_run:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0

    train = [r for r in rows if r["split"] == "train"]
    valid = [r for r in rows if r["split"] == "valid"]
    if args.check:
        problems = []
        for name, expected in (("train.jsonl", train), ("valid.jsonl", valid)):
            path = os.path.join(args.out, name)
            if not os.path.exists(path):
                problems.append(f"{path} 가 없다")
                continue
            if digest(load_jsonl(path)) != digest(expected):
                problems.append(f"{path} 가 지금 입력과 다르다 — prepare_sft.py 를 다시 돌린다")
        manifest = os.path.join(args.out, "manifest.json")
        if os.path.exists(manifest):
            with open(manifest, encoding="utf-8") as fh:
                saved = json.load(fh)
            if saved.get("fingerprint") != report["fingerprint"]:
                problems.append("manifest.json 의 지문이 다르다")
        else:
            problems.append("manifest.json 이 없다")
        if problems:
            for problem in problems:
                print("실패:", problem)
            return 1
        print(f"OK — {len(train)} train · {len(valid)} valid (지문 {report['fingerprint']})")
        return 0

    if not rows:
        print("넣을 레코드가 없다 — 눈검수 전(draft)일 수 있다. `--dry-run` 으로 이유를 본다.", file=sys.stderr)
        print(json.dumps(report, ensure_ascii=False, indent=2)[:2000], file=sys.stderr)
        return 1

    write_jsonl(os.path.join(args.out, "train.jsonl"), train)
    write_jsonl(os.path.join(args.out, "valid.jsonl"), valid)
    with open(os.path.join(args.out, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(report, fh, ensure_ascii=False, indent=2, sort_keys=True)
        fh.write("\n")
    print(json.dumps({k: report[k] for k in ("source", "kept", "dropped", "split", "drafts_included", "fingerprint")},
                     ensure_ascii=False))
    print(f"저장: {args.out}/train.jsonl · valid.jsonl · manifest.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
