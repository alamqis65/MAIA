""" Whisper transcription & normalization service. """

import re
import ssl
import json as _json
import time
from datetime import datetime
from pytz import timezone
import platform
import whisper
import torch
import logging
import warnings

from config import (
    DEFAULT_TRANSCRIBE_OPTIONS,
    WHISPER_MODEL,
    WHISPER_FP16,
    WHISPER_CACHE_DIR,
    WHISPER_TORCH_NUM_THREADS,
    WHISPER_TORCH_NUM_INTEROP_THREADS,
    WHISPER_SSL_FALLBACK,
    WHISPER_DEVICE,
    load_fixes,
)

gmt7 = timezone('Asia/Jakarta')

# --- logger setup ---

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

_MODEL = None  # Lazy-initialized Whisper model instance
FIXES, PATTERNS = load_fixes()

# Precompile case-insensitive exact replacement patterns.
# Sort by descending key length to avoid a shorter key consuming part of a
# longer phrase (similar to a trie longest-match preference) — this mirrors the
# prior simple .replace semantics while being safer for overlapping phrases.
_FIXES_CI_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(re.escape(k), re.IGNORECASE), v) for k, v in sorted(FIXES.items(), key=lambda kv: -len(kv[0]))
]

warnings.filterwarnings(
    "ignore",
    message=r"You are using `torch.load` with `weights_only=False`",
    category=FutureWarning,
    module="whisper",
)

## --- internal functions ---

def _configure_torch_threads():
    """Best-effort torch thread configuration.

    Must be called before any heavy parallel work starts. If we're too late
    (e.g., another import already triggered MKL/OpenMP initialization), we
    swallow the RuntimeError rather than crashing the service.
    """
    try:
        if WHISPER_TORCH_NUM_THREADS:
            torch.set_num_threads(WHISPER_TORCH_NUM_THREADS)
        if WHISPER_TORCH_NUM_INTEROP_THREADS:
            torch.set_num_interop_threads(WHISPER_TORCH_NUM_INTEROP_THREADS)
    except RuntimeError as e:
        logger.warning(
            "Unable to set torch thread counts (may already be initialized): %s",
            e,
        )

# --- device_select.py (inline or top of whisper_service.py) ---
import os
import torch

def select_torch_device(preferred: str | None = None) -> tuple[str, bool]:
    """
    Returns (device_string, use_fp16).
    - Honors env WHISPER_DEVICE if set: "mps", "cuda", "cpu"
    - Auto-detects best device if not set.
    - fp16 base preference comes from WHISPER_FP16; CUDA always forces fp16 True
    """
    env_pref = (preferred or WHISPER_DEVICE)

    # Normalize env preference to a valid device if possible
    def _valid(dev: str) -> bool:
        if dev == "cuda":
            return torch.cuda.is_available()
        if dev == "mps":
            return torch.backends.mps.is_available()
        if dev == "cpu":
            return True
        return False

    if env_pref in ("cuda", "mps", "cpu") and _valid(env_pref):
        device = env_pref
    else:
        # Auto-pick best available
        if torch.cuda.is_available():
            device = "cuda"
        elif torch.backends.mps.is_available():
            device = "mps"
        else:
            device = "cpu"
                
    # Base preference from imported WHISPER_FP16; always force True for CUDA
    use_fp16 = bool(WHISPER_FP16)
    if device == "cuda":
        use_fp16 = True

    return device, use_fp16

# def _build_load_kwargs() -> dict:
#     load_kwargs: dict = {}
#     if WHISPER_CACHE_DIR:
#         os.makedirs(WHISPER_CACHE_DIR, exist_ok=True)
#         load_kwargs["download_root"] = WHISPER_CACHE_DIR
#     if WHISPER_DEVICE:
#         load_kwargs["device"] = WHISPER_DEVICE
#     return load_kwargs
def _build_load_kwargs():
    """
    Build kwargs for whisper.load_model with MPS awareness and sane defaults.
    """
    load_kwargs = {}

    # Where to cache model files
    if WHISPER_CACHE_DIR:
        load_kwargs["download_root"] = WHISPER_CACHE_DIR

    # Decide device
    device, use_fp16 = select_torch_device()
    load_kwargs["device"] = device

    # Conditionally include fp16 if supported
    if hasattr(whisper, 'load_model') and 'fp16' in whisper.load_model.__code__.co_varnames:
        load_kwargs["fp16"] = bool(use_fp16)

    logger.info(
        "Whisper load kwargs: device=%s, fp16=%s, download_root=%s",
        load_kwargs.get("device"),
        load_kwargs.get("fp16"),
        load_kwargs.get("download_root"),
    )

    # Optional: tune dtype if you have issues (we leave it to whisper default)
    return load_kwargs

def _load_model_with_ssl_fallback():
    """Load Whisper model with SSL fallback for network issues"""
    load_kwargs = _build_load_kwargs()

    try:
        # Try normal loading first
        logger.info(f"Loading Whisper model: {WHISPER_MODEL}")
        return whisper.load_model(WHISPER_MODEL, **load_kwargs)
    except ssl.SSLError as e:
        if not WHISPER_SSL_FALLBACK:
            logger.error(f"SSL error and fallback disabled: {e}")
            raise
        logger.warning(f"SSL error during model loading: {e}")
        logger.info("Attempting to load model with SSL verification disabled...")

        # Temporarily disable SSL verification
        original_context = ssl._create_default_https_context
        ssl._create_default_https_context = ssl._create_unverified_context

        try:
            model = whisper.load_model(WHISPER_MODEL, **load_kwargs)
            logger.info("Model loaded successfully with SSL workaround")
            return model
        except Exception as fallback_error:
            logger.error(f"Failed to load model even with SSL workaround: {fallback_error}")
            raise
        finally:
            # Restore original SSL context
            ssl._create_default_https_context = original_context
    except Exception as e:
        logger.error(f"Failed to load Whisper model: {e}")
        raise

## --- public functions ---

def normalize_clinical_id(text: str) -> str:
    """Normalize clinical transcription text.

    Applies:
      1. Case-insensitive phrase substitutions from FIXES (exact phrases, any casing)
      2. Additional regex-based normalization rules from PATTERNS (as-configured)

    Note: This normalization intentionally does not attempt to preserve the original case pattern
    of the matched phrase (e.g., Title Case vs lower) because the desired
    canonical forms in FIXES already encode the target styling.
    """
    # Case-insensitive exact (phrase) replacements
    for pattern, replacement in _FIXES_CI_PATTERNS:
        text = pattern.sub(replacement, text)

    # Configured regex patterns (left as-is; allow author to decide flags)
    for rule in PATTERNS:
        if not isinstance(rule, dict) or "regex" not in rule or "replace" not in rule:
            logger.warning(f"Skipping invalid rule: {rule}")
            continue

        flags = 0
        # Optional: allow a future 'ignore_case: true' in YAML without breaking existing structure
        if rule.get("ignore_case"):
            flags |= re.IGNORECASE
        text = re.sub(rule["regex"], rule["replace"], text, flags=flags)
    return text

def get_model():
    """Return a cached Whisper model instance (lazy-loaded)."""
    global _MODEL
    if _MODEL is None:
        _MODEL = _load_model_with_ssl_fallback()
    return _MODEL


def transcribe_audio_file(path: str, overrides: dict, language: str, normalize: bool = True) -> dict:
    """Transcribe an audio file using Whisper.

    Parameters:
        path: path to temporary audio file
        overrides: dict of option overrides coming from request
        language: target/source language code
        normalize: when True (default) apply clinical text normalization rules

    Returns:
        Whisper transcription result dict (possibly normalized)
    """
    transcribe_kwargs = DEFAULT_TRANSCRIBE_OPTIONS.copy()
    transcribe_kwargs.update({k: v for k, v in overrides.items() if v is not None})
    transcribe_kwargs.setdefault("language", language)
    transcribe_kwargs.setdefault("task", "transcribe")

    # Log the effective transcription settings before invoking the model
    try:
        logger.info("Transcription kwargs (effective): %s", _json.dumps(transcribe_kwargs, indent=2, sort_keys=True))
    except Exception:
        # Fallback if JSON serialization fails (e.g., non-serializable values)
        logger.info("Transcription kwargs (effective): %s", transcribe_kwargs)

    model = get_model()  # Lazy load the model when actually needed

    print("Torch version:", torch.__version__)
    print("Torch thread count:", torch.get_num_threads(), "interop thread count:", torch.get_num_interop_threads())
    print("Python version:", platform.python_version())
    print("MPS available:", torch.backends.mps.is_available())
    print("MPS built:", torch.backends.mps.is_built())
    print("CUDA available:", torch.cuda.is_available())
    start_wall = datetime.now(gmt7)
    start_perf = time.perf_counter()
    print("Starting transcription with model:", start_wall.isoformat() + "Z", "language:", language, "normalize:", normalize, "overrides:", {k: v for k, v in overrides.items() if v is not None})

    result = model.transcribe(path, **transcribe_kwargs)

    end_perf = time.perf_counter()
    end_wall = datetime.now(gmt7)
    processing_seconds = end_perf - start_perf
    print("Ending transcription with model:", end_wall.isoformat() + "Z", "language:", language, "normalize:", normalize, "overrides:", {k: v for k, v in overrides.items() if v is not None})
    print("Transcription processing time (seconds):", round(processing_seconds, 4))
    print(" ")
    
    if normalize:
        # Apply clinical normalization to whole transcript and each segment
        if "text" in result:
            result["text"] = normalize_clinical_id(result["text"])
        for seg in result.get("segments", []) or []:
            if "text" in seg:
                seg["text"] = normalize_clinical_id(seg["text"])

    return result

## --- initialization

_configure_torch_threads()
