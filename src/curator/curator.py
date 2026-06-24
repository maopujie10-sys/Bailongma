# Curator - Content curation engine for Bailongma
# Extracts knowledge, auto-tags, and organizes information from conversations and documents

import re
import json
from typing import Optional
from datetime import datetime

class Curator:
    \"\"\"Content curation engine: extract, tag, organize.\"\"\"
    
    def __init__(self, config: dict = None):
        self.config = config or {}
        self.extractors = {}
        self.tags = set()
        self._initialized = False
    
    def initialize(self) -> bool:
        self._initialized = True
        return True
    
    def extract_knowledge(self, text: str, source: str = "conversation") -> list:
        \"\"\"Extract knowledge items from text.\"\"\"
        items = []
        sentences = re.split(r'[.。!！?？\n]+', text)
        for s in sentences:
            s = s.strip()
            if len(s) > 20:
                items.append({
                    "text": s,
                    "source": source,
                    "timestamp": datetime.now().isoformat(),
                    "type": self._classify(s)
                })
        return items
    
    def _classify(self, text: str) -> str:
        \"\"\"Classify text into knowledge type.\"\"\"
        patterns = {
            "fact": r'(是|为|等于|位于|属于|包含|有|在)',
            "procedure": r'(步骤|首先|然后|最后|方法|如何|怎么)',
            "constraint": r'(必须|不能|禁止|一定要|绝不|铁律)',
            "knowledge": r'(原理|概念|定义|指|即|所谓)',
        }
        for ktype, pattern in patterns.items():
            if re.search(pattern, text):
                return ktype
        return "fact"
    
    def auto_tag(self, text: str) -> list:
        \"\"\"Auto-generate tags from text.\"\"\"
        tags = []
        keywords = re.findall(r'[A-Z][a-z]+|[A-Z]{2,}|[\u4e00-\u9fff]{2,4}', text)
        seen = set()
        for kw in keywords:
            if kw.lower() not in seen and len(kw) >= 2:
                tags.append(kw)
                seen.add(kw.lower())
        return tags[:10]
    
    def curate_conversation(self, messages: list) -> dict:
        \"\"\"Curate a conversation into structured knowledge.\"\"\"
        all_items = []
        all_tags = set()
        for msg in messages:
            content = msg.get("content", "")
            items = self.extract_knowledge(content, "conversation")
            for item in items:
                item["tags"] = self.auto_tag(item["text"])
                all_tags.update(item["tags"])
            all_items.extend(items)
        return {
            "items": all_items,
            "tags": list(all_tags),
            "count": len(all_items),
            "timestamp": datetime.now().isoformat()
        }
    
    def get_status(self) -> dict:
        return {"initialized": self._initialized, "extractors": list(self.extractors.keys())}

curator = Curator()
