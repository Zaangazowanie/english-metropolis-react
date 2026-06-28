import type { World } from 'koota'
import { Renderable, Transform } from '../traits'

export function renderBindingSystem(world: World) {
  world.query(Transform, Renderable).updateEach(([transform, renderable]) => {
    if (!renderable.object) return

    renderable.object.visible = renderable.visible
    renderable.object.position.copy(transform.position)
    renderable.object.rotation.copy(transform.rotation)
    renderable.object.scale.copy(transform.scale)
  })
}
