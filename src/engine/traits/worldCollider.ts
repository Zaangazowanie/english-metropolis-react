import { trait } from 'koota'
import { BufferGeometry } from 'three'

export const WorldCollider = trait(() => ({
  geometry: null as BufferGeometry | null,
  ready: false,
}))
