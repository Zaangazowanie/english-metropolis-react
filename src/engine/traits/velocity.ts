import { trait } from 'koota'
import { Vector3 } from 'three'

export const Velocity = trait({
  linear: () => new Vector3(),
  angular: () => new Vector3(),
  damping: 0.92,
})
