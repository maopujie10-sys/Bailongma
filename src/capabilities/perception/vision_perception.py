# vision_perception.py - Visual perception module
# Screen capture + OCR + image description

import os
import time
import base64
import json
from datetime import datetime
from pathlib import Path

try:
    import pyautogui
    HAS_PYAUTOGUI = True
except ImportError:
    HAS_PYAUTOGUI = False

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

try:
    import pytesseract
    HAS_TESSERACT = True
except ImportError:
    HAS_TESSERACT = False


class VisionPerception:
    def __init__(self, save_dir=None):
        self.save_dir = save_dir or str(Path.home() / "Bailongma" / "screenshots")
        os.makedirs(self.save_dir, exist_ok=True)
        self.last_screenshot = None
        self.last_ocr_text = ""

    def capture_screen(self, region=None, save=True):
        if not HAS_PYAUTOGUI:
            return {"error": "pyautogui not installed", "ok": False}
        try:
            img = pyautogui.screenshot(region=region)
            self.last_screenshot = img
            result = {"ok": True, "size": img.size, "timestamp": datetime.now().isoformat()}
            if save:
                filename = f"screenshot_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.png"
                filepath = os.path.join(self.save_dir, filename)
                img.save(filepath)
                result["path"] = filepath
            import io
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            result["base64"] = base64.b64encode(buf.getvalue()).decode("utf-8")
            return result
        except Exception as e:
            return {"error": str(e), "ok": False}

    def ocr(self, image=None, lang="chi_sim+eng"):
        if not HAS_TESSERACT:
            return {"error": "pytesseract not installed", "ok": False}
        img = image or self.last_screenshot
        if img is None:
            return {"error": "no image to OCR", "ok": False}
        try:
            text = pytesseract.image_to_string(img, lang=lang)
            self.last_ocr_text = text
            return {"ok": True, "text": text, "timestamp": datetime.now().isoformat()}
        except Exception as e:
            return {"error": str(e), "ok": False}

    def describe(self, image=None):
        img = image or self.last_screenshot
        if img is None:
            return {"error": "no image to describe", "ok": False}
        try:
            w, h = img.size
            if HAS_PIL:
                gray = img.convert("L")
                pixels = list(gray.getdata())
                avg_brightness = sum(pixels) / len(pixels) if pixels else 0
            else:
                avg_brightness = 0
            return {
                "ok": True,
                "size": {"width": w, "height": h},
                "avg_brightness": round(avg_brightness, 1),
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            return {"error": str(e), "ok": False}

    def status(self):
        return {
            "pyautogui": HAS_PYAUTOGUI,
            "pil": HAS_PIL,
            "tesseract": HAS_TESSERACT,
            "save_dir": self.save_dir,
            "last_screenshot_size": self.last_screenshot.size if self.last_screenshot else None
        }


if __name__ == "__main__":
    vp = VisionPerception()
    print("VisionPerception status:", json.dumps(vp.status(), indent=2))
    result = vp.capture_screen()
    print("capture:", "ok" if result.get("ok") else result.get("error"))
    if result.get("ok"):
        ocr_result = vp.ocr()
        print("ocr:", ocr_result.get("text", "")[:200] if ocr_result.get("ok") else ocr_result.get("error"))
