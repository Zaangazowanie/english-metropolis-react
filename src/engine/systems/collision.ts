import type { World } from 'koota'
import { Box3, Line3, Vector3 } from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import { CapsuleCollider, PlayerControlled, PlayerController, RadialGravity, Transform, Velocity, WorldCollider } from '../traits'

const capsuleSegment = new Line3()
const capsuleBounds = new Box3()
const trianglePoint = new Vector3()
const capsulePoint = new Vector3()
const penetrationNormal = new Vector3()
const triangleNormal = new Vector3()
const surfaceNormal = new Vector3()
const bottom = new Vector3()
const top = new Vector3()

type BvhGeometry = {
  boundsTree?: MeshBVH
}

const MAX_COLLISION_PASSES = 3
const EPSILON = 0.000001

export function collisionSystem(world: World) {
  world.query(WorldCollider).updateEach(([collider]) => {
    const geometry = collider.ready ? collider.geometry : null
    const bvhGeometry = geometry as (typeof geometry & BvhGeometry) | null
    if (bvhGeometry && !bvhGeometry.boundsTree) {
      bvhGeometry.boundsTree = new MeshBVH(bvhGeometry)
    }
  })

  world.query(Transform, Velocity, CapsuleCollider, RadialGravity, PlayerControlled, PlayerController).updateEach(([
    transform,
    velocity,
    capsule,
    gravity,
    player,
    controller,
  ]) => {
    player.grounded = false
    controller.grounded = false

    resolveSurfaceNormal(transform, gravity)

    for (let pass = 0; pass < MAX_COLLISION_PASSES; pass++) {
      let anyHit = false

      bottom.copy(transform.position).addScaledVector(surfaceNormal, capsule.radius + capsule.skin)
      top.copy(transform.position).addScaledVector(surfaceNormal, Math.max(capsule.radius + capsule.skin, capsule.height - capsule.radius))
      capsuleSegment.start.copy(bottom)
      capsuleSegment.end.copy(top)
      capsuleBounds.makeEmpty()
      capsuleBounds.expandByPoint(capsuleSegment.start)
      capsuleBounds.expandByPoint(capsuleSegment.end)
      capsuleBounds.expandByScalar(capsule.radius + capsule.skin)

      world.query(WorldCollider).updateEach(([collider]) => {
        const bvhGeometry = collider.geometry as (typeof collider.geometry & BvhGeometry) | null
        const boundsTree = collider.ready ? bvhGeometry?.boundsTree : undefined
        if (!boundsTree) return

        boundsTree.shapecast({
          intersectsBounds: (box) => box.intersectsBox(capsuleBounds),
          intersectsTriangle: (triangle) => {
            const distance = triangle.closestPointToSegment(capsuleSegment, trianglePoint, capsulePoint)
            const minDistance = capsule.radius + capsule.skin
            if (distance >= minDistance) return false

            penetrationNormal.copy(capsulePoint).sub(trianglePoint)
            if (penetrationNormal.lengthSq() < EPSILON) {
              triangle.getNormal(triangleNormal)
              penetrationNormal.copy(triangleNormal)
              if (penetrationNormal.dot(surfaceNormal) < 0) penetrationNormal.multiplyScalar(-1)
            } else {
              penetrationNormal.normalize()
            }

            transform.position.addScaledVector(penetrationNormal, minDistance - distance)
            const intoSurface = velocity.linear.dot(penetrationNormal)
            if (intoSurface < 0) velocity.linear.addScaledVector(penetrationNormal, -intoSurface)
            if (penetrationNormal.dot(surfaceNormal) > 0.38) {
              player.grounded = true
              controller.grounded = true
            }
            anyHit = true
            return false
          },
        })
      })

      if (!anyHit) break
      resolveSurfaceNormal(transform, gravity)
    }

    resolveSurfaceNormal(transform, gravity)
    const radialDistance = transform.position.distanceTo(gravity.center)
    if (radialDistance < gravity.radius) {
      transform.position.copy(gravity.center).addScaledVector(surfaceNormal, gravity.radius)
      const radialSpeed = velocity.linear.dot(surfaceNormal)
      if (radialSpeed < 0) velocity.linear.addScaledVector(surfaceNormal, -radialSpeed)
      player.grounded = true
      controller.grounded = true
    } else if (radialDistance <= gravity.radius + capsule.skin * 2 && velocity.linear.dot(surfaceNormal) <= 0.02) {
      player.grounded = true
      controller.grounded = true
    }

    controller.surfaceNormal.copy(surfaceNormal)
  })
}

function resolveSurfaceNormal(transform: { position: Vector3 }, gravity: { center: Vector3; radius: number }) {
  surfaceNormal.copy(transform.position).sub(gravity.center)
  if (surfaceNormal.lengthSq() < EPSILON) {
    surfaceNormal.set(0, 1, 0)
    transform.position.copy(gravity.center).addScaledVector(surfaceNormal, gravity.radius)
  } else {
    surfaceNormal.normalize()
  }
}
