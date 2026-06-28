import type { RootState } from '@react-three/fiber'
import type { World } from 'koota'
import { Vector3 } from 'three'
import { EngineTime, PlayerControlled, PlayerController, Transform } from '../traits'

const cameraTarget = new Vector3()
const lookTarget = new Vector3()
const up = new Vector3()
const forward = new Vector3()

const CAMERA_BACK = 1.55
const CAMERA_UP = 0.72
const LOOK_UP = 0.28
const LOOK_FORWARD = 0.32
const CAMERA_LERP = 0.13

export function cameraSystem(world: World, state: RootState) {
  const player = world.queryFirst(PlayerControlled, PlayerController, Transform)
  if (!player) return

  const transform = player.get(Transform)
  const controller = player.get(PlayerController)
  if (!transform || !controller) return

  const time = world.get(EngineTime)
  const reducedMotion = (time as { reducedMotion?: boolean } | undefined)?.reducedMotion === true

  up.copy(controller.surfaceNormal)
  if (up.lengthSq() < 0.000001) up.set(0, 1, 0)
  else up.normalize()

  forward.copy(controller.forward)
  forward.addScaledVector(up, -forward.dot(up))
  if (forward.lengthSq() < 0.000001) forward.set(0, 0, -1)
  else forward.normalize()

  cameraTarget.copy(transform.position).addScaledVector(up, CAMERA_UP).addScaledVector(forward, -CAMERA_BACK)
  if (reducedMotion) state.camera.position.copy(cameraTarget)
  else state.camera.position.lerp(cameraTarget, CAMERA_LERP)

  state.camera.up.copy(up)
  lookTarget.copy(transform.position).addScaledVector(up, LOOK_UP).addScaledVector(forward, LOOK_FORWARD)
  state.camera.lookAt(lookTarget)
}
