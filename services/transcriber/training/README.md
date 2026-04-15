# Whisper Simple Fine-Tuning (Experimental)

This directory contains an **experimental** scaffold to perform *lightweight adaptation* of a Whisper model using parameter-efficient LoRA fine-tuning on a small custom dataset.

> IMPORTANT: The official OpenAI Whisper repository does **not** provide a supported fine-tuning API. This approach uses community techniques (PEFT / LoRA) and may yield unstable results. Use for experimentation only.

## Overview
We implement: 
1. Simple dataset format (JSONL or TSV) with fields: `audio_path`, `text`, optional `language`.
2. A small PyTorch Dataset that loads & resamples audio with `torchaudio`.
3. LoRA adapters (if available) applied to the Whisper encoder+decoder projection layers.
4. Training loop with gradient accumulation, mixed precision, and periodic validation WER (optional if `jiwer` installed).
5. Checkpoint saving of only LoRA adapter weights (default) to keep artifacts small.

## Data Preparation
Place your audio + transcripts somewhere accessible, then create one of:

### Option A: JSONL
```
{"audio_path": "/abs/path/audio1.wav", "text": "transcript one", "language": "id"}
{"audio_path": "/abs/path/audio2.wav", "text": "transcript two"}
```

### Option B: TSV (tab separated, header row required)
```
audio_path	text	language
/abs/path/audio1.wav	transcript one	id
/abs/path/audio2.wav	transcript two	
```

Language column is optional; falls back to a default.

## Quick Start
Install extra dependencies (PEFT etc.):
```
pip install -r training/requirements-training.txt
```

Run a tiny smoke training (1–2 steps) to verify pipeline:
```
python -m training.train_lora \
  --model small \
  --data data/sample.jsonl \
  --output-dir outputs/exp1 \
  --epochs 1 \
  --limit-train 4 \
  --limit-eval 2
```

After training, to use adapters in inference, supply `--lora-adapter` path to a future adapted loader (not yet wired into `whisper_service.py`).

## Integration Plan (Next Steps)
- Add optional environment variable `WHISPER_LORA_ADAPTER` and load merged weights at startup.
- Provide an evaluation script computing WER on a held-out set.
- Add streaming dataset + augmentation (SpecAugment, noise mix) for robustness.

## Limitations / Warnings
- LoRA does not update the full model; large domain shifts may need full fine-tuning (expensive).
- Be mindful of licensing and PHI/PII in transcripts.
- For >1hr data, monitor VRAM/CPU; consider quantization or gradient checkpointing.

## Minimal Example Dataset
See `data/sample.jsonl` (create your own). Keep files short (<30s) for initial experiments.

## Reproducing Inference with Adapters (Conceptual)
1. Load base model as usual.
2. Load LoRA adapter weights and merge into model.
3. Proceed with transcription.

A helper function will be added in a follow-up (not included yet to keep this PR small).

---
**Experimental**: Expect to iterate.
