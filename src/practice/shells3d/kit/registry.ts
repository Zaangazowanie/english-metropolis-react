import type { Game3DRegistryEntry } from '../types'

/**
 * The Fluent City arcade registry — the list of available 3D games.
 *
 * Empty in PR 0: the foundation ships the GameKit only. Each Wave-1 build PR
 * appends exactly ONE entry (its `shellKey` MUST equal the 2D shell's route
 * key, e.g. 'snake', 'mazechase'). The host lazy-loads `load()` and falls back
 * to the canonical 2D shell on any failure.
 *
 * Example entry a future game PR would add:
 *   {
 *     shellKey: 'snake',
 *     title: 'Metro Snake',
 *     district: 'The Underground',
 *     load: () => import('../Snake3D'),
 *   }
 */
export const game3dRegistry: Game3DRegistryEntry[] = [
  {
    shellKey: 'airplane',
    title: 'Paper Plane Post',
    district: 'Royal Mail Sky Route',
    load: () => import('../Airplane3D'),
  },
  {
    shellKey: 'battleship',
    title: 'Bathtub Fleet',
    district: 'Little Venice Canals',
    load: () => import('../Battleship3D'),
  },
  {
    shellKey: 'mazechase',
    title: 'Museum After Dark',
    district: 'Museum After Dark',
    load: () => import('../MazeChase3D'),
  },
  {
    shellKey: 'openthebox',
    title: 'The Vault Job',
    district: 'The Bank Vault',
    load: () => import('../OpenTheBox3D'),
  },
  {
    shellKey: 'snake',
    title: 'Metro Snake',
    district: 'The Underground',
    load: () => import('../Snake3D'),
  },
  {
    shellKey: 'whackamole',
    title: 'Camden Pop-Up Pigeons',
    district: 'Camden Market',
    load: () => import('../WhackAMole3D'),
  },
]

/** Look up a registered 3D game by its 2D shell route key. */
export function findGame3D(shellKey: string): Game3DRegistryEntry | undefined {
  return game3dRegistry.find((entry) => entry.shellKey === shellKey)
}
