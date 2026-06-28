import type { RootState } from '@react-three/fiber'
import type { World } from 'koota'
import { Vector3 } from 'three'
import { PlayerControlled, Transform } from '../traits'

const cameraOffset = new Vector3(0, 4.5, 8)
const cameraTarget = new Vector3()
const lookTarget = new Vector3()

export function cameraSystem(world: World, state: RootState) {
  const player = world.queryFirst(PlayerControlled, Transform)
  if (!player) return

  const transform = player.get(Transform)
  if (!transform) return

  cameraTarget.copy(transform.position).add(cameraOffset)
  state.camera.position.lerp(cameraTarget, 0.12)
  lookTarget.copy(transform.position)
  state.camera.lookAt(lookTarget)
}
