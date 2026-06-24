/**
 * Mem0 Memory Provider — 第二大脑对接适配器
 * 将 Mem0 (mem0ai/mem0) 接入 Bailongma 多Provider记忆架构
 * 
 * Mem0 能力：
 *   - 向量记忆存储 (ChromaDB/Qdrant/Weaviate)
 *   - 自动记忆提取与去重
 *   - 语义搜索 + 关键词混合检索
 *   - 记忆衰减与重要性排序
 * 
 * 接口：实现 MemoryProvider { name, search(query, limit), getByEntity(entityId, limit), getPersonMemory(entityId) }
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let _mem0Process = null;
let _initialized = false;
let _mem0Config = {
  vectorStore: "chromadb",
  chromaHost: "127.0.0.1",
  chromaPort: 8000,
  collectionName: "bailongma_mem0",
  embeddingModel: "text-embedding-3-small",
  llmModel: "gpt-4o-mini",
};

/**
 * 通过 Python 子进程调用 Mem0
 * Mem0 Python SDK 比 Node 端更成熟
 */
async function _callMem0Python(action, params = {}) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, "mem0-bridge.py");
    const input = JSON.stringify({ action, ...params });
    
    const proc = spawn("python", [scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 30000,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Mem0 bridge exit ${code}: ${stderr}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(new Error(`Mem0 bridge parse error: ${stdout.slice(0, 200)}`));
      }
    });

    proc.on("error", reject);
    proc.stdin.write(input);
    proc.stdin.end();
  });
}

/**
 * 初始化 Mem0
 */
async function initMem0(config = {}) {
  if (_initialized) return true;
  Object.assign(_mem0Config, config);
  
  try {
    const result = await _callMem0Python("init", { config: _mem0Config });
    _initialized = result.ok === true;
    return _initialized;
  } catch (e) {
    console.error("[Mem0Provider] Init failed:", e.message);
    return false;
  }
}

/**
 * 搜索记忆
 */
async function search(query, limit = 10) {
  if (!_initialized) {
    const ok = await initMem0();
    if (!ok) return [];
  }
  
  try {
    const result = await _callMem0Python("search", { query, limit });
    return (result.memories || []).map(m => ({
      id: m.id,
      content: m.memory || m.content,
      score: m.score,
      metadata: m.metadata || {},
      source: "mem0",
      timestamp: m.created_at || m.timestamp,
    }));
  } catch (e) {
    console.error("[Mem0Provider] Search failed:", e.message);
    return [];
  }
}

/**
 * 按实体获取记忆
 */
async function getByEntity(entityId, limit = 20) {
  if (!_initialized) {
    const ok = await initMem0();
    if (!ok) return [];
  }
  
  try {
    const result = await _callMem0Python("get_by_entity", { entityId, limit });
    return (result.memories || []).map(m => ({
      id: m.id,
      content: m.memory || m.content,
      metadata: m.metadata || {},
      source: "mem0",
      timestamp: m.created_at || m.timestamp,
    }));
  } catch (e) {
    console.error("[Mem0Provider] getByEntity failed:", e.message);
    return [];
  }
}

/**
 * 获取人物记忆档案
 */
async function getPersonMemory(entityId) {
  if (!_initialized) {
    const ok = await initMem0();
    if (!ok) return null;
  }
  
  try {
    const result = await _callMem0Python("get_person_memory", { entityId });
    return result.profile || null;
  } catch (e) {
    console.error("[Mem0Provider] getPersonMemory failed:", e.message);
    return null;
  }
}

/**
 * 添加记忆
 */
async function addMemory(content, metadata = {}) {
  if (!_initialized) {
    const ok = await initMem0();
    if (!ok) return null;
  }
  
  try {
    const result = await _callMem0Python("add", { content, metadata });
    return result;
  } catch (e) {
    console.error("[Mem0Provider] addMemory failed:", e.message);
    return null;
  }
}

/**
 * 健康检查
 */
async function healthCheck() {
  try {
    const result = await _callMem0Python("health");
    return { ok: result.ok === true, detail: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export const Mem0Provider = {
  name: "mem0",
  search,
  getByEntity,
  getPersonMemory,
  addMemory,
  init: initMem0,
  healthCheck,
};
