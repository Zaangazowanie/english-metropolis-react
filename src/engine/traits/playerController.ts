import { trait } from 'koota'
import { Vector3 } from 'three'

export const PlayerController = trait({
  forward: () => new Vector3(0, 0, -1),
  surfaceNormal: () => new Vector3(0, 1, 0),
  heading: 0,
  turnSpeed: 2.35,
  walkSpeed: 2.05,
  jumpSpeed: 3.25,
  grounded: false,
})
