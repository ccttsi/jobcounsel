#!/usr/bin/env python3
# FTN-1 초안 검사 — AUP-5 답 검사기(assistant/answer-check.js)를 초안에 자동 대조한다.
#
#   python3 ops/ftn/check.py            # work/drafts.jsonl 을 검사해 checked 칸을 채운다
#   python3 ops/ftn/check.py --report   # 통과·미통과 집계만
#
# 검사기 통과 = 초안의 법정 수치가 data/legal-constants.json 과 같고, 자료실 안 링크가 모두
# 실재하는 섹터를 가리키며, 검사기가 고친 것이 없다(fixed.numbers=0·fixed.links=0).
# 고쳐진 초안은 「근거 대조가 필요한 것」으로 남긴다 — 통과로 세지 않는다.
#
# 검사기는 한 벌만 쓴다 — 서버 사본(answer-check.js·check-data.js)을 그대로 싣는다.
#   · node 가 있으면 ops/ftn/check_drafts.cjs (CI·배포 환경의 정본)
#   · 없으면 quickjs 파이썬 모듈로 «같은 파일»을 싣는다(개발 상자 대체 경로, 결과는 같게 나오도록)
"""FTN-1 초안 AUP-5 검사기 대조."""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WORK = os.path.join(ROOT, "ops", "ftn", "work")
DRAFTS = os.path.join(WORK, "drafts.jsonl")
CANDIDATES = os.path.join(ROOT, "ops", "ftn", "dataset", "candidates.jsonl")
RUNNER = os.path.join(ROOT, "ops", "ftn", "check_drafts.cjs")
CHECK_DATA = os.path.join(ROOT, "supabase", "functions", "assistant-proxy", "check-data.js")
ANSWER_CHECK = os.path.join(ROOT, "supabase", "functions", "assistant-proxy", "answer-check.js")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import draft as draft_mod  # noqa: E402 — 근거 본문 푸는 함수를 한 벌만 쓴다

# 답이 «제12조» 처럼 조문을 인용하면, 그 조문이 답이 가리킨 근거([[REFS:e…]]) 안에 있어야 한다.
# 2026-11-28 눈검수: 법 조각을 안 가리키고 조문 번호를 지어낸 답(FTN1-CS-0119 근로기준법 제15·23조)이 나왔다.
ARTICLE = re.compile(r"제\s?(\d+)조")
# 검사기는 수치를 고칠 때 «※ 자료실 기준 값 —» 꼬리를 붙인다 — 다시 돌릴 때마다 겹치므로 떼고 검사한다(같은 답을 두 번 검사해도 같게).
FOOTER = re.compile(r"(?m)^\s*※\s*자료실 기준 값[^\n]*\n?")
# «68100원» 처럼 쉼표 없는 다섯 자리 이상 수 — 검사기가 꼬리만 붙이고 본문은 두는 경우가 있어 여기서 먼저 맞춘다.
BARE_NUMBER = re.compile(r"(?<![\d,.])(\d{5,})(?![\d,.])")


def tidy_numbers(text):
    return BARE_NUMBER.sub(lambda m: f"{int(m.group(1)):,}", text)


def load_jsonl(path):
    with open(path, encoding="utf-8") as fh:
        return [json.loads(line) for line in fh if line.strip()]


def write_jsonl(path, rows):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def url_for(ref):
    """근거 참조 → 자료실 안 주소. 색인 글은 u, 조각은 그 섹터 첫 화면."""
    if ref.get("u"):
        return ref["u"]
    sector = ref.get("s")
    return f"./{sector}/" if sector else ""


def run_node(payload):
    proc = subprocess.run(["node", RUNNER, ROOT], input=json.dumps({"items": payload}, ensure_ascii=False),
                          capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip()[:300])
    return json.loads(proc.stdout)["items"]


def run_quickjs(payload):
    """node 가 없는 개발 상자용 — 같은 검사기 파일을 quickjs 로 싣는다."""
    import quickjs  # pip install quickjs
    ctx = quickjs.Context()
    for path in (CHECK_DATA, ANSWER_CHECK):
        with open(path, encoding="utf-8") as fh:
            ctx.eval(fh.read())
    out = []
    for item in payload:
        refs = [{"id": r["id"], "url": r["url"], "title": r.get("title", "")} for r in item["references"] if r.get("url")]
        raw = ctx.eval("JSON.stringify(JCAssistCheck.check(%s, %s))" % (
            json.dumps(item["answer"], ensure_ascii=False), json.dumps(refs, ensure_ascii=False)))
        r = json.loads(raw)
        out.append({"id": item["id"], "answer": r["answer"], "fixed": r["fixed"],
                    "links": [x.get("id") for x in r["references"]]})
    return out


def main():
    ap = argparse.ArgumentParser(description="FTN-1 초안 AUP-5 검사")
    ap.add_argument("--report", action="store_true", help="집계만 본다")
    ap.add_argument("--drafts", default=DRAFTS)
    args = ap.parse_args()

    if not os.path.exists(args.drafts):
        print(f"✗ {os.path.relpath(args.drafts, ROOT)} 이 없다 — python3 ops/ftn/draft.py")
        return 1

    cands = {c["id"]: c for c in load_jsonl(CANDIDATES)}
    drafts = load_jsonl(args.drafts)

    if args.report:
        ok = sum(1 for d in drafts if (d.get("checked") or {}).get("ok"))
        bad = sum(1 for d in drafts if d.get("checked") and not d["checked"].get("ok"))
        todo = len(drafts) - ok - bad
        arts = sum(1 for d in drafts if (d.get("checked") or {}).get("articles_outside"))
        print(f"초안 {len(drafts)}건 — 통과 {ok} · 고침 필요 {bad} · 미검사 {todo}"
              + (f" (그중 근거 밖 조문 인용 {arts})" if arts else ""))
        return 0

    payload = []
    for d in drafts:
        cand = cands.get(d["id"], {})
        ev = cand.get("evidence") or []
        refs = []
        for n in d.get("refs") or []:
            if 1 <= int(n) <= len(ev):
                ref = ev[int(n) - 1]
                refs.append({"id": f"e{n}", "url": url_for(ref), "title": ref.get("t", "")})
        payload.append({"id": d["id"], "answer": tidy_numbers(FOOTER.sub("", d.get("answer", "")).strip()), "references": refs})

    try:
        if shutil.which("node"):
            results = {r["id"]: r for r in run_node(payload)}
            engine = "node"
        else:
            results = {r["id"]: r for r in run_quickjs(payload)}
            engine = "quickjs(로컬 대체)"
    except Exception as exc:  # 검사기를 못 싣으면 통과로 세지 않는다
        print(f"✗ 검사기를 실행하지 못했다 — {exc}")
        return 1

    chunks, docs = draft_mod.evidence_index()
    ok = bad = 0
    for d in drafts:
        r = results.get(d["id"])
        if not r:
            continue
        fixed = r.get("fixed") or {"numbers": 0, "links": 0}
        answer = r.get("answer") or d.get("answer", "")
        before = tidy_numbers(FOOTER.sub("", d.get("answer", "")).strip())
        changed = answer.strip() != before  # 검사기가 실제로 고친 것이 있는가(꼬리 겹침은 빼고)
        ev = (cands.get(d["id"]) or {}).get("evidence") or []
        cited = [ev[n - 1] for n in (d.get("refs") or []) if 1 <= int(n) <= len(ev)]
        evtext = " ".join((chunks.get(("chunk", ref.get("i"))) or docs.get(ref.get("i")) or "") for ref in cited)
        outside = sorted(set(ARTICLE.findall(answer)) - set(ARTICLE.findall(evtext)), key=int)
        passed = bool(answer) and not changed and not outside
        d["answer"] = answer
        d["checked"] = {"numbers": fixed.get("numbers", 0), "links": fixed.get("links", 0),
                        "changed": changed, "articles_outside": outside, "ok": passed, "engine": engine}
        d["status"] = "checked" if passed else "needs-fix"
        ok += 1 if passed else 0
        bad += 0 if passed else 1

    write_jsonl(args.drafts, drafts)
    print(f"검사 완료({engine}) — 통과 {ok}건 · 고침 필요 {bad}건 · 전체 {len(drafts)}건")
    return 0


if __name__ == "__main__":
    sys.exit(main())
