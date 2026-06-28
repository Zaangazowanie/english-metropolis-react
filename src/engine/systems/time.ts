import type { World } from 'koota'
import { EngineTime } from '../traits'

export function updateTime(world: World, delta: number, elapsed: number) {
  world.set(EngineTime, {
    delta: Math.min(delta, 1 / 30),
    elapsed,
  })
}
