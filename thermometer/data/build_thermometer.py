#!/usr/bin/env python3
"""산업 온도계 — 온도 산출·검증 스크립트 (16번 `thermometer/`)

  python3 thermometer/data/build_thermometer.py            # 산출 + 검증
  python3 thermometer/data/build_thermometer.py --check    # 계산 없이 검증만

읽는 것  industries.json(산업) · indicators.json(축별 근거) · sources.json(출처)
쓰는 것  thermometer.json (화면이 읽는 유일한 파일)

산출식 (SCHEMA.md §3과 같은 식이다 — 한쪽을 고치면 다른 쪽도 같이 고친다)
  ① 근거 하나: 배수 = 전년비 ÷ 눈금, s = tanh(배수) × 방향
     눈금은 축마다 다르다 — 고용 3% · 생산 5% · 매출 5% · 트렌드 15%.
     tanh를 쓰는 이유: 배수가 1배면 0.76, 2배면 0.96으로 1에 가까워질 뿐 넘지 않는다.
     잘라 버리면(clamp) 큰 산업이 전부 +1에 몰려 서로 구별되지 않는다.
  ② 축 점수: 그 축에 실린 근거의 평균 (근거가 없으면 축 없음 = None)
  ③ 종합: 실린 축만으로 가중 평균(0.3·0.3·0.2·0.2)하고, 근거 커버리지의 제곱근을 곱한다.
     근거가 1축뿐이면 그 온도도 55%만 믿는다 — 적게 아는 산업이 극단으로 튀지 않게.
  ④ 온도: 종합이 0 이상이면 ×40(폭염까지), 0 미만이면 ×20(한파까지) → -20~+40℃
확인되지 않은 값은 0으로 채우지 않는다. 근거가 없는 축은 비우고, 온도는 실린 축만으로 낸다.
"""
import argparse
import json
import math
import os
import sys
from datetime import datetime, timezone, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
KST = timezone(timedelta(hours=9))

AXES = ("emp", "prod", "rev", "trend")
AXIS_ORDER_FOR_INDEX = AXES


def load(name):
    path = os.path.join(HERE, name)
    with open(path, "rb") as fh:
        raw = fh.read()
    if raw.startswith(b"\xef\xbb\xbf"):
        raise SystemExit(f"{name}: UTF-8 BOM이 붙어 있다(BOM 없이 저장해야 한다)")
    return json.loads(raw.decode("utf-8"))


def squash(ratio):
    """배수를 ±1 안으로 부드럽게 눌러 담는다(넘치지 않게)."""
    return math.tanh(ratio)


def band(t):
    """온도 → 말. 0이 평년(평온)이다."""
    if t is None:
        return "근거 없음"
    if t >= 20:
        return "폭염"
    if t >= 8:
        return "더움"
    if t > 2:
        return "따뜻함"
    if t >= -2:
        return "평년"
    if t > -8:
        return "서늘"
    if t > -14:
        return "추움"
    return "한파"


def temperature(composite):
    if composite is None:
        return None
    raw = composite * 40.0 if composite >= 0 else composite * 20.0
    return round(raw, 1)


def build_side(side, baseline, weights):
    """한쪽(국내/글로벌)의 축 점수·근거·온도를 낸다."""
    axes = {}
    used_weight = 0.0
    weighted = 0.0
    for axis in AXES:
        items = side.get(axis) or []
        rows, scores = [], []
        for item in items:
            scale = baseline[axis]
            direction = item.get("dir", 1)
            ratio = item["yoy"] / scale
            score = squash(ratio) * direction
            scores.append(score)
            rows.append({
                "label": item["label"],
                "yoy": item["yoy"],
                "value": item["value"],
                "period": item["period"],
                "source_id": item["source_id"],
                "note": item.get("note", ""),
                "dir": direction,
                "ratio": round(ratio, 2),
                "score": round(score, 3),
            })
        score = round(sum(scores) / len(scores), 3) if scores else None
        axes[axis] = {"score": score, "items": rows}
        if score is not None:
            used_weight += weights[axis]
            weighted += weights[axis] * score
    if used_weight == 0:
        composite = None
    else:
        composite = (weighted / used_weight) * math.sqrt(used_weight)
    temp = temperature(composite)
    axes_used = sum(1 for a in AXES if axes[a]["score"] is not None)
    raw_band = band(temp)
    return {
        "axes": axes,
        "composite": None if composite is None else round(composite, 3),
        "temperature": temp,
        "band": raw_band if axes_used >= 2 else "근거 1축",
        "band_raw": raw_band,
        "axes_used": axes_used,
        "axes_total": len(AXES),
        "weight_covered": round(used_weight, 2),
    }


def validate(data, industries, sources):
    problems = []
    source_ids = {s["source_id"] for s in sources["sources"]}
    ids = [i["id"] for i in industries["industries"]]
    if len(ids) != len(set(ids)):
        problems.append("industries.json: id가 중복된다")
    for industry in industries["industries"]:
        iid = industry["id"]
        row = data["industries"].get(iid)
        if row is None:
            problems.append(f"indicators.json: '{iid}' 산업의 근거가 없다")
            continue
        for side in ("domestic", "global"):
            if side not in row:
                problems.append(f"{iid}: {side}가 없다")
                continue
            for axis, items in row[side].items():
                if axis not in AXES:
                    problems.append(f"{iid}/{side}: 알 수 없는 축 '{axis}'")
                for item in items:
                    where = f"{iid}/{side}/{axis}"
                    for key in ("label", "yoy", "value", "period", "source_id"):
                        if key not in item:
                            problems.append(f"{where}: '{key}'가 없다")
                    if item.get("source_id") not in source_ids:
                        problems.append(f"{where}: 출처 '{item.get('source_id')}'가 sources.json에 없다")
                    if not isinstance(item.get("yoy"), (int, float)):
                        problems.append(f"{where}: yoy가 숫자가 아니다")
                    if item.get("dir", 1) not in (1, -1):
                        problems.append(f"{where}: dir은 1 또는 -1이다")
        # 고유 근거·정보 칸도 출처를 확인한다.
        for item in row.get("info", []):
            if item.get("source_id") not in source_ids:
                problems.append(f"{iid}/info: 출처 '{item.get('source_id')}'가 sources.json에 없다")
        if not any(row["domestic"].get(a) for a in AXES):
            problems.append(f"{iid}: 국내 근거가 하나도 없다")
        if not any(row["global"].get(a) for a in AXES):
            problems.append(f"{iid}: 글로벌 근거가 하나도 없다")
    extra = set(data["industries"]) - set(ids)
    for iid in sorted(extra):
        problems.append(f"indicators.json: industries.json에 없는 산업 '{iid}'")
    return problems


def main():
    parser = argparse.ArgumentParser(description="산업 온도계 산출")
    parser.add_argument("--check", action="store_true", help="계산 결과를 쓰지 않고 검증만 한다")
    args = parser.parse_args()

    industries = load("industries.json")
    data = load("indicators.json")
    sources = load("sources.json")

    problems = validate(data, industries, sources)
    if problems:
        print("검증 실패")
        for line in problems:
            print(" -", line)
        return 1

    baseline = data["baseline"]
    weights = data["weights"]
    source_map = {s["source_id"]: s for s in sources["sources"]}
    feel_groups = {g["id"]: g for g in industries["feel_groups"]}

    out_rows = []
    for industry in industries["industries"]:
        iid = industry["id"]
        row = data["industries"][iid]
        dom = build_side(row["domestic"], baseline, weights)
        glb = build_side(row["global"], baseline, weights)
        gap = None
        if dom["temperature"] is not None and glb["temperature"] is not None:
            gap = round(dom["temperature"] - glb["temperature"], 1)
        feel = feel_groups[industry["feel_group"]]
        out_rows.append({
            "id": iid,
            "name": industry["name"],
            "en": industry["en"],
            "one_line": industry["one_line"],
            "tags": industry["tags"],
            "ksic": industry["ksic"],
            "feel": {"group_id": feel["id"], "group": feel["name"], "group_sub": feel["sub"], "name": industry["feel_name"]},
            "size": industry["size"],
            "domestic": dom,
            "global": glb,
            "gap": gap,
            "info": row.get("info", []),
        })

    ranked = sorted([r for r in out_rows if r["domestic"]["temperature"] is not None],
                    key=lambda r: r["domestic"]["temperature"], reverse=True)
    for idx, row in enumerate(ranked):
        row["domestic"]["rank"] = idx + 1
    for row in out_rows:
        row["domestic"].setdefault("rank", None)

    document = {
        "schema_version": "1.0.0",
        "generated_at": datetime.now(KST).replace(microsecond=0).isoformat(),
        "industry_count": len(out_rows),
        "method": {
            "baseline": baseline,
            "weights": weights,
            "axis_names": data["axis_names"],
            "range": [-20, 40],
            "note": "축 눈금(전년비 %)으로 나눠 tanh로 ±1에 눌러 담고, 가중 평균한 뒤 근거 커버리지의 제곱근을 곱한다. 0 이상은 40을, 0 미만은 20을 곱해 -20~+40℃로 편다.",
        },
        "classifications": industries["classifications"],
        "feel_groups": industries["feel_groups"],
        "context": data["context"],
        "sources": sources["sources"],
        "industries": out_rows,
    }

    summary = {
        "domestic": sum(1 for r in out_rows if r["domestic"]["temperature"] is not None),
        "global": sum(1 for r in out_rows if r["global"]["temperature"] is not None),
        "both": sum(1 for r in out_rows if r["domestic"]["temperature"] is not None and r["global"]["temperature"] is not None),
    }

    if args.check:
        print(f"검증 통과 — 산업 {len(out_rows)}개 (국내 온도 {summary['domestic']} · 글로벌 온도 {summary['global']} · 둘 다 {summary['both']})")
        return 0

    path = os.path.join(HERE, "thermometer.json")
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(document, fh, ensure_ascii=False, indent=1)
        fh.write("\n")

    print(f"thermometer.json — 산업 {len(out_rows)}개")
    print(f"  국내 온도 {summary['domestic']}개 · 글로벌 온도 {summary['global']}개 · 둘 다 {summary['both']}개")
    print(f"  출처 {len(source_map)}곳 (Track A {sum(1 for s in source_map.values() if s['track']=='A')} · Track B {sum(1 for s in source_map.values() if s['track']=='B')})")
    for row in ranked[:3]:
        print(f"  가장 더움(국내) {row['name']} {row['domestic']['temperature']}℃")
    for row in ranked[-3:]:
        print(f"  가장 차가움(국내) {row['name']} {row['domestic']['temperature']}℃")
    return 0


if __name__ == "__main__":
    sys.exit(main())
