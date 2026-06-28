# English Metro Engine Layer

Phase 0 introduces `src/engine/` as a hidden, experimental ECS foundation for the Path C rebuild. It runs alongside the live `src/world/` WorldKit and is mounted only at `/world-next`; no live navigation links to it.

## Contract

- `src/world/` remains the production English Metro world until a later migration explicitly replaces it.
- `/world-next` is a flagged manual route for builder QA and architecture work. It must not be linked from the landing, arcade, or student UI.
- The engine is frontend-only. Do not add Convex schema/functions, backend routes, nginx changes, deploy scripts, external URLs, or runtime CDNs.
- Keep one React Three Fiber canvas per mounted experience, DPR at or below 1.5, draw calls low, and per-frame systems allocation-free.
- Learner-facing English remains DOM/HTML overlay text, never baked into 3D textures.

## Layout

```txt
src/engine/
  EngineCanvas.tsx        hidden R3F mount that boots an ECS world and frame runner
  WorldNext.tsx           lazy route component used by /world-next
  world.ts                koota world factory and singleton export
  traits/                 data-only ECS traits
  systems/                per-frame ECS systems
```

The structure follows the koota discipline used by Viber3D: create a world, keep traits as small data slices, keep systems as deterministic per-frame functions, and wire the system runner through R3F `useFrame`. The code is adapted for English Metro instead of vendoring Viber3D.

## Traits

- `Transform`: position, rotation, and scale backed by three objects.
- `Velocity`: linear and angular velocity plus damping.
- `PlayerControlled`: input state marker for the future player controller.
- `Renderable`: optional `Object3D` binding for syncing ECS state to three.
- `RadialGravity`: marker and configuration for planet or round-world gravity.
- `EngineTime`: world-level delta and elapsed time.

## Systems

Current systems are intentionally small stubs for Phase 1 agents to fill in:

1. `updateTime` stores clamped frame timing on the world.
2. `movementSystem` applies player input to velocity and integrates transforms.
3. `collisionSystem` keeps radial-gravity entities on or above a configured radius.
4. `cameraSystem` follows the first player-controlled transform.
5. `renderBindingSystem` copies ECS transforms into bound `Object3D` instances.

Systems should stay pure relative to their inputs, reuse module-scope scratch objects, and avoid allocations inside query loops.

## Phase 1 integration notes

- Add the player controller by writing input into `PlayerControlled` and movement state into `Velocity`; do not couple input directly to meshes.
- Add `three-mesh-bvh` collision through a dedicated system that owns collider resources and updates ECS traits, not React component state.
- Add district or GLB loading behind route-level lazy imports and keep assets under `public/world/`.
- Keep shell entry points and practice pedagogy unchanged. The engine may launch existing shells later, but shell results must still flow through the existing `Game3DProps` and `SessionResult` contracts.
