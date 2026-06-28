import { trait } from 'koota'
import { Object3D } from 'three'

export const Renderable = trait(() => ({
  object: null as Object3D | null,
  visible: true,
}))
