// 自我进化工具 schema：write_source / self_build / self_upgrade / self_rollback / list_source / read_source
export const evolutionSchemas = {
  write_source: {
    type: "function",
    function: {
      name: "write_source",
      description: "修改白龙马自己的源代码文件。支持增/删/改操作，每次修改前自动 git commit 备份。可操作 src/ 下所有文件。改完源码后应调用 self_build 编译验证，然后再调 self_upgrade 替换运行中的 EXE 并重启。",
      parameters: {
        type: "object",
        properties: {
          file: { type: "string", description: "源文件路径，相对于项目根目录，如 src/config.js、src/index.js。" },
          action: { type: "string", enum: ["replace", "insert_after", "insert_before", "append", "delete_lines"], description: "操作类型。" },
          old_string: { type: "string", description: "replace/delete_lines 时：要替换或删除的原始文本（必须精确匹配）。" },
          new_string: { type: "string", description: "replace/insert/append 时：要写入的新文本。" },
          line: { type: "number", description: "insert_after/insert_before 时的目标行号（1-based）。" },
          description: { type: "string", description: "本次改动的简短说明，作为 git commit message。" }
        },
        required: ["file", "action", "description"]
      }
    }
  },
  self_build: {
    type: "function",
    function: {
      name: "self_build",
      description: "编译白龙马 Electron 应用（Windows）。执行 npm run build:win，生成新的 EXE。构建失败可调 self_rollback 回退。",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  self_upgrade: {
    type: "function",
    function: {
      name: "self_upgrade",
      description: "用新编译的 EXE 替换当前运行的白龙马并重启。检查 dist-build/ 下新构建产物，复制到运行目录并触发重启。",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  self_rollback: {
    type: "function",
    function: {
      name: "self_rollback",
      description: "回退最近的源码改动（git reset --hard HEAD~1）。仅在构建失败或改动出问题时使用。",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  list_source: {
    type: "function",
    function: {
      name: "list_source",
      description: "列出白龙马 src/ 下的所有源文件（可按子目录过滤）。",
      parameters: {
        type: "object",
        properties: { subdir: { type: "string", description: "可选子目录名。" } },
        required: []
      }
    }
  },
  self_test: { type: "function", function: { name: "self_test", description: "快速自测：检查源码语法错误、关键文件存在、Git状态", parameters: { type: "object", properties: {}, required: [] } } },
  read_source: {
    type: "function",
    function: {
      name: "read_source",
      description: "读取白龙马自己的源代码文件，支持按行范围读取。",
      parameters: {
        type: "object",
        properties: {
          file: { type: "string", description: "源文件路径，相对于项目根目录。" },
          offset: { type: "number", description: "起始行号（1-based）。" },
          limit: { type: "number", description: "读取行数，最多2000行。" }
        },
        required: ["file"]
      }
    }
  }
}
