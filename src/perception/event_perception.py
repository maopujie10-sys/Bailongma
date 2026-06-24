"""
事件感知模块 - 文件变化watchdog + 窗口切换pygetwindow + 剪贴板pyperclip
由晨曦（指挥官）派 CrewAI Agent 军团执行
"""
import os
import sys
import json
import time
import threading
import re
from datetime import datetime
from pathlib import Path

SANDBOX = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SANDBOX))

# Optional imports
try:
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler
    HAS_WATCHDOG = True
except ImportError:
    HAS_WATCHDOG = False

try:
    import pygetwindow as gw
    HAS_WINDOW = True
except ImportError:
    HAS_WINDOW = False

try:
    import pyperclip
    HAS_CLIPBOARD = True
except ImportError:
    HAS_CLIPBOARD = False


class FileChangeHandler(FileSystemEventHandler):
    """文件系统变化处理器"""
    def __init__(self, callback):
        self.callback = callback
    
    def on_created(self, event):
        self.callback({"type": "file_created", "path": event.src_path, "time": datetime.now().isoformat()})
    
    def on_modified(self, event):
        self.callback({"type": "file_modified", "path": event.src_path, "time": datetime.now().isoformat()})
    
    def on_deleted(self, event):
        self.callback({"type": "file_deleted", "path": event.src_path, "time": datetime.now().isoformat()})


class EventPerception:
    """事件驱动感知：文件变化 + 窗口切换 + 剪贴板"""
    
    def __init__(self):
        self.events = []
        self.max_events = 1000
        self._observer = None
        self._watch_thread = None
        self._running = False
        self._last_window = None
        self._last_clipboard = None
    
    @staticmethod
    def _safe_title(title):
        if not title:
            return ""
        return re.sub(r'[​-‏ - ­﻿⁠-⁤]', '', title).strip()

    def _record(self, event):
        self.events.append(event)
        if len(self.events) > self.max_events:
            self.events = self.events[-self.max_events:]
    
    # ── 文件监控 ──
    def watch_directory(self, path, recursive=True):
        """监控目录的文件变化"""
        if not HAS_WATCHDOG:
            return {"ok": False, "error": "watchdog not installed"}
        
        try:
            if self._observer:
                self._observer.stop()
                self._observer.join(timeout=2)
            
            self._observer = Observer()
            handler = FileChangeHandler(self._record)
            self._observer.schedule(handler, path, recursive=recursive)
            self._observer.start()
            self._running = True
            
            return {"ok": True, "watching": path, "recursive": recursive}
        except Exception as e:
            return {"ok": False, "error": str(e)}
    
    def stop_watching(self):
        """停止文件监控"""
        if self._observer:
            self._observer.stop()
            self._observer.join(timeout=2)
            self._observer = None
            self._running = False
        return {"ok": True}
    
    # ── 窗口感知 ──
    def get_active_window(self):
        """获取当前活动窗口信息"""
        if not HAS_WINDOW:
            return {"ok": False, "error": "pygetwindow not installed"}
        
        try:
            win = gw.getActiveWindow()
            if win:
                safe_title = self._safe_title(win.title)
                info = {
                    "title": safe_title,
                    "position": {"left": win.left, "top": win.top, "width": win.width, "height": win.height},
                    "time": datetime.now().isoformat()
                }
                # Detect window switch
                if self._last_window and self._last_window != safe_title:
                    self._record({"type": "window_switch", "from": self._last_window, "to": safe_title, "time": info["time"]})
                self._last_window = safe_title
                return {"ok": True, "window": info}
            return {"ok": False, "error": "No active window"}
        except Exception as e:
            return {"ok": False, "error": str(e)}
    
    def list_windows(self):
        """列出所有窗口"""
        if not HAS_WINDOW:
            return {"ok": False, "error": "pygetwindow not installed"}
        
        try:
            windows = []
            for w in gw.getAllWindows():
                safe_t = self._safe_title(w.title)
                if safe_t:
                    windows.append({
                        "title": safe_t,
                        "visible": w.visible,
                        "position": {"left": w.left, "top": w.top, "width": w.width, "height": w.height}
                    })
            return {"ok": True, "windows": windows}
        except Exception as e:
            return {"ok": False, "error": str(e)}
    
    # ── 剪贴板感知 ──
    def get_clipboard(self):
        """读取剪贴板内容"""
        if not HAS_CLIPBOARD:
            return {"ok": False, "error": "pyperclip not installed"}
        
        try:
            text = pyperclip.paste()
            if text and text != self._last_clipboard:
                self._record({"type": "clipboard_change", "text": text[:500], "time": datetime.now().isoformat()})
                self._last_clipboard = text
            return {"ok": True, "text": text[:2000]}
        except Exception as e:
            return {"ok": False, "error": str(e)}
    
    # ── 综合感知 ──
    def perceive_all(self):
        """一次性获取所有感知数据"""
        result = {
            "timestamp": datetime.now().isoformat(),
            "window": self.get_active_window(),
            "clipboard": self.get_clipboard(),
            "recent_events": self.events[-20:] if self.events else [],
            "capabilities": {
                "watchdog": HAS_WATCHDOG,
                "window": HAS_WINDOW,
                "clipboard": HAS_CLIPBOARD
            }
        }
        return result
    
    def get_recent_events(self, n=50, event_type=None):
        """获取最近的事件"""
        events = self.events
        if event_type:
            events = [e for e in events if e.get("type") == event_type]
        return events[-n:]


# Self-test
if __name__ == "__main__":
    import argparse, json
    parser = argparse.ArgumentParser()
    parser.add_argument("--perceive-all", action="store_true")
    parser.add_argument("--window", action="store_true")
    parser.add_argument("--clipboard", action="store_true")
    args = parser.parse_args()
    ep = EventPerception()
    if args.perceive_all:
        result = ep.perceive_all()
        print(json.dumps(result, default=str, ensure_ascii=False))
    elif args.window:
        result = ep.get_active_window()
        print(json.dumps(result, default=str, ensure_ascii=False))
    elif args.clipboard:
        result = ep.get_clipboard()
        print(json.dumps(result, default=str, ensure_ascii=False))
    else:
        print(f"[event] watchdog: {HAS_WATCHDOG}, window: {HAS_WINDOW}, clipboard: {HAS_CLIPBOARD}")
        result = ep.perceive_all()
        print(json.dumps(result, indent=2, ensure_ascii=False, default=str))
