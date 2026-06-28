import type { World } from 'koota'
import { EngineTime, PlayerControlled, Transform, Velocity } from '../traits'

const PLAYER_ACCELERATION = 8

export function movementSystem(world: World) {
  const time = world.get(EngineTime)
  const delta = time?.delta ?? 0

  world.query(PlayerControlled, Velocity).updateEach(([player, velocity]) => {
    velocity.linear.x += player.inputX * PLAYER_ACCELERATION * delta
    velocity.linear.z += player.inputY * PLAYER_ACCELERATION * delta
  })

  world.query(Transform, Velocity).updateEach(([transform, velocity]) => {
    transform.position.x += velocity.linear.x * delta
    transform.position.y += velocity.linear.y * delta
    transform.position.z += velocity.linear.z * delta

    transform.rotation.x += velocity.angular.x * delta
    transform.rotation.y += velocity.angular.y * delta
    transform.rotation.z += velocity.angular.z * delta

    velocity.linear.multiplyScalar(velocity.damping)
    velocity.angular.multiplyScalar(velocity.damping)
  })
}
