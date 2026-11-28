#!/usr/bin/env python3
"""FTN-3 준비물 자기시험 — GPU·네트워크 없이 돈다.

    python3 ops/ftn/train/test_train_scripts.py

무엇을 지키나:
  · 학습 입력과 서빙 입력(`ops/serve/zerogpu/space/app.py`)의 조립이 글자까지 같다 —
    다르면 LoRA 가 배운 «근거 읽는 자리»를 서빙에서 못 찾는다.
  · 눈검수 전(draft)·검사 실패·개인정보·시험 문항 겹침은 학습 입력에서 빠진다.
  · 후보 표·프롬프트 사본이 원천(`ops/serve/zerogpu/prompts/measure_prompts.json`)·법정 수치와 어긋나지 않는다.
  · 노트북이 유효한 ipynb 이고, 비밀값을 박지 않았고, 4비트·LoRA·SFTTrainer·병합 셀을 갖췄다.
"""
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
sys.path.insert(0, HERE)

import measure_base  # noqa: E402
import prepare_sft  # noqa: E402
import sft_format  # noqa: E402

GUIDE = sft_format.guide_text()


def record(ident="T-001", q="최저임금 시급이 얼마예요?", answer="2026년 최저임금은 시간급 10,320원입니다. 자료실 계산기에서 확인할 수 있어요.",
           evidence=("【최저임금】 2026년 시간급 10,320원.",), refs=(0,), status="train", ok=True):
    blocks = [f"<guide>\n{GUIDE}\n</guide>"]
    for n, body in enumerate(evidence, 1):
        blocks.append(f'<evidence id="e{n}">\n{body}\n</evidence>')
    blocks.append(f"[질문]\n{q}")
    blocks.append("답은 평문으로, 결론부터 3~6문장. 자료실 근거 번호를 실제로 쓴 것만 마지막 줄에 [[REFS:e1]] 처럼 적습니다(없으면 [[REFS:]]).")
    return {
        "id": ident, "q": q, "input": "\n\n".join(blocks), "answer": answer, "refs": list(refs),
        "status": status, "split": "train", "style": "계산", "qtype": "calc", "source": "test",
        "check": {"ok": ok},
    }


class FormatTest(unittest.TestCase):
    def test_parse_input(self):
        guide, page, bodies, question = sft_format.parse_input(record()["input"])
        self.assertEqual(guide, GUIDE)
        self.assertEqual(page, "")
        self.assertEqual(len(bodies), 1)
        self.assertIn("10,320원", bodies[0])
        self.assertEqual(question, "최저임금 시급이 얼마예요?")
        self.assertNotIn("답은 평문으로", question)

    def test_current_page_is_kept(self):
        text = record()["input"].replace("<guide>", "<current_page>\npay-calc 화면\n</current_page>\n\n<guide>", 1)
        _guide, page, _bodies, _q = sft_format.parse_input(text)
        self.assertEqual(page, "pay-calc 화면")

    def test_serve_shape_matches_space_app(self):
        """스페이스 앱의 조립(근거:\\n… \\n\\n질문: …)과 글자까지 같아야 한다."""
        rec = record()
        inputs = sft_format.to_serve_inputs(rec)

        def space_build(instruction, evidence, question):
            inst = (instruction or "").strip() or "기본"
            ev = (evidence or "").strip()
            body = ("근거:\n" + ev + "\n\n" if ev else "") + "질문: " + question.strip()
            return [{"role": "system", "content": inst}, {"role": "user", "content": body}]

        messages = sft_format.build_messages(rec, guide=GUIDE)
        space = space_build(inputs["instruction"], inputs["evidence"], inputs["question"])
        self.assertEqual(messages[0]["content"], space[0]["content"])
        self.assertEqual(messages[1]["content"], space[1]["content"])

    def test_no_evidence_refusal(self):
        rec = record(q="코스피 시세 알려 줘", answer="자료실 범위 밖이라 답하지 않아요. 진로·취업 쪽이면 도와드릴게요.",
                     evidence=(), refs=())
        messages = sft_format.build_messages(rec)
        self.assertEqual(messages[1]["content"], "질문: 코스피 시세 알려 줘")
        self.assertTrue(messages[2]["content"].endswith("[[REFS:]]"))

    def test_refs_line_uses_one_based_ids(self):
        rec = record(refs=(0, 2))
        self.assertEqual(sft_format.refs_line(rec["refs"]), "[[REFS:e1,e3]]")
        body, nums = sft_format.strip_refs("답입니다\n[[REFS:e2,e3]]")
        self.assertEqual((body, nums), ("답입니다", [2, 3]))
        body, nums = sft_format.strip_refs("답입니다")
        self.assertEqual((body, nums), ("답입니다", []))

    def test_without_refs(self):
        messages = sft_format.build_messages(record(), with_refs=False)
        self.assertNotIn("[[REFS:", messages[2]["content"])


class PrepareTest(unittest.TestCase):
    def _write(self, folder, rows):
        os.makedirs(folder, exist_ok=True)
        with open(os.path.join(folder, "train.jsonl"), "w", encoding="utf-8") as fh:
            for row in rows:
                fh.write(json.dumps(row, ensure_ascii=False) + "\n")
        with open(os.path.join(folder, "valid.jsonl"), "w", encoding="utf-8") as fh:
            fh.write(json.dumps(dict(row, split="valid"), ensure_ascii=False) + "\n")

    def test_gating_and_drops(self):
        with tempfile.TemporaryDirectory() as tmp:
            rows = [
                record("OK-1"),
                record("OK-2", q="구직급여 상한은 얼마인가요?", refs=(0,)),
                record("DRAFT-1", q="실업급여 신청은 어떻게 하나요?", status="draft"),
                record("BAD-1", q="국민연금 요율은요?", ok=False),
                record("PII-1", q="010-1234-5678로 연락 주세요"),
                record("SHORT-1", q="짧은 답", answer="네."),
                record("OK-1", q="번호 중복"),
            ]
            self._write(os.path.join(tmp, "in"), rows)
            kept, report = prepare_sft.prepare([os.path.join(tmp, "in")], check_leak=False)
            ids = [r["id"] for r in kept]
            self.assertEqual(ids, ["OK-1", "OK-2"])
            self.assertEqual(report["kept"], 2)
            self.assertIn("status=draft", report["why_dropped"])
            self.assertIn("개인정보 모양", report["why_dropped"])

            kept_draft, report_draft = prepare_sft.prepare([os.path.join(tmp, "in")], allow_draft=True, check_leak=False)
            self.assertGreater(len(kept_draft), len(kept))
            self.assertGreater(report_draft["drafts_included"], 0)

    def test_kept_records_have_messages(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._write(os.path.join(tmp, "in"), [record("OK-1")])
            kept, _report = prepare_sft.prepare([os.path.join(tmp, "in")], check_leak=False)
            messages = kept[0]["messages"]
            self.assertEqual([m["role"] for m in messages], ["system", "user", "assistant"])
            self.assertTrue(messages[1]["content"].startswith("근거:\n[e1] "))
            self.assertEqual(kept[0]["meta"]["refs"], [1])

    def test_test_item_is_refused(self):
        """시험 문항과 같은 문장은 학습 입력으로 들어가지 않는다."""
        with open(os.path.join(ROOT, "assistant", "eval", "items.jsonl"), encoding="utf-8") as fh:
            items = [json.loads(line) for line in fh if line.strip()]
        test_item = next(it for it in items if it.get("split") == "test")
        with tempfile.TemporaryDirectory() as tmp:
            self._write(os.path.join(tmp, "in"), [record("LEAK-1", q=test_item["q"])])
            kept, report = prepare_sft.prepare([os.path.join(tmp, "in")])
            self.assertEqual(kept, [])
            self.assertTrue(any("겹침" in key for key in report["why_dropped"]))

    def test_cli_writes_and_checks(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._write(os.path.join(tmp, "in"), [record("OK-1")])
            out = os.path.join(tmp, "out")
            rc = prepare_sft.main(["--from", os.path.join(tmp, "in"), "--out", out, "--no-leak-check"])
            self.assertEqual(rc, 0)
            self.assertTrue(os.path.exists(os.path.join(out, "train.jsonl")))
            self.assertTrue(os.path.exists(os.path.join(out, "manifest.json")))
            self.assertEqual(prepare_sft.main(["--from", os.path.join(tmp, "in"), "--out", out,
                                               "--no-leak-check", "--check"]), 0)
            # 입력이 바뀌면 --check 가 잡아낸다
            self._write(os.path.join(tmp, "in"), [record("OK-1"), record("OK-2", q="다른 질문인가요?")])
            self.assertEqual(prepare_sft.main(["--from", os.path.join(tmp, "in"), "--out", out,
                                               "--no-leak-check", "--check"]), 1)


class MeasureTest(unittest.TestCase):
    def test_prompt_copy_matches_source(self):
        """후보 실측 프롬프트 사본(p1~p6)이 공용 원천과 글자까지 같아야 한다 — 비교가 성립하려면."""
        path = os.path.join(ROOT, "ops", "serve", "zerogpu", "prompts", "measure_prompts.json")
        with open(path, encoding="utf-8") as fh:
            source = {p["id"]: p for p in json.load(fh)["prompts"]}
        local = {p["id"]: p for p in measure_base.PROMPTS}
        self.assertEqual(set(source), set(local))
        for ident, prompt in source.items():
            self.assertEqual(prompt["question"], local[ident]["question"], ident)
            self.assertEqual(prompt.get("evidence", ""), local[ident].get("evidence", ""), ident)

    def test_numeric_pointer_values(self):
        for item in measure_base.NUMERIC:
            value = measure_base.legal_value(item["pointer"])
            self.assertEqual(value, item["expect"], item["pointer"])

    def test_answer_stats(self):
        prompt = {"pointer_value": 10320, "unit": "원"}
        good = measure_base.answer_stats("2026년 최저임금은 시간급 10,320원입니다.", prompt)
        self.assertTrue(good["number_hit"])
        self.assertGreater(good["hangul_ratio"], 0.5)
        bad = measure_base.answer_stats("以下은 brief한 方法입니다. ポートフォリオ", prompt)
        self.assertFalse(bad["number_hit"])
        self.assertGreater(bad["foreign_script"], 0)
        rate = measure_base.answer_stats("근로자 부담은 4.75%입니다.", {"pointer_value": 0.0475, "unit": "비율"})
        self.assertTrue(rate["number_hit"])

    def test_model_table(self):
        for key, spec in measure_base.MODELS.items():
            self.assertTrue(spec["id"].count("/") == 1, key)
            self.assertIn("license", spec)
            self.assertIn("params", spec)
        self.assertIn("qwen3-4b-instruct", measure_base.MODELS)

    def test_dry_run_needs_no_torch(self):
        out = subprocess.run([sys.executable, os.path.join(HERE, "measure_base.py"), "--dry-run"],
                             capture_output=True, text=True, timeout=120)
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertIn("p1-cf-1", out.stdout)


class NotebookTest(unittest.TestCase):
    def setUp(self):
        self.path = os.path.join(HERE, "ftn3_qlora.ipynb")
        with open(self.path, encoding="utf-8") as fh:
            self.nb = json.load(fh)

    def test_valid_notebook(self):
        self.assertEqual(self.nb.get("nbformat"), 4)
        self.assertGreaterEqual(len(self.nb["cells"]), 8)
        for cell in self.nb["cells"]:
            self.assertIn(cell["cell_type"], ("markdown", "code"))
            if cell["cell_type"] == "code":
                self.assertIsInstance(cell.get("source"), list)

    def test_has_the_steps(self):
        code = "\n".join("".join(c["source"]) for c in self.nb["cells"] if c["cell_type"] == "code")
        for needle in ("BitsAndBytesConfig", "load_in_4bit", "LoraConfig", "SFTTrainer",
                       "merge_and_unload", "prepare_sft", "apply_chat_template"):
            self.assertIn(needle, code, needle)

    def test_no_secret_literals(self):
        code = "".join("".join(c["source"]) for c in self.nb["cells"] if c["cell_type"] == "code")
        # 값처럼 보이는 것(토큰·키)이 본문에 박혀 있으면 실패. 이름(hf_token)은 괜찮다.
        for pattern in (r"hf_[A-Za-z0-9]{20,}", r"sk-[A-Za-z0-9]{20,}", r"KGAT_[A-Za-z0-9]{10,}",
                        r"github_pat_[A-Za-z0-9_]{20,}"):
            self.assertIsNone(re.search(pattern, code), pattern)
        self.assertIn("kaggle_secrets", code)
        self.assertIn("get_secret", code)


if __name__ == "__main__":
    unittest.main(verbosity=2)
