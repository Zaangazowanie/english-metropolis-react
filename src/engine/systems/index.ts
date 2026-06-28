import type { RootState } from '@react-three/fiber'
import type { World } from 'koota'
import { cameraSystem } from './camera'
import { collisionSystem } from './collision'
import { movementSystem } from './movement'
import { renderBindingSystem } from './renderBinding'
import { updateTime } from './time'

export function runEngineSystems(world: World, state: RootState, delta: number) {
  updateTime(world, delta, state.clock.elapsedTime)
  movementSystem(world)
  collisionSystem(world)
  cameraSystem(world, state)
  renderBindingSystem(world)
}
