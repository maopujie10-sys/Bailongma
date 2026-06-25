# Agent Army - MetaGPT Adapter
# 将MetaGPT多Agent协作框架接入Bailongma

import os
import json
from typing import Optional, List, Dict, Any
from metagpt.software_company import SoftwareCompany
from metagpt.roles import Architect, Engineer, ProductManager, ProjectManager

class MetaGPTAdapter:
    \"\"\"MetaGPT适配器：将MetaGPT软件公司模式接入Bailongma\"\"\"
    
    def __init__(self, config: Optional[Dict] = None):
        self.config = config or {
            "model": os.getenv("METAGPT_MODEL", "deepseek-chat"),
            "api_key": os.getenv("DEEPSEEK_API_KEY", ""),
            "base_url": os.getenv("METAGPT_BASE_URL", "https://api.deepseek.com")
        }
        self.company: Optional[SoftwareCompany] = None
        self.roles: Dict[str, Any] = {}
    
    def create_company(self, idea: str, investment: float = 3.0,
                       n_round: int = 5) -> SoftwareCompany:
        self.company = SoftwareCompany()
        self.company.hire([
            ProductManager(),
            Architect(),
            ProjectManager(),
            Engineer(n_engineer=2)
        ])
        self.company.invest(investment)
        self.company.start_project(idea)
        return self.company
    
    async def run_project(self, idea: str, investment: float = 3.0,
                          n_round: int = 5) -> Dict:
        company = self.create_company(idea, investment, n_round)
        history = await company.run(n_round=n_round)
        return {
            "idea": idea,
            "investment": investment,
            "rounds": n_round,
            "history": str(history),
            "success": True
        }
    
    def hire_role(self, role_class: Any, name: str = None) -> str:
        role_name = name or role_class.__name__
        self.roles[role_name] = role_class()
        return role_name
    
    def list_roles(self) -> List[str]:
        return list(self.roles.keys())
    
    def get_status(self) -> Dict:
        return {
            "company_active": self.company is not None,
            "roles_hired": len(self.roles),
            "config_model": self.config.get("model", "unknown")
        }
