# CrewAI Adapter for Bailongma Agent Army
# Bridges CrewAI multi-agent orchestration into Bailongma's agent framework

import os
import json
import asyncio
from typing import Optional, Callable

class CrewAIAdapter:
    \"\"\"Adapter for CrewAI multi-agent orchestration framework.\"\"\"
    
    def __init__(self, config: dict = None):
        self.config = config or {}
        self.agents = {}
        self.tasks = {}
        self.crew = None
        self._initialized = False
        
    def initialize(self, llm_config: dict = None) -> bool:
        \"\"\"Initialize CrewAI with LLM configuration.\"\"\"
        try:
            from crewai import Agent, Task, Crew, Process
            self.Agent = Agent
            self.Task = Task
            self.Crew = Crew
            self.Process = Process
            self._initialized = True
            return True
        except ImportError as e:
            print(f"[CrewAIAdapter] CrewAI not installed: {e}")
            return False
    
    def create_agent(self, name: str, role: str, goal: str, backstory: str = "",
                     tools: list = None, llm: str = None) -> dict:
        \"\"\"Create a CrewAI agent.\"\"\"
        if not self._initialized:
            return {"error": "CrewAI not initialized"}
        agent = self.Agent(
            role=role,
            goal=goal,
            backstory=backstory or f"Expert {role}",
            tools=tools or [],
            llm=llm or self.config.get("default_llm", "deepseek-chat"),
            verbose=True
        )
        self.agents[name] = agent
        return {"name": name, "role": role, "status": "created"}
    
    def create_task(self, name: str, description: str, agent_name: str,
                    expected_output: str = "", context: list = None) -> dict:
        \"\"\"Create a task assigned to an agent.\"\"\"
        if agent_name not in self.agents:
            return {"error": f"Agent '{agent_name}' not found"}
        task = self.Task(
            description=description,
            agent=self.agents[agent_name],
            expected_output=expected_output or description
        )
        self.tasks[name] = task
        return {"name": name, "agent": agent_name, "status": "created"}
    
    def form_crew(self, agent_names: list, task_names: list,
                  process: str = "sequential") -> dict:
        \"\"\"Form a crew from existing agents and tasks.\"\"\"
        agents = [self.agents[n] for n in agent_names if n in self.agents]
        tasks = [self.tasks[n] for n in task_names if n in self.tasks]
        process_map = {"sequential": self.Process.sequential, "hierarchical": self.Process.hierarchical}
        self.crew = self.Crew(
            agents=agents,
            tasks=tasks,
            process=process_map.get(process, self.Process.sequential),
            verbose=True
        )
        return {"agents": len(agents), "tasks": len(tasks), "process": process}
    
    async def kickoff(self) -> dict:
        \"\"\"Execute the crew's tasks.\"\"\"
        if not self.crew:
            return {"error": "No crew formed"}
        result = await self.crew.kickoff_async()
        return {"result": str(result), "status": "completed"}
    
    def get_status(self) -> dict:
        return {
            "initialized": self._initialized,
            "agents": list(self.agents.keys()),
            "tasks": list(self.tasks.keys()),
            "crew_formed": self.crew is not None
        }

# Singleton
crewai_adapter = CrewAIAdapter()
