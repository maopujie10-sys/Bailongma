# Agent Army - Mem0 Adapter
# 将Mem0记忆系统接入Bailongma记忆层

import os
import json
from typing import Optional, List, Dict, Any
from mem0 import Memory

class Mem0Adapter:
    \"\"\"Mem0适配器：将Mem0长期记忆能力接入Bailongma\"\"\"
    
    def __init__(self, config: Optional[Dict] = None):
        self.config = config or {
            "vector_store": {
                "provider": os.getenv("MEM0_VECTOR_PROVIDER", "chroma"),
                "config": {
                    "collection_name": os.getenv("MEM0_COLLECTION", "bailongma_memory"),
                    "path": os.getenv("MEM0_DB_PATH", "./data/mem0_db")
                }
            },
            "llm": {
                "provider": "deepseek",
                "config": {
                    "model": "deepseek-chat",
                    "api_key": os.getenv("DEEPSEEK_API_KEY", "")
                }
            },
            "embedder": {
                "provider": "openai",
                "config": {
                    "model": "text-embedding-3-small",
                    "api_key": os.getenv("OPENAI_API_KEY", "")
                }
            }
        }
        self.memory = Memory.from_config(self.config)
    
    def add(self, content: str, user_id: str = "default", 
            metadata: Optional[Dict] = None) -> Dict:
        return self.memory.add(content, user_id=user_id, metadata=metadata or {})
    
    def search(self, query: str, user_id: str = "default", 
               limit: int = 10) -> List[Dict]:
        return self.memory.search(query, user_id=user_id, limit=limit)
    
    def get_all(self, user_id: str = "default") -> List[Dict]:
        return self.memory.get_all(user_id=user_id)
    
    def delete(self, memory_id: str) -> bool:
        self.memory.delete(memory_id)
        return True
    
    def update(self, memory_id: str, content: str) -> bool:
        self.memory.update(memory_id, content)
        return True
    
    def get_stats(self) -> Dict:
        all_memories = self.memory.get_all()
        return {
            "total_count": len(all_memories),
            "provider": self.config["vector_store"]["provider"]
        }
