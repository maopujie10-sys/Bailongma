# event_perception.py - Event perception module
# File change watchdog + window switch detection + clipboard monitoring

import os
import time
import json
import threading
from datetime import datetime
from pathlib import Path

try:
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler
    HAS_WATCHDOG = True
except ImportError:
    HAS_WATCHDOG = False

try:
    import pygetwindow as gw
    HAS_PYGETWINDOW = True
except ImportError:
    HAS_PYGETWINDOW = False

try:
    import pyperclip
    HAS_PYPERCLIP = True
except ImportError:
    HAS_PYPERCLIP = False


class FileChangeHandler(FileSystemEventHandler):
    def __init__(self, callback):
        self.callback = callback

    def on_modified(self, event):
        self.callback({"type": "file_modified", "path": event.src_path, "time": datetime.now().isoformat()})

    def on_created(self, event):
        self.callback({"type": "file_created", "path": event.src_path, "time": datetime.now().isoformat()})

    def on_deleted(self, event):
        self.callback({"type": "file_deleted", "path": event.src_path, "time": datetime.now().isoformat()})


class EventPerception:
    def __init__(self):
        self.observer = None
        self._watch_thread = None
        self._running = False
        self.events = []
        self.max_events = 200
        self._last_window = None
        self._last_clipboard = ""

    def start_watching(self, path, recursive=True):
        if not HAS_WATCHDOG:
            return {"error": "watchdog not installed", "ok": False}
        if self.observer:
            self.stop_watching()

        def on_event(e):
            self.events.append(e)
            if len(self.events) > self.max_events:
                self.events = self.events[-self.max_events:]

        handler = FileChangeHandler(on_event)
        self.observer = Observer()
        self.observer.schedule(handler, path, recursive=recursive)
        self.observer.start()
        self._running = True
        return {"ok": True, "watching": path, "recursive": recursive}

    def stop_watching(self):
        if self.observer:
            self.observer.stop()
            self.observer.join(timeout=3)
            self.observer = None
        self._running = False
        return {"ok": True}

    def get_active_window(self):
        if not HAS_PYGETWINDOW:
            return {"error": "pygetwindow not installed", "ok": False}
        try:
            win = gw.getActiveWindow()
            if win:
                info = {"title": win.title, "size": {"w": win.width, "h": win.height},
                        "position": {"x": win.left, "y": win.top}, "timestamp": datetime.now().isoformat()}
                if self._last_window != win.title:
                    self._last_window = win.title
                    self.events.append({"type": "window_changed", "window": info, "time": datetime.now().isoformat()})
                return {"ok": True, "window": info}
            return {"ok": True, "window": None}
        except Exception as e:
            return {"error": str(e), "ok": False}

    def get_all_windows(self):
        if not HAS_PYGETWINDOW:
            return {"error": "pygetwindow not installed", "ok": False}
        try:
            wins = [{"title": w.title, "size": {"w": w.width, "h": w.height}} for w in gw.getAllWindows() if w.title]
            return {"ok": True, "windows": wins}
        except Exception as e:
            return {"error": str(e), "ok": False}

    def get_clipboard(self):
        if not HAS_PYPERCLIP:
            return {"error": "pyperclip not installed", "ok": False}
        try:
            text = pyperclip.paste()
            if text != self._last_clipboard:
                self._last_clipboard = text
                self.events.append({"type": "clipboard_changed", "length": len(text),
                                    "preview": text[:100], "time": datetime.now().isoformat()})
            return {"ok": True, "text": text, "length": len(text)}
        except Exception as e:
            return {"error": str(e), "ok": False}

    def get_recent_events(self, n=20, event_type=None):
        events = self.events
        if event_type:
            events = [e for e in events if e.get("type") == event_type]
        return {"ok": True, "events": events[-n:], "total": len(self.events)}

    def clear_events(self):
        self.events = []
        return {"ok": True}

    def status(self):
        return {
            "watchdog": HAS_WATCHDOG,
            "pygetwindow": HAS_PYGETWINDOW,
            "pyperclip": HAS_PYPERCLIP,
            "watching": self._running,
            "events_buffered": len(self.events)
        }


if __name__ == "__main__":
    ep = EventPerception()
    print("EventPerception status:", json.dumps(ep.status(), indent=2))
    print("active window:", json.dumps(ep.get_active_window(), indent=2, ensure_ascii=False))
    print("clipboard:", ep.get_clipboard().get("preview", "")[:100] if ep.get_clipboard().get("ok") else "N/A")
