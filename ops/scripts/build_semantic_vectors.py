#!/usr/bin/env python3
"""AUP-7 뜻 벡터 — assistant/data/semantic-vectors.json

섹터 42장과 근거 조각 81개를 **라이선스가 확인된 공개 다국어 임베딩 모델**로 미리 임베딩해 두는
정적 파일이다. 브라우저는 이 파일만 받아 «질문 벡터»가 왔을 때 뜻이 가까운 섹터를 조금 민다
(assistant/search.js 의 semBoost). 질문 벡터를 만드는 경로가 없으면 이 파일은 아무 일도 하지 않고,
검색은 지금과 100% 똑같이 돈다.

모델 — intfloat 계열 e5-small 구조(384차원)를 한국어로 이어 학습한
  dragonkue/multilingual-e5-small-ko-v2 (Apache-2.0, 서술·질문 대조 학습)
  · 섹터·조각은 지식 쪽이므로 «passage:» 접두, 질문은 «query:» 접두(e5 규칙).
  · 섹터 벡터 = 섹터 소개문 벡터와 그 섹터 문서 벡터들의 평균(무게 1:1)을 다시 길이 1로.
    한 섹터에 문서가 수천 개인 곳(사전형)이 소개문만으로 좁아지지 않게 하려는 것이다.

저장 모양 (휴대폰 부담을 줄이려 int8·길이 1·base64)
  {"v":"witw-semantic-vectors/1.0.0","model":"…","license":"…","dim":384,"scale":127,
   "note":"…","provider":"","provider_model":"","sectors":{섹터 id: b64},"chunks":{"0": b64, …}}

  JC_E5_MODEL=<onnx> JC_E5_TOKENIZER=<tokenizer.json> \\
    python3 ops/scripts/build_semantic_vectors.py            # 만들기
  python3 ops/scripts/build_semantic_vectors.py --check      # 지금 자료와 어긋나지 않는지(모델 없이, CI)

  --check 는 모델 없이 본다 — 섹터 id·조각 번호가 지금 index.json·chunks.json 과 맞는지,
  차원·길이·머리말이 맞는지, 파일이 너무 커지지 않았는지.
"""
import base64
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "assistant", "data", "semantic-vectors.json")
INDEX = os.path.join(ROOT, "assistant", "data", "index.json")
CHUNKS = os.path.join(ROOT, "assistant", "data", "chunks.json")

MODEL = "dragonkue/multilingual-e5-small-ko-v2"
LICENSE = "Apache-2.0"
DIM = 384
SCALE = 127
MAX_BYTES = 200 * 1024        # 휴대폰이 첫 검색에 받는 양 — 이보다 커지면 손본다
DOCS_PER_SECTOR = 300         # 섹터 평균 벡터에 쓰는 문서 수 상한(사전형 섹터가 판을 덮지 않게)


def load(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def embedder():
    import numpy as np
    import onnxruntime as ort
    from tokenizers import Tokenizer

    model_path = os.environ.get("JC_E5_MODEL", "")
    tok_path = os.environ.get("JC_E5_TOKENIZER", "")
    if not model_path or not tok_path or not os.path.exists(model_path):
        sys.exit("JC_E5_MODEL·JC_E5_TOKENIZER 가 없다 — 모델 파일을 받아 두고 다시 실행한다(머리말 주석 참고).")
    sess = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
    tok = Tokenizer.from_file(tok_path)
    tok.enable_truncation(max_length=256)

    def run(texts, prefix="passage: ", bs=32):
        out = []
        for s in range(0, len(texts), bs):
            batch = [prefix + t for t in texts[s:s + bs]]
            encs = [tok.encode(t) for t in batch]
            mx = max(len(e.ids) for e in encs)
            ids = np.zeros((len(encs), mx), dtype=np.int64)
            am = np.zeros((len(encs), mx), dtype=np.int64)
            for i, e in enumerate(encs):
                ids[i, :len(e.ids)] = e.ids
                am[i, :len(e.ids)] = e.attention_mask
            h = sess.run(None, {"input_ids": ids, "attention_mask": am})[0]
            m = am[..., None].astype("float32")
            v = (h * m).sum(1) / np.maximum(m.sum(1), 1e-6)
            v /= np.maximum(np.linalg.norm(v, axis=1, keepdims=True), 1e-9)
            out.append(v)
        return np.vstack(out)

    return run


def sector_texts(idx):
    out = []
    for s in idx.get("sectors", []):
        out.append((s["id"], (s.get("title", "") + ". " + (s.get("desc") or "") + ". " +
                              " ".join(s.get("tags", []) or [])).strip()))
    return out


def quant(v):
    import numpy as np
    v = v / max(float(np.linalg.norm(v)), 1e-9)
    q = np.clip(np.round(v * SCALE), -SCALE, SCALE).astype("int8")
    return base64.b64encode(q.tobytes()).decode()


def build():
    import numpy as np

    idx = load(INDEX)
    chunks = load(CHUNKS)["chunks"]
    run = embedder()

    # 섹터 — 소개문 벡터 + 문서 평균 벡터
    secs = sector_texts(idx)
    prof = run([t for _, t in secs])
    by = {}
    for d in idx.get("docs", []):
        by.setdefault(d.get("s"), []).append(d)
    docs, owner = [], []
    for sid, _ in secs:
        for d in by.get(sid, [])[:DOCS_PER_SECTOR]:
            docs.append((d.get("t", "") + ". " + str(d.get("k", "")).replace(",", " ") + ". " +
                         (d.get("x") or "")[:150]).strip())
            owner.append(sid)
    dv = run(docs) if docs else None
    vectors = {}
    for i, (sid, _) in enumerate(secs):
        v = prof[i]
        rows = [j for j, o in enumerate(owner) if o == sid]
        if rows:
            c = dv[rows].mean(0)
            c /= max(float(np.linalg.norm(c)), 1e-9)
            v = v + c
        vectors[sid] = quant(v)

    # 조각 — 조각 본문
    cv = run([(c.get("t", "") + ". " + c.get("x", "")).strip() for c in chunks])
    chunk_vectors = {str(c["i"]): quant(cv[j]) for j, c in enumerate(chunks)}

    return {
        "v": "witw-semantic-vectors/1.0.0",
        "model": MODEL,
        "license": LICENSE,
        "dim": DIM,
        "scale": SCALE,
        "provider": "",
        "provider_model": "",
        "note": "AUP-7 뜻 벡터 — 섹터·근거 조각을 공개 임베딩 모델로 미리 임베딩한 정적 파일(int8·길이 1·base64). "
                "브라우저는 질문 벡터가 있을 때만 뜻이 가까운 섹터를 조금 민다(assistant/search.js). "
                "질문 벡터를 만드는 경로가 없으면 아무 일도 하지 않는다. "
                "ops/scripts/build_semantic_vectors.py 가 만든다(손으로 고치지 않는다). "
                "provider 에 질의 임베딩 주소를 적으면 화면이 그 주소로 질문 벡터를 받아 온다"
                "(provider_model 은 이 파일의 model 과 같아야 한다 — 다르면 받지 않는다).",
        "sectors": vectors,
        "chunks": chunk_vectors,
    }


def check():
    bad = []
    if not os.path.exists(OUT):
        return ["assistant/data/semantic-vectors.json 이 없다 — build_semantic_vectors.py 로 만든다."]
    size = os.path.getsize(OUT)
    d = load(OUT)
    if d.get("model") != MODEL:
        bad.append("모델 이름이 스크립트와 다르다: " + str(d.get("model")))
    if d.get("license") != LICENSE:
        bad.append("라이선스 표기가 스크립트와 다르다: " + str(d.get("license")))
    if int(d.get("dim") or 0) != DIM:
        bad.append("차원이 %d 가 아니다" % DIM)
    if size > MAX_BYTES:
        bad.append("파일이 너무 크다: %.1fKB (상한 %dKB)" % (size / 1024, MAX_BYTES // 1024))
    idx = load(INDEX)
    want = {s["id"] for s in idx.get("sectors", [])}
    got = set((d.get("sectors") or {}).keys())
    missing = sorted(want - got)
    extra = sorted(got - want)
    if missing:
        bad.append("벡터가 없는 섹터: " + ", ".join(missing[:6]))
    if extra:
        bad.append("색인에 없는 섹터 벡터: " + ", ".join(extra[:6]))
    chunks = load(CHUNKS)["chunks"]
    cw = {str(c["i"]) for c in chunks}
    cg = set((d.get("chunks") or {}).keys())
    if cw - cg:
        bad.append("벡터가 없는 조각: " + ", ".join(sorted(cw - cg)[:6]))
    if cg - cw:
        bad.append("없는 조각 번호의 벡터: " + ", ".join(sorted(cg - cw)[:6]))
    for k, v in (d.get("sectors") or {}).items():
        try:
            n = len(base64.b64decode(v))
        except Exception:
            bad.append("섹터 벡터가 base64 가 아니다: " + k)
            break
        if n != DIM:
            bad.append("섹터 벡터 차원이 %d 다: %s" % (n, k))
            break
    p = str(d.get("provider") or "")
    if p and not p.startswith(("/", "https://")):
        bad.append("provider 주소가 상대경로나 https 가 아니다: " + p)
    return bad


def main():
    if "--check" in sys.argv:
        bad = check()
        if bad:
            for b in bad:
                print("✗ " + b)
            return 1
        d = load(OUT)
        print("semantic-vectors.json 최신 — 섹터 %d · 조각 %d · %.1fKB (%s, %s)" % (
            len(d["sectors"]), len(d["chunks"]), os.path.getsize(OUT) / 1024, d["model"], d["license"]))
        return 0
    data = build()
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n"
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(text)
    print("%s — 섹터 %d · 조각 %d · %.1fKB (%s, %s)" % (
        OUT, len(data["sectors"]), len(data["chunks"]), len(text.encode("utf-8")) / 1024, MODEL, LICENSE))
    return 0


if __name__ == "__main__":
    sys.exit(main())
