/**
 * 执行层统一调度器 — Army Adapter
 * 
 * 封装 CrewAI / MetaGPT / Browser-use 的 Python 调用，
 * 通过 child_process 派活给 Python Agent 军团，收集结果返回。
 * 
 * 三个引擎：
 *   crewai     — 多Agent角色协作编排
 *   metagpt    — 软件公司多Agent协作
 *   browser-use — 浏览器操控
 */

import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { config } from '../config.js'

// Python 脚本目录 — 用 fileURLToPath 避免 Windows 双盘符问题
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCRIPTS_DIR = path.join(__dirname, '..', '..', 'scripts', 'army')

// 确保脚本目录存在
function ensureScriptsDir() {
  if (!fs.existsSync(SCRIPTS_DIR)) {
    fs.mkdirSync(SCRIPTS_DIR, { recursive: true })
  }
}

/**
 * 调用 Python 引擎执行任务
 * @param {object} params - { engine, task, agents, config }
 * @returns {Promise<{ok: boolean, result: string, engine: string, error?: string}>}
 */
export async function dispatchToArmy({ engine, task, agents, config: taskConfig } = {}) {
  if (!engine || !task) {
    return { ok: false, error: 'dispatch_to_army requires engine and task' }
  }

  const timeout = Math.min(Math.max(taskConfig?.timeout || 120, 10), 600)

  const scriptPath = path.join(SCRIPTS_DIR, `${engine}_runner.py`)
  
  // 如果 runner 脚本不存在，动态生成
  if (!fs.existsSync(scriptPath)) {
    ensureScriptsDir()
    const script = generateRunnerScript(engine)
    fs.writeFileSync(scriptPath, script, 'utf-8')
  }

  // 把 Bailongma 的 LLM 配置通过环境变量传给 Python
  const env = { ...process.env }
  if (config.apiKey && config.apiKey !== 'none') {
    env.OPENAI_API_KEY = config.apiKey
  }
  if (config.baseURL) {
    env.OPENAI_BASE_URL = config.baseURL
  }
  // 如果有显式传入的模型名
  if (taskConfig?.model) {
    env.LLM_MODEL = taskConfig.model
  } else if (config.model) {
    env.LLM_MODEL = config.model
  }

  return new Promise((resolve) => {
    const proc = spawn('python', [scriptPath, task], {
      timeout: timeout * 1000,
      windowsHide: true,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString() })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({
          ok: true,
          engine,
          result: stdout.trim() || '(empty)',
        })
      } else {
        resolve({
          ok: false,
          engine,
          error: stderr.trim() || stdout.trim() || `exit code ${code}`,
          result: stdout.trim(),
        })
      }
    })

    proc.on('error', (err) => {
      resolve({
        ok: false,
        engine,
        error: `spawn failed: ${err.message}`,
      })
    })
  })
}

/**
 * 生成 Python runner 脚本
 */
function generateRunnerScript(engine) {
  switch (engine) {
    case 'crewai':
      return `# CrewAI runner — 多Agent协作编排
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
`

    case 'metagpt':
      return `# MetaGPT runner — 软件公司多Agent协作
import sys, os, json

task = sys.argv[1] if len(sys.argv) > 1 else ""

api_key = os.environ.get("OPENAI_API_KEY", "")
base_url = os.environ.get("OPENAI_BASE_URL", "")
model = os.environ.get("LLM_MODEL", "gpt-4o")

if not api_key:
    print(json.dumps({"ok": False, "error": "OPENAI_API_KEY not set"}))
    sys.exit(1)

try:
    os.environ["OPENAI_API_KEY"] = api_key
    if base_url:
        os.environ["OPENAI_BASE_URL"] = base_url
    
    from metagpt.software_company import generate_repo, ProjectRepo
    from metagpt.actions import UserRequirement
    
    repo = ProjectRepo(".")
    result = await generate_repo(
        UserRequirement(content=task),
        investment=3.0,
        n_round=5,
    )
    print(str(result))
    
except ImportError as e:
    print(json.dumps({"ok": False, "error": f"MetaGPT not installed: {e}"}))
    sys.exit(1)
except Exception as e:
    print(json.dumps({"ok": False, "error": str(e)}))
    sys.exit(1)
`

    case 'browser-use':
      return `# Browser-use runner — 浏览器操控
import sys, os, json, asyncio

task = sys.argv[1] if len(sys.argv) > 1 else ""

api_key = os.environ.get("OPENAI_API_KEY", "")
base_url = os.environ.get("OPENAI_BASE_URL", "")
model = os.environ.get("LLM_MODEL", "gpt-4o")

if not api_key:
    print(json.dumps({"ok": False, "error": "OPENAI_API_KEY not set"}))
    sys.exit(1)

async def main():
    try:
        from browser_use import Agent as BrowserAgent
        from langchain_openai import ChatOpenAI
        
        llm = ChatOpenAI(model=model, api_key=api_key, base_url=base_url) if base_url else ChatOpenAI(model=model, api_key=api_key)
        agent = BrowserAgent(task=task, llm=llm)
        result = await agent.run()
        print(str(result))
        
    except ImportError as e:
        print(json.dumps({"ok": False, "error": f"browser-use not installed: {e}"}))
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))

asyncio.run(main())
`

    default:
      return `# Unknown engine
import sys, json
print(json.dumps({"ok": False, "error": f"Unknown engine: {sys.argv[0] if len(sys.argv) > 0 else '?'}"}))
sys.exit(1)
`
  }
}

/**
 * 批量探测三个引擎是否可用
 * 使用内联 Python -c 命令，避免文件路径问题
 * @returns {Promise<Array<{engine: string, available: boolean, version?: string}>>}
 */
export async function probeArmyEngines() {
  const engines = [
    { engine: 'crewai', module: 'crewai' },
    { engine: 'metagpt', module: 'metagpt' },
    { engine: 'browser-use', module: 'browser_use' },
  ]

  const results = []

  for (const { engine, module } of engines) {
    try {
      const result = await new Promise((resolve) => {
        const proc = spawn('python', ['-c', `import ${module}; v = getattr(${module}, '__version__', 'installed'); print(v)`], {
          timeout: 10000,
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        })
        let out = ''
        proc.stdout.on('data', (c) => { out += c.toString() })
        proc.on('close', (code) => {
          if (code === 0 && out.trim()) {
            resolve(out.trim())
          } else {
            resolve(null)
          }
        })
        proc.on('error', () => resolve(null))
      })

      results.push({
        engine,
        available: result !== null,
        version: result || undefined,
      })
    } catch {
      results.push({ engine, available: false })
    }
  }

  return results
}
