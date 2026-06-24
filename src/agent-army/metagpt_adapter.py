# MetaGPT Adapter for Bailongma Agent Army
# Bridges MetaGPT multi-role software development into Bailongma's agent framework

import os
import json
import asyncio
from typing import Optional, Any

class MetaGPTAdapter:
    \"\"\"Adapter for MetaGPT multi-role software development framework.\"\"\"
    
    def __init__(self, config: dict = None):
        self.config = config or {}
        self.company = None
        self._initialized = False
        
    def initialize(self, llm_config: dict = None) -> bool:
        try:
            from metagpt.software_company import SoftwareCompany
            from metagpt.roles import Architect, Engineer, ProductManager, ProjectManager
            self.SoftwareCompany = SoftwareCompany
            self.Architect = Architect
            self.Engineer = Engineer
            self.ProductManager = ProductManager
            self.ProjectManager = ProjectManager
            self._initialized = True
            return True
        except ImportError as e:
            print(f"[MetaGPTAdapter] MetaGPT not installed: {e}")
            return False
    
    def create_company(self, idea: str, investment: float = 3.0,
                       n_round: int = 5) -> dict:
        if not self._initialized:
            return {"error": "MetaGPT not initialized"}
        try:
            self.company = self.SoftwareCompany()
            self.company.investment = investment
            self.company.n_round = n_round
            self.company.idea = idea
            return {"status": "created", "idea": idea, "investment": investment}
        except Exception as e:
            return {"error": str(e)}
    
    async def run_project(self, idea: str, investment: float = 3.0,
                          n_round: int = 5) -> dict:
        if not self._initialized:
            return {"error": "MetaGPT not initialized"}
        try:
            company = self.SoftwareCompany()
            company.investment = investment
            company.n_round = n_round
            history = await company.run(idea)
            return {"status": "completed", "history": str(history)}
        except Exception as e:
            return {"error": str(e)}
    
    def get_roles(self) -> list:
        if not self._initialized:
            return []
        return ["Architect", "Engineer", "ProductManager", "ProjectManager"]
    
    def get_status(self) -> dict:
        return {
            "initialized": self._initialized,
            "company_active": self.company is not None,
            "roles": self.get_roles()
        }

metagpt_adapter = MetaGPTAdapter()
