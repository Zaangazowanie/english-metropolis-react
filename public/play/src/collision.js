export function circleHitsAABB(x, z, radius, colliders = []) {
  const radiusSq = radius * radius;
  for (const box of colliders) {
    if (x + radius < box.minX || x - radius > box.maxX ||
        z + radius < box.minZ || z - radius > box.maxZ) continue;
    const nearestX = Math.max(box.minX, Math.min(x, box.maxX));
    const nearestZ = Math.max(box.minZ, Math.min(z, box.maxZ));
    const dx = x - nearestX;
    const dz = z - nearestZ;
    if (dx * dx + dz * dz < radiusSq) return box;
  }
  return null;
}

export function personPosition(person) {
  return person?.wrap?.position || person?.obj?.position || person?.position || person;
}

export function resolveCircleAgainstPeople(position, velocity, radius, people = [], self = null) {
  for (const person of people) {
    if (!person || person === self || person.wrap === self || person.obj === self) continue;
    const other = personPosition(person);
    if (!other || other === position || !Number.isFinite(other.x) || !Number.isFinite(other.z)) continue;
    const otherRadius = person.collisionRadius || other.collisionRadius || 0.32;
    const minDistance = radius + otherRadius;
    let dx = position.x - other.x;
    let dz = position.z - other.z;
    let distanceSq = dx * dx + dz * dz;
    if (distanceSq >= minDistance * minDistance) continue;
    const coincident = distanceSq < 1e-8;
    const distance = coincident ? 0 : Math.sqrt(distanceSq);
    const nx = coincident ? 1 : dx / distance;
    const nz = coincident ? 0 : dz / distance;
    const push = minDistance - distance;
    position.x += nx * push;
    position.z += nz * push;
    if (velocity) {
      const inward = velocity.x * nx + velocity.z * nz;
      if (inward < 0) {
        velocity.x -= inward * nx;
        velocity.z -= inward * nz;
      }
    }
  }
}
