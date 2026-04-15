from pathlib import Path
import yaml
import os
from dotenv import load_dotenv

def _env_float(name: str, default: float | None = None) -> float | None:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return float(value)
    except ValueError:
        print(f"WHISPER config warning: cannot parse {name}={value!r}")
        return default

def _env_int(name: str, default: int | None = None) -> int | None:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        print(f"WHISPER config warning: cannot parse {name}={value!r}")
        return default

def _env_bool(name: str, default: bool | None = None) -> bool | None:
    value = os.getenv(name)
    if value is None:
        return default
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    print(f"WHISPER config warning: cannot parse {name}={value!r}")
    return default

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

RABBITMQ_URL = os.getenv("RABBITMQ_URL")
RABBITMQ_EXCHANGE = os.getenv("RABBITMQ_EXCHANGE", "asc.soapi")
RABBITMQ_EXCHANGE_ROUTING_KEY = os.getenv("RABBITMQ_EXCHANGE_ROUTING_KEY", "transcript.ready")
RABBITMQ_QUEUE = os.getenv("RABBITMQ_QUEUE", "transcription_results")

WHISPER_DEFAULT_LANGUAGE = os.getenv("WHISPER_DEFAULT_LANGUAGE", "id")
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "small")
WHISPER_CACHE_DIR = os.getenv("WHISPER_CACHE_DIR", "~/.cache/whisper")

#WHISPER_DEVICE = os.getenv("WHISPER_DEVICE")  # e.g. cpu, cuda, cuda:0
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "").strip().lower()  # e.g. "mps", "cpu"
WHISPER_FP16 = _env_bool("WHISPER_FP16", False)

# Whisper environment-driven settings
WHISPER_TORCH_NUM_THREADS = _env_int("WHISPER_TORCH_NUM_THREADS", 4)
WHISPER_TORCH_NUM_INTEROP_THREADS = _env_int("WHISPER_TORCH_NUM_INTEROP_THREADS", 2)
WHISPER_SSL_FALLBACK = _env_bool("WHISPER_SSL_FALLBACK", True)

# Build temperature / fallback schedule compatible with openai-whisper.
# If both WHISPER_TEMPERATURE and WHISPER_TEMPERATURE_INCREMENT are set and increment > 0,
# we expand into a tuple: base, base+inc, base+2*inc, ... <= 1.0. This mirrors the native
# behaviour of passing a temperature tuple for fallback attempts (instead of the unsupported
# 'temperature_increment_on_fallback' kwarg from other implementations like faster-whisper).
_base_temp = _env_float("WHISPER_TEMPERATURE")
_inc = _env_float("WHISPER_TEMPERATURE_INCREMENT")
_temperature_value = None
if _base_temp is not None:
    if _inc is not None and _inc > 0:
        temps: list[float] = []
        t = _base_temp
        # Guard against pathological values
        max_iter = 20  # safety cap
        iter_count = 0
        while t <= 1.000001 and iter_count < max_iter:
            temps.append(round(t, 6))
            t += _inc
            iter_count += 1
        # Ensure at least one value
        if not temps:
            temps = [round(_base_temp, 6)]
        _temperature_value = tuple(temps)
    else:
        _temperature_value = _base_temp

DEFAULT_TRANSCRIBE_OPTIONS = {
    "temperature": _temperature_value,
    "compression_ratio_threshold": _env_float("WHISPER_COMPRESSION_RATIO_THRESHOLD"),
    "logprob_threshold": _env_float("WHISPER_LOGPROB_THRESHOLD"),
    "no_speech_threshold": _env_float("WHISPER_NO_SPEECH_THRESHOLD"),
    "condition_on_previous_text": _env_bool("WHISPER_CONDITION_ON_PREVIOUS"),
    "initial_prompt": os.getenv("WHISPER_INITIAL_PROMPT"),
    "beam_size": _env_int("WHISPER_BEAM_SIZE"),
    "best_of": _env_int("WHISPER_BEST_OF"),
    "patience": _env_float("WHISPER_PATIENCE"),
    "length_penalty": _env_float("WHISPER_LENGTH_PENALTY"),
    "word_timestamps": _env_bool("WHISPER_WORD_TIMESTAMPS"),
    "task": os.getenv("WHISPER_TASK"),
    "fp16": _env_bool("WHISPER_FP16", default=False),
}

DEFAULT_TRANSCRIBE_OPTIONS = {k: v for k, v in DEFAULT_TRANSCRIBE_OPTIONS.items() if v is not None}
if "task" not in DEFAULT_TRANSCRIBE_OPTIONS:
    DEFAULT_TRANSCRIBE_OPTIONS["task"] = "transcribe"

# Temperature fallback schedule
# temps = []
# t0 = _env_float("WHISPER_TEMPERATURE", 0.0)
# tmax = _env_float("WHISPER_TEMPERATURE_MAX", 0.6)
# tstep = _env_float("WHISPER_TEMPERATURE_INCREMENT_ON_FALLBACK", 0.2)

# cur = t0
# while cur <= tmax + 1e-6:
#     temps.append(round(cur, 2))
#     cur += tstep

# DEFAULT_TRANSCRIBE_OPTIONS["temperature"] = tuple(temps)  # contoh: (0.0, 0.2, 0.4, 0.6)

FIXES_CONFIG_PATH = os.getenv("FIXES_CONFIG", "clinical_fixes.yaml")
def load_fixes():
    with open(FIXES_CONFIG_PATH, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return data.get("fixes", {}), data.get("patterns", [])
