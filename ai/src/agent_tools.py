"""
agent_tools.py — Implementasi tools untuk coding agent.

Fixes:
- [L2] get_workspace() fallback sekarang .resolve() path agar konsisten dengan set_workspace()
- [BROWSER-UX] browser_open() dan browser_state() return format manusiawi, bukan raw DOM
- [BROWSER-PATH] _find_bin() helper untuk cari binary di PATH + ~/.local/bin
- [BROWSER-PATH] python3 -m playwright, bukan bare 'playwright'
"""
from __future__ import annotations

import html
import logging
import os
import re
import shutil
import subprocess
import threading
import time
from pathlib import Path
from typing import Callable

logger = logging.getLogger(__name__)

# ── Konstanta ──────────────────────────────────────────────────────────────────

MAX_FILE_SIZE   = 200_000
MAX_OUTPUT      = 20_000
MAX_GLOB_RESULT = 300
MAX_GREP_RESULT = 300
GLOB_TIMEOUT    = 10.0
DEFAULT_TIMEOUT = 30
MAX_TIMEOUT     = 300

_DESTRUCTIVE_PATTERNS = re.compile(
    r"\b(rm\s+-rf|mkfs|dd\s+if=|:\(\)\s*\{|shutdown|reboot|halt|"
    r"chmod\s+-R\s+777|chown\s+-R|truncate\s+--size=0|"
    r">\s*/dev/sd|format\s+[A-Za-z]:)\b",
    re.IGNORECASE,
)

_BINARY_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".tiff",
    ".mp4", ".mp3", ".wav", ".ogg", ".flac",
    ".zip", ".tar", ".gz", ".bz2", ".xz", ".7z", ".rar",
    ".exe", ".dll", ".so", ".dylib", ".bin",
    ".pdf", ".docx", ".xlsx", ".pptx",
    ".pyc", ".pyo", ".class", ".wasm",
}

# ── Per-thread workspace ───────────────────────────────────────────────────────

_local = threading.local()


def get_workspace() -> Path:
    if hasattr(_local, "root"):
        return _local.root
    ws = os.environ.get("CLAW_WORKSPACE", "")
    base = Path(ws).resolve() if ws else Path("/tmp/workspace").resolve()
    base.mkdir(parents=True, exist_ok=True)
    _local.root = base
    return base


def set_workspace(path: str | Path) -> Path:
    p = Path(path).resolve()
    p.mkdir(parents=True, exist_ok=True)
    _local.root = p
    logger.debug("Workspace set: %s (thread=%s)", p, threading.current_thread().name)
    return p


# ── Helpers ───────────────────────────────────────────────────────────────────

def _truncate(text: str, limit: int = MAX_OUTPUT) -> str:
    if len(text) <= limit:
        return text
    half    = limit // 2
    omitted = len(text) - limit
    return (
        text[:half]
        + f"\n\n... [⚠ {omitted:,} karakter dihilangkan] ...\n\n"
        + text[-half:]
    )


def _safe_path(raw: str) -> Path:
    ws        = get_workspace()
    candidate = (ws / raw).resolve()
    ws_str    = str(ws.resolve())
    if candidate != ws.resolve() and not str(candidate).startswith(ws_str + os.sep):
        raise PermissionError(f"Akses ditolak: path '{raw}' berada di luar workspace")
    return candidate


def _fmt_size(size: int) -> str:
    if size < 1024:
        return f"{size} B"
    elif size < 1_048_576:
        return f"{size / 1024:.1f} KB"
    else:
        return f"{size / 1_048_576:.1f} MB"


def _is_binary(path: Path) -> bool:
    if path.suffix.lower() in _BINARY_EXTENSIONS:
        return True
    try:
        chunk = path.read_bytes()[:512]
        return b"\x00" in chunk
    except Exception:
        return False


def _is_destructive(command: str) -> bool:
    return bool(_DESTRUCTIVE_PATTERNS.search(command))


# ── read_file ─────────────────────────────────────────────────────────────────

def read_file(path: str, offset: int = 1, limit: int = 500) -> str:
    try:
        p = _safe_path(path)
        if not p.exists():
            return f"[Error] File tidak ditemukan: {path}"
        if not p.is_file():
            return f"[Error] Bukan file: {path}"

        size = p.stat().st_size
        if size > MAX_FILE_SIZE:
            return (
                f"[Error] File terlalu besar ({_fmt_size(size)}, "
                f"maks {_fmt_size(MAX_FILE_SIZE)}): {path}\n"
                f"Gunakan offset & limit untuk membaca sebagian."
            )

        if _is_binary(p):
            return f"[Info] File binary ({_fmt_size(size)}), tidak dapat ditampilkan: {path}"

        content = p.read_text(encoding="utf-8", errors="replace")
        lines   = content.splitlines()
        total   = len(lines)

        offset = max(1, offset)
        limit  = max(1, min(limit, 2000))
        start  = offset - 1
        end    = min(total, start + limit)

        if start >= total:
            return f"[Info] Offset {offset} melebihi total {total} baris pada: {path}"

        selected = lines[start:end]
        numbered = "\n".join(f"{start + i + 1:5} | {line}" for i, line in enumerate(selected))
        header   = f"[{path}] Baris {start+1}–{end} dari {total} baris total"
        if end < total:
            header += f" (sisa {total - end} baris, gunakan offset={end+1})"
        return f"{header}\n{'-' * 60}\n{numbered}"

    except PermissionError as e:
        return f"[Error] {e}"
    except Exception as e:
        logger.exception("read_file error: %s", path)
        return f"[Error] Gagal membaca file: {e}"


# ── write_file ────────────────────────────────────────────────────────────────

def write_file(path: str, content: str, backup: bool = False) -> str:
    try:
        p = _safe_path(path)
        p.parent.mkdir(parents=True, exist_ok=True)

        if backup and p.exists():
            bak = p.with_suffix(p.suffix + ".bak")
            shutil.copy2(p, bak)
            bak_note = f" (backup: {bak.name})"
        else:
            bak_note = ""

        p.write_text(content, encoding="utf-8")
        lines = content.count("\n") + 1
        size  = _fmt_size(p.stat().st_size)
        logger.info("write_file: %s (%s)", path, size)
        return f"[OK] File ditulis: {path} — {lines} baris, {size}{bak_note}"

    except PermissionError as e:
        return f"[Error] {e}"
    except Exception as e:
        logger.exception("write_file error: %s", path)
        return f"[Error] Gagal menulis file: {e}"


# ── edit_file ─────────────────────────────────────────────────────────────────

def edit_file(path: str, old_string: str, new_string: str) -> str:
    try:
        p = _safe_path(path)
        if not p.exists():
            return f"[Error] File tidak ditemukan: {path}"
        if not p.is_file():
            return f"[Error] Bukan file: {path}"

        original = p.read_text(encoding="utf-8", errors="replace")
        count    = original.count(old_string)

        if count == 0:
            hint_lines = [
                f"  baris {i+1}: {ln.strip()}"
                for i, ln in enumerate(original.splitlines())
                if any(tok in ln for tok in old_string.split()[:3])
            ][:5]
            hint = ("\nMungkin maksud kamu:\n" + "\n".join(hint_lines)) if hint_lines else ""
            return f"[Error] String tidak ditemukan dalam file: {path}{hint}"

        if count > 1:
            return (
                f"[Error] String ditemukan {count} kali dalam {path} — "
                f"harus unik agar edit aman. Perluas konteks old_string."
            )

        updated = original.replace(old_string, new_string, 1)
        p.write_text(updated, encoding="utf-8")

        old_lines = old_string.count("\n") + 1
        new_lines = new_string.count("\n") + 1
        delta     = new_lines - old_lines
        delta_str = f"+{delta}" if delta >= 0 else str(delta)

        logger.info("edit_file: %s (%s baris)", path, delta_str)
        return f"[OK] Edit berhasil: {path} ({old_lines}→{new_lines} baris, delta {delta_str})"

    except PermissionError as e:
        return f"[Error] {e}"
    except Exception as e:
        logger.exception("edit_file error: %s", path)
        return f"[Error] Gagal mengedit file: {e}"


# ── bash ──────────────────────────────────────────────────────────────────────

def bash(command: str, timeout: int = DEFAULT_TIMEOUT) -> str:
    timeout = max(1, min(int(timeout), MAX_TIMEOUT))

    if _is_destructive(command):
        return (
            f"[Blocked] Perintah terdeteksi destruktif dan diblokir:\n"
            f"  {command}\n"
            f"Konfirmasi dengan user jika benar-benar diperlukan."
        )

    try:
        start  = time.monotonic()
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=str(get_workspace()),
            env={**os.environ, "PYTHONUNBUFFERED": "1"},
        )
        elapsed = time.monotonic() - start

        out = result.stdout or ""
        err = result.stderr or ""

        parts = []
        if out:
            parts.append(out)
        if err:
            parts.append(f"[stderr]\n{err}")
        combined = "\n".join(parts).strip() or "(tidak ada output)"
        combined = _truncate(combined)

        footer = f"\n[exit: {result.returncode} | {elapsed:.2f}s]"
        logger.info("bash: exit=%d time=%.2fs cmd=%r", result.returncode, elapsed, command[:80])
        return combined + footer

    except subprocess.TimeoutExpired:
        return f"[Error] Timeout setelah {timeout} detik: {command!r}"
    except Exception as e:
        logger.exception("bash error: %s", command)
        return f"[Error] Gagal menjalankan perintah: {e}"


# ── glob ──────────────────────────────────────────────────────────────────────

def glob(pattern: str, path: str = ".") -> str:
    try:
        base     = _safe_path(path)
        ws       = get_workspace()
        matches: list[Path] = []
        deadline = time.monotonic() + GLOB_TIMEOUT

        for m in base.glob(pattern):
            if time.monotonic() > deadline:
                matches_str = "\n".join(str(m.relative_to(ws)) for m in sorted(matches))
                return (
                    f"[Warning] Glob timeout ({GLOB_TIMEOUT:.0f}s), "
                    f"hasil parsial ({len(matches)} file):\n{matches_str}"
                )
            matches.append(m)
            if len(matches) >= MAX_GLOB_RESULT:
                break

        if not matches:
            return f"(tidak ada file yang cocok dengan pola: {pattern!r})"

        matches = sorted(matches, key=lambda p: (p.is_file(), str(p)))
        lines   = []
        for m in matches:
            rel  = str(m.relative_to(ws))
            kind = "📄" if m.is_file() else "📁"
            size = f"  {_fmt_size(m.stat().st_size)}" if m.is_file() else ""
            lines.append(f"{kind} {rel}{size}")

        result = "\n".join(lines)
        if len(matches) == MAX_GLOB_RESULT:
            result += f"\n... (hasil dibatasi {MAX_GLOB_RESULT} entri)"
        return result

    except PermissionError as e:
        return f"[Error] {e}"
    except Exception as e:
        logger.exception("glob error: pattern=%s path=%s", pattern, path)
        return f"[Error] Gagal melakukan glob: {e}"


# ── grep ──────────────────────────────────────────────────────────────────────

def grep(
    pattern: str,
    path: str = ".",
    file_glob: str = "*",
    context_lines: int = 0,
    case_sensitive: bool = False,
) -> str:
    try:
        base  = _safe_path(path)
        ws    = get_workspace()
        flags = 0 if case_sensitive else re.IGNORECASE

        try:
            regex = re.compile(pattern, flags)
        except re.error as e:
            return f"[Error] Regex tidak valid: {e}"

        results:    list[str] = []
        hit_files:  int       = 0
        total_hits: int       = 0

        for fp in sorted(base.rglob(file_glob)):
            if not fp.is_file():
                continue
            if fp.stat().st_size > MAX_FILE_SIZE:
                continue
            if _is_binary(fp):
                continue

            try:
                lines = fp.read_text(encoding="utf-8", errors="replace").splitlines()
            except Exception:
                continue

            rel       = str(fp.relative_to(ws))
            file_hits = 0

            for i, line in enumerate(lines):
                if not regex.search(line):
                    continue

                file_hits  += 1
                total_hits += 1

                if context_lines > 0:
                    start = max(0, i - context_lines)
                    end   = min(len(lines), i + context_lines + 1)
                    block_lines = []
                    for j in range(start, end):
                        prefix = ">" if j == i else " "
                        block_lines.append(f"  {prefix} {rel}:{j+1}: {lines[j]}")
                    results.append("\n".join(block_lines))
                else:
                    results.append(f"{rel}:{i+1}: {line}")

                if total_hits >= MAX_GREP_RESULT:
                    break

            if file_hits > 0:
                hit_files += 1
            if total_hits >= MAX_GREP_RESULT:
                break

        if not results:
            mode = "case-sensitive" if case_sensitive else "case-insensitive"
            return f"(tidak ada hasil untuk: {pattern!r} [{mode}])"

        header = f"[{total_hits} match di {hit_files} file]"
        if total_hits >= MAX_GREP_RESULT:
            header += f" (dibatasi {MAX_GREP_RESULT})"
        return _truncate(header + "\n" + "\n".join(results))

    except PermissionError as e:
        return f"[Error] {e}"
    except Exception as e:
        logger.exception("grep error: pattern=%s", pattern)
        return f"[Error] Gagal melakukan grep: {e}"


# ── ls ────────────────────────────────────────────────────────────────────────

def ls(path: str = ".") -> str:
    try:
        p = _safe_path(path)
        if not p.exists():
            return f"[Error] Tidak ditemukan: {path}"
        if not p.is_dir():
            s = p.stat()
            return f"[File] {p.name}\n  Ukuran : {_fmt_size(s.st_size)}\n  Path   : {path}"

        entries = sorted(p.iterdir(), key=lambda x: (x.is_file(), x.name.lower()))
        if not entries:
            return f"(direktori kosong: {path})"

        lines = []
        dirs  = [e for e in entries if e.is_dir()]
        files = [e for e in entries if e.is_file()]

        for e in dirs:
            lines.append(f"📁 {e.name}/")
        for e in files:
            size = _fmt_size(e.stat().st_size)
            lines.append(f"📄 {e.name}  ({size})")

        total_size = sum(e.stat().st_size for e in files)
        footer     = f"\n{len(dirs)} direktori, {len(files)} file — total {_fmt_size(total_size)}"
        return "\n".join(lines) + footer

    except PermissionError as e:
        return f"[Error] {e}"
    except Exception as e:
        logger.exception("ls error: %s", path)
        return f"[Error] Gagal listing direktori: {e}"


# ── tree ──────────────────────────────────────────────────────────────────────

def tree(path: str = ".", max_depth: int = 3, show_size: bool = False) -> str:
    try:
        root = _safe_path(path)
        if not root.exists():
            return f"[Error] Tidak ditemukan: {path}"
        if not root.is_dir():
            return f"[Error] Bukan direktori: {path}"

        max_depth = max(1, min(max_depth, 8))
        lines     = [f"📁 {root.name}/"]
        _tree_recurse(root, "", 0, max_depth, show_size, lines)

        total_dirs  = sum(1 for _ in root.rglob("*") if _.is_dir())
        total_files = sum(1 for _ in root.rglob("*") if _.is_file())
        lines.append(f"\n{total_dirs} direktori, {total_files} file")
        return "\n".join(lines)

    except PermissionError as e:
        return f"[Error] {e}"
    except Exception as e:
        logger.exception("tree error: %s", path)
        return f"[Error] Gagal membuat tree: {e}"


def _tree_recurse(
    directory: Path, prefix: str, depth: int,
    max_depth: int, show_size: bool, lines: list[str],
) -> None:
    if depth >= max_depth:
        return
    try:
        entries = sorted(directory.iterdir(), key=lambda x: (x.is_file(), x.name.lower()))
    except PermissionError:
        return

    for i, entry in enumerate(entries):
        is_last   = (i == len(entries) - 1)
        connector = "└── " if is_last else "├── "
        extension = "    " if is_last else "│   "

        if entry.is_dir():
            lines.append(f"{prefix}{connector}📁 {entry.name}/")
            _tree_recurse(entry, prefix + extension, depth + 1, max_depth, show_size, lines)
        else:
            size_str = f"  ({_fmt_size(entry.stat().st_size)})" if show_size else ""
            lines.append(f"{prefix}{connector}📄 {entry.name}{size_str}")


# ── move_file ─────────────────────────────────────────────────────────────────

def move_file(src: str, dst: str) -> str:
    try:
        s = _safe_path(src)
        d = _safe_path(dst)

        if not s.exists():
            return f"[Error] Sumber tidak ditemukan: {src}"
        if d.exists():
            return f"[Error] Tujuan sudah ada: {dst} — hapus dulu jika ingin overwrite."

        d.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(s), str(d))
        logger.info("move_file: %s → %s", src, dst)
        return f"[OK] Dipindahkan: {src} → {dst}"

    except PermissionError as e:
        return f"[Error] {e}"
    except Exception as e:
        logger.exception("move_file error: %s → %s", src, dst)
        return f"[Error] Gagal memindahkan: {e}"


# ── copy_file ─────────────────────────────────────────────────────────────────

def copy_file(src: str, dst: str) -> str:
    try:
        s = _safe_path(src)
        d = _safe_path(dst)

        if not s.exists():
            return f"[Error] Sumber tidak ditemukan: {src}"

        d.parent.mkdir(parents=True, exist_ok=True)

        if s.is_dir():
            if d.exists():
                return f"[Error] Tujuan direktori sudah ada: {dst}"
            shutil.copytree(str(s), str(d))
            count = sum(1 for _ in d.rglob("*") if _.is_file())
            return f"[OK] Direktori disalin: {src} → {dst} ({count} file)"
        else:
            shutil.copy2(str(s), str(d))
            size = _fmt_size(d.stat().st_size)
            return f"[OK] File disalin: {src} → {dst} ({size})"

    except PermissionError as e:
        return f"[Error] {e}"
    except Exception as e:
        logger.exception("copy_file error: %s → %s", src, dst)
        return f"[Error] Gagal menyalin: {e}"


# ── delete_file ───────────────────────────────────────────────────────────────

def delete_file(path: str, recursive: bool = False) -> str:
    try:
        p = _safe_path(path)

        if not p.exists():
            return f"[Error] Tidak ditemukan: {path}"

        if p.is_dir():
            if not recursive:
                return (
                    f"[Error] '{path}' adalah direktori. "
                    f"Gunakan recursive=true untuk menghapus beserta isinya."
                )
            count = sum(1 for _ in p.rglob("*") if _.is_file())
            shutil.rmtree(str(p))
            logger.info("delete_file (dir): %s (%d files)", path, count)
            return f"[OK] Direktori dihapus: {path} ({count} file di dalamnya)"
        else:
            size = _fmt_size(p.stat().st_size)
            p.unlink()
            logger.info("delete_file: %s (%s)", path, size)
            return f"[OK] File dihapus: {path} ({size})"

    except PermissionError as e:
        return f"[Error] {e}"
    except Exception as e:
        logger.exception("delete_file error: %s", path)
        return f"[Error] Gagal menghapus: {e}"


# ── find_replace_all ──────────────────────────────────────────────────────────

def find_replace_all(
    pattern: str,
    replacement: str,
    path: str = ".",
    file_glob: str = "*",
    case_sensitive: bool = False,
    dry_run: bool = True,
) -> str:
    try:
        base  = _safe_path(path)
        ws    = get_workspace()
        flags = 0 if case_sensitive else re.IGNORECASE

        try:
            regex = re.compile(pattern, flags)
        except re.error as e:
            return f"[Error] Regex tidak valid: {e}"

        results:       list[str] = []
        changed_files: int       = 0
        total_changes: int       = 0

        for fp in sorted(base.rglob(file_glob)):
            if not fp.is_file() or _is_binary(fp):
                continue
            if fp.stat().st_size > MAX_FILE_SIZE:
                continue

            try:
                original = fp.read_text(encoding="utf-8", errors="replace")
            except Exception:
                continue

            count = len(regex.findall(original))
            if count == 0:
                continue

            updated = regex.sub(replacement, original)
            rel     = str(fp.relative_to(ws))

            results.append(f"  {rel}: {count} penggantian")
            changed_files += 1
            total_changes += count

            if not dry_run:
                fp.write_text(updated, encoding="utf-8")

        if not results:
            return f"(tidak ada file yang cocok dengan pattern {pattern!r})"

        mode   = "[DRY RUN — tidak ada yang ditulis]" if dry_run else "[DITULIS]"
        header = f"{mode} {total_changes} penggantian di {changed_files} file:"
        result = header + "\n" + "\n".join(results)

        if dry_run:
            result += "\n\nGunakan dry_run=false untuk menerapkan perubahan."

        logger.info(
            "find_replace_all: pattern=%r files=%d changes=%d dry_run=%s",
            pattern, changed_files, total_changes, dry_run,
        )
        return result

    except PermissionError as e:
        return f"[Error] {e}"
    except Exception as e:
        logger.exception("find_replace_all error")
        return f"[Error] Gagal find_replace_all: {e}"


# ══════════════════════════════════════════════════════════════════════════════
# BROWSER TOOLS
# ══════════════════════════════════════════════════════════════════════════════

BROWSER_TIMEOUT = 30

_browser_ready      = False
_browser_ready_lock = threading.Lock()

# ── DOM element patterns ──────────────────────────────────────────────────────

# Regex untuk ekstrak index + tag + teks dari baris raw browser-use state
# Contoh: [12]<button >Submit</button>  atau  [5]<a >Home</a>
_DOM_ELEM_RE = re.compile(
    r"\[(\d+)\]<(\w+)[^>]*>\s*(.*?)\s*(?:</\w+>)?$",
    re.IGNORECASE,
)

_TAG_LABELS: dict[str, str] = {
    "a":        "🔗 Link",
    "button":   "🔘 Tombol",
    "input":    "📝 Input",
    "textarea": "📝 Textarea",
    "select":   "📋 Dropdown",
    "form":     "📄 Form",
    "h1": "Judul", "h2": "Judul", "h3": "Judul",
    "div": "Elemen", "span": "Elemen", "p": "Teks",
    "img": "🖼 Gambar",
    "nav": "Menu", "header": "Header", "footer": "Footer",
}

_INTERACTIVE_TAGS = {"a", "button", "input", "textarea", "select"}


def _parse_dom_to_human(raw: str) -> str:
    """
    Ubah raw DOM output browser-use menjadi format manusiawi.

    Input (raw):
        [12]<button >Submit</button>
        [5]<a >Home</a>
        [739]<a />About
        [741]<a />Store

    Output:
        🔘 Tombol  [12]  Submit
        🔗 Link    [5]   Home
        🔗 Link    [739] About
        🔗 Link    [741] Store
    """
    lines       = raw.strip().splitlines()
    interactive: list[tuple[int, str, str, str]] = []  # (index, tag, label, text)
    other:       list[tuple[int, str, str, str]] = []

    # ── Coba format [N]<tag>text</tag> dan [N]<tag />text ──
    _ALT_RE = re.compile(
        r"\[(\d+)\]<(\w+)[^>]*/?>[ \t]*(.*)",
        re.IGNORECASE,
    )

    for line in lines:
        line = line.strip()
        if not line:
            continue

        m = _DOM_ELEM_RE.match(line) or _ALT_RE.match(line)
        if not m:
            continue

        idx_str, tag, text = m.group(1), m.group(2).lower(), m.group(3).strip()
        idx     = int(idx_str)
        label   = _TAG_LABELS.get(tag, "Elemen")

        # Bersihkan teks — buang inner HTML sisa
        text = re.sub(r"<[^>]+>", "", text).strip()
        if not text:
            text = f"({tag})"

        entry = (idx, tag, label, text)
        if tag in _INTERACTIVE_TAGS:
            interactive.append(entry)
        else:
            other.append(entry)

    if not interactive and not other:
        # Fallback: raw tidak bisa di-parse, kembalikan ringkasan singkat
        total_lines = len([l for l in lines if l.strip()])
        return f"(Halaman ter-load, {total_lines} elemen terdeteksi — gunakan browser_state untuk detail)"

    result_lines: list[str] = []

    if interactive:
        result_lines.append("Elemen interaktif:")
        for idx, tag, label, text in interactive:
            result_lines.append(f"  [{idx:>4}]  {label:<14}  {text}")

    if other:
        # Batasi elemen non-interaktif — user jarang butuh ini
        result_lines.append("")
        result_lines.append(f"Konten lain ({len(other)} elemen):")
        for idx, tag, label, text in other[:8]:
            result_lines.append(f"  [{idx:>4}]  {label:<14}  {text[:60]}")
        if len(other) > 8:
            result_lines.append(f"  ... dan {len(other) - 8} elemen lainnya")

    return "\n".join(result_lines)


def _extract_page_meta(raw: str) -> dict[str, str]:
    """
    Ekstrak metadata halaman dari raw output browser-use.
    Return dict: title, url, status
    """
    meta: dict[str, str] = {}

    # Title
    title_m = re.search(r"(?:title|judul)[:\s]+(.+)", raw, re.IGNORECASE)
    if title_m:
        meta["title"] = title_m.group(1).strip()

    # URL
    url_m = re.search(r"https?://[^\s\"'<>]+", raw)
    if url_m:
        meta["url"] = url_m.group(0).strip()

    # Status
    if re.search(r"\b(error|gagal|failed|not found|404)\b", raw, re.IGNORECASE):
        meta["status"] = "error"
    elif re.search(r"\b(success|berhasil|loaded|ok)\b", raw, re.IGNORECASE):
        meta["status"] = "ok"

    return meta


# ── Binary finder ──────────────────────────────────────────────────────────────

def _find_bin(name: str) -> str | None:
    """
    Cari binary di PATH standar + ~/.local/bin.
    Fix untuk HF Spaces / Docker non-root user di mana pip install
    meletakkan binary di ~/.local/bin yang kadang tidak ada di PATH.
    """
    found = shutil.which(name)
    if found:
        return found
    local_bin = Path.home() / ".local" / "bin" / name
    return str(local_bin) if local_bin.exists() else None


def _run_setup_cmd(cmd: str, timeout: int = 300) -> tuple[bool, str]:
    try:
        result = subprocess.run(
            cmd, shell=True, capture_output=True, text=True,
            timeout=timeout, env={**os.environ},
        )
        output = (result.stdout + result.stderr).strip()
        return result.returncode == 0, output
    except subprocess.TimeoutExpired:
        return False, f"Timeout setelah {timeout}s"
    except Exception as e:
        return False, str(e)


def _start_xvfb() -> tuple[bool, str]:
    if os.environ.get("DISPLAY"):
        return True, f"DISPLAY sudah set: {os.environ['DISPLAY']}"

    if not shutil.which("Xvfb"):
        return False, "Xvfb tidak ditemukan. Pastikan 'xvfb' ada di Dockerfile."

    try:
        subprocess.Popen(
            ["Xvfb", ":99", "-screen", "0", "1280x720x24"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        time.sleep(1.5)
        os.environ["DISPLAY"] = ":99"
        logger.info("Xvfb started, DISPLAY=:99")
        return True, "Xvfb started di :99"
    except Exception as e:
        return False, f"Gagal start Xvfb: {e}"


def _ensure_browser_ready() -> tuple[bool, str]:
    global _browser_ready

    if _browser_ready:
        return True, "ready"

    with _browser_ready_lock:
        if _browser_ready:
            return True, "ready"

        steps: list[str] = []

        ok, msg = _start_xvfb()
        steps.append(f"Xvfb: {'✓' if ok else '✗'} {msg}")
        if not ok:
            return False, "\n".join(steps)

        bu_bin = _find_bin("browser-use")
        if not bu_bin:
            steps.append("Menginstall browser-use[cli]...")
            ok, out = _run_setup_cmd(
                'pip install "browser-use[cli]" --break-system-packages -q 2>&1',
                timeout=180,
            )
            steps.append(f"pip install: {'✓' if ok else '✗'} {out[-150:] if out else ''}")
            if not ok:
                return False, "\n".join(steps)
            bu_bin = _find_bin("browser-use")
        else:
            steps.append("browser-use CLI: ✓ sudah ada")

        if not bu_bin:
            return False, "\n".join(steps) + "\n[Error] browser-use tidak ditemukan setelah install"

        chromium_check = subprocess.run(
            ["python3", "-c",
             "from playwright.sync_api import sync_playwright; "
             "p = sync_playwright().start(); p.chromium; p.stop(); print('ok')"],
            capture_output=True, text=True, timeout=15,
        )
        if "ok" not in chromium_check.stdout:
            steps.append("Menginstall Playwright Chromium...")
            ok, out = _run_setup_cmd("python3 -m playwright install chromium 2>&1", timeout=300)
            steps.append(f"playwright install: {'✓' if ok else '✗'} {out[-150:] if out else ''}")
            ok2, out2 = _run_setup_cmd("python3 -m playwright install-deps chromium 2>&1", timeout=120)
            steps.append(f"playwright deps: {'✓' if ok2 else '~'} {out2[-150:] if out2 else ''}")
        else:
            steps.append("Playwright Chromium: ✓ sudah ada")

        ok, out = _run_setup_cmd(f'"{bu_bin}" install 2>&1', timeout=120)
        steps.append(f"browser-use install: {'✓' if ok else '~'} {out[-100:] if out else ''}")

        _browser_ready = True
        logger.info("Browser setup complete")
        return True, "Browser ready:\n" + "\n".join(steps)


def _run_browser_cmd(args: list[str], timeout: int = BROWSER_TIMEOUT) -> str:
    """
    Jalankan `browser-use <args>` dengan path eksplisit.
    Return raw output — formatting dilakukan di caller (browser_open, browser_state).
    """
    ready, status = _ensure_browser_ready()
    if not ready:
        raise RuntimeError(f"Browser belum siap:\n{status}")

    bu_bin = _find_bin("browser-use")
    if not bu_bin:
        raise RuntimeError("browser-use tidak ditemukan di PATH maupun ~/.local/bin setelah setup.")

    try:
        result = subprocess.run(
            [bu_bin] + args,
            capture_output=True, text=True,
            timeout=timeout,
            env=os.environ.copy(),
        )
        output = (result.stdout or "").strip()
        stderr = (result.stderr or "").strip()

        if result.returncode != 0 and stderr:
            output = (output + "\n[stderr] " + stderr).strip()

        return output or "(tidak ada output)"

    except subprocess.TimeoutExpired:
        raise RuntimeError(f"browser-use timeout setelah {timeout}s")
    except FileNotFoundError:
        raise RuntimeError("browser-use tidak ditemukan setelah setup. Coba rebuild image.")


# ── browser_open ──────────────────────────────────────────────────────────────

def browser_open(url: str) -> str:
    """
    Buka URL di browser. Return format manusiawi, bukan raw DOM.
    Output didesain untuk dibaca user langsung — bukan developer log.
    """
    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    try:
        raw = _run_browser_cmd(["open", url], timeout=30)
        logger.info("browser_open: %s", url)

        # Cek error
        if raw.startswith("[Error]") or "error" in raw.lower()[:60]:
            return f"[Error] Gagal membuka {url}\n{raw[:200]}"

        # Format output manusiawi
        meta   = _extract_page_meta(raw)
        title  = meta.get("title", "")
        lines  = [f"🌐 Membuka: {url}"]

        if title:
            lines.append(f"📄 Judul halaman: {title}")

        lines.append("✅ Halaman berhasil dimuat.")
        lines.append("")
        lines.append("Gunakan browser_state untuk melihat elemen di halaman ini.")

        # Simpan raw sebagai metadata internal untuk agent_loop (diawali __RAW__)
        internal = f"__RAW__\n{raw}"
        return "\n".join(lines) + f"\n{internal}"

    except RuntimeError as e:
        return f"[Error] {e}"
    except Exception as e:
        logger.exception("browser_open error: %s", url)
        return f"[Error] Gagal membuka browser: {e}"


# ── browser_state ─────────────────────────────────────────────────────────────

def browser_state() -> str:
    """
    Ambil state halaman saat ini.
    Return format manusiawi — elemen interaktif ditampilkan jelas dengan index
    agar user / agent bisa langsung browser_click atau browser_input.
    """
    try:
        raw = _run_browser_cmd(["state"], timeout=15)
        logger.info("browser_state: %d chars raw", len(raw))

        if raw.startswith("[Error]"):
            return f"[Error] Gagal mengambil state browser: {raw[:200]}"

        human = _parse_dom_to_human(raw)

        lines = ["🌐 State halaman saat ini:", ""]
        lines.append(human)
        lines.append("")
        lines.append("Gunakan browser_click [index] atau browser_input [index] [teks] untuk berinteraksi.")

        # Simpan raw internal untuk agent_loop
        return "\n".join(lines) + f"\n__RAW__\n{raw}"

    except RuntimeError as e:
        return f"[Error] {e}"
    except Exception as e:
        logger.exception("browser_state error")
        return f"[Error] Gagal mengambil state browser: {e}"


# ── browser_click ─────────────────────────────────────────────────────────────

def browser_click(index: int) -> str:
    """Klik elemen berdasarkan index dari hasil browser_state."""
    try:
        raw = _run_browser_cmd(["click", str(index)], timeout=15)
        logger.info("browser_click: index=%d", index)

        if raw.startswith("[Error]"):
            return f"[Error] Gagal klik index {index}: {raw[:200]}"

        return f"✅ Klik berhasil pada elemen [{index}].\n{raw[:300] if raw else ''}"

    except RuntimeError as e:
        return f"[Error] {e}"
    except Exception as e:
        logger.exception("browser_click error: index=%d", index)
        return f"[Error] Gagal klik elemen: {e}"


# ── browser_input ─────────────────────────────────────────────────────────────

def browser_input(index: int, text: str) -> str:
    """Isi input field berdasarkan index dari hasil browser_state."""
    if not text:
        return "[Error] browser_input: text tidak boleh kosong"

    try:
        raw = _run_browser_cmd(["input", str(index), text], timeout=15)
        logger.info("browser_input: index=%d text=%r", index, text[:40])

        if raw.startswith("[Error]"):
            return f"[Error] Gagal isi input [{index}]: {raw[:200]}"

        return f"✅ Input [{index}] terisi: {text!r}\n{raw[:200] if raw else ''}"

    except RuntimeError as e:
        return f"[Error] {e}"
    except Exception as e:
        logger.exception("browser_input error: index=%d", index)
        return f"[Error] Gagal isi input: {e}"


# ── dispatcher ────────────────────────────────────────────────────────────────

TOOL_REGISTRY: dict[str, Callable] = {
    "read_file":        read_file,
    "write_file":       write_file,
    "edit_file":        edit_file,
    "bash":             bash,
    "glob":             glob,
    "grep":             grep,
    "ls":               ls,
    "tree":             tree,
    "move_file":        move_file,
    "copy_file":        copy_file,
    "delete_file":      delete_file,
    "find_replace_all": find_replace_all,
    "browser_open":     browser_open,
    "browser_state":    browser_state,
    "browser_click":    browser_click,
    "browser_input":    browser_input,
}


def dispatch(tool_name: str, args: dict) -> str:
    fn = TOOL_REGISTRY.get(tool_name)
    if fn is None:
        available = ", ".join(sorted(TOOL_REGISTRY))
        return f"[Error] Tool tidak dikenal: '{tool_name}'. Tersedia: {available}"

    _INT_PARAMS = {"offset", "limit", "timeout", "context_lines", "max_depth", "index"}

    cleaned: dict = {}
    for k, v in args.items():
        if isinstance(v, str):
            v = html.unescape(v)
            if v.lower() == "true":
                v = True
            elif v.lower() == "false":
                v = False
            elif k in _INT_PARAMS:
                try:
                    v = int(v)
                except ValueError:
                    pass
        cleaned[k] = v

    try:
        result = fn(**cleaned)
        logger.debug("dispatch: %s → %d chars", tool_name, len(str(result)))
        return str(result)
    except TypeError as e:
        import inspect
        sig = inspect.signature(fn)
        return (
            f"[Error] Parameter salah untuk '{tool_name}': {e}\n"
            f"Signature: {tool_name}{sig}"
        )
    except Exception as e:
        logger.exception("dispatch unhandled: tool=%s", tool_name)
        return f"[Error] Tool '{tool_name}' crash: {e}"
