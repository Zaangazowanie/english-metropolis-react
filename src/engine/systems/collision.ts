import type { World } from 'koota'
import { Vector3 } from 'three'
import { RadialGravity, Transform } from '../traits'

const surfaceOffset = new Vector3()

export function collisionSystem(world: World) {
  world.query(Transform, RadialGravity).updateEach(([transform, gravity]) => {
    surfaceOffset.copy(transform.position).sub(gravity.center)

    if (surfaceOffset.lengthSq() === 0) {
      transform.position.set(gravity.center.x, gravity.center.y + gravity.radius, gravity.center.z)
      return
    }

    if (surfaceOffset.length() < gravity.radius) {
      surfaceOffset.setLength(gravity.radius)
      transform.position.copy(gravity.center).add(surfaceOffset)
    }
  })
}
