import { createWorld } from 'koota'
import { EngineTime } from './traits'

export type EngineWorld = ReturnType<typeof createEngineWorld>

export function createEngineWorld() {
  return createWorld(EngineTime)
}

export const engineWorld = createEngineWorld()
