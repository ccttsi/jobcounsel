#!/usr/bin/env python3
"""AUP-7 뜻 벡터 — assistant/data/semantic-vectors.json

섹터 소개문(과 섹터별 문서 최대 300개)과 근거 조각 81개를 **사이트가 질문 벡터를 받아 오는 것과 같은 모델**로
미리 임베딩해 두는 정적 파일이다. 브라우저는 이 파일만 받아 «질문 벡터»가 왔을 때 뜻이 가까운 섹터를 조금 민다
(assistant/search.js 의 semBoost). 질문 벡터를 만드는 경로가 없으면 이 파일은 아무 일도 하지 않고,
검색은 지금과 100% 똑같이 돈다.

모델 — BAAI **bge-m3** (`@cf/baai/bge-m3`, MIT, 1024차원). Cloudflare Workers AI 바인딩으로 돈다.
  · 질문 벡터를 만드는 곳(functions/api/embed.js)과 **같은 모델·같은 차원**이라야 코사인이 뜻을 가진다.
    그래서 이 스크립트는 모델 파일을 직접 돌리지 않고 **라이브 /api/embed 에 물어서** 만든다 —
    만드는 쪽과 쓰는 쪽이 같은 모델임을 따로 확인할 필요가 없다.
  · e5 계열과 달리 «query:»/«passage:» 접두사를 붙이지 않는다.
  · 섹터 벡터 = 소개문 벡터와 그 섹터 문서 벡터들의 평균(무게 1:1)을 다시 길이 1로.
    한 섹터에 문서가 수천 개인 곳(사전형)이 소개문만으로 좁아지지 않게 하려는 것이다.

저장 모양 (휴대폰 부담을 줄이려 int8·길이 1·base64)
  {"v":"witw-semantic-vectors/1.0.0","model":"@cf/baai/bge-m3","license":"MIT","dim":1024,"scale":127,
   "note":"…","provider":"/api/embed","provider_model":"@cf/baai/bge-m3",
   "sectors":{섹터 id: b64},"chunks":{"0": b64, …}}

  python3 ops/scripts/build_semantic_vectors.py                       # 만들기(라이브 /api/embed)
  python3 ops/scripts/build_semantic_vectors.py --api <주소>           # 다른 주소로 만들기
  python3 ops/scripts/build_semantic_vectors.py --check               # 지금 자료와 어긋나지 않는지(네트워크 없이, CI)
  python3 ops/scripts/build_semantic_vectors.py --eval-vectors <파일>  # 성적표용 질문 벡터(저장소 밖, 커밋 안 함)

  --cache <파일> 을 주면 임베딩을 한 줄씩 쌓아 두어, 도중에 끊겨도 다시 돌릴 때 이어서 한다
  (질문·문서 본문은 해시로만 남기고 원문은 저장하지 않는다).
"""
import base64
import hashlib
import json
import os
import socket
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "assistant", "data", "semantic-vectors.json")
INDEX = os.path.join(ROOT, "assistant", "data", "index.json")
CHUNKS = os.path.join(ROOT, "assistant", "data", "chunks.json")
EVAL_ITEMS = os.path.join(ROOT, "assistant", "eval", "items.jsonl")

MODEL = "@cf/baai/bge-m3"
LICENSE = "MIT"
DIM = 1024
SCALE = 127
MAX_BYTES = 200 * 1024        # 휴대폰이 첫 검색에 받는 양 — 이보다 커지면 손본다
DOCS_PER_SECTOR = 300         # 섹터 평균 벡터에 쓰는 문서 수 상한(사전형 섹터가 판을 덮지 않게)
API = "https://witw.pages.dev/api/embed"
WORKERS = 8                   # 동시 요청 — Workers AI 무료 한도를 넘기지 않는 선
RETRIES = 4
TIMEOUT = 15


def load(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def sector_texts(idx):
    out = []
    for s in idx.get("sectors", []):
        out.append((s["id"], (s.get("title", "") + ". " + (s.get("desc") or "") + ". " +
                              " ".join(s.get("tags", []) or [])).strip()))
    return out


def doc_texts(idx, secs):
    """섹터별 문서 → (섹터 id, 본문). 섹터 순서대로, 섹터마다 DOCS_PER_SECTOR 개까지."""
    by = {}
    for d in idx.get("docs", []):
        by.setdefault(d.get("s"), []).append(d)
    out = []
    for sid, _ in secs:
        for d in by.get(sid, [])[:DOCS_PER_SECTOR]:
            out.append((sid, (d.get("t", "") + ". " + str(d.get("k", "")).replace(",", " ") + ". " +
                              (d.get("x") or "")[:150]).strip()))
    return out


def chunk_texts(chunks):
    return [(str(c["i"]), (c.get("t", "") + ". " + c.get("x", "")).strip()) for c in chunks]


# ---------------------------------------------------------------- 라이브 /api/embed
UA = "witw-aup7-vector-build/1.0"      # 기본 python-urllib UA는 Cloudflare가 403으로 막는다 — 이름을 밝힌다


def _get(url):
    last = ""
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(RETRIES):
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
                body = json.loads(res.read().decode("utf-8"))
            vec = body.get("vector") or body.get("embedding")
            if body.get("model") and body.get("model") != MODEL:
                raise RuntimeError("모델이 다르다: %s" % body.get("model"))
            if not vec or len(vec) != DIM:
                raise RuntimeError("벡터 모양이 %d차원이 아니다" % (len(vec or [])))
            return [float(x) for x in vec]
        except (urllib.error.HTTPError, urllib.error.URLError, socket.timeout, RuntimeError, ValueError) as exc:
            last = "%s: %s" % (type(exc).__name__, exc)
            code = getattr(exc, "code", 0)
            # 400(빈 질문)은 다시 해도 같다 — 바로 실패. 나머지는 잠깐 쉬고 다시.
            if code == 400:
                break
            time.sleep(min(8, 0.6 * (2 ** attempt)))
    raise RuntimeError(last)


class Cache:
    """임베딩 캐시 — 본문 대신 해시(sha256 앞 32자)만 남긴다. 한 줄에 하나(JSONL)."""

    def __init__(self, path):
        self.path = path
        self.lock = threading.Lock()
        self.data = {}
        if path and os.path.exists(path):
            with open(path, encoding="utf-8") as fh:
                for line in fh:
                    try:
                        row = json.loads(line)
                    except ValueError:
                        continue
                    self.data[row["k"]] = row["v"]

    @staticmethod
    def key(kind, text):
        return kind + ":" + hashlib.sha256(text.encode("utf-8")).hexdigest()[:32]

    def get(self, key):
        with self.lock:
            return self.data.get(key)

    def put(self, key, vec):
        with self.lock:
            self.data[key] = vec
            if self.path:
                with open(self.path, "a", encoding="utf-8") as fh:
                    fh.write(json.dumps({"k": key, "v": vec}, separators=(",", ":")) + "\n")


def embed(texts, api, cache, workers=WORKERS, label=""):
    """(kind, 본문) 목록 → 같은 순서의 float 벡터 목록. 없는 것만 라이브에서 받아 온다."""
    todo = []
    for i, (kind, text) in enumerate(texts):
        if cache.get(Cache.key(kind, text)) is None:
            todo.append(i)
    total = len(texts)
    print("  %s — %d건 (캐시 %d · 새로 받을 것 %d)" % (label, total, total - len(todo), len(todo)), flush=True)
    if todo:
        done = [0]
        lock = threading.Lock()

        def work(i):
            kind, text = texts[i]
            vec = _get(api + ("&" if "?" in api else "?") + "q=" + urllib.parse.quote(text[:200]))
            cache.put(Cache.key(kind, text), vec)
            with lock:
                done[0] += 1
                if done[0] % 100 == 0:
                    print("    %d / %d" % (done[0], len(todo)), flush=True)

        errors = []

        def run(i):
            try:
                work(i)
            except Exception as exc:                     # 한 건이라도 실패하면 파일을 쓰지 않는다
                errors.append((i, str(exc)))

        threads = []
        queue = list(todo)
        qlock = threading.Lock()

        def pump():
            while True:
                with qlock:
                    if not queue:
                        return
                    i = queue.pop(0)
                run(i)

        for _ in range(min(workers, max(1, len(todo)))):
            t = threading.Thread(target=pump, daemon=True)
            t.start()
            threads.append(t)
        for t in threads:
            t.join()
        if errors:
            raise SystemExit("임베딩 실패 %d건 — 예: %s" % (len(errors), errors[0][1]))
    return [cache.get(Cache.key(kind, text)) for kind, text in texts]


def quant(v):
    import numpy as np
    v = np.asarray(v, dtype="float64")
    v = v / max(float(np.linalg.norm(v)), 1e-9)
    q = np.clip(np.round(v * SCALE), -SCALE, SCALE).astype("int8")
    return base64.b64encode(q.tobytes()).decode()


def build(api, cache):
    import numpy as np

    idx = load(INDEX)
    chunks = load(CHUNKS)["chunks"]
    secs = sector_texts(idx)
    docs = doc_texts(idx, secs)

    prof = np.array(embed([("p", t) for _, t in secs], api, cache, label="섹터 소개문"))
    dv = np.array(embed([("p", t) for _, t in docs], api, cache, label="섹터 문서")) if docs else None

    vectors = {}
    for i, (sid, _) in enumerate(secs):
        v = prof[i]
        rows = [j for j, (o, _) in enumerate(docs) if o == sid]
        if rows and dv is not None:
            c = dv[rows].mean(0)
            c /= max(float(np.linalg.norm(c)), 1e-9)
            v = v + c
        vectors[sid] = quant(v)

    cv = embed([("p", t) for _, t in chunk_texts(chunks)], api, cache, label="근거 조각")
    chunk_vectors = {}
    for j, (num, _) in enumerate(chunk_texts(chunks)):
        chunk_vectors[num] = quant(cv[j])

    return {
        "v": "witw-semantic-vectors/1.0.0",
        "model": MODEL,
        "license": LICENSE,
        "dim": DIM,
        "scale": SCALE,
        "provider": "/api/embed",
        "provider_model": MODEL,
        "note": "AUP-7 뜻 벡터 — 섹터·근거 조각을 BAAI bge-m3(MIT, Cloudflare Workers AI @cf/baai/bge-m3)로 "
                "미리 임베딩한 정적 파일(int8·길이 1·base64). "
                "브라우저는 질문 벡터가 있을 때만 뜻이 가까운 섹터를 조금 민다(assistant/search.js). "
                "질문 벡터를 만드는 경로가 없으면 아무 일도 하지 않는다. "
                "ops/scripts/build_semantic_vectors.py 가 라이브 /api/embed 에 물어서 만든다(손으로 고치지 않는다). "
                "provider 는 질의 임베딩 주소, provider_model 은 이 파일의 model 과 같아야 한다 — 다르면 화면이 받지 않는다.",
        "sectors": vectors,
        "chunks": chunk_vectors,
    }


def eval_vectors(api, cache, path):
    """성적표(`aup_eval.mjs --vectors`)가 먹는 모양 — 문항 id별 질문 벡터. 저장소에 넣지 않는다."""
    items = [json.loads(line) for line in open(EVAL_ITEMS, encoding="utf-8") if line.strip()]
    vecs = embed([("q", it["q"]) for it in items], api, cache, label="성적표 질문")
    out = {"model": MODEL, "dim": DIM,
           "queries": {it["id"]: quant(vecs[i]) for i, it in enumerate(items)}}
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print("  %s — 질문 %d건 (%s, %d차원)" % (path, len(out["queries"]), MODEL, DIM), flush=True)


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
    for name, table in (("섹터", d.get("sectors") or {}), ("조각", d.get("chunks") or {})):
        for k, v in table.items():
            try:
                n = len(base64.b64decode(v))
            except Exception:
                bad.append("%s 벡터가 base64 가 아니다: %s" % (name, k))
                break
            if n != DIM:
                bad.append("%s 벡터 차원이 %d 다: %s" % (name, n, k))
                break
    p = str(d.get("provider") or "")
    if p and not p.startswith(("/", "https://")):
        bad.append("provider 주소가 상대경로나 https 가 아니다: " + p)
    if p and d.get("provider_model") and d.get("provider_model") != d.get("model"):
        bad.append("provider_model 이 model 과 다르다 — 화면이 질문 벡터를 받지 않는다: "
                   + str(d.get("provider_model")) + " ≠ " + str(d.get("model")))
    return bad


def arg(name, default=""):
    if name in sys.argv:
        i = sys.argv.index(name)
        if i + 1 < len(sys.argv) and not sys.argv[i + 1].startswith("--"):
            return sys.argv[i + 1]
        return default
    return default


def main():
    global WORKERS
    api = arg("--api", API)
    cache = Cache(arg("--cache", ""))
    WORKERS = int(arg("--workers", str(WORKERS)) or WORKERS)

    if "--check" in sys.argv:
        bad = check()
        if bad:
            for b in bad:
                print("✗ " + b)
            return 1
        d = load(OUT)
        print("semantic-vectors.json 최신 — 섹터 %d · 조각 %d · %.1fKB (%s, %s, 질의 경로 %s)" % (
            len(d["sectors"]), len(d["chunks"]), os.path.getsize(OUT) / 1024, d["model"], d["license"],
            d.get("provider") or "꺼짐"))
        return 0

    if "--eval-vectors" in sys.argv:
        eval_vectors(api, cache, arg("--eval-vectors"))
        return 0

    data = build(api, cache)
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n"
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(text)
    print("%s — 섹터 %d · 조각 %d · %.1fKB (%s, %s)" % (
        OUT, len(data["sectors"]), len(data["chunks"]), len(text.encode("utf-8")) / 1024, MODEL, LICENSE))
    return 0


if __name__ == "__main__":
    sys.exit(main())
