import { dispatchToArmy, probeArmyEngines } from '../../agents/army-adapter.js'

export async function execDispatchToArmy(args) {
  const { engine, task, agents, config } = args
  if (!engine || !task) {
    return { ok: false, error: 'dispatch_to_army requires engine and task' }
  }
  try {
    const result = await dispatchToArmy({ engine, task, agents, config })
    return { ok: true, result }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

export async function execProbeArmyEngines(_args) {
  try {
    const result = await probeArmyEngines()
    return { ok: true, result }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}
