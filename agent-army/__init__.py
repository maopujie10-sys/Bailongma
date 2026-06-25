# Agent Army - Unified Entry Point
# Bailongma Agent军团统一入口

from .adapters.crewai_adapter import CrewAIAdapter
from .adapters.mem0_adapter import Mem0Adapter
from .adapters.browseruse_adapter import BrowserUseAdapter
from .adapters.metagpt_adapter import MetaGPTAdapter

__all__ = [
    "CrewAIAdapter",
    "Mem0Adapter", 
    "BrowserUseAdapter",
    "MetaGPTAdapter"
]

class AgentArmy:
    \"\"\"Agent军团总指挥：统一管理所有Agent框架适配器\"\"\"
    
    def __init__(self):
        self.crewai = CrewAIAdapter()
        self.mem0 = Mem0Adapter()
        self.browseruse = BrowserUseAdapter()
        self.metagpt = MetaGPTAdapter()
        self._adapters = {
            "crewai": self.crewai,
            "mem0": self.mem0,
            "browseruse": self.browseruse,
            "metagpt": self.metagpt
        }
    
    def get_adapter(self, name: str):
        return self._adapters.get(name)
    
    def list_adapters(self):
        return list(self._adapters.keys())
    
    def status(self):
        return {
            "adapters_loaded": len(self._adapters),
            "available": list(self._adapters.keys())
        }
