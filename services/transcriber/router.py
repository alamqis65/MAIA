""" router for the transcription service. """

import tempfile
import time
import os
import shutil
from datetime import datetime
import torch
from fastapi.concurrency import run_in_threadpool

from pytz import timezone
from fastapi import APIRouter, UploadFile, File, HTTPException, Header, Depends

from config import WHISPER_MODEL
from rabbitmq import publish_transcript
from whisper_service import transcribe_audio_file

gmt7 = timezone('Asia/Jakarta')

router = APIRouter(prefix="/v1/transcriber", tags=["transcriber"])

async def auth_headers(
    authorization: str = Header(...),
    x_id: str = Header(...),
    x_timestamp: str = Header(...),
):
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Invalid auth scheme")

    token = authorization.removeprefix("Bearer ")

    return {
        "token": token,
        "x_id": x_id,
        "x_timestamp": x_timestamp,
    }

@router.get("/health", summary="Lightweight service health & runtime info")
def health():
    """Return basic health information.

    Notes:
      - Does NOT force a Whisper model load. If the model has not yet been
        requested by any transcription call, model_loaded will be False.
      - If you need a deep check that actually loads the model, you can hit the
        transcription endpoint once or adapt this handler to call get_model().
    """
    # Access internal cache (best-effort; avoids importing heavy modules twice)
    try:  # noqa: WPS501
        from whisper_service import _MODEL as _WHISPER_MODEL_CACHE  # type: ignore
    except Exception:  # pragma: no cover - very unlikely
        _WHISPER_MODEL_CACHE = None  # type: ignore

    model_loaded = _WHISPER_MODEL_CACHE is not None
    model_device: str | None = None
    if model_loaded:
        try:  # guard against edge cases if parameters() is missing
            model_device = str(next(_WHISPER_MODEL_CACHE.parameters()).device)  # type: ignore
        except Exception:  # pragma: no cover - defensive
            model_device = "unknown"

    return {
        "torch": {
            "version": getattr(torch, "__version__", "unknown"),
            "cuda_available": torch.cuda.is_available(),
            "mps_available": getattr(torch.backends.mps, "is_available", lambda: False)(),
        },
        "whisper": {
            "model_name": WHISPER_MODEL,
            "model_loaded": model_loaded,
            "model_device": model_device,
        },
        "service": {
            "timezone": str(gmt7),
        },
    }

@router.post("/transcribe", summary="Transcribe an audio file")
async def transcribe(
    audio: UploadFile = File(...),
    # auth=Depends(auth_headers),
    language: str = "id",
    publish: bool = True,
    normalize: bool = True,
    temperature: float | None = None,
    compression_ratio_threshold: float | None = None,
    logprob_threshold: float | None = None,
    no_speech_threshold: float | None = None,
    condition_on_previous_text: bool | None = None,
    initial_prompt: str | None = None,
    beam_size: int | None = None,
    best_of: int | None = None,
    patience: float | None = None,
    length_penalty: float | None = None,
    word_timestamps: bool | None = None,
    task: str | None = None,
    fp16: bool | None = None,
    
):
    if not audio.filename:
        raise HTTPException(status_code=400, detail="Audio kosong")
    
    # print(auth);

    # Efficient handling of uploaded audio: avoid redundant full-memory copy.
    # Strategy:
    # 1. If the underlying UploadFile has a tangible filesystem path (large uploads
    #    that spooled to disk), use it directly (no copy, no extra I/O).
    # 2. Otherwise, stream-copy the file object to a NamedTemporaryFile using shutil.copyfileobj
    #    (chunked) instead of reading all bytes at once.
    # upload_path = getattr(audio.file, "name", None)
    cleanup_needed = False

    # if isinstance(upload_path, str) and os.path.exists(upload_path):
    #     # Reuse existing spooled temp file path
    #     tmp_path = upload_path
    # else:
    #     # Stream copy to a real temp file with .wav suffix
    #     with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
    #         audio.file.seek(0)
    #         shutil.copyfileobj(audio.file, tmp, length=1024 * 1024)
    #         tmp_path = tmp.name
    #         cleanup_needed = True

    temp_dir = os.path.join(os.path.dirname(__file__), "temp_audio")
    os.makedirs(temp_dir, exist_ok=True)

    suffix = os.path.splitext(audio.filename)[1] or ".wav"

    tmp = tempfile.NamedTemporaryFile(
        delete=False,
        suffix=suffix,
        dir=temp_dir
    )
    
    try:
        audio.file.seek(0)
        shutil.copyfileobj(audio.file, tmp, length=1024 * 1024)
        tmp.flush()
        os.fsync(tmp.fileno())
        tmp_path = tmp.name
    finally:
        tmp.close()

    cleanup_needed = True

    # Build overrides dict, filtering None downstream when constructing actual call args.
    overrides = {
        "temperature": temperature,
        "compression_ratio_threshold": compression_ratio_threshold,
        "logprob_threshold": logprob_threshold,
        "no_speech_threshold": no_speech_threshold,
        "condition_on_previous_text": condition_on_previous_text,
        "initial_prompt": initial_prompt,
        "beam_size": beam_size,
        "best_of": best_of,
        "patience": patience,
        "length_penalty": length_penalty,
        "word_timestamps": word_timestamps,
        "task": task,
        "fp16": fp16,
    }

    start_wall = datetime.now(gmt7)
    start_perf = time.perf_counter()
    try:
        # Offload synchronous, CPU/GPU-bound transcription to a thread to avoid blocking the event loop.
        result = await run_in_threadpool(
            transcribe_audio_file,
            tmp_path,
            overrides,
            language,
            normalize,
        )
    finally:
        # Remove our own temp file if we created one.
        if cleanup_needed:
            try:
                os.remove(tmp_path)
            except OSError:
                pass
    end_perf = time.perf_counter()
    end_wall = datetime.now(gmt7)
    processing_seconds = end_perf - start_perf

    segments = result.get("segments", []) or []
    audio_duration = None
    if segments:
        # Whisper segments are chronological; last end is duration
        last_end = segments[-1].get("end")
        if isinstance(last_end, (int, float)):
            audio_duration = float(last_end)
    rtf = None
    if audio_duration and audio_duration > 0:
        rtf = processing_seconds / audio_duration

    payload = {
        "language": result.get("language", language),
        "transcript": result.get("text", "").strip(),
        "segment_count": len(segments),
        "segments": segments,
        # "segments": [
        #     {"start": s.get("start"), "end": s.get("end"), "text": s.get("text", "").strip()}
        #     for s in segments
        # ],
        "meta": {
            "model": WHISPER_MODEL,
            "ts": datetime.now(gmt7).isoformat() + "Z",
            "started_at": start_wall.isoformat() + "Z",
            "completed_at": end_wall.isoformat() + "Z",
            "processing_seconds": round(processing_seconds, 4),
            "audio_duration_seconds": round(audio_duration, 4) if audio_duration is not None else None,
            "real_time_factor": round(rtf, 4) if rtf is not None else None,
        },
    }

    if publish:
        try:
            await publish_transcript(payload)
        except Exception as exc:
            print("Publish transcript error:", exc)

    return payload