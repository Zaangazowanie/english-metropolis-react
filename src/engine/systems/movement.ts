import type { World } from 'koota'
import { Matrix4, Quaternion, Vector3 } from 'three'
import { EngineTime, PlayerControlled, PlayerController, RadialGravity, Transform, Velocity } from '../traits'

const tangentVelocity = new Vector3()
const radialVelocity = new Vector3()
const surfaceNormal = new Vector3()
const fallbackForward = new Vector3()
const right = new Vector3()
const basis = new Matrix4()
const turnQuat = new Quaternion()
const WORLD_FORWARD = new Vector3(0, 0, -1)
const WORLD_RIGHT = new Vector3(1, 0, 0)

export function movementSystem(world: World) {
  const time = world.get(EngineTime)
  const delta = time?.delta ?? 0
  if (delta <= 0) return

  world.query(PlayerControlled, PlayerController, Transform, Velocity, RadialGravity).updateEach(([
    player,
    controller,
    transform,
    velocity,
    gravity,
  ]) => {
    surfaceNormal.copy(transform.position).sub(gravity.center)
    if (surfaceNormal.lengthSq() < 0.000001) {
      surfaceNormal.set(0, 1, 0)
      transform.position.copy(gravity.center).addScaledVector(surfaceNormal, gravity.radius)
    } else {
      surfaceNormal.normalize()
    }
    controller.surfaceNormal.copy(surfaceNormal)

    const forward = controller.forward
    forward.addScaledVector(surfaceNormal, -forward.dot(surfaceNormal))
    if (forward.lengthSq() < 0.000001) {
      fallbackForward.copy(Math.abs(surfaceNormal.y) > 0.92 ? WORLD_RIGHT : WORLD_FORWARD)
      forward.copy(fallbackForward).addScaledVector(surfaceNormal, -fallbackForward.dot(surfaceNormal))
    }
    forward.normalize()

    if (Math.abs(player.inputX) > 0.04) {
      turnQuat.setFromAxisAngle(surfaceNormal, -player.inputX * controller.turnSpeed * delta)
      forward.applyQuaternion(turnQuat)
      forward.addScaledVector(surfaceNormal, -forward.dot(surfaceNormal)).normalize()
    }

    const currentRadialSpeed = velocity.linear.dot(surfaceNormal)
    const grounded = player.grounded || controller.grounded
    let nextRadialSpeed = grounded ? Math.max(0, currentRadialSpeed) : currentRadialSpeed

    if (player.jumpQueued && grounded) {
      nextRadialSpeed = controller.jumpSpeed
      player.grounded = false
      controller.grounded = false
    }
    player.jumpQueued = false

    tangentVelocity.copy(forward).multiplyScalar(player.inputY * controller.walkSpeed)
    radialVelocity.copy(surfaceNormal).multiplyScalar(nextRadialSpeed)
    velocity.linear.copy(tangentVelocity).add(radialVelocity)
    velocity.linear.addScaledVector(surfaceNormal, -gravity.strength * delta)

    transform.position.addScaledVector(velocity.linear, delta)

    surfaceNormal.copy(transform.position).sub(gravity.center)
    if (surfaceNormal.lengthSq() < 0.000001) surfaceNormal.set(0, 1, 0)
    else surfaceNormal.normalize()
    controller.surfaceNormal.copy(surfaceNormal)

    forward.addScaledVector(surfaceNormal, -forward.dot(surfaceNormal))
    if (forward.lengthSq() < 0.000001) {
      forward.copy(Math.abs(surfaceNormal.y) > 0.92 ? WORLD_FORWARD : WORLD_RIGHT)
      forward.addScaledVector(surfaceNormal, -forward.dot(surfaceNormal))
    }
    forward.normalize()

    right.copy(surfaceNormal).cross(forward)
    if (right.lengthSq() < 0.000001) right.copy(WORLD_RIGHT)
    else right.normalize()
    basis.makeBasis(right, surfaceNormal, forward)
    transform.rotation.setFromRotationMatrix(basis)
  })
}
