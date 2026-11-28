#!/usr/bin/env python3
"""FTN-3 학습·서빙 공용 프롬프트 조립 — 모양은 이 파일 한 곳에서만 만든다.

왜 한 곳인가:
  학습 입력과 서빙 입력이 1글자라도 다르면 LoRA 가 배운 «근거를 읽는 자리»를 서빙에서 못 찾는다.
  그래서 ① 학습용 messages ② 서빙 스페이스(`ops/serve/zerogpu/space/app.py`)에 그대로 넣을 세 칸
  (지침·근거·질문)을 같은 함수에서 만든다.

서빙 스페이스의 조립 규칙(고정):
  system = 지침(instruction)
  user   = ("근거:\\n" + evidence + "\\n\\n" if evidence else "") + "질문: " + question
  → `to_serve_inputs()` 가 돌려주는 세 값을 스페이스의 세 칸에 넣으면 두 모양이 같아진다.
  (스페이스 코드는 다른 작업 뭉텅이라 고치지 않는다. 코드 수정 없이 맞추는 쪽을 택했다.)

지키는 선:
  · 근거는 FTN-1 초안이 이미 푼 `<evidence id="eN">` 본문을 그대로 쓴다(조각을 다시 풀지 않는다).
  · 근거 번호(e1…)는 답 끝 `[[REFS:e1,e3]]` 와 이어진다. 순서를 바꾸면 인용이 어긋난다.
"""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
GUIDE = os.path.join(ROOT, "ops", "ftn", "sources", "guide_summary.md")

REFS_TAIL = re.compile(r"\s*\[\[REFS:([^\]]*)\]\]\s*$")
GUIDE_BLOCK = re.compile(r"<guide>\s*(.*?)\s*</guide>", re.S)
PAGE_BLOCK = re.compile(r"<current_page>\s*(.*?)\s*</current_page>", re.S)
EVIDENCE_BLOCK = re.compile(r'<evidence id="e(\d+)">\s*(.*?)\s*</evidence>', re.S)
QUESTION_BLOCK = re.compile(r"\[질문\]\s*(.*)", re.S)


def guide_text(path=GUIDE):
    """지침 요약 — 머리말(«이 문서는 …»)은 뺀다. `ops/ftn/draft.py` 와 같은 규칙."""
    with open(path, encoding="utf-8") as fh:
        lines = fh.read().splitlines()
    start = next((i for i, line in enumerate(lines) if line.startswith("당신은")), 0)
    return "\n".join(lines[start:]).strip()


def parse_input(text):
    """FTN-1 `input` 한 덩이를 (지침, 앞 화면, [근거 본문…], 질문) 으로 푼다.

    질문 뒤의 «답은 평문으로, 결론부터 3~6문장 …» 안내문은 서식 지시라 뺀다 —
    서빙에서는 그 문장을 넣지 않으므로 학습에도 넣으면 안 된다.
    """
    text = text or ""
    guide = ""
    m = GUIDE_BLOCK.search(text)
    if m:
        guide = m.group(1).strip()
        text = text[: m.start()] + text[m.end():]
    page = ""
    m = PAGE_BLOCK.search(text)
    if m:
        page = m.group(1).strip()
        text = text[: m.start()] + text[m.end():]
    evidence = [(int(n), body.strip()) for n, body in EVIDENCE_BLOCK.findall(text)]
    evidence.sort(key=lambda pair: pair[0])
    text = EVIDENCE_BLOCK.sub("", text)
    question = ""
    m = QUESTION_BLOCK.search(text)
    if m:
        question = m.group(1).strip()
    question = re.split(r"\n\s*답은 평문으로,", question)[0].strip()
    return guide, page, [body for _n, body in evidence], question


def refs_list(refs):
    """FTN-1 `refs` 는 0부터 세는 근거 자리표시다 → 답에 쓰는 e번호(1부터)로 바꾼다."""
    out = []
    for ref in refs or []:
        try:
            n = int(ref) + 1
        except (TypeError, ValueError):
            continue
        if n >= 1 and n not in out:
            out.append(n)
    return out


def refs_line(refs):
    """답 끝에 붙는 인용 줄. 근거를 하나도 안 썼으면 `[[REFS:]]`."""
    nums = refs_list(refs)
    return "[[REFS:" + ",".join(f"e{n}" for n in nums) + "]]"


def strip_refs(text):
    """답 끝 `[[REFS:…]]` 를 떼고 (본문, [e번호…]) 로 나눈다 — 화면에 보일 때는 뗀다."""
    text = (text or "").strip()
    m = REFS_TAIL.search(text)
    if not m:
        return text, []
    nums = [int(x) for x in re.findall(r"e(\d+)", m.group(1))]
    return text[: m.start()].strip(), nums


def evidence_text(bodies):
    """근거 본문 여러 개 → 서빙 근거 칸 글자. 번호표 `[e1]` 이 인용의 닻이다."""
    lines = []
    for n, body in enumerate(bodies, 1):
        body = " ".join(str(body).split())
        lines.append(f"[e{n}] {body}")
    return "\n".join(lines)


def to_serve_inputs(record):
    """한 레코드 → 스페이스 세 칸(지침·근거·질문). 스페이스 코드를 고치지 않고 그대로 넣는다."""
    guide, page, bodies, question = parse_input(record.get("input", ""))
    evidence = evidence_text(bodies)
    if page:
        evidence = (evidence + "\n\n" if evidence else "") + f"[앞 화면] {page}"
    return {"instruction": guide or guide_text(), "evidence": evidence, "question": question}


def build_messages(record, guide=None, with_refs=True):
    """한 레코드 → ChatML messages. system=지침, user=근거+질문, assistant=모범 답."""
    inputs = to_serve_inputs(record)
    system = guide or inputs["instruction"]
    body = ("근거:\n" + inputs["evidence"] + "\n\n" if inputs["evidence"] else "") + \
           "질문: " + inputs["question"]
    answer = (record.get("answer") or "").strip()
    if with_refs:
        answer = (answer + "\n" + refs_line(record.get("refs"))) if answer else answer
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": body},
        {"role": "assistant", "content": answer},
    ]


def render_plain(messages):
    """눈으로 볼 때 쓰는 평문 모양 — 테스트·미리보기용."""
    parts = []
    for msg in messages:
        parts.append(f"<|{msg['role']}|>\n{msg['content']}")
    return "\n".join(parts)
