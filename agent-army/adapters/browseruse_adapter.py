# Agent Army - Browser-Use Adapter
# 将Browser-Use浏览器自动化接入Bailongma执行层

import os
import json
from typing import Optional, List, Dict, Any
from browser_use import Agent as BrowserAgent
from langchain_openai import ChatOpenAI

class BrowserUseAdapter:
    \"\"\"Browser-Use适配器：将浏览器自动化能力接入Bailongma\"\"\"
    
    def __init__(self, llm_config: Optional[Dict] = None):
        self.llm = ChatOpenAI(
            model=llm_config.get("model", "deepseek-chat") if llm_config else "deepseek-chat",
            base_url=llm_config.get("base_url", "https://api.deepseek.com") if llm_config else "https://api.deepseek.com",
            api_key=llm_config.get("api_key", os.getenv("DEEPSEEK_API_KEY", "")) if llm_config else os.getenv("DEEPSEEK_API_KEY", "")
        )
        self.sessions: Dict[str, BrowserAgent] = {}
    
    async def create_session(self, task: str, session_id: str = None) -> str:
        sid = session_id or f"browser_{len(self.sessions)}"
        agent = BrowserAgent(task=task, llm=self.llm)
        self.sessions[sid] = agent
        return sid
    
    async def run_session(self, session_id: str) -> Dict:
        agent = self.sessions.get(session_id)
        if not agent:
            raise ValueError(f"Session '{session_id}' not found")
        result = await agent.run()
        return {
            "session_id": session_id,
            "result": str(result),
            "success": True
        }
    
    async def run_task(self, task: str) -> Dict:
        agent = BrowserAgent(task=task, llm=self.llm)
        result = await agent.run()
        return {"task": task, "result": str(result), "success": True}
    
    def list_sessions(self) -> List[str]:
        return list(self.sessions.keys())
    
    def close_session(self, session_id: str) -> bool:
        if session_id in self.sessions:
            del self.sessions[session_id]
            return True
        return False
