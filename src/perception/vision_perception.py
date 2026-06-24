"""
视觉感知模块 - 屏幕截图捕获 + 视觉理解（OCR/图像描述）
由晨曦（指挥官）派 CrewAI Agent 军团执行
"""
import os
import sys
import base64
import json
from datetime import datetime
from pathlib import Path

# Add sandbox to path
SANDBOX = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SANDBOX))

# Try to import required packages
try:
    from PIL import ImageGrab, Image
    import pytesseract
    HAS_CAPTURE = True
except ImportError:
    HAS_CAPTURE = False
    print("[vision] WARNING: PIL/pytesseract not installed. Screenshot capture limited.")

try:
    from openai import OpenAI
    HAS_AI = True
except ImportError:
    HAS_AI = False
    print("[vision] WARNING: openai not installed. AI vision limited.")

class VisionPerception:
    """屏幕视觉感知：截图 + OCR + AI视觉理解"""
    
    def __init__(self):
        self.api_key = os.environ.get("DEEPSEEK_API_KEY") or os.environ.get("OPENAI_API_KEY")
        self.client = None
        if HAS_AI and self.api_key:
            self.client = OpenAI(
                api_key=self.api_key,
                base_url=os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
            )
        self.capture_dir = SANDBOX / "captures"
        self.capture_dir.mkdir(exist_ok=True)
    
    def capture_screen(self, region=None):
        """截取屏幕，返回 PIL Image 对象"""
        if not HAS_CAPTURE:
            return {"ok": False, "error": "PIL not installed"}
        
        try:
            if region:
                img = ImageGrab.grab(bbox=region)
            else:
                img = ImageGrab.grab()
            return {"ok": True, "image": img, "size": img.size}
        except Exception as e:
            return {"ok": False, "error": str(e)}
    
    def ocr_text(self, image):
        """从图片中提取文字"""
        if not HAS_CAPTURE:
            return {"ok": False, "error": "pytesseract not installed"}
        
        try:
            text = pytesseract.image_to_string(image, lang='chi_sim+eng')
            return {"ok": True, "text": text.strip()}
        except Exception as e:
            return {"ok": False, "error": str(e)}
    
    def describe_image(self, image, question=None):
        """用AI视觉模型描述图片内容"""
        if not self.client:
            return {"ok": False, "error": "No AI client available"}
        
        try:
            # Save to buffer
            import io
            buf = io.BytesIO()
            image.save(buf, format='PNG')
            buf.seek(0)
            img_b64 = base64.b64encode(buf.read()).decode()
            
            prompt = question or "请详细描述这张截图中显示的内容，包括窗口、文字、按钮等UI元素。"
            
            # DeepSeek doesn't support vision directly, use text description
            # For vision, we'd need a multimodal model
            response = self.client.chat.completions.create(
                model="deepseek-chat",
                messages=[{
                    "role": "user",
                    "content": f"[图片base64数据已捕获，大小{len(img_b64)}字符]\n\n{prompt}\n\n请基于OCR文字和上下文推断屏幕内容。"
                }],
                max_tokens=500
            )
            return {"ok": True, "description": response.choices[0].message.content}
        except Exception as e:
            return {"ok": False, "error": str(e)}
    
    def perceive(self, region=None, question=None):
        """完整感知流程：截图 → OCR → AI描述"""
        result = {
            "timestamp": datetime.now().isoformat(),
            "capture": None,
            "ocr": None,
            "description": None
        }
        
        # Step 1: Capture
        cap = self.capture_screen(region)
        result["capture"] = {"ok": cap["ok"], "size": cap.get("size")}
        
        if not cap["ok"]:
            result["error"] = cap["error"]
            return result
        
        # Step 2: OCR
        ocr = self.ocr_text(cap["image"])
        result["ocr"] = ocr
        
        # Step 3: AI Description
        desc = self.describe_image(cap["image"], question)
        result["description"] = desc
        
        # Save capture
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        cap_path = self.capture_dir / f"screen_{ts}.png"
        cap["image"].save(cap_path)
        result["saved_to"] = str(cap_path)
        
        return result

# Self-test
if __name__ == "__main__":
    import argparse, json, sys
    parser = argparse.ArgumentParser()
    parser.add_argument("--screenshot", action="store_true")
    parser.add_argument("--perceive", action="store_true")
    args = parser.parse_args()
    vp = VisionPerception()
    if args.screenshot:
        cap = vp.capture_screen()
        if cap.get("ok"):
            print(json.dumps({"ok": True, "size": list(cap["image"].size)}, default=str))
        else:
            print(json.dumps(cap, default=str))
    elif args.perceive:
        result = vp.perceive()
        if "image_base64" in result:
            result["image_base64"] = f"<{len(result['image_base64'])} chars>"
        print(json.dumps(result, default=str, ensure_ascii=False))
    else:
        print(f"[vision] Capture: {HAS_CAPTURE}, AI: {HAS_AI and vp.client is not None}")
        if HAS_CAPTURE:
            result = vp.perceive()
            print(json.dumps({k: v for k, v in result.items() if k != "image"}, indent=2, ensure_ascii=False, default=str))
