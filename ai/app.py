"""
app.py — Gemini Claw Web UI

Fixes vs versi sebelumnya:
- [THINKING]    on_thinking callback → push SSE event "thinking" ke frontend
- [HEARTBEAT]   SSE generator pakai heartbeat ping tiap 5s selama agent hidup
- [TIMEOUT]     wait tidak lagi hardcoded 60s — adaptive berdasarkan thread status
- [SESSION]     Session conversation disimpan ke file JSON di workspace
- [CHECKPOINT]  /api/checkpoint endpoint + checkpoint auto-load saat restore
"""
from __future__ import annotations

import io
import json
import os
import queue
import shutil
import threading
import time
import uuid
import zipfile
from pathlib import Path

from flask import Flask, Response, jsonify, render_template, request, send_file, send_from_directory, stream_with_context

# ── Workspace base ─────────────────────────────────────────────────────────────
_default_base = "/home/runner/work" if os.path.isdir("/home/runner") else "/tmp/workspace"
BASE_WORKSPACE = Path(os.environ.get("CLAW_WORKSPACE", _default_base)).resolve()
BASE_WORKSPACE.mkdir(parents=True, exist_ok=True)

from src.agent_loop import AgentLoop
from src.gemini_client import DEFAULT_MODEL

app = Flask(__name__)
app.secret_key = os.urandom(24)


@app.after_request
def set_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"]         = "SAMEORIGIN"
    response.headers["X-XSS-Protection"]        = "1; mode=block"
    response.headers["Referrer-Policy"]         = "strict-origin-when-cross-origin"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; "
        "frame-src 'self'; "
        "connect-src 'self';"
    )
    return response


# ── Session storage ────────────────────────────────────────────────────────────

sessions: dict[str, dict] = {}
_sessions_lock = threading.Lock()

_SESSION_FILE    = ".claw_session.json"
_CHECKPOINT_FILE = ".claw_checkpoint.json"

_HEARTBEAT_INTERVAL = 5
_POST_DONE_TIMEOUT  = 30


def _session_path(ws: Path) -> Path:
    return ws / _SESSION_FILE


def _checkpoint_path(ws: Path) -> Path:
    return ws / _CHECKPOINT_FILE


def _save_session(ws: Path, conversation: list[dict]) -> None:
    try:
        data = {"conversation": conversation}
        tmp  = _session_path(ws).with_suffix(".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(_session_path(ws))
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("_save_session failed: %s", e)


def _load_session(ws: Path) -> list[dict]:
    p = _session_path(ws)
    if not p.exists():
        return []
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        conv = data.get("conversation", [])
        return [t for t in conv if isinstance(t, dict) and "role" in t and "content" in t]
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("_load_session failed: %s", e)
        return []


def save_checkpoint(ws: Path, turn_count: int, conversation: list[dict]) -> None:
    try:
        data = {"turn_count": turn_count, "conversation": conversation}
        tmp  = _checkpoint_path(ws).with_suffix(".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(_checkpoint_path(ws))
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("save_checkpoint failed: %s", e)


def load_checkpoint(ws: Path) -> dict | None:
    p = _checkpoint_path(ws)
    if not p.exists():
        return None
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        return data if "conversation" in data else None
    except Exception:
        return None


def clear_checkpoint(ws: Path) -> None:
    try:
        p = _checkpoint_path(ws)
        if p.exists():
            p.unlink()
    except Exception:
        pass


def get_session(sid: str) -> dict:
    with _sessions_lock:
        if sid not in sessions:
            ws = BASE_WORKSPACE / sid
            ws.mkdir(parents=True, exist_ok=True)
            conversation = _load_session(ws)
            sessions[sid] = {
                "conversation":    conversation,
                "model":           DEFAULT_MODEL,
                "workspace":       ws,
                "confirm_queue":   None,
                "pending_confirm": None,
                "confirm_timeout": 60,
            }
        return sessions[sid]


def session_workspace(sid: str) -> Path:
    return get_session(sid)["workspace"]


def _assert_inside_workspace(ws: Path, target: Path) -> None:
    ws_real  = ws.resolve()
    tgt_real = target.resolve()
    if tgt_real != ws_real and not str(tgt_real).startswith(str(ws_real) + os.sep):
        raise PermissionError(f"Akses ditolak: path di luar workspace ({target})")


def sse_event(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.route("/favicon.ico")
def favicon():
    return "", 204


@app.route("/api/session", methods=["POST"])
def restore_session():
    body = request.get_json(force=True)
    sid  = body.get("session_id", "").strip()
    if not sid:
        sid = str(uuid.uuid4())

    sess           = get_session(sid)
    ws             = sess["workspace"]
    checkpoint     = load_checkpoint(ws)
    has_checkpoint = checkpoint is not None

    return jsonify({
        "session_id":     sid,
        "workspace":      str(ws),
        "has_checkpoint": has_checkpoint,
        "turn_count":     checkpoint.get("turn_count", 0) if has_checkpoint else 0,
        "conv_length":    len(sess["conversation"]),
    })


@app.route("/")
def index():
    sid = str(uuid.uuid4())
    ws  = session_workspace(sid)
    return render_template("index.html", session_id=sid, model=DEFAULT_MODEL, workspace=str(ws))


@app.route("/api/checkpoint/status", methods=["GET"])
def checkpoint_status():
    sid = request.args.get("sid", "")
    if not sid:
        return jsonify({"has_checkpoint": False}), 400
    ws = session_workspace(sid)
    cp = load_checkpoint(ws)
    return jsonify({
        "has_checkpoint": cp is not None,
        "turn_count":     cp.get("turn_count", 0) if cp else 0,
        "conv_length":    len(cp.get("conversation", [])) if cp else 0,
    })


@app.route("/api/checkpoint/resume", methods=["POST"])
def checkpoint_resume():
    body = request.get_json(force=True)
    sid  = body.get("session_id", "")
    if not sid:
        return jsonify({"ok": False, "error": "session_id diperlukan"}), 400

    ws = session_workspace(sid)
    cp = load_checkpoint(ws)
    if not cp:
        return jsonify({"ok": False, "error": "Tidak ada checkpoint tersedia"}), 404

    sess = get_session(sid)
    with _sessions_lock:
        sess["conversation"] = cp["conversation"]
    _save_session(ws, cp["conversation"])

    return jsonify({
        "ok":          True,
        "turn_count":  cp.get("turn_count", 0),
        "conv_length": len(cp["conversation"]),
    })


@app.route("/api/checkpoint/discard", methods=["POST"])
def checkpoint_discard():
    body = request.get_json(force=True)
    sid  = body.get("session_id", "")
    if not sid:
        return jsonify({"ok": False, "error": "session_id diperlukan"}), 400
    clear_checkpoint(session_workspace(sid))
    return jsonify({"ok": True})


@app.route("/api/chat", methods=["POST"])
def chat():
    body   = request.get_json(force=True)
    sid    = body.get("session_id", "")
    prompt = body.get("prompt", "").strip()
    model  = body.get("model", DEFAULT_MODEL)

    if not prompt:
        return jsonify({"error": "Prompt kosong"}), 400

    sess = get_session(sid)
    sess["model"] = model
    ws = sess["workspace"]

    q: queue.Queue = queue.Queue()

    # ── Callbacks ──────────────────────────────────────────────────────────────

    def on_text(text: str):
        if text.strip():
            q.put({"type": "text", "content": text})

    def on_thinking(content: str):
        """
        [THINKING] Push thinking block ke frontend via SSE.
        Frontend render sebagai collapsible bubble — muted, subtle,
        bisa di-expand untuk lihat reasoning agent.
        """
        if content and content.strip():
            q.put({"type": "thinking", "content": content})

    def on_tool_start(name: str, params: dict):
        param_str = ", ".join(f"{k}={repr(v)[:50]}" for k, v in params.items())
        q.put({"type": "tool_start", "name": name, "params": param_str})

    def on_tool_result(name: str, output: str):
        lines   = output.strip().splitlines()
        preview = "\n".join(lines[:12])
        if len(lines) > 12:
            preview += f"\n... ({len(lines) - 12} baris lebih)"
        q.put({"type": "tool_result", "name": name, "output": preview})

    def on_warning(message: str):
        q.put({"type": "warning", "content": message})

    def on_blocked(tool: str, reason: str, risk_level: str):
        q.put({"type": "blocked", "tool": tool, "reason": reason, "risk": risk_level})

    def on_mode_change(old_mode: str, new_mode: str, reason: str):
        q.put({"type": "mode_change", "from": old_mode, "to": new_mode, "reason": reason})

    def on_confirm(pending_tools: list[dict], timeout: int = 60) -> dict[str, bool]:
        cq = queue.Queue()
        with _sessions_lock:
            sess["confirm_queue"]   = cq
            sess["confirm_timeout"] = timeout
            sess["pending_confirm"] = {"tools": pending_tools, "timeout": timeout}

        q.put({"type": "confirm_request", "tools": pending_tools, "timeout": timeout})

        try:
            result = cq.get(timeout=timeout)
        except queue.Empty:
            result = {t["key"]: False for t in pending_tools}

        with _sessions_lock:
            sess["confirm_queue"]   = None
            sess["confirm_timeout"] = 60
            sess["pending_confirm"] = None

        return result

    def on_question(question_text: str):
        q.put({"type": "question", "content": question_text})

    def on_checkpoint(turn_count: int, conversation: list[dict]):
        save_checkpoint(ws, turn_count, conversation)

    def on_conversation_update(conversation: list[dict]):
        _save_session(ws, conversation)
        with _sessions_lock:
            sess["conversation"] = conversation

    # ── Agent thread ───────────────────────────────────────────────────────────

    def run_agent():
        from src.agent_tools import set_workspace
        set_workspace(ws)
        try:
            agent = AgentLoop(model=model, workspace=ws)
            _, updated = agent.run(
                prompt,
                sess["conversation"],
                on_text                = on_text,
                on_thinking            = on_thinking,        # [THINKING] ← baru
                on_tool_start          = on_tool_start,
                on_tool_result         = on_tool_result,
                on_warning             = on_warning,
                on_blocked             = on_blocked,
                on_mode_change         = on_mode_change,
                on_confirm             = on_confirm,
                on_question            = on_question,
                on_checkpoint          = on_checkpoint,
                on_conversation_update = on_conversation_update,
            )
            _save_session(ws, updated)
            clear_checkpoint(ws)
            with _sessions_lock:
                sess["conversation"] = updated
        except Exception as e:
            q.put({"type": "error", "content": str(e)})
        finally:
            q.put({"type": "done"})

    thread = threading.Thread(target=run_agent, daemon=True)
    thread.start()

    # ── SSE generator — heartbeat based ────────────────────────────────────────
    def generate():
        # Phase 1: agent masih jalan
        while thread.is_alive():
            with _sessions_lock:
                has_confirm = sess.get("confirm_queue") is not None

            poll_timeout = 2 if has_confirm else _HEARTBEAT_INTERVAL

            try:
                item = q.get(timeout=poll_timeout)
                yield sse_event(item)
                if item["type"] == "done":
                    return
            except queue.Empty:
                yield sse_event({"type": "ping"})

        # Phase 2: thread mati, drain sisa queue
        deadline = time.monotonic() + _POST_DONE_TIMEOUT
        while time.monotonic() < deadline:
            try:
                item = q.get(timeout=1)
                yield sse_event(item)
                if item["type"] == "done":
                    return
            except queue.Empty:
                break

        yield sse_event({"type": "done"})

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control":     "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.route("/api/confirm", methods=["POST"])
def confirm_action():
    body      = request.get_json(force=True)
    sid       = body.get("session_id", "")
    decisions = body.get("decisions", {})

    if not sid:
        return jsonify({"ok": False, "error": "session_id diperlukan"}), 400

    sess = get_session(sid)
    with _sessions_lock:
        cq = sess.get("confirm_queue")

    if cq is None:
        return jsonify({"ok": False, "error": "Tidak ada konfirmasi pending (mungkin sudah timeout)"}), 409

    cq.put(decisions)
    return jsonify({"ok": True})


@app.route("/api/clear", methods=["POST"])
def clear_session():
    body = request.get_json(force=True)
    sid  = body.get("session_id", "")
    ws   = session_workspace(sid)

    with _sessions_lock:
        if sid in sessions:
            sessions[sid]["conversation"] = []

    _save_session(ws, [])
    clear_checkpoint(ws)
    return jsonify({"ok": True})


@app.route("/api/summarize", methods=["POST"])
def summarize_memory():
    from src.gemini_client import call_gemini, GeminiAPIError

    body = request.get_json(force=True)
    sid  = body.get("session_id", "")
    sess = get_session(sid)
    ws   = sess["workspace"]
    conv = sess.get("conversation", [])

    if not conv:
        return jsonify({"ok": False, "error": "Tidak ada percakapan untuk diringkas"}), 400

    lines = []
    for turn in conv:
        role    = "User" if turn["role"] == "user" else "Assistant"
        content = turn["content"]
        if len(content) > 3000:
            content = content[:3000] + "\n...[terpotong]"
        lines.append(f"{role}: {content}")

    summarize_prompt = (
        "Berikut adalah riwayat percakapan antara User dan AI coding agent. "
        "Buat ringkasan komprehensif dalam Bahasa Indonesia yang mencakup:\n"
        "1. Konteks proyek atau tugas yang sedang dikerjakan\n"
        "2. File-file yang telah dibuat/diedit dan isinya secara singkat\n"
        "3. Keputusan teknis penting yang sudah diambil\n"
        "4. Status pekerjaan saat ini dan langkah selanjutnya\n\n"
        "Ringkasan harus cukup detail agar AI bisa melanjutkan pekerjaan tanpa kehilangan konteks.\n\n"
        f"Riwayat Percakapan:\n{chr(10).join(lines)}\n\nRingkasan:"
    )

    try:
        summary = call_gemini(summarize_prompt)
    except GeminiAPIError as e:
        return jsonify({"ok": False, "error": str(e)}), 500

    new_conv = [
        {"role": "user",      "content": "[RINGKASAN PERCAKAPAN SEBELUMNYA]\n" + summary},
        {"role": "assistant", "content": "Baik, saya sudah membaca ringkasan percakapan sebelumnya. Saya siap melanjutkan dari sini."},
    ]
    sess["conversation"] = new_conv
    _save_session(ws, new_conv)
    clear_checkpoint(ws)

    return jsonify({"ok": True, "summary": summary})


@app.route("/api/files/clear", methods=["POST"])
def clear_workspace_files():
    body = request.get_json(force=True)
    sid  = body.get("session_id", "")
    ws   = session_workspace(sid)
    deleted, errors = [], []
    if ws.exists():
        for entry in ws.iterdir():
            if entry.name in (_SESSION_FILE, _CHECKPOINT_FILE):
                continue
            try:
                if entry.is_dir():
                    shutil.rmtree(entry)
                else:
                    entry.unlink()
                deleted.append(entry.name)
            except Exception as e:
                errors.append(f"{entry.name}: {e}")
    return jsonify({"ok": True, "deleted": deleted, "errors": errors})


@app.route("/api/file/delete", methods=["POST"])
def delete_file():
    body     = request.get_json(force=True)
    sid      = body.get("session_id", "")
    filepath = body.get("path", "").strip()
    if not filepath:
        return jsonify({"ok": False, "error": "Path diperlukan"}), 400

    ws     = session_workspace(sid)
    target = ws / filepath
    try:
        _assert_inside_workspace(ws, target)
    except PermissionError as e:
        return jsonify({"ok": False, "error": str(e)}), 403

    target = target.resolve()
    if not target.exists():
        return jsonify({"ok": False, "error": "File tidak ditemukan"}), 404
    if not target.is_file():
        return jsonify({"ok": False, "error": "Bukan file"}), 400

    target.unlink()
    return jsonify({"ok": True})


@app.route("/api/workspace", methods=["GET"])
def workspace_info():
    sid = request.args.get("sid", "")
    ws  = session_workspace(sid) if sid else BASE_WORKSPACE
    try:
        entries = sorted(ws.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower()))
        files = [
            {"name": e.name, "is_dir": e.is_dir(), "size": e.stat().st_size if e.is_file() else None}
            for e in entries[:30]
            if e.name not in (_SESSION_FILE, _CHECKPOINT_FILE)
        ]
    except Exception:
        files = []
    return jsonify({"path": str(ws), "files": files})


SKIP_DIRS  = {"node_modules", ".git", ".cache", "__pycache__", ".next", "dist", ".venv", "venv"}
SKIP_NAMES = {".DS_Store", "Thumbs.db", _SESSION_FILE, _CHECKPOINT_FILE}


def _is_hidden(name: str) -> bool:
    return name.startswith(".")


def _list_files_recursive(workspace: Path) -> list[dict]:
    results = []

    def walk(directory: Path, prefix: str = ""):
        try:
            entries = sorted(directory.iterdir(), key=lambda x: (x.is_file(), x.name.lower()))
        except PermissionError:
            return
        for entry in entries:
            name = entry.name
            if _is_hidden(name) or name in SKIP_NAMES:
                continue
            rel = (prefix + "/" + name).lstrip("/")
            if entry.is_dir():
                if name in SKIP_DIRS:
                    continue
                walk(entry, rel)
            else:
                results.append({
                    "path":    rel,
                    "name":    name,
                    "size":    entry.stat().st_size,
                    "is_html": name.lower().endswith((".html", ".htm")),
                })

    walk(workspace)
    return results


@app.route("/api/files", methods=["GET"])
def list_files():
    sid = request.args.get("sid", "")
    ws  = session_workspace(sid) if sid else BASE_WORKSPACE
    return jsonify({"files": _list_files_recursive(ws)})


@app.route("/api/file", methods=["GET"])
def download_file():
    sid      = request.args.get("sid", "")
    filepath = request.args.get("path", "")
    if not filepath:
        return "Path diperlukan", 400

    ws     = session_workspace(sid) if sid else BASE_WORKSPACE
    target = ws / filepath
    try:
        _assert_inside_workspace(ws, target)
    except PermissionError:
        return "Akses ditolak: path traversal terdeteksi", 403

    return send_from_directory(str(ws.resolve()), filepath, as_attachment=True)


@app.route("/workspace/<sid>/<path:filepath>")
def serve_workspace(sid: str, filepath: str):
    ws     = session_workspace(sid)
    target = ws / filepath
    try:
        _assert_inside_workspace(ws, target)
    except PermissionError:
        return "Akses ditolak: path traversal terdeteksi", 403
    return send_from_directory(str(ws.resolve()), filepath)


@app.route("/api/download-zip", methods=["GET"])
def download_zip():
    sid = request.args.get("sid", "")
    ws  = session_workspace(sid) if sid else BASE_WORKSPACE
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for fp in sorted(ws.rglob("*")):
            if fp.is_file():
                parts = fp.relative_to(ws).parts
                if any(p.startswith(".") or p in SKIP_DIRS for p in parts):
                    continue
                if fp.name in (_SESSION_FILE, _CHECKPOINT_FILE):
                    continue
                zf.write(fp, fp.relative_to(ws))
    buf.seek(0)
    return send_file(buf, mimetype="application/zip", as_attachment=True, download_name="workspace.zip")


@app.route("/api/upload", methods=["POST"])
def upload_files():
    sid = request.form.get("session_id", "")
    ws  = session_workspace(sid) if sid else BASE_WORKSPACE
    ws.mkdir(parents=True, exist_ok=True)

    files   = request.files.getlist("files")
    results = []

    for f in files:
        filename  = f.filename or "upload"
        safe_name = Path(filename).name

        if safe_name in (_SESSION_FILE, _CHECKPOINT_FILE):
            results.append({"name": safe_name, "type": "file", "ok": False, "error": "Nama file tidak diizinkan"})
            continue

        if safe_name.lower().endswith(".zip"):
            try:
                with zipfile.ZipFile(io.BytesIO(f.read())) as zf:
                    extracted = []
                    for member in zf.infolist():
                        if member.filename in (_SESSION_FILE, _CHECKPOINT_FILE):
                            continue
                        target = ws / member.filename
                        try:
                            _assert_inside_workspace(ws, target)
                        except PermissionError:
                            continue
                        zf.extract(member, ws)
                        extracted.append(member.filename)
                results.append({"name": safe_name, "type": "zip", "extracted": len(extracted), "ok": True})
            except Exception as e:
                results.append({"name": safe_name, "type": "zip", "ok": False, "error": str(e)})
        else:
            try:
                dest = ws / safe_name
                f.save(str(dest))
                results.append({"name": safe_name, "type": "file", "size": dest.stat().st_size, "ok": True})
            except Exception as e:
                results.append({"name": safe_name, "type": "file", "ok": False, "error": str(e)})

    return jsonify({"ok": True, "results": results})



# ── VNC proxy ──────────────────────────────────────────────────────────────────
import urllib.request as _urllib_req

@app.route("/vnc/")
@app.route("/vnc/<path:subpath>")
def vnc_proxy(subpath=""):
    """Proxy request ke noVNC (websockify) yang jalan di localhost:6080."""
    target = f"http://localhost:6080/{subpath}"
    try:
        req = _urllib_req.Request(target)
        with _urllib_req.urlopen(req, timeout=5) as resp:
            body = resp.read()
            ct   = resp.headers.get("Content-Type", "text/html")
            return Response(body, status=resp.status, content_type=ct)
    except Exception as e:
        return f"VNC belum tersedia: {e}", 503


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)



