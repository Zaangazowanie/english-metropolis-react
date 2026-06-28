import { trait } from 'koota'
import { Euler, Vector3 } from 'three'

export const Transform = trait({
  position: () => new Vector3(),
  rotation: () => new Euler(),
  scale: () => new Vector3(1, 1, 1),
})
