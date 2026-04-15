"""Experimental LoRA fine-tuning for Whisper using PEFT.

Usage (small smoke test):

python -m training.train_lora \
  --model small \
  --data data/sample.jsonl \
  --output-dir outputs/exp1 \
  --epochs 1 --batch-size 2 --learning-rate 1e-4 --limit-train 8

Dataset format: JSONL rows with keys: audio_path, text, optional language
OR a TSV with header row containing at least audio_path, text.

Caveats:
- This is a simplified loop; not production grade.
- Full Whisper fine-tuning is non-trivial and resource intensive.
- Only trains LoRA adapter layers; base weights frozen.
"""
from __future__ import annotations
import os
import json
import math
import argparse
import logging
import random
import dataclasses
from dataclasses import dataclass
from typing import List, Optional, Iterable

import torch
import torchaudio
import soundfile as sf

from peft import LoraConfig, get_peft_model
from torch.utils.data import Dataset, DataLoader

try:
    import whisper  # openai-whisper
except ImportError as e:
    raise SystemExit("openai-whisper must be installed in the current environment") from e

try:
    from jiwer import wer
    HAVE_WER = True
except Exception:
    HAVE_WER = False

logger = logging.getLogger("train_lora")
logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s %(message)s")

SUPPORTED_AUDIO_EXT = {".wav", ".mp3", ".m4a", ".flac", ".ogg"}

# -------------------------------------------------
# Data structures
# -------------------------------------------------
@dataclass
class Sample:
    audio_path: str
    text: str
    language: Optional[str] = None

# -------------------------------------------------
# Dataset
# -------------------------------------------------
class WhisperFinetuneDataset(Dataset):
    def __init__(self, items: List[Sample], target_sr: int = 16000, max_duration: float = 30.0):
        self.items = items
        self.target_sr = target_sr
        self.max_samples = int(target_sr * max_duration)

    def __len__(self):
        return len(self.items)

    def _load_audio(self, path: str):
        ext = os.path.splitext(path)[1].lower()
        if ext not in SUPPORTED_AUDIO_EXT:
            raise ValueError(f"Unsupported audio type: {path}")
        # Prefer torchaudio (respects backend & speed); fallback to soundfile
        try:
            wav, sr = torchaudio.load(path)
            if wav.shape[0] > 1:
                wav = wav.mean(dim=0, keepdim=True)
        except Exception:
            data, sr = sf.read(path)
            if data.ndim > 1:
                data = data.mean(axis=1)
            wav = torch.tensor(data).unsqueeze(0)
        if sr != self.target_sr:
            wav = torchaudio.functional.resample(wav, sr, self.target_sr)
        wav = wav[0]
        if wav.numel() > self.max_samples:
            wav = wav[: self.max_samples]
        return wav

    def __getitem__(self, idx):
        sample = self.items[idx]
        audio = self._load_audio(sample.audio_path)
        return {
            "audio": audio,
            "text": sample.text.strip(),
            "language": sample.language or "id",
        }

# -------------------------------------------------
# Data loading helpers
# -------------------------------------------------

def load_dataset(path: str) -> List[Sample]:
    if not os.path.isfile(path):
        raise FileNotFoundError(path)
    ext = os.path.splitext(path)[1].lower()
    items: List[Sample] = []
    if ext in {".jsonl", ".json"}:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                row = json.loads(line)
                items.append(Sample(audio_path=row["audio_path"], text=row["text"], language=row.get("language")))
    elif ext in {".tsv", ".txt"}:
        import csv
        with open(path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f, delimiter="\t")
            for row in reader:
                items.append(Sample(audio_path=row["audio_path"], text=row["text"], language=row.get("language")))
    else:
        raise ValueError("Unsupported dataset file. Use .jsonl or .tsv")
    return items

# -------------------------------------------------
# Collate
# -------------------------------------------------

def collate(batch, processor, device):
    audios = [b["audio"] for b in batch]
    texts = [b["text"] for b in batch]
    languages = [b["language"] for b in batch]
    # Tokenize via whisper tokenizer
    # Convert list of tensors to a padded batch of mel spectrograms -> we reuse Whisper's internal log_mel_spectrogram
    max_len = max(a.shape[0] for a in audios)
    padded = torch.zeros(len(audios), max_len)
    for i, a in enumerate(audios):
        padded[i, : a.shape[0]] = a
    # Convert to mel
    mel = torch.stack([whisper.log_mel_spectrogram(a) for a in padded])  # shape (B, 80, T)
    mel = mel.to(device)
    # Tokenize targets
    tokenizer = processor.tokenizer
    encoded = [tokenizer.encode(t) for t in texts]
    # Pad tokens
    max_tok = max(len(e) for e in encoded)
    tok_batch = torch.full((len(encoded), max_tok), tokenizer.eot, dtype=torch.long)
    for i, seq in enumerate(encoded):
        tok_batch[i, : len(seq)] = torch.tensor(seq, dtype=torch.long)
    return mel, tok_batch, texts, languages

# -------------------------------------------------
# Training loop
# -------------------------------------------------

def setup_lora(model, r=16, alpha=32, dropout=0.05, target_modules=None):
    if target_modules is None:
        # Common linear proj names inside Whisper's transformer; adjust if mismatch in future versions
        target_modules = ["k_proj", "q_proj", "v_proj", "out_proj", "fc1", "fc2"]
    config = LoraConfig(
        r=r,
        lora_alpha=alpha,
        target_modules=target_modules,
        lora_dropout=dropout,
        bias="none",
        task_type="SEQ_2_SEQ_LM",
    )
    lora_model = get_peft_model(model, config)
    lora_model.print_trainable_parameters()  # log count
    return lora_model


def evaluate(model, loader, processor, device, limit=None):
    model.eval()
    preds = []
    refs = []
    with torch.no_grad():
        for i, batch in enumerate(loader):
            mel, tok_batch, texts, languages = collate(batch, processor, device)
            options = whisper.DecodingOptions(language=languages[0], fp16=False)
            for m in mel:
                result = whisper.decode(model, m, options)
                preds.append(result.text.strip())
            refs.extend(texts)
            if limit and len(refs) >= limit:
                break
    if HAVE_WER:
        metric = wer(refs, preds)
    else:
        metric = float('nan')
    return metric, list(zip(refs, preds))


def train(args):
    device = torch.device("cuda" if torch.cuda.is_available() else ("mps" if torch.backends.mps.is_available() else "cpu"))
    base_model = whisper.load_model(args.model, device=device)

    # Freeze all
    for p in base_model.parameters():
        p.requires_grad = False

    model = setup_lora(base_model, r=args.lora_r, alpha=args.lora_alpha, dropout=args.lora_dropout)

    # Tokenizer / processor placeholder (we reuse base model's tokenizer attribute)
    processor = base_model

    items = load_dataset(args.data)
    random.shuffle(items)
    if args.limit_train:
        train_items = items[: args.limit_train]
    else:
        train_items = items
    # Simple split
    val_split = max(1, int(len(train_items) * 0.1))
    val_items = train_items[:val_split]
    train_core = train_items[val_split:] or val_items  # ensure not empty

    train_ds = WhisperFinetuneDataset(train_core, max_duration=args.max_duration)
    val_ds = WhisperFinetuneDataset(val_items, max_duration=args.max_duration)

    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True, collate_fn=lambda b: b)
    val_loader = DataLoader(val_ds, batch_size=1, shuffle=False, collate_fn=lambda b: b)

    optimizer = torch.optim.AdamW(model.parameters(), lr=args.learning_rate)
    scaler = torch.cuda.amp.GradScaler(enabled=(device.type == "cuda"))

    total_steps = math.ceil(len(train_loader) / args.grad_accum * args.epochs)
    logger.info(f"Starting training for {args.epochs} epochs, ~{total_steps} optimizer steps")

    global_step = 0
    os.makedirs(args.output_dir, exist_ok=True)

    for epoch in range(args.epochs):
        model.train()
        running_loss = 0.0
        for step, batch in enumerate(train_loader):
            mel, tok_batch, texts, languages = collate(batch, processor, device)
            with torch.cuda.amp.autocast(enabled=(device.type == "cuda")):
                # Whisper forward: we call model directly with mel spectrograms
                # openai-whisper doesn't expose a standard forward returning loss; we approximate by cross-entropy on logits
                logits = model(mel)[0]  # (B, T, vocab) - shape may differ; adapt if mismatch
                # Align lengths (truncate/pad token batch to logits length)
                target = tok_batch.to(device)
                if logits.shape[1] < target.shape[1]:
                    target = target[:, : logits.shape[1]]
                elif logits.shape[1] > target.shape[1]:
                    target = torch.nn.functional.pad(target, (0, logits.shape[1] - target.shape[1]), value=processor.tokenizer.eot)
                loss = torch.nn.functional.cross_entropy(
                    logits.reshape(-1, logits.size(-1)), target.reshape(-1), ignore_index=processor.tokenizer.eot
                )
            scaler.scale(loss / args.grad_accum).backward()
            running_loss += loss.item()
            if (step + 1) % args.grad_accum == 0:
                scaler.step(optimizer)
                scaler.update()
                optimizer.zero_grad(set_to_none=True)
                global_step += 1
                if global_step % args.log_every == 0:
                    logger.info(f"epoch {epoch} step {global_step} loss {running_loss / args.log_every:.4f}")
                    running_loss = 0.0
        # Validation
        val_wer, pairs = evaluate(model, val_loader, processor, device, limit=args.limit_eval)
        logger.info(f"Epoch {epoch} validation WER: {val_wer}")
        # Save LoRA adapter
        ckpt_dir = os.path.join(args.output_dir, f"epoch{epoch}")
        os.makedirs(ckpt_dir, exist_ok=True)
        model.save_pretrained(ckpt_dir)
        with open(os.path.join(ckpt_dir, "val_metrics.json"), "w", encoding="utf-8") as f:
            json.dump({"wer": val_wer}, f)

    logger.info("Training complete")
    logger.info(f"Adapters saved under: {args.output_dir}")


def parse_args():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="small")
    ap.add_argument("--data", required=True)
    ap.add_argument("--output-dir", required=True)
    ap.add_argument("--epochs", type=int, default=1)
    ap.add_argument("--batch-size", type=int, default=2)
    ap.add_argument("--learning-rate", type=float, default=1e-4)
    ap.add_argument("--grad-accum", type=int, default=1)
    ap.add_argument("--log-every", type=int, default=10)
    ap.add_argument("--limit-train", type=int)
    ap.add_argument("--limit-eval", type=int)
    ap.add_argument("--max-duration", type=float, default=30.0)
    # LoRA params
    ap.add_argument("--lora-r", type=int, default=16)
    ap.add_argument("--lora-alpha", type=int, default=32)
    ap.add_argument("--lora-dropout", type=float, default=0.05)
    return ap.parse_args()

if __name__ == "__main__":
    args = parse_args()
    train(args)
