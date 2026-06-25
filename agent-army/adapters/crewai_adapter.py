# Agent Army - CrewAI Adapter
# 将CrewAI Agent框架接入Bailongma指挥体系

import os
import json
from typing import Optional, List, Dict, Any
from crewai import Agent, Task, Crew, Process

class CrewAIAdapter:
    \"\"\"CrewAI适配器：将CrewAI Agent编排能力接入Bailongma\"\"\"
    
    def __init__(self, llm_config: Optional[Dict] = None):
        self.llm_config = llm_config or {
            "model": os.getenv("CREWAI_MODEL", "deepseek-chat"),
            "base_url": os.getenv("CREWAI_BASE_URL", "https://api.deepseek.com"),
            "api_key": os.getenv("DEEPSEEK_API_KEY", "")
        }
        self.agents: Dict[str, Agent] = {}
        self.tasks: Dict[str, Task] = {}
    
    def create_agent(self, name: str, role: str, goal: str, 
                     backstory: str = "", tools: List = None,
                     allow_delegation: bool = True,
                     verbose: bool = True) -> Agent:
        agent = Agent(
            role=role,
            goal=goal,
            backstory=backstory or f"你是{name}，{role}。你的目标是{goal}。",
            tools=tools or [],
            allow_delegation=allow_delegation,
            verbose=verbose,
            llm=self.llm_config
        )
        self.agents[name] = agent
        return agent
    
    def create_task(self, name: str, description: str, 
                    agent_name: str,
                    expected_output: str = "",
                    context_tasks: List[str] = None) -> Task:
        agent = self.agents.get(agent_name)
        if not agent:
            raise ValueError(f"Agent '{agent_name}' not found")
        
        context = [self.tasks[t] for t in (context_tasks or []) if t in self.tasks]
        task = Task(
            description=description,
            agent=agent,
            expected_output=expected_output or description,
            context=context if context else None
        )
        self.tasks[name] = task
        return task
    
    def run_crew(self, task_names: List[str], process: Process = Process.sequential) -> str:
        tasks = [self.tasks[t] for t in task_names if t in self.tasks]
        agents = list(set(task.agent for task in tasks))
        crew = Crew(agents=agents, tasks=tasks, process=process, verbose=True)
        result = crew.kickoff()
        return str(result)
    
    def run_single(self, agent_name: str, task_description: str) -> str:
        agent = self.agents.get(agent_name)
        if not agent:
            raise ValueError(f"Agent '{agent_name}' not found")
        task = Task(description=task_description, agent=agent, expected_output=task_description)
        crew = Crew(agents=[agent], tasks=[task], verbose=True)
        return str(crew.kickoff())
    
    def list_agents(self) -> List[str]:
        return list(self.agents.keys())
    
    def list_tasks(self) -> List[str]:
        return list(self.tasks.keys())
