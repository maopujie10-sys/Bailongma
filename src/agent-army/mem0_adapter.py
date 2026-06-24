# Mem0 Adapter for Bailongma Agent Army
# Bridges Mem0 memory layer into Bailongma's agent framework

import os
import json
from typing import Optional, Any

class Mem0Adapter:
    \"\"\"Adapter for Mem0 memory management framework.\"\"\"
    
    def __init__(self, config: dict = None):
        self.config = config or {}
        self.memory = None
        self._initialized = False
        
    def initialize(self, user_id: str = "default", api_key: str = None) -> bool:
        try:
            from mem0 import Memory
            self.memory = Memory()
            self._initialized = True
            return True
        except ImportError:
            try:
                from mem0 import MemoryClient
                key = api_key or os.environ.get("MEM0_API_KEY", "")
                self.memory = MemoryClient(api_key=key, user_id=user_id)
                self._initialized = True
                return True
            except ImportError as e:
                print(f"[Mem0Adapter] Mem0 not installed: {e}")
                return False
    
    def add(self, messages: list, user_id: str = None, metadata: dict = None) -> dict:
        if not self._initialized:
            return {"error": "Mem0 not initialized"}
        try:
            result = self.memory.add(messages, user_id=user_id or "default", metadata=metadata or {})
            return {"status": "added", "result": result}
        except Exception as e:
            return {"error": str(e)}
    
    def search(self, query: str, user_id: str = None, limit: int = 10) -> dict:
        if not self._initialized:
            return {"error": "Mem0 not initialized"}
        try:
            results = self.memory.search(query, user_id=user_id or "default", limit=limit)
            return {"status": "ok", "results": results}
        except Exception as e:
            return {"error": str(e)}
    
    def get_all(self, user_id: str = None) -> dict:
        if not self._initialized:
            return {"error": "Mem0 not initialized"}
        try:
            results = self.memory.get_all(user_id=user_id or "default")
            return {"status": "ok", "results": results}
        except Exception as e:
            return {"error": str(e)}
    
    def delete(self, memory_id: str) -> dict:
        if not self._initialized:
            return {"error": "Mem0 not initialized"}
        try:
            self.memory.delete(memory_id)
            return {"status": "deleted", "id": memory_id}
        except Exception as e:
            return {"error": str(e)}
    
    def get_status(self) -> dict:
        return {"initialized": self._initialized, "provider": type(self.memory).__name__ if self.memory else "none"}

mem0_adapter = Mem0Adapter()
