"""
agent_loop.py — Zero-Shot Multi-Purpose Agent dengan Mandatory Reasoning.

Features (semua digabung):
- [BROWSER-UX]  _summarize_browser_output() — AI summarization setelah browser_open/state
- [BROWSER-UX]  _strip_raw_section() — buang __RAW__ block sebelum dikirim ke agent
- [CHECKPOINT]  on_checkpoint callback — dipanggil sebelum setiap eksekusi tool
- [SESSION]     on_conversation_update callback — dipanggil setiap conversation diupdate
"""

from __future__ import annotations

import logging
import os
import re
import threading
import time
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from .agent_tools import dispatch, TOOL_REGISTRY, set_workspace
from .gemini_client import GeminiAPIError, call_gemini, DEFAULT_MODEL

logger = logging.getLogger(__name__)

# ── Konstanta ──────────────────────────────────────────────────────────────────

DEFAULT_MAX_TURNS       = 30
DEFAULT_CONFIRM_TIMEOUT = 60
MAX_PROMPT_CHARS        = 180_000
MIN_HISTORY_TURNS       = 4
RETRY_ATTEMPTS          = 3
RETRY_BASE_DELAY        = 1.5
MAX_TOOL_WORKERS        = 4
MAX_ERROR_STREAK        = 4
MAX_LOOP_REPEAT         = 3
MAX_TOOL_RETRY          = 2

INTENT_RISK_BUDGET   = 50
WARN_THRESHOLD       = 25
HARD_BLOCK_SINGLE_OP = 20

_BROWSER_SUMMARIZE_TOOLS = {"browser_open", "browser_state"}


# ── Risk Score Matrix ──────────────────────────────────────────────────────────

_BASE_RISK: dict[str, int] = {
    "read_file":        0,
    "glob":             0,
    "grep":             0,
    "ls":               0,
    "tree":             0,
    "copy_file":        1,
    "write_file":       2,
    "edit_file":        2,
    "bash":             3,
    "move_file":        3,
    "find_replace_all": 4,
    "delete_file":      6,
    "browser_open":     0,
    "browser_state":    0,
    "browser_click":    1,
    "browser_input":    1,
}

RISK_PATTERNS: dict[str, re.Pattern] = {
    "port_conflict":  re.compile(r"(flask|uvicorn|gunicorn|server|listen).*?(\d{4,5})", re.I),
    "sensitive_file": re.compile(r"\.(env|secret|key|pem|crt|p12|pfx)$", re.I),
    "system_path":    re.compile(r"(\/etc\/|\/usr\/|\/bin\/|\/sys\/|C:\\Windows)", re.I),
}

_ULTRA_DANGEROUS = [
    "rm -rf /", "mkfs", "> /dev/sda", "dd if=/dev/zero",
    ":(){ :|:& };:", "chmod -R 777 /",
]


# ── AgentMode ─────────────────────────────────────────────────────────────────

class AgentMode:
    NORMAL    = "normal"
    CAUTIOUS  = "cautious"
    DEGRADED  = "degraded"
    SAFE_STOP = "safe_stop"


# ── DecisionResult ────────────────────────────────────────────────────────────

@dataclass
class DecisionResult:
    should_execute: bool
    reason:         str
    risk_score:     int        = 0
    risk_level:     str        = "low"
    needs_confirm:  bool       = False
    alternative:    str | None = None


# ── AgentState ────────────────────────────────────────────────────────────────

class AgentState:
    """Thread-safe state management."""

    def __init__(self):
        self._lock = threading.Lock()
        self._error_streak      = 0
        self._total_errors      = 0
        self._intent_risk_used  = 0
        self._intent_tool_count = 0
        self._tool_call_log: list[str] = []
        self.mode:            str      = AgentMode.NORMAL
        self.turn_count:      int      = 0
        self.confirmed_risks: set[str] = set()

    @property
    def error_streak(self) -> int:
        with self._lock: return self._error_streak

    @property
    def total_errors(self) -> int:
        with self._lock: return self._total_errors

    @property
    def intent_risk_used(self) -> int:
        with self._lock: return self._intent_risk_used

    @property
    def tool_call_log(self) -> list[str]:
        with self._lock: return list(self._tool_call_log)

    def new_intent(self) -> None:
        with self._lock:
            self._intent_risk_used  = 0
            self._intent_tool_count = 0

    def record_success(self, tool_name: str) -> None:
        with self._lock:
            self._error_streak = 0

    def record_error(self, tool_name: str) -> None:
        with self._lock:
            self._error_streak += 1
            self._total_errors += 1

    def record_risk_used(self, risk_score: int) -> None:
        with self._lock:
            self._intent_risk_used  += risk_score
            self._intent_tool_count += 1

    def record_tool_call(self, tool_name: str, params: dict) -> None:
        key_params = {k: v for k, v in params.items() if k in ("path", "command", "pattern", "src", "dst", "url", "index")}
        sig = f"{tool_name}:{sorted(key_params.items())}"
        with self._lock:
            self._tool_call_log.append(sig)

    def detect_loop(self) -> tuple[bool, str]:
        log = self.tool_call_log
        if len(log) < MAX_LOOP_REPEAT:
            return False, ""
        recent = log[-MAX_LOOP_REPEAT:]
        if len(set(recent)) == 1:
            return True, f"Tool call identik {MAX_LOOP_REPEAT}x berturut: {recent[0]}"
        if len(log) >= 4:
            last4 = log[-4:]
            if last4[0] == last4[2] and last4[1] == last4[3]:
                return True, f"Terdeteksi loop 2-cycle: {last4[0]} ↔ {last4[1]}"
        return False, ""

    def should_stop(self) -> tuple[bool, str]:
        if self.error_streak >= MAX_ERROR_STREAK:
            return True, f"Error streak {self.error_streak}x berturut-turut"
        loop, reason = self.detect_loop()
        if loop:
            return True, reason
        return False, ""

    def evaluate_mode(self) -> str:
        es = self.error_streak
        te = self.total_errors
        ir = self.intent_risk_used
        if es >= MAX_ERROR_STREAK:              return AgentMode.SAFE_STOP
        if te >= 4 or ir >= INTENT_RISK_BUDGET: return AgentMode.DEGRADED
        if te >= 2 or ir >= WARN_THRESHOLD:     return AgentMode.CAUTIOUS
        return AgentMode.NORMAL

    def try_upgrade_mode(self) -> tuple[bool, str, str]:
        recommended = self.evaluate_mode()
        mode_order  = [AgentMode.NORMAL, AgentMode.CAUTIOUS, AgentMode.DEGRADED, AgentMode.SAFE_STOP]
        ci = mode_order.index(self.mode) if self.mode in mode_order else 0
        ri = mode_order.index(recommended) if recommended in mode_order else 0
        if ri > ci:
            old = self.mode
            self.mode = recommended
            return True, old, recommended
        return False, self.mode, self.mode


# ── Risk Computation ──────────────────────────────────────────────────────────

def _compute_risk(tool_name: str, params: dict, workspace: Path) -> tuple[int, str, list[str]]:
    base    = _BASE_RISK.get(tool_name, 2)
    score   = base
    reasons: list[str] = []

    for param_val in params.values():
        if not isinstance(param_val, str):
            continue
        if RISK_PATTERNS["sensitive_file"].search(param_val):
            score += 4
            reasons.append("file sensitif")
        if RISK_PATTERNS["system_path"].search(param_val):
            score += 5
            reasons.append("path sistem")

    if tool_name == "write_file":
        path_str = params.get("path", "")
        if path_str:
            target = workspace / path_str
            try:
                if not target.exists():
                    score -= 1
                    reasons.append("file baru")
                else:
                    size = target.stat().st_size
                    if size > 10_000:
                        score += 2
                        reasons.append(f"overwrite file {size // 1024}KB")
                    elif size > 0:
                        score += 1
                        reasons.append("overwrite file existing")
            except OSError:
                score -= 1
                reasons.append("file baru (race condition)")

    if tool_name == "bash":
        cmd = params.get("command", "")
        for danger in _ULTRA_DANGEROUS:
            if danger in cmd:
                score += 20
                reasons.append(f"perintah destruktif: {danger}")
        if "pip install" in cmd:
            score += 1
            reasons.append("modifikasi environment")

    if tool_name == "delete_file":
        if str(params.get("recursive", "false")).lower() == "true":
            score += 4
            reasons.append("delete rekursif")

    if tool_name == "find_replace_all":
        if str(params.get("dry_run", "true")).lower() == "false":
            score += 2
            reasons.append("bulk replace tanpa dry_run")

    if score >= 10:   level = "critical"
    elif score >= 6:  level = "high"
    elif score >= 3:  level = "medium"
    else:             level = "low"

    return score, level, reasons


# ── Decision Engine ────────────────────────────────────────────────────────────

class DecisionEngine:
    def __init__(self, state: AgentState, workspace: Path):
        self.state     = state
        self.workspace = workspace

    def evaluate(self, tool_name: str, params: dict) -> DecisionResult:
        if tool_name not in TOOL_REGISTRY:
            return DecisionResult(should_execute=False, reason=f"Tool '{tool_name}' tidak dikenal", risk_level="critical")

        worth, worth_reason = self._check_worth(tool_name, params)
        if not worth:
            return DecisionResult(should_execute=False, reason=worth_reason, risk_level="low")

        safe, safe_reason = self._check_safety(tool_name, params)
        if not safe:
            return DecisionResult(should_execute=False, reason=safe_reason, risk_score=999, risk_level="critical")

        risk_score, risk_level, reasons = _compute_risk(tool_name, params, self.workspace)
        reason_str = f"{risk_level} risk" + (f" — {', '.join(reasons)}" if reasons else "")
        risk_key   = self._make_risk_key(tool_name, params)

        if risk_score >= HARD_BLOCK_SINGLE_OP and risk_key not in self.state.confirmed_risks:
            return DecisionResult(should_execute=True, reason=reason_str, risk_score=risk_score, risk_level=risk_level, needs_confirm=True)

        if self.state.mode == AgentMode.DEGRADED and risk_score >= 6:
            return DecisionResult(
                should_execute=False,
                reason=f"Mode degraded: skip risk={risk_score} ({reason_str})",
                risk_score=risk_score, risk_level=risk_level,
                alternative="Verifikasi kondisi dengan tool read-only",
            )

        if self.state.intent_risk_used + risk_score > INTENT_RISK_BUDGET:
            return DecisionResult(
                should_execute=False,
                reason=f"Intent risk budget habis (used={self.state.intent_risk_used}, op={risk_score}, limit={INTENT_RISK_BUDGET}). Sampaikan progress ke user.",
                risk_score=risk_score, risk_level=risk_level,
                alternative="Laporkan progress saat ini ke user",
            )

        return DecisionResult(
            should_execute=True,
            reason=f"OK — {reason_str}",
            risk_score=risk_score,
            risk_level=risk_level,
            needs_confirm=False,
        )

    def _make_risk_key(self, tool_name: str, params: dict) -> str:
        path = params.get("path", params.get("src", params.get("url", "")))
        return f"{tool_name}:{path}"

    def _check_worth(self, tool_name: str, params: dict) -> tuple[bool, str]:
        if tool_name == "write_file":
            content = params.get("content", "")
            if not content or not content.strip():
                return False, "write_file ditolak: content kosong"
        if tool_name == "edit_file":
            old = params.get("old_string", "")
            new = params.get("new_string", "")
            if old and old == new:
                return False, "edit_file ditolak: old_string == new_string"
        if tool_name == "bash":
            if not params.get("command", "").strip():
                return False, "bash ditolak: command kosong"
        if tool_name == "browser_open":
            if not params.get("url", "").strip():
                return False, "browser_open ditolak: url kosong"
        if tool_name == "browser_input":
            if not params.get("text", "").strip():
                return False, "browser_input ditolak: text kosong"
        return True, ""

    def _check_safety(self, tool_name: str, params: dict) -> tuple[bool, str]:
        # Cek traversal HANYA pada path params, bukan content/command/text
        # Bug: scan semua params → write_file berisi konten JS dengan ".."
        # diblokir padahal bukan path traversal
        _PATH_PARAMS = {"path", "src", "dst", "url"}
        for k, v in params.items():
            if k in _PATH_PARAMS and isinstance(v, str) and v.count("..") >= 3:
                return False, f"Path traversal mencurigakan: {v}"
        if tool_name == "bash":
            cmd = params.get("command", "")
            for danger in _ULTRA_DANGEROUS:
                if danger in cmd:
                    return False, f"Perintah berbahaya diblokir: {danger}"
        return True, ""


# ── Pre-flight Checker ────────────────────────────────────────────────────────

class PreflightChecker:
    def __init__(self, workspace: Path):
        self.workspace = workspace

    def check(self, tool_name: str, params: dict) -> list[str]:
        if tool_name == "bash":
            return self._check_bash(params)
        if tool_name in ("write_file", "edit_file"):
            return self._check_file_write(tool_name, params)
        if tool_name == "read_file":
            return self._check_file_read(params)
        if tool_name == "browser_open":
            return self._check_browser_open(params)
        return []

    def _check_bash(self, params: dict) -> list[str]:
        warnings = []
        cmd = params.get("command", "")
        port_match = RISK_PATTERNS["port_conflict"].search(cmd)
        if port_match:
            try:
                port = int(port_match.group(2))
                import socket
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.settimeout(0.5)
                    if s.connect_ex(("localhost", port)) == 0:
                        warnings.append(f"⚠ Port {port} sudah dipakai — pertimbangkan port {port + 1}")
            except Exception:
                pass
        if "pip install" in cmd and "--break-system-packages" not in cmd:
            warnings.append("⚠ pip install tanpa --break-system-packages, mungkin gagal di beberapa env")
        return warnings

    def _check_file_write(self, tool_name: str, params: dict) -> list[str]:
        warnings = []
        path_str = params.get("path", "")
        if not path_str:
            return warnings
        target = self.workspace / path_str
        if target.exists() and tool_name == "write_file":
            try:
                existing_size = target.stat().st_size
                new_size      = len(params.get("content", "").encode("utf-8"))
                if existing_size > 0 and new_size < existing_size * 0.3:
                    warnings.append(
                        f"⚠ Content baru ({new_size}B) jauh lebih kecil dari file lama ({existing_size}B) — kemungkinan data hilang"
                    )
            except OSError:
                pass
        if not target.parent.exists():
            warnings.append(f"⚠ Direktori '{target.parent.name}' belum ada — akan dibuat otomatis")
        return warnings

    def _check_file_read(self, params: dict) -> list[str]:
        path_str = params.get("path", "")
        if path_str and not (self.workspace / path_str).exists():
            return [f"⚠ File '{path_str}' tidak ditemukan"]
        return []

    def _check_browser_open(self, params: dict) -> list[str]:
        warnings = []
        url = params.get("url", "")
        if url and not url.startswith(("http://", "https://")):
            warnings.append("⚠ URL tanpa scheme — akan ditambah https:// otomatis")
        return warnings


# ── Validation Layer ──────────────────────────────────────────────────────────

class ValidationLayer:
    def __init__(self, workspace: Path):
        self.workspace = workspace

    def validate(self, tool_name: str, params: dict, output: str) -> tuple[bool, str]:
        if output.startswith("[Error]") or output.startswith("[Blocked]"):
            return False, f"Tool error: {output[:120]}"
        if tool_name == "write_file":
            return self._validate_write(params, output)
        if tool_name == "bash":
            return self._validate_bash(output)
        if tool_name == "edit_file":
            return self._validate_edit(params, output)
        if tool_name in ("browser_open", "browser_click", "browser_input"):
            if "[Error]" in output[:30]:
                return False, f"Browser tool gagal: {output[:120]}"
            return True, "OK"
        if tool_name == "browser_state":
            if "[Error]" in output[:30]:
                return False, f"browser_state gagal: {output[:120]}"
            return True, "OK"
        return True, "OK"

    def _validate_write(self, params: dict, output: str) -> tuple[bool, str]:
        path_str = params.get("path", "")
        if not path_str:
            return True, "OK"
        target = self.workspace / path_str
        if not target.exists():
            return False, f"File tidak ada setelah write: {path_str}"
        if target.stat().st_size == 0:
            return False, f"File kosong setelah write: {path_str}"
        ext = target.suffix.lower()
        if ext == ".py":
            import subprocess
            r = subprocess.run(
                ["python3", "-m", "py_compile", str(target)],
                capture_output=True, text=True, timeout=10,
            )
            if r.returncode != 0:
                return False, f"Syntax error Python: {r.stderr.strip()[:200]}"
        elif ext == ".json":
            try:
                json.loads(target.read_text(encoding="utf-8"))
            except Exception as e:
                return False, f"JSON tidak valid: {e}"
        return True, f"valid ({ext or 'file'})"

    def _validate_bash(self, output: str) -> tuple[bool, str]:
        m = re.search(r"\[exit: (\d+)", output)
        if m and int(m.group(1)) != 0:
            return False, f"Bash exit code {m.group(1)}"
        if "Traceback (most recent call last)" in output and "exit: 0" not in output:
            return False, "Python traceback terdeteksi"
        return True, "OK"

    def _validate_edit(self, params: dict, output: str) -> tuple[bool, str]:
        path_str = params.get("path", "")
        if not path_str:
            return True, "OK"
        target = self.workspace / path_str
        if not target.exists():
            return False, f"File tidak ada setelah edit: {path_str}"
        if target.suffix.lower() == ".py":
            import subprocess
            r = subprocess.run(
                ["python3", "-m", "py_compile", str(target)],
                capture_output=True, text=True, timeout=10,
            )
            if r.returncode != 0:
                return False, f"Syntax error Python setelah edit: {r.stderr.strip()[:200]}"
        return True, "OK"


# ── Browser output helpers ────────────────────────────────────────────────────

def _strip_raw_section(output: str) -> str:
    """Buang __RAW__ block — agent dapat versi bersih, user tidak lihat noise."""
    if "__RAW__" not in output:
        return output
    return output[:output.index("__RAW__")].strip()


def _extract_raw_section(output: str) -> str:
    """Ambil raw DOM dari __RAW__ block untuk summarization."""
    if "__RAW__" not in output:
        return output
    return output[output.index("__RAW__") + len("__RAW__"):].strip()


def _summarize_browser_output(
    tool_name: str,
    params:    dict,
    output:    str,
    model:     str,
) -> str:
    """
    Inject AI summarization setelah browser_open / browser_state.
    User melihat ringkasan natural language — bukan raw DOM.
    """
    raw          = _extract_raw_section(output)
    clean_output = _strip_raw_section(output)

    if not raw or len(raw.strip()) < 20:
        return clean_output

    if tool_name == "browser_open":
        url    = params.get("url", "halaman ini")
        prompt = (
            f"Kamu adalah asisten yang merangkum hasil browsing web untuk user.\n\n"
            f"User baru membuka: {url}\n\n"
            f"Ini adalah output dari tool browser (elemen halaman yang terdeteksi):\n"
            f"---\n{raw[:3000]}\n---\n\n"
            f"Tulis ringkasan singkat (3-6 kalimat) dalam bahasa yang sama dengan user yang menjelaskan:\n"
            f"1. Halaman apa yang berhasil dibuka\n"
            f"2. Konten utama / isi halaman secara singkat\n"
            f"3. Aksi apa yang tersedia (login, search, menu, dll) — kalau ada\n\n"
            f"Jangan sebut 'elemen DOM', 'index', atau istilah teknis. "
            f"Tulis seperti manusia mendeskripsikan halaman web."
        )
    elif tool_name == "browser_state":
        prompt = (
            f"Kamu adalah asisten yang mendeskripsikan isi halaman web untuk user.\n\n"
            f"Ini adalah daftar elemen interaktif di halaman saat ini:\n"
            f"---\n{raw[:3000]}\n---\n\n"
            f"Tulis deskripsi singkat (2-4 kalimat) yang menjelaskan:\n"
            f"1. Halaman apa ini kira-kira berdasarkan elemen yang ada\n"
            f"2. Apa saja yang bisa dilakukan user (klik apa, isi apa)\n\n"
            f"Setelah deskripsi, tampilkan daftar aksi yang tersedia dalam format:\n"
            f"**Aksi tersedia:**\n"
            f"- [nomor] Nama aksi\n\n"
            f"Gunakan bahasa natural, bukan istilah teknis seperti 'DOM element' atau 'index'."
        )
    else:
        return clean_output

    try:
        summary = call_gemini(prompt, model=model)
        return summary.strip() + "\n\n---\n" + clean_output
    except Exception as e:
        logger.warning("_summarize_browser_output failed: %s", e)
        return clean_output


# ── System Prompt ─────────────────────────────────────────────────────────────

_TOOL_SIGNATURES: dict[str, dict] = {
    "read_file":        {"desc": "Baca isi file dengan pagination",                              "params": [("path","wajib","path file relatif ke workspace"),("offset","opsional","baris awal, default 1"),("limit","opsional","jumlah baris, default 500")],                                                                                                                                                    "example": "<path>src/main.py</path>\n<offset>1</offset>\n<limit>100</limit>"},
    "write_file":       {"desc": "Tulis atau timpa file (seluruh isi)",                          "params": [("path","wajib","path file"),("content","wajib","isi file lengkap"),("backup","opsional","true untuk simpan .bak sebelum overwrite")],                                                                                                                                                                "example": "<path>hello.py</path>\n<content>print('Hello')</content>"},
    "edit_file":        {"desc": "Ganti satu kemunculan teks dalam file (old_string harus unik)","params": [("path","wajib","path file"),("old_string","wajib","teks lama yang unik dalam file"),("new_string","wajib","teks pengganti")],                                                                                                                                                                     "example": "<path>src/main.py</path>\n<old_string>def foo():\n    pass</old_string>\n<new_string>def foo():\n    return 42</new_string>"},
    "bash":             {"desc": "Jalankan perintah shell di dalam workspace",                   "params": [("command","wajib","perintah shell"),("timeout","opsional","batas waktu detik, default 30, maks 300")],                                                                                                                                                                                               "example": "<command>python3 -m pytest tests/ -v</command>\n<timeout>60</timeout>"},
    "glob":             {"desc": "Cari file berdasarkan pola glob",                              "params": [("pattern","wajib","pola glob, misal **/*.py"),("path","opsional","direktori awal, default .")],                                                                                                                                                                                                     "example": "<pattern>**/*.py</pattern>\n<path>src</path>"},
    "grep":             {"desc": "Cari teks/regex dalam file secara rekursif",                   "params": [("pattern","wajib","regex atau teks yang dicari"),("path","opsional","direktori, default ."),("file_glob","opsional","filter ekstensi, default *"),("context_lines","opsional","baris konteks sebelum/sesudah, default 0"),("case_sensitive","opsional","true/false, default false")],                 "example": "<pattern>def main</pattern>\n<path>src</path>\n<file_glob>*.py</file_glob>\n<context_lines>2</context_lines>"},
    "ls":               {"desc": "Tampilkan isi direktori",                                      "params": [("path","opsional","direktori, default .")],                                                                                                                                                                                                                                                          "example": "<path>src</path>"},
    "tree":             {"desc": "Tampilkan struktur direktori rekursif",                        "params": [("path","opsional","direktori, default ."),("max_depth","opsional","kedalaman maks, default 3"),("show_size","opsional","true untuk tampilkan ukuran file")],                                                                                                                                          "example": "<path>.</path>\n<max_depth>3</max_depth>"},
    "move_file":        {"desc": "Pindahkan atau rename file/direktori",                         "params": [("src","wajib","path sumber"),("dst","wajib","path tujuan")],                                                                                                                                                                                                                                         "example": "<src>old_name.py</src>\n<dst>new_name.py</dst>"},
    "copy_file":        {"desc": "Salin file atau direktori",                                    "params": [("src","wajib","path sumber"),("dst","wajib","path tujuan")],                                                                                                                                                                                                                                         "example": "<src>template/</src>\n<dst>my_project/</dst>"},
    "delete_file":      {"desc": "Hapus file atau direktori",                                    "params": [("path","wajib","path yang akan dihapus"),("recursive","opsional","true untuk hapus direktori beserta isinya")],                                                                                                                                                                                     "example": "<path>old_file.py</path>"},
    "find_replace_all": {"desc": "Cari & ganti regex di banyak file sekaligus",                 "params": [("pattern","wajib","regex yang dicari"),("replacement","wajib","teks pengganti"),("path","opsional","direktori, default ."),("file_glob","opsional","filter file, default *"),("case_sensitive","opsional","true/false, default false"),("dry_run","opsional","true = preview saja. Default true")],  "example": "<pattern>old_fn</pattern>\n<replacement>new_fn</replacement>\n<file_glob>*.py</file_glob>\n<dry_run>false</dry_run>"},
    "browser_open":     {"desc": "Buka URL di browser (fresh Chromium session).",               "params": [("url","wajib","URL lengkap, misal https://google.com")],                                                                                                                                                                                                                                             "example": "<url>https://example.com</url>"},
    "browser_state":    {"desc": "Lihat elemen interaktif di halaman saat ini beserta index-nya. Panggil sebelum browser_click / browser_input.", "params": [],                                                                                                                                                                                                                                                  "example": ""},
    "browser_click":    {"desc": "Klik elemen berdasarkan index dari hasil browser_state.",      "params": [("index","wajib","nomor index elemen dari browser_state")],                                                                                                                                                                                                                                          "example": "<index>2</index>"},
    "browser_input":    {"desc": "Isi input field berdasarkan index dari hasil browser_state.",  "params": [("index","wajib","nomor index field dari browser_state"),("text","wajib","teks yang akan diisi")],                                                                                                                                                                                                  "example": "<index>0</index>\n<text>hello@example.com</text>"},
}


def _build_tool_docs() -> str:
    lines = []
    for name, info in _TOOL_SIGNATURES.items():
        if name not in TOOL_REGISTRY:
            continue
        lines.append(f"**{name}** — {info['desc']}")
        lines.append("```xml")
        lines.append("<tool_call>")
        lines.append(f"<name>{name}</name>")
        if info["example"]:
            lines.append(info["example"])
        lines.append("</tool_call>")
        lines.append("```")
        if info["params"]:
            param_strs = [f"`{p[0]}` ({p[1]}): {p[2]}" for p in info["params"]]
            lines.append("Parameter: " + " · ".join(param_strs))
        lines.append("")
    return "\n".join(lines)


def build_system_prompt(workspace: str | Path | None = None) -> str:
    if workspace:
        cwd = Path(workspace).resolve()
    else:
        ws_env = os.environ.get("CLAW_WORKSPACE", "")
        cwd = Path(ws_env).resolve() if ws_env else Path.cwd()

    tool_docs  = _build_tool_docs()
    tool_names = ", ".join(f"`{n}`" for n in TOOL_REGISTRY)

    return f"""Kamu adalah AI assistant yang adaptif dan multi-capable. Kamu bisa beroperasi dalam berbagai mode: casual conversation, software engineering, research analysis, file management, web browsing, dan general task execution.

## Zero-Shot Adaptive Behavior

**Deteksi intent dari user message dan adapt secara otomatis:**

- **CASUAL** (greeting, small talk, tanya kabar, thanks) → Response natural dan friendly. Jangan forcing technical context. Jangan mention workspace kecuali user nanya.
- **CODING** (programming, debugging, software dev) → Switch to engineer mode: decisive, default-aware, execute-first. Mention workspace jika relevan.
- **RESEARCH** (data analysis, scraping, report) → Methodical: plan, execute systematically, report dengan insight.
- **FILE_OPS** (organize files, batch rename, convert) → Careful, scan dulu, backup awareness.
- **DEVOPS** (deploy, setup env, server config) → Cautious, check-before-change, rollback plan.
- **WEB** (browsing, scraping, cek website, isi form) → Gunakan browser tools: open → state → click/input. Selalu state dulu sebelum interaksi.
- **GENERAL** (task executable via shell) → Pragmatic, pick sensible defaults.

**Jangan pernah:**
- Asumsikan user selalu mau coding
- Tanya "Mau FastAPI atau Flask?" — pilih sendiri, state reasoning singkat
- Konfirmasi untuk operasi reversible (write file baru, install package, hapus file kecil)
- Pakai `<ask_user>` untuk preferensi minor (styling, naming convention)

**Selalu:**
- Bahasa sesuai user (Indonesia/English/mixed)
- Stop dan lapor kalau 3x error berturut atau genuinely stuck
- Untuk web tasks: browser_open → browser_state → browser_click/browser_input (urutan ini wajib)

## Mandatory Reasoning Protocol

Sebelum response substantif atau tool execution, WAJIB berpikir dulu:

<thinking>
1. Intent: [casual/coding/research/file_ops/devops/web/general]
2. Context: [relevant info dari history/workspace]
3. Approach: [strategi singkat]
4. Risk: [kalau ada tool calls, assess risk level]
</thinking>

## Available Tools ({len(TOOL_REGISTRY)}): {tool_names}

Gunakan `<tool_call>` untuk eksekusi. Bisa multiple tool parallel.

{tool_docs}

## Environment
- Workspace: `{cwd}` (gunakan hanya jika relevan dengan task)
- Python 3.11, Node.js 20, Git, curl, wget
- Browser: Chromium via browser-use CLI (fresh session, no login)
"""


# ── Parser ────────────────────────────────────────────────────────────────────

_THINKING_RE    = re.compile(r"<thinking>(.*?)</thinking>",          re.DOTALL)
_TOOL_CALL_RE   = re.compile(r"<tool_call>(.*?)</tool_call>",        re.DOTALL)
_TOOL_RESULT_RE = re.compile(r"<tool_result[^>]*>.*?</tool_result>", re.DOTALL)
_ASK_USER_RE    = re.compile(r"<ask_user>(.*?)</ask_user>",          re.DOTALL)
_TAG_RE         = re.compile(r"<(\w+)>(.*?)</\1>",                   re.DOTALL)
_CDATA_RE       = re.compile(r"<!\[CDATA\[(.*?)\]\]>",               re.DOTALL)
_CODE_BLOCK_RE  = re.compile(r"```.*?```",                            re.DOTALL)


def _strip_cdata(text: str) -> str:
    return _CDATA_RE.sub(lambda m: m.group(1), text)


def parse_thinking(text: str) -> str | None:
    m = _THINKING_RE.search(text)
    return m.group(1).strip() if m else None


def parse_tool_calls(text: str) -> list[dict]:
    calls      = []
    clean_text = _THINKING_RE.sub("", text)
    for m in _TOOL_CALL_RE.finditer(clean_text):
        block  = m.group(1)
        params: dict[str, str] = {}
        for tag in _TAG_RE.finditer(block):
            key, val = tag.group(1), tag.group(2)
            if key == "thinking":
                continue
            params[key] = _strip_cdata(val).strip()
        name = params.pop("name", None)
        if name:
            calls.append({"name": name.strip(), "params": params})
    return calls


def parse_ask_user(text: str) -> str | None:
    clean_text = _THINKING_RE.sub("", text)
    m          = _ASK_USER_RE.search(clean_text)
    return m.group(1).strip() if m else None


def strip_tool_calls(text: str) -> str:
    cleaned = _TOOL_CALL_RE.sub("", text)
    cleaned = _TOOL_RESULT_RE.sub("", cleaned)
    cleaned = _ASK_USER_RE.sub(r"\1", cleaned)
    cleaned = _THINKING_RE.sub("", cleaned)

    placeholders: list[str] = []

    def _protect(m: re.Match) -> str:
        placeholders.append(m.group(0))
        return f"\x00CB{len(placeholders)-1}\x00"

    protected = _CODE_BLOCK_RE.sub(_protect, cleaned)
    protected = re.sub(r"\n{4,}", "\n\n\n", protected)
    for i, block in enumerate(placeholders):
        protected = protected.replace(f"\x00CB{i}\x00", block)
    return protected.strip()


# ── Context Management ────────────────────────────────────────────────────────

def _truncate_history(system: str, conversation: list[dict], max_chars: int = MAX_PROMPT_CHARS) -> list[dict]:
    system_chars = len(system)
    budget       = max_chars - system_chars
    must_keep    = conversation[-MIN_HISTORY_TURNS * 2:]
    optional     = conversation[: len(conversation) - len(must_keep)]
    kept:   list[dict] = []
    remaining = budget - sum(len(t.get("content", "")) for t in must_keep)

    for turn in reversed(optional):
        turn_len = len(turn.get("content", ""))
        if remaining - turn_len < 0:
            break
        kept.insert(0, turn)
        remaining -= turn_len

    truncated = conversation[: len(conversation) - len(must_keep) - len(kept)]
    if truncated:
        first_keep_role = must_keep[0]["role"] if must_keep else "assistant"
        notice_role = "assistant" if first_keep_role == "user" else "user"
        kept.insert(0, {
            "role":    notice_role,
            "content": f"[Catatan: {len(truncated)} pesan lama dihilangkan untuk menghemat konteks]",
        })

    return kept + must_keep


def _build_full_prompt(system: str, conversation: list[dict]) -> str:
    truncated = _truncate_history(system, conversation)
    lines     = [system, ""]
    for turn in truncated:
        role = "User" if turn["role"] == "user" else "Assistant"
        lines.append(f"{role}: {turn['content']}")
    lines.append("Assistant:")
    return "\n".join(lines)


def _render_result(
    name:            str,
    params:          dict,
    output:          str,
    warnings:        list[str] | None = None,
    validation_note: str | None       = None,
) -> str:
    # Browser tools: strip __RAW__ sebelum masuk ke prompt agent
    if name in _BROWSER_SUMMARIZE_TOOLS:
        output = _strip_raw_section(output)

    param_str = ", ".join(f"{k}={v!r}" for k, v in params.items())
    extra     = ""
    if warnings:
        extra += "\n[PREFLIGHT WARNINGS]\n" + "\n".join(warnings)
    if validation_note and validation_note not in ("OK", "blocked"):
        extra += f"\n[VALIDATION] {validation_note}"
    return f'\n<tool_result name="{name}" params="{param_str}">\n{output}{extra}\n</tool_result>\n'


# ── Retry Helper ──────────────────────────────────────────────────────────────

def _call_with_retry(
    prompt:     str,
    model:      str,
    attempts:   int   = RETRY_ATTEMPTS,
    base_delay: float = RETRY_BASE_DELAY,
) -> str:
    last_exc: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            return call_gemini(prompt, model=model)
        except GeminiAPIError as e:
            last_exc = e
            if attempt == attempts:
                break
            delay = base_delay * (2 ** (attempt - 1))
            logger.warning("Gemini retry %d/%d in %.1fs: %s", attempt, attempts, delay, e)
            time.sleep(delay)
    raise GeminiAPIError(f"Gagal setelah {attempts} percobaan: {last_exc}") from last_exc


# ── Confirm Resolution ────────────────────────────────────────────────────────

@dataclass
class _ResolvedTool:
    decision: DecisionResult
    approved: bool


def _resolve_confirms(
    tool_calls:      list[dict],
    decision_engine: DecisionEngine,
    state:           AgentState,
    on_confirm:      Callable | None,
    on_warning:      Callable | None,
    confirm_timeout: int                    = DEFAULT_CONFIRM_TIMEOUT,
    stop_event:      threading.Event | None = None,
) -> dict[int, _ResolvedTool]:
    resolved: dict[int, _ResolvedTool] = {}
    pending:  list[dict]               = []

    for i, tc in enumerate(tool_calls):
        decision = decision_engine.evaluate(tc["name"], tc["params"])

        if not decision.should_execute:
            resolved[i] = _ResolvedTool(decision=decision, approved=False)
            continue

        if not decision.needs_confirm:
            resolved[i] = _ResolvedTool(decision=decision, approved=True)
            continue

        risk_key       = decision_engine._make_risk_key(tc["name"], tc["params"])
        display_params = {k: v for k, v in tc["params"].items() if k in ("path", "command", "src", "dst", "pattern", "url", "index")}
        pending.append({
            "index":      i,
            "key":        risk_key,
            "name":       tc["name"],
            "params":     display_params,
            "risk_score": decision.risk_score,
            "risk_level": decision.risk_level,
            "reason":     decision.reason,
            "_decision":  decision,
        })

    if not pending:
        return resolved

    if on_confirm is None:
        for item in pending:
            if on_warning:
                on_warning(f"⚠ Menjalankan operasi berisiko tanpa konfirmasi ({item['risk_level']}): {item['name']}")
            resolved[item["index"]] = _ResolvedTool(decision=item["_decision"], approved=True)
        return resolved

    if stop_event and stop_event.is_set():
        for item in pending:
            resolved[item["index"]] = _ResolvedTool(decision=item["_decision"], approved=False)
        return resolved

    pending_for_frontend = [{k: v for k, v in item.items() if k != "_decision"} for item in pending]

    result_holder: list[dict] = []
    confirm_done  = threading.Event()

    def _call_confirm():
        try:
            result_holder.append(on_confirm(pending_for_frontend, confirm_timeout))
        except Exception as e:
            logger.warning("on_confirm exception: %s", e)
            result_holder.append({})
        finally:
            confirm_done.set()

    threading.Thread(target=_call_confirm, daemon=True).start()

    elapsed = 0.0
    while elapsed < confirm_timeout + 5:
        if confirm_done.is_set():
            break
        if stop_event and stop_event.is_set():
            for item in pending:
                resolved[item["index"]] = _ResolvedTool(decision=item["_decision"], approved=False)
            return resolved
        time.sleep(0.5)
        elapsed += 0.5

    decisions = result_holder[0] if result_holder else {}

    for item in pending:
        key      = item["key"]
        approved = decisions.get(key, False)
        resolved[item["index"]] = _ResolvedTool(decision=item["_decision"], approved=approved)
        if approved:
            state.confirmed_risks.add(key)
        else:
            logger.info("Confirm rejected: %s", key)

    return resolved


# ── Parallel Tool Executor ────────────────────────────────────────────────────

def _execute_tools_parallel(
    tool_calls:      list[dict],
    on_tool_start:   Callable | None,
    on_tool_result:  Callable | None,
    workspace:       Path,
    decision_engine: DecisionEngine,
    preflight:       PreflightChecker,
    validator:       ValidationLayer,
    state:           AgentState,
    model:           str                    = DEFAULT_MODEL,
    on_blocked:      Callable | None        = None,
    on_warning:      Callable | None        = None,
    on_confirm:      Callable | None        = None,
    confirm_timeout: int                    = DEFAULT_CONFIRM_TIMEOUT,
    stop_event:      threading.Event | None = None,
) -> list[tuple[str, dict, str, list[str], str]]:

    resolved = _resolve_confirms(
        tool_calls, decision_engine, state,
        on_confirm, on_warning, confirm_timeout, stop_event,
    )

    results: list[tuple | None] = [None] * len(tool_calls)

    def _run(index: int, name: str, params: dict) -> tuple[int, str, list[str], str]:
        if stop_event and stop_event.is_set():
            return index, "[BLOCKED] Agent dihentikan", [], "stopped"

        set_workspace(workspace)

        rt: _ResolvedTool = resolved.get(index, _ResolvedTool(
            decision=DecisionResult(should_execute=False, reason="Tidak ada decision"),
            approved=False,
        ))

        if not rt.approved or not rt.decision.should_execute:
            if not rt.approved and rt.decision.should_execute:
                reason      = f"User menolak konfirmasi ({rt.decision.risk_level} risk)"
                blocked_msg = f"[BLOCKED] Ditolak user: {name}"
            else:
                reason      = rt.decision.reason
                blocked_msg = f"[BLOCKED] {reason}"
                if rt.decision.alternative:
                    blocked_msg += f"\nAlternatif: {rt.decision.alternative}"

            logger.warning("Blocked [%d]: %s — %s", index, name, reason)
            if on_blocked:
                on_blocked(name, reason, rt.decision.risk_level)
            if on_tool_result:
                on_tool_result(name, blocked_msg)
            return index, blocked_msg, [], "blocked"

        warnings = preflight.check(name, params)
        for w in warnings:
            if on_warning:
                on_warning(w)

        state.record_tool_call(name, params)
        if on_tool_start:
            on_tool_start(name, params)

        output = ""
        for attempt in range(1, MAX_TOOL_RETRY + 1):
            if stop_event and stop_event.is_set():
                output = "[BLOCKED] Agent dihentikan saat eksekusi"
                break
            t0      = time.monotonic()
            output  = dispatch(name, params)
            elapsed = time.monotonic() - t0
            logger.info("Tool [%d] %s attempt %d — %.2fs", index, name, attempt, elapsed)
            if not output.startswith("[Error]"):
                break
            if attempt < MAX_TOOL_RETRY:
                logger.warning("Retry %d/%d: %s — %s", attempt, MAX_TOOL_RETRY, name, output[:80])
                time.sleep(0.5 * attempt)

        is_valid, validation_note = validator.validate(name, params, output)
        if not is_valid:
            output += f"\n[VALIDATION FAILED] {validation_note}"
            state.record_error(name)
        else:
            state.record_success(name)
            state.record_risk_used(rt.decision.risk_score)

        # [BROWSER-UX] Summarize untuk user, raw tetap di output untuk history
        display_output = output
        if name in _BROWSER_SUMMARIZE_TOOLS and is_valid:
            display_output = _summarize_browser_output(name, params, output, model)

        if on_tool_result:
            on_tool_result(name, display_output)

        return index, output, warnings, validation_note

    with ThreadPoolExecutor(max_workers=MAX_TOOL_WORKERS) as executor:
        futures = {executor.submit(_run, i, tc["name"], tc["params"]): i for i, tc in enumerate(tool_calls)}
        for future in as_completed(futures):
            try:
                idx, output, warnings, validation_note = future.result()
                tc           = tool_calls[idx]
                results[idx] = (tc["name"], tc["params"], output, warnings, validation_note)
            except Exception as e:
                idx = futures[future]
                tc  = tool_calls[idx]
                err = f"[Error] Tool crash: {e}"
                logger.exception("Tool crash: %s", tc["name"])
                state.record_error(tc["name"])
                if on_tool_result:
                    on_tool_result(tc["name"], err)
                results[idx] = (tc["name"], tc["params"], err, [], "crash")

    return [r for r in results if r is not None]


# ── AgentLoop ─────────────────────────────────────────────────────────────────

class AgentLoop:
    def __init__(
        self,
        model:           str               = DEFAULT_MODEL,
        workspace:       str | Path | None = None,
        max_turns:       int               = DEFAULT_MAX_TURNS,
        confirm_timeout: int               = DEFAULT_CONFIRM_TIMEOUT,
    ):
        self.model           = model
        self.max_turns       = max(1, max_turns)
        self.confirm_timeout = confirm_timeout
        self.workspace       = Path(workspace).resolve() if workspace else None
        self._system         = build_system_prompt(workspace)

    def run(
        self,
        user_input:             str,
        conversation:           list[dict],
        on_text:                Callable | None         = None,
        on_thinking:            Callable | None         = None,
        on_tool_start:          Callable | None         = None,
        on_tool_result:         Callable | None         = None,
        on_turn:                Callable | None         = None,
        on_warning:             Callable | None         = None,
        on_blocked:             Callable | None         = None,
        on_mode_change:         Callable | None         = None,
        on_confirm:             Callable | None         = None,
        on_question:            Callable | None         = None,
        on_checkpoint:          Callable | None         = None,   # [CHECKPOINT] (turn_count, conversation)
        on_conversation_update: Callable | None         = None,   # [SESSION]    (conversation)
        stop_event:             threading.Event | None  = None,
    ) -> tuple[str, list[dict]]:
        ws = self.workspace
        if ws:
            set_workspace(ws)

        state     = AgentState()
        decision  = DecisionEngine(state, ws or Path.cwd())
        preflight = PreflightChecker(ws or Path.cwd())
        validator = ValidationLayer(ws or Path.cwd())

        conversation = list(conversation)
        conversation.append({"role": "user", "content": user_input})
        state.new_intent()

        # [SESSION] Persist user message langsung masuk
        if on_conversation_update:
            on_conversation_update(conversation)

        final_text  = ""
        turn_count  = 0
        total_tools = 0

        logger.info(
            "AgentLoop.run: model=%s workspace=%s max_turns=%d confirm_timeout=%d",
            self.model, ws, self.max_turns, self.confirm_timeout,
        )

        while turn_count < self.max_turns:
            if stop_event and stop_event.is_set():
                final_text = "[Agent dihentikan oleh sistem]"
                conversation.append({"role": "assistant", "content": final_text})
                if on_conversation_update:
                    on_conversation_update(conversation)
                break

            turn_count       += 1
            state.turn_count  = turn_count

            if turn_count > 1:
                last = conversation[-1]
                if last["role"] == "user" and not last["content"].strip().startswith("<tool_result"):
                    state.new_intent()
                    logger.debug("Turn %d: new intent — risk budget reset", turn_count)

            should_stop, stop_reason = state.should_stop()
            if should_stop:
                final_text = (
                    f"⚠ **Agent berhenti secara aman.**\n\n"
                    f"Alasan: {stop_reason}\n\n"
                    f"Status: {turn_count} turn, {total_tools} tool calls.\n\n"
                    f"Silakan coba lagi dengan instruksi yang lebih spesifik."
                )
                logger.warning("AgentLoop SAFE STOP: %s", stop_reason)
                state.mode = AgentMode.SAFE_STOP
                if on_text:
                    on_text(final_text)
                conversation.append({"role": "assistant", "content": final_text})
                if on_conversation_update:
                    on_conversation_update(conversation)
                break

            changed, old_mode, new_mode = state.try_upgrade_mode()
            if changed:
                logger.warning("AgentLoop mode: %s → %s", old_mode, new_mode)
                if on_mode_change:
                    on_mode_change(
                        old_mode, new_mode,
                        f"total_errors={state.total_errors}, intent_risk={state.intent_risk_used}/{INTENT_RISK_BUDGET}",
                    )

            prompt = _build_full_prompt(self._system, conversation)
            logger.debug("Turn %d/%d — %d chars", turn_count, self.max_turns, len(prompt))

            try:
                raw_reply = _call_with_retry(prompt, model=self.model)
            except GeminiAPIError as e:
                err_msg = f"[Error API] {e}"
                logger.error("AgentLoop API error: %s", e)
                if on_text:
                    on_text(err_msg)
                conversation.append({"role": "assistant", "content": err_msg})
                if on_conversation_update:
                    on_conversation_update(conversation)
                return err_msg, conversation

            thinking_content = parse_thinking(raw_reply)
            if thinking_content and on_thinking:
                on_thinking(thinking_content)

            tool_calls   = parse_tool_calls(raw_reply)
            ask_question = parse_ask_user(raw_reply)
            visible_text = strip_tool_calls(raw_reply)

            if visible_text and on_text:
                on_text(visible_text)

            if on_turn:
                on_turn(turn_count, len(tool_calls))

            if ask_question:
                if tool_calls:
                    logger.warning(
                        "Turn %d: model campur ask_user + %d tool_call — semua tool di-hold",
                        turn_count, len(tool_calls),
                    )
                conversation.append({"role": "assistant", "content": raw_reply})
                if on_conversation_update:
                    on_conversation_update(conversation)
                final_text = visible_text
                if on_question:
                    on_question(ask_question)
                logger.info("Turn %d: ask_user emitted, loop paused", turn_count)
                break

            if not tool_calls:
                conversation.append({"role": "assistant", "content": raw_reply})
                if on_conversation_update:
                    on_conversation_update(conversation)
                final_text = visible_text
                logger.info("AgentLoop done: %d turns, %d tools", turn_count, total_tools)
                break

            # [CHECKPOINT] Simpan sebelum eksekusi tool — titik recovery kalau crash
            if on_checkpoint:
                checkpoint_conv = list(conversation) + [{"role": "assistant", "content": raw_reply}]
                on_checkpoint(turn_count, checkpoint_conv)

            total_tools += len(tool_calls)
            logger.info("Turn %d: %d tool(s)", turn_count, len(tool_calls))

            executed = _execute_tools_parallel(
                tool_calls,
                on_tool_start,
                on_tool_result,
                workspace        = ws or Path.cwd(),
                decision_engine  = decision,
                preflight        = preflight,
                validator        = validator,
                state            = state,
                model            = self.model,
                on_blocked       = on_blocked,
                on_warning       = on_warning,
                on_confirm       = on_confirm,
                confirm_timeout  = self.confirm_timeout,
                stop_event       = stop_event,
            )

            tool_results_block = "".join(
                _render_result(name, params, output, warnings, validation_note)
                for name, params, output, warnings, validation_note in executed
            )

            conversation.append({"role": "assistant", "content": raw_reply})
            conversation.append({"role": "user",      "content": tool_results_block.strip()})

            # [SESSION] Persist setelah tool result masuk ke conversation
            if on_conversation_update:
                on_conversation_update(conversation)

        else:
            final_text = (
                f"[Batas maksimum {self.max_turns} turn tercapai. "
                f"Total tool calls: {total_tools}. "
                f"Coba pecah tugas menjadi langkah yang lebih kecil.]"
            )
            logger.warning("AgentLoop hit max_turns=%d", self.max_turns)
            conversation.append({"role": "assistant", "content": final_text})
            if on_conversation_update:
                on_conversation_update(conversation)
            if on_text:
                on_text(final_text)

        return final_text, conversation
