import { trait } from 'koota'
import { Vector3 } from 'three'

export const RadialGravity = trait({
  center: () => new Vector3(),
  strength: 9.8,
  radius: 12,
})
