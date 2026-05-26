"""
gemini_client.py — Google Generative AI SDK untuk Gemini Claw V2.

Drop-in replacement untuk PuruBoy client.
- Model: gemini-2.5-flash (free tier, 10 RPM / 250 RPD)
- Fallback: gemini-2.5-flash-lite (15 RPM / 1000 RPD) kalau 429
- API key dari env GEMINI_API_KEY (HF Secrets)
- Rate limit aware — MIN_RPM_DELAY 6.5s untuk stay di bawah 10 RPM
- Exponential backoff untuk 429 / 5xx
"""
from __future__ import annotations

import os
import time
import threading

import google.generativeai as genai

DEFAULT_MODEL      = "gemini-2.5-flash"
FALLBACK_MODEL     = "gemini-2.5-flash-lite"
MIN_RPM_DELAY      = 6.5    # 10 RPM = 1 req/6s, tambah buffer 0.5s
MAX_RETRIES        = 5
BASE_RETRY_DELAY   = 5.0


class GeminiAPIError(Exception):
    pass


# ── Rate limiter ───────────────────────────────────────────────────────────────

_last_request_time: float = 0.0
_rate_lock = threading.Lock()


def _rate_limit() -> None:
    global _last_request_time
    with _rate_lock:
        elapsed = time.time() - _last_request_time
        if elapsed < MIN_RPM_DELAY:
            time.sleep(MIN_RPM_DELAY - elapsed)
        _last_request_time = time.time()


# ── API Key ────────────────────────────────────────────────────────────────────

def _get_api_key() -> str:
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        raise GeminiAPIError(
            "GEMINI_API_KEY belum diset. "
            "Tambahkan di HF Space → Settings → Repository Secrets."
        )
    return key


# ── Core caller ────────────────────────────────────────────────────────────────

def _call_model(model_name: str, prompt: str) -> str:
    """
    Kirim prompt ke satu model, raise GeminiAPIError kalau gagal.
    Dipanggil oleh call_gemini() dengan fallback logic.
    """
    genai.configure(api_key=_get_api_key())
    model_obj = genai.GenerativeModel(model_name=model_name)

    delay = BASE_RETRY_DELAY

    for attempt in range(MAX_RETRIES):
        try:
            _rate_limit()

            response = model_obj.generate_content(prompt)

            text = ""
            for part in response.parts:
                if hasattr(part, "text") and part.text:
                    text += part.text

            if not text.strip():
                raise GeminiAPIError("Respons API kosong")

            return text

        except GeminiAPIError:
            raise

        except Exception as e:
            msg    = str(e)
            is_429 = "429" in msg or "quota" in msg.lower() or "rate" in msg.lower()

            if attempt == MAX_RETRIES - 1:
                raise GeminiAPIError(
                    f"[{model_name}] Gagal setelah {MAX_RETRIES} percobaan: {msg}"
                )

            wait = max(delay, 15.0) if is_429 else delay
            print(f"[{model_name}] Percobaan {attempt + 1} gagal: {msg}. Retry dalam {wait:.0f}s...")
            time.sleep(wait)
            delay = min(delay * 2, 60.0)


# ── Main call ──────────────────────────────────────────────────────────────────

def call_gemini(prompt: str, model: str = DEFAULT_MODEL) -> str:
    """
    Kirim prompt ke Gemini API.
    - Primary: model yang diminta (default gemini-2.5-flash)
    - Fallback: gemini-2.5-flash-lite kalau primary 429 / error
    Signature identik dengan versi lama — drop-in compatible dengan agent_loop.
    """
    try:
        return _call_model(model, prompt)

    except GeminiAPIError as e:
        msg = str(e)
        is_rate = "429" in msg or "quota" in msg.lower() or "rate" in msg.lower()

        # Kalau bukan rate limit error dan bukan primary model, langsung raise
        if not is_rate or model == FALLBACK_MODEL:
            raise

        # Fallback ke flash-lite kalau rate limit kena
        print(f"[Fallback] {model} kena rate limit, switching ke {FALLBACK_MODEL}...")
        return _call_model(FALLBACK_MODEL, prompt)
