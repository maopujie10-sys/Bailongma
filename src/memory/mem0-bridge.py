#!/usr/bin/env python3
"""
mem0-bridge.py — Mem0 Python Bridge for Bailongma Node.js
通过 stdin/stdout JSON 通信，Node 端 spawn 此脚本进行 Mem0 操作

协议：
  输入 (stdin): JSON { "action": "init|search|add|get_by_entity|get_person_memory|health", ... }
  输出 (stdout): JSON { "ok": true|false, ... }
"""

import sys
import json
import os
import traceback

_mem0_client = None
_initialized = False

# 默认使用本地 LLM (llama.cpp server)
DEFAULT_LLM_CONFIG = {
    "provider": "openai",
    "config": {
        "api_key": "not-needed",
        "model": "local-model",
        "openai_base_url": "http://127.0.0.1:8090/v1",
    }
}

DEFAULT_EMBEDDER_CONFIG = {
    "provider": "openai",
    "config": {
        "api_key": "not-needed",
        "model": "text-embedding-3-small",
        "openai_base_url": "http://127.0.0.1:8090/v1",
    }
}

def init_mem0(config):
    global _mem0_client, _initialized
    try:
        from mem0 import Memory
        
        llm_config = DEFAULT_LLM_CONFIG.copy()
        embedder_config = DEFAULT_EMBEDDER_CONFIG.copy()
        
        # 允许覆盖 base URL
        if config.get("openaiBaseUrl"):
            llm_config["config"]["openai_base_url"] = config["openaiBaseUrl"]
            embedder_config["config"]["openai_base_url"] = config["openaiBaseUrl"]
        if config.get("openaiApiKey"):
            llm_config["config"]["api_key"] = config["openaiApiKey"]
            embedder_config["config"]["api_key"] = config["openaiApiKey"]
        
        _mem0_client = Memory.from_config({
            "vector_store": {
                "provider": config.get("vectorStore", "chroma"),
                "config": {
                    "collection_name": config.get("collectionName", "bailongma_mem0"),
                    "path": os.path.join(os.path.dirname(__file__), "..", "..", "data", "mem0_chroma"),
                }
            },
            "llm": llm_config,
            "embedder": embedder_config,
            "history_db_path": os.path.join(os.path.dirname(__file__), "..", "..", "data", "mem0_history.db"),
        })
        _initialized = True
        return {"ok": True, "message": "Mem0 initialized"}
    except Exception as e:
        return {"ok": False, "error": str(e), "traceback": traceback.format_exc()}

def search_memories(query, limit=10):
    if not _mem0_client:
        return {"ok": False, "error": "Mem0 not initialized"}
    try:
        results = _mem0_client.search(query, limit=limit)
        memories = []
        for r in results:
            memories.append({
                "id": r.get("id", ""),
                "memory": r.get("memory", ""),
                "score": r.get("score", 0),
                "metadata": r.get("metadata", {}),
                "created_at": str(r.get("created_at", "")),
            })
        return {"ok": True, "memories": memories}
    except Exception as e:
        return {"ok": False, "error": str(e)}

def add_memory(content, metadata=None):
    if not _mem0_client:
        return {"ok": False, "error": "Mem0 not initialized"}
    try:
        result = _mem0_client.add(content, user_id=metadata.get("user_id", "default") if metadata else "default", metadata=metadata or {})
        return {"ok": True, "result": result}
    except Exception as e:
        return {"ok": False, "error": str(e)}

def get_by_entity(entity_id, limit=20):
    if not _mem0_client:
        return {"ok": False, "error": "Mem0 not initialized"}
    try:
        results = _mem0_client.get_all(user_id=entity_id, limit=limit)
        memories = []
        for r in results:
            memories.append({
                "id": r.get("id", ""),
                "memory": r.get("memory", ""),
                "metadata": r.get("metadata", {}),
                "created_at": str(r.get("created_at", "")),
            })
        return {"ok": True, "memories": memories}
    except Exception as e:
        return {"ok": False, "error": str(e)}

def get_person_memory(entity_id):
    if not _mem0_client:
        return {"ok": False, "error": "Mem0 not initialized"}
    try:
        results = _mem0_client.get_all(user_id=entity_id, limit=100)
        profile = {
            "entity_id": entity_id,
            "memory_count": len(results),
            "recent_topics": [],
            "key_facts": [],
        }
        for r in results[:20]:
            mem = r.get("memory", "")
            if mem:
                profile["recent_topics"].append(mem[:200])
        return {"ok": True, "profile": profile}
    except Exception as e:
        return {"ok": False, "error": str(e)}

def health_check():
    return {
        "ok": _initialized,
        "initialized": _initialized,
        "mem0_version": "2.0.7",
    }

def main():
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            print(json.dumps({"ok": False, "error": "Empty input"}))
            return
        
        req = json.loads(raw)
        action = req.get("action", "")
        
        if action == "init":
            result = init_mem0(req.get("config", {}))
        elif action == "search":
            result = search_memories(req.get("query", ""), req.get("limit", 10))
        elif action == "add":
            result = add_memory(req.get("content", ""), req.get("metadata"))
        elif action == "get_by_entity":
            result = get_by_entity(req.get("entityId", "default"), req.get("limit", 20))
        elif action == "get_person_memory":
            result = get_person_memory(req.get("entityId", "default"))
        elif action == "health":
            result = health_check()
        else:
            result = {"ok": False, "error": f"Unknown action: {action}"}
        
        print(json.dumps(result, ensure_ascii=False, default=str))
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e), "traceback": traceback.format_exc()}))

if __name__ == "__main__":
    main()
