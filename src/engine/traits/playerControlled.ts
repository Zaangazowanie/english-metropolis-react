import { trait } from 'koota'

export const PlayerControlled = trait({
  inputX: 0,
  inputY: 0,
  jumpQueued: false,
  grounded: true,
})
