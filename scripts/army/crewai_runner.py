# CrewAI runner — 多Agent协作编排
import sys, os, json

task = sys.argv[1] if len(sys.argv) > 1 else ""

# 从环境变量获取 LLM 配置（由 Bailongma 注入）
api_key = os.environ.get("OPENAI_API_KEY", "")
base_url = os.environ.get("OPENAI_BASE_URL", "")
model = os.environ.get("LLM_MODEL", "gpt-4o")

if not api_key:
    print(json.dumps({"ok": False, "error": "OPENAI_API_KEY not set. Bailongma LLM config not available."}))
    sys.exit(1)

try:
    from crewai import Agent, Task, Crew, Process, LLM
    
    # 用 Bailongma 的 LLM 配置
    llm = LLM(model=model, api_key=api_key, base_url=base_url) if base_url else LLM(model=model, api_key=api_key)
    
    worker = Agent(
        role="执行者",
        goal="完成用户分配的任务并返回结果",
        backstory="你是一个高效的执行Agent，擅长理解任务并产出结果。",
        allow_delegation=False,
        verbose=False,
        llm=llm,
    )
    
    work = Task(
        description=task,
        expected_output="任务执行结果，简洁明了",
        agent=worker,
    )
    
    crew = Crew(
        agents=[worker],
        tasks=[work],
        process=Process.sequential,
        verbose=False,
    )
    
    result = crew.kickoff()
    print(str(result))
    
except ImportError as e:
    print(json.dumps({"ok": False, "error": f"CrewAI not installed: {e}"}))
    sys.exit(1)
except Exception as e:
    print(json.dumps({"ok": False, "error": str(e)}))
    sys.exit(1)
