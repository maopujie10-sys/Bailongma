import { getInstalledToolSchema } from './marketplace/index.js'
import { commsSchemas } from './schemas/comms.js'
import { filesystemSchemas } from './schemas/filesystem.js'
import { shellSchemas } from './schemas/shell.js'
import { webSchemas } from './schemas/web.js'
import { mediaSchemas } from './schemas/media.js'
import { memorySchemas } from './schemas/memory.js'
import { uiSchemas } from './schemas/ui.js'
import { taskSchemas } from './schemas/task.js'
import { reviewSchemas } from './schemas/review.js'
import { remindersSchemas } from './schemas/reminders.js'
import { agentsSchemas } from './schemas/agents.js'
import { perceptionSchemas } from './schemas/perception.js'
import { systemSchemas } from './schemas/system.js'
import { skillsSchemas } from './schemas/skills.js'

export const TOOL_SCHEMAS = {
  ...commsSchemas,
  ...filesystemSchemas,
  ...shellSchemas,
  ...webSchemas,
  ...mediaSchemas,
  ...memorySchemas,
  ...uiSchemas,
  ...taskSchemas,
  ...reviewSchemas,
  ...remindersSchemas,
  ...agentsSchemas,
  ...perceptionSchemas,
  ...systemSchemas,
  ...skillsSchemas,
}

export function getToolSchemas(toolNames) {
  return toolNames
    .filter(name => name !== 'express')
    .map(name => TOOL_SCHEMAS[name] ?? getInstalledToolSchema(name))
    .filter(Boolean)
    .map(({ recognizer_highlights, ...rest }) => rest)
}
