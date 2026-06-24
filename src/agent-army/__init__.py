# Agent Army index - unified entry point for all agent framework adapters

from .crewai_adapter import crewai_adapter
from .mem0_adapter import mem0_adapter
from .browser_use_adapter import browser_use_adapter
from .metagpt_adapter import metagpt_adapter

class AgentArmy:
    \"\"\"Unified agent army orchestrator for Bailongma.\"\"\"
    
    def __init__(self):
        self.adapters = {
            "crewai": crewai_adapter,
            "mem0": mem0_adapter,
            "browser_use": browser_use_adapter,
            "metagpt": metagpt_adapter
        }
    
    def get_adapter(self, name: str):
        return self.adapters.get(name)
    
    def initialize_all(self, llm_config: dict = None) -> dict:
        results = {}
        for name, adapter in self.adapters.items():
            results[name] = adapter.initialize(llm_config)
        return results
    
    def get_status(self) -> dict:
        return {name: adapter.get_status() for name, adapter in self.adapters.items()}
    
    def list_adapters(self) -> list:
        return list(self.adapters.keys())

agent_army = AgentArmy()
