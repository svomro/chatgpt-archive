#!/usr/bin/env python3
"""Record ChatGPT streaming HTTP responses without delaying the client."""

from __future__ import annotations

import json
import os
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import BinaryIO

from mitmproxy import http


CAPTURE_ROOT = Path(
    os.environ.get("CHATGPT_CAPTURE_DIR", str(Path.home() / "ChatGPT-Stream-Captures"))
).expanduser()

CHATGPT_HOST_SUFFIXES = (
    "chatgpt.com",
    "openai.com",
)

STREAM_PATH_RE = re.compile(
    r"/(?:backend-api|backend-anon)/(?:f/)?conversation(?:/|$)", re.IGNORECASE
)

SENSITIVE_HEADERS = {
    "authorization",
    "cookie",
    "proxy-authorization",
    "set-cookie",
}


def _is_chatgpt_host(host: str) -> bool:
    host = host.lower().rstrip(".")
    return any(host == suffix or host.endswith(f".{suffix}") for suffix in CHATGPT_HOST_SUFFIXES)


def _redacted_headers(headers: http.Headers) -> dict[str, str]:
    return {
        name: "<redacted>" if name.lower() in SENSITIVE_HEADERS else value
        for name, value in headers.items(multi=True)
    }


def _safe_component(value: str) -> str:
    value = re.sub(r"[^A-Za-z0-9._-]+", "_", value)
    return value.strip("._-")[:100] or "stream"


class ActiveCapture:
    def __init__(self, directory: Path, raw_file: BinaryIO) -> None:
        self.directory = directory
        self.raw_file = raw_file
        self.bytes_written = 0


class ChatGPTStreamRecorder:
    def __init__(self) -> None:
        self._active: dict[str, ActiveCapture] = {}
        self._lock = threading.Lock()

    def responseheaders(self, flow: http.HTTPFlow) -> None:
        response = flow.response
        if response is None or not _is_chatgpt_host(flow.request.pretty_host):
            return

        content_type = response.headers.get("content-type", "").lower()
        path = flow.request.path
        if "text/event-stream" not in content_type and not STREAM_PATH_RE.search(path):
            return

        started = datetime.now(timezone.utc)
        day_dir = CAPTURE_ROOT / started.astimezone().strftime("%Y-%m-%d")
        flow_dir = day_dir / (
            f"{started.astimezone().strftime('%H-%M-%S.%f')[:-3]}_"
            f"{_safe_component(flow.request.pretty_host)}_{flow.id}"
        )
        flow_dir.mkdir(parents=True, exist_ok=False)

        metadata = {
            "flow_id": flow.id,
            "captured_at": started.isoformat(),
            "client": flow.client_conn.peername,
            "request": {
                "method": flow.request.method,
                "scheme": flow.request.scheme,
                "host": flow.request.pretty_host,
                "port": flow.request.port,
                "path": flow.request.path,
                "url": flow.request.pretty_url,
                "headers": _redacted_headers(flow.request.headers),
            },
            "response": {
                "status_code": response.status_code,
                "reason": response.reason,
                "headers": _redacted_headers(response.headers),
            },
        }
        (flow_dir / "meta.json").write_text(
            json.dumps(metadata, ensure_ascii=False, indent=2, default=str) + "\n",
            encoding="utf-8",
        )

        raw_file = (flow_dir / "raw.sse").open("ab", buffering=0)
        with self._lock:
            self._active[flow.id] = ActiveCapture(flow_dir, raw_file)

        response.stream = lambda chunk, flow_id=flow.id: self._record_chunk(flow_id, chunk)
        print(f"[chatgpt-recorder] capturing {flow.request.method} {flow.request.pretty_url}")
        print(f"[chatgpt-recorder] -> {flow_dir / 'raw.sse'}")

    def _record_chunk(self, flow_id: str, chunk: bytes) -> bytes:
        with self._lock:
            capture = self._active.get(flow_id)
            if capture is None:
                return chunk

            if chunk:
                capture.raw_file.write(chunk)
                capture.raw_file.flush()
                capture.bytes_written += len(chunk)
                return chunk

            self._finish_locked(flow_id, status="complete")
            return chunk

    def error(self, flow: http.HTTPFlow) -> None:
        with self._lock:
            if flow.id in self._active:
                self._finish_locked(flow.id, status="error", error=str(flow.error))

    def done(self) -> None:
        with self._lock:
            for flow_id in list(self._active):
                self._finish_locked(flow_id, status="proxy-stopped")

    def _finish_locked(self, flow_id: str, *, status: str, error: str | None = None) -> None:
        capture = self._active.pop(flow_id, None)
        if capture is None:
            return

        capture.raw_file.flush()
        capture.raw_file.close()
        result = {
            "status": status,
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "bytes_written": capture.bytes_written,
        }
        if error:
            result["error"] = error
        (capture.directory / "result.json").write_text(
            json.dumps(result, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(
            f"[chatgpt-recorder] {status}: {capture.bytes_written} bytes -> "
            f"{capture.directory / 'raw.sse'}"
        )


addons = [ChatGPTStreamRecorder()]
