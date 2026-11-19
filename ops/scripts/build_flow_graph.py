#!/usr/bin/env python3
"""27번 상담 플로우 — 시너지 매핑 그래프 만들기 (결정론적 · 지어낸 값 0)

  python3 ops/scripts/build_flow_graph.py            # flow/data/graph.json 을 다시 만든다
  python3 ops/scripts/build_flow_graph.py --check    # 지금 파일이 원본들과 맞는지 본다(다르면 1)

무엇으로 만드나 (모두 저장소 안의 실제 자료다)
  · assets/tools.js ............... 섹터 27개의 id·번호·제목·딱지·한 줄 소개·meta·tags·mode
  · assistant/data/rag-preface.json  섹터마다의 키워드(k)·한 줄 설명(d)·용어→섹터 표(terms)
  · translator/data/terms.json ..... 용어 1,813개의 정식 이름·다른 이름·연계 섹터(links[].to)

무엇을 만드나
  sectors[]  섹터 하나의 역할(무엇이며 무엇을 설명하는지) — 전부 위 자료의 글자 그대로
  pairs[]    두 섹터가 이어질 때의 시너지 — 자료실이 잇는 짝(JC_LINKS)이면 표시하고,
             두 섹터가 함께 쓰는 말(겹치는 키워드·용어)을 근거로 싣는다. 근거가 0이면 싣지 않는다.
  kw{}       키워드 → 섹터. 「경단녀」처럼 줄임말·다른 이름도 정식 이름의 섹터를 가리킨다.
  starts[]   첫 화면의 시작 키워드 — 위 kw 로 실제로 풀리는 말만 싣는다(안 풀리면 넣지 않는다).

같은 원본이면 언제 돌려도 같은 파일이 나온다(정렬·반올림·시각 없음).
"""
import argparse
import hashlib
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TOOLS = os.path.join(ROOT, "assets", "tools.js")
RAG = os.path.join(ROOT, "assistant", "data", "rag-preface.json")
TERMS = os.path.join(ROOT, "translator", "data", "terms.json")
OUT_DIR = os.path.join(ROOT, "flow", "data")
OUT = os.path.join(OUT_DIR, "graph.json")

# 이 화면 자신(27번)은 후보가 될 수 없다 — 플로우를 짜는 도구이지 재료가 아니다.
SELF_ID = "flow"

# 첫 화면의 시작 키워드 — 상담실에서 가장 자주 먼저 나오는 말들. 위 kw 로 풀리지 않으면 싣지 않는다.
START_WORDS = [
    "경력단절여성", "경단녀", "국민취업지원제도", "구직급여", "실업급여",
    "직무분석", "법령", "면접", "자격증", "이직", "신산업", "산업", "기업",
    "학과", "대학원", "포트폴리오", "훈련", "채용", "청년", "중장년",
    "상담", "검사", "노동시장", "고용보험", "육아휴직", "직업상담사",
]

FIELD_RE = {
    "id": r"id:'([^']*)'",
    "gi": r"gi:'([^']*)'",
    "mode": r"mode:'([^']*)'",
    "no": r"no:'([^']*)'",
    "badge": r"badge:'([^']*)'",
    "short": r"short:'([^']*)'",
    "color": r"color:'([^']*)'",
    "title": r"title:'([^']*)'",
    "path": r"path:'([^']*)'",
    "desc": r"desc:'([^']*)'",
}
LIST_RE = {"meta": r"meta:\[([^\]]*)\]", "tags": r"tags:\[([^\]]*)\]"}


def norm(word):
    """말 하나를 견주기 좋게 — 소문자, 앞뒤 공백 제거, 가운데 공백 제거, 가운뎃점 통일."""
    w = str(word or "").strip().lower()
    w = w.replace("·", "").replace("ㆍ", "").replace("・", "")
    w = re.sub(r"\s+", "", w)
    return w


def show(word):
    """화면에 보일 때는 원래 적힌 모습을 살린다(「2.5D 패키징」을 소문자로 깎지 않는다)."""
    return re.sub(r"\s+", " ", str(word or "").strip())


def drop_substrings(words):
    """앞에 온(더 중요한) 말을 살리고, 그 말에 품긴 뒤쪽 말만 뺀다(순서는 그대로)."""
    out = []
    for w in words:
        if any(w != o and w in o for o in out):
            continue
        out = [o for o in out if not (o != w and o in w)]
        out.append(w)
    return out


def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def digest():
    h = hashlib.sha256()
    for path in (TOOLS, RAG, TERMS):
        h.update(read(path).encode("utf-8"))
    return h.hexdigest()[:16]


def parse_tools():
    raw = read(TOOLS)
    start = raw.find("window.JC_TOOLS")
    end = raw.find("window.JC_LINKS")
    body = raw[start:end]
    blocks = re.split(r"\n\s*\{(?=id:')", body)[1:]
    tools = []
    for block in blocks:
        item = {}
        for key, pattern in FIELD_RE.items():
            m = re.search(pattern, block)
            item[key] = m.group(1) if m else ""
        for key, pattern in LIST_RE.items():
            m = re.search(pattern, block)
            inner = m.group(1) if m else ""
            item[key] = re.findall(r"'([^']*)'", inner)
        m = re.search(r"\bmo:(\d+)", block)
        item["mo"] = int(m.group(1)) if m else 0
        if item["id"]:
            tools.append(item)
    links_raw = raw[raw.find("window.JC_LINKS"):]
    links = re.findall(r"\['([^']+)','([^']+)'\]", links_raw)
    return tools, links


def main():
    parser = argparse.ArgumentParser(description="27번 상담 플로우 시너지 그래프 생성")
    parser.add_argument("--check", action="store_true", help="지금 파일과 다시 만든 것이 같은지 본다")
    args = parser.parse_args()

    tools, links = parse_tools()
    ids = [t["id"] for t in tools]
    by_id = {t["id"]: t for t in tools}
    if not tools:
        print("✗ assets/tools.js 에서 섹터를 읽지 못했다")
        return 1

    rag = json.loads(read(RAG))
    rag_sectors = {s["id"]: s for s in rag.get("sectors", [])}
    rag_terms = rag.get("terms", {})
    terms = json.loads(read(TERMS)).get("terms", [])

    # ---------- 섹터마다의 말(토큰) ----------
    # concept: 그 섹터가 하는 일을 가리키는 말(자료실 지도의 키워드·용어 표·번역기 용어)
    # tag: 섹터 장부의 검색어
    concept = {i: {} for i in ids}      # token → 근거 이름
    tags = {i: {} for i in ids}
    disp = {}                           # token → 화면에 보일 원래 모습
    src = {}                            # token → 근거의 종류(0 자료실 지도 키워드 … 3 섹터 검색어)
    for tid, entry in rag_sectors.items():
        if tid not in by_id:
            continue
        for word in str(entry.get("k", "")).split(","):
            w = norm(word)
            if w:
                concept[tid].setdefault(w, "자료실 지도 키워드")
                disp.setdefault(w, show(word))
                src[w] = min(src.get(w, 9), 0)
    for word, targets in rag_terms.items():
        w = norm(word)
        if not w:
            continue
        disp.setdefault(w, show(word))
        src[w] = min(src.get(w, 9), 1)
        for tid in targets or []:
            if tid in concept:
                concept[tid].setdefault(w, "자료실 용어표")
    for t in tools:
        for word in t["tags"]:
            w = norm(word)
            if w:
                tags[t["id"]].setdefault(w, "섹터 검색어")
                disp.setdefault(w, show(word))
                src[w] = min(src.get(w, 9), 3)
    for term in terms:
        targets = {l.get("to") for l in term.get("links") or [] if l.get("to") in concept}
        if not targets:
            continue
        names = [term.get("term", ""), term.get("ko", "")] + list(term.get("aka") or [])
        for name in names:
            w = norm(name)
            if not w or len(w) > 24:
                continue
            disp.setdefault(w, show(name))
            src[w] = min(src.get(w, 9), 2)
            for tid in targets:
                concept[tid].setdefault(w, "번역기 용어")

    # ---------- 키워드 → 섹터 ----------
    kw = {}
    for tid in ids:
        if tid == SELF_ID:
            continue
        for w in list(concept[tid]) + list(tags[tid]):
            if len(w) < 2 or len(w) > 24:
                continue
            kw.setdefault(w, set()).add(tid)
    kw = {w: sorted(v, key=lambda i: by_id[i]["no"]) for w, v in kw.items()}

    # 몇 곳이나 함께 쓰는 말인가 — 여러 곳이 쓰는 말(「AI」)보다 두 곳만 쓰는 말(「AGV·AMR」)이 더 구체적인 근거다.
    df = {w: len(v) for w, v in kw.items()}

    def rank_shared(tokens):
        """근거로 삼을 말을 드러내기 좋은 순서로: 드문 말 → 한글 → 짧은 말."""
        def k(w):
            spelled = disp.get(w, w)
            korean = 0 if re.search(r"[가-힣]", spelled) else 1
            return (src.get(w, 9), df.get(w, 99), korean, len(spelled), spelled)
        return [disp.get(w, w) for w in sorted(tokens, key=k)]

    # ---------- 짝(시너지) ----------
    link_set = set()
    for a, b in links:
        if a in by_id and b in by_id:
            link_set.add(tuple(sorted((a, b))))
    pair_index = {}
    for a_i, a in enumerate(ids):
        for b in ids[a_i + 1:]:
            shared_concept = drop_substrings(rank_shared(set(concept[a]) & set(concept[b])))
            shared_tag = drop_substrings(rank_shared((set(tags[a]) & set(tags[b])) - (set(concept[a]) & set(concept[b]))))
            shared = shared_concept[:6]
            if len(shared) < 6:
                have = {norm(w) for w in shared}
                shared += [w for w in shared_tag if norm(w) not in have][: 6 - len(shared)]
            is_link = tuple(sorted((a, b))) in link_set
            n = len(set(concept[a]) & set(concept[b])) + len((set(tags[a]) & set(tags[b])))
            if not is_link and not shared:
                continue
            weight = (4 if is_link else 0) + min(4, n)
            pair_index[f"{a}|{b}"] = {
                "a": a, "b": b, "w": weight, "link": is_link,
                "n": n, "shared": shared,
                "basis": ("자료실 연결 짝" if is_link else "겹치는 말만"),
            }

    pairs = sorted(pair_index.values(),
                   key=lambda p: (-p["w"], -p["n"], by_id[p["a"]]["no"], by_id[p["b"]]["no"]))

    # ---------- 섹터의 역할 ----------
    sectors = []
    for t in sorted(tools, key=lambda x: x["no"]):
        r = rag_sectors.get(t["id"], {})
        sectors.append({
            "id": t["id"], "no": t["no"], "title": t["title"], "badge": t["badge"],
            "short": t["short"], "gi": t["gi"], "mode": t["mode"], "path": t["path"],
            "color": t["color"], "desc": t["desc"], "meta": t["meta"],
            "role": str(r.get("d") or t["desc"]),
            "kw": sorted(concept[t["id"]])[:40],
        })

    # ---------- 첫 화면의 시작 키워드 ----------
    starts = []
    seen = set()
    for word in START_WORDS:
        w = norm(word)
        targets = kw.get(w)
        if not targets:
            # 줄임말·정식 이름의 일부로도 찾아본다 (예: 「경단녀」→「경력단절여성」)
            targets = sorted({i for k, v in kw.items() if w and len(w) >= 2 and w in k for i in v},
                             key=lambda i: by_id[i]["no"])
            print(f"· «{word}» 는 정확히 맞는 말이 없어 품긴 말로 찾았다 → {', '.join(targets[:4]) or '없음'}")
        targets = [i for i in targets if i != SELF_ID and i not in seen or True]
        targets = [i for i in targets if i != SELF_ID]
        if not targets:
            print(f"· «{word}» 로 풀리는 섹터가 없어 시작 목록에서 뺐다")
            continue
        seen.add(w)
        starts.append({"k": word, "to": targets[:6]})

    data = {
        "schema_version": "1.0.0",
        "sources": {
            "tools": "assets/tools.js",
            "rag": "assistant/data/rag-preface.json",
            "terms": "translator/data/terms.json",
        },
        "digest": digest(),
        "self": SELF_ID,
        "sectors": sectors,
        "pairs": pairs,
        "kw": kw,
        "starts": starts,
        "notice": "시너지는 자료실이 잇는 짝(assets/tools.js의 JC_LINKS)과 두 섹터가 함께 쓰는 말만으로 셉니다. 근거가 없는 짝은 싣지 않았습니다.",
    }

    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"), sort_keys=False) + "\n"

    if args.check:
        try:
            current = read(OUT)
        except OSError:
            print("✗ flow/data/graph.json 이 없다 — build_flow_graph.py 를 먼저 돌린다")
            return 1
        if current != text:
            print("✗ flow/data/graph.json 이 원본과 다르다 — build_flow_graph.py 로 다시 만든다")
            return 1
        print("✓ flow/data/graph.json 이 원본과 같다")
        return 0

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(text)
    print(f"✓ 섹터 {len(sectors)}개 · 짝 {len(pairs)}개 · 키워드 {len(kw)}개 · 시작 키워드 {len(starts)}개 "
          f"→ flow/data/graph.json ({len(text.encode('utf-8')):,}바이트)")
    linked = sum(1 for p in pairs if p["link"])
    print(f"  그중 자료실 연결 짝 {linked}개 · 겹치는 말만 이어진 짝 {len(pairs) - linked}개")
    return 0


if __name__ == "__main__":
    sys.exit(main())
