# Browser-Use Adapter for Bailongma Agent Army
# Bridges browser-use web automation into Bailongma's agent framework

import os
import json
import asyncio
from typing import Optional, Any

class BrowserUseAdapter:
    \"\"\"Adapter for browser-use web automation framework.\"\"\"
    
    def __init__(self, config: dict = None):
        self.config = config or {}
        self.agent = None
        self.browser = None
        self._initialized = False
        
    def initialize(self, llm_config: dict = None, headless: bool = True) -> bool:
        try:
            from browser_use import Agent
            from langchain_openai import ChatOpenAI
            self.Agent = Agent
            self.ChatOpenAI = ChatOpenAI
            self._initialized = True
            return True
        except ImportError as e:
            print(f"[BrowserUseAdapter] browser-use not installed: {e}")
            return False
    
    async def create_agent(self, task: str, llm_model: str = None, 
                           headless: bool = None) -> dict:
        if not self._initialized:
            return {"error": "browser-use not initialized"}
        try:
            model = llm_model or self.config.get("default_llm", "deepseek-chat")
            llm = self.ChatOpenAI(model=model)
            self.agent = self.Agent(task=task, llm=llm)
            return {"status": "created", "task": task}
        except Exception as e:
            return {"error": str(e)}
    
    async def run(self, max_steps: int = 100) -> dict:
        if not self.agent:
            return {"error": "No agent created"}
        try:
            result = await self.agent.run(max_steps=max_steps)
            return {"status": "completed", "result": str(result)}
        except Exception as e:
            return {"error": str(e)}
    
    async def execute_task(self, task: str, llm_model: str = None, 
                           max_steps: int = 100) -> dict:
        create_result = await self.create_agent(task, llm_model)
        if "error" in create_result:
            return create_result
        return await self.run(max_steps)
    
    def get_status(self) -> dict:
        return {
            "initialized": self._initialized,
            "agent_active": self.agent is not None
        }

browser_use_adapter = BrowserUseAdapter()
