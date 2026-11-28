"""직업상담 문답 서빙 스페이스 — HF Spaces ZeroGPU (2026-12-22 개통 예정)

모양(FTN-1): 입력 = 지침 요약 + 근거 조각 + 질문 / 출력 = 답
- 기본 모델: Qwen/Qwen3-4B-Instruct-2507 (Apache-2.0)
- 학습 뒤 LoRA: 환경변수 WITW_LORA_ADAPTER에 어댑터 리포 ID를 넣으면 병합해 서빙
"""
import os

import gradio as gr
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

try:
    import spaces
except ImportError:  # 로컬 시험용 — 스페이스 밖에서는 GPU 장식자를 통과형으로 둔다
    class _SpacesShim:
        @staticmethod
        def GPU(*_args, **_kwargs):
            def deco(fn):
                return fn
            return deco
    spaces = _SpacesShim()

MODEL_ID = os.environ.get("WITW_MODEL_ID", "Qwen/Qwen3-4B-Instruct-2507")
ADAPTER_ID = os.environ.get("WITW_LORA_ADAPTER", "").strip()

DEFAULT_INSTRUCTION = (
    "당신은 직업상담 자료실의 문답 비서입니다. "
    "주어진 근거 조각 안에서만 답하고, 근거에 없는 사실·수치는 만들지 않습니다. "
    "첫 문장에 결론을 먼저 적습니다."
)

print(f"[witw] 모델 적재 시작: {MODEL_ID}")
tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
model = AutoModelForCausalLM.from_pretrained(MODEL_ID, torch_dtype=torch.bfloat16)
if ADAPTER_ID:
    from peft import PeftModel
    print(f"[witw] LoRA 어댑터 병합: {ADAPTER_ID}")
    model = PeftModel.from_pretrained(model, ADAPTER_ID).merge_and_unload()
print("[witw] 모델 적재 완료(CPU) — 첫 호출 때 GPU로 옮긴다")


def build_messages(instruction, evidence, question):
    inst = (instruction or "").strip() or DEFAULT_INSTRUCTION
    ev = (evidence or "").strip()
    body = ("근거:\n" + ev + "\n\n" if ev else "") + "질문: " + question.strip()
    return [
        {"role": "system", "content": inst},
        {"role": "user", "content": body},
    ]


@spaces.GPU(duration=120)
def generate(instruction, evidence, question, max_new_tokens):
    global model
    if not next(model.parameters()).is_cuda:
        model = model.to("cuda")
    messages = build_messages(instruction, evidence, question)
    ids = tokenizer.apply_chat_template(
        messages, add_generation_prompt=True, return_tensors="pt"
    ).to("cuda")
    out = model.generate(ids, max_new_tokens=int(max_new_tokens), do_sample=False)
    return tokenizer.decode(out[0][ids.shape[1]:], skip_special_tokens=True)


demo = gr.Interface(
    fn=generate,
    inputs=[
        gr.Textbox(label="지침 요약 (비우면 기본 지침)", lines=2, value=""),
        gr.Textbox(label="근거 조각", lines=6),
        gr.Textbox(label="질문", lines=2),
        gr.Slider(64, 1024, value=512, step=64, label="최대 새 토큰"),
    ],
    outputs=gr.Textbox(label="답", lines=12),
    title="직업상담 문답 서빙 (시험)",
    description="근거를 보고 답하는 모양의 서빙 실측용. 이름·연락처 같은 개인정보는 넣지 않는다.",
    api_name="generate",
)

if __name__ == "__main__":
    demo.launch()
