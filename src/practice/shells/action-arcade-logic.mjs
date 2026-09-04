/** Deterministic movement helpers used by the action games. */
export function nextMazeStep(maze, from, goal) {
  const queue = [{ ...from, first: null }];
  const seen = new Set([`${from.r},${from.c}`]);
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i];
    if (node.r === goal.r && node.c === goal.c) return node.first ?? from;
    for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const cell = { r: node.r + dr, c: node.c + dc };
      const key = `${cell.r},${cell.c}`;
      if (maze[cell.r]?.[cell.c] !== 0 || seen.has(key)) continue;
      seen.add(key); queue.push({ ...cell, first: node.first ?? cell });
    }
  }
  return from;
}
export function snakeStep(body, direction, rows, cols, grow = false) {
  const offsets = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
  const [dr, dc] = offsets[direction];
  const head = { r: (body[0].r + dr + rows) % rows, c: (body[0].c + dc + cols) % cols };
  const retained = grow ? body : body.slice(0, -1);
  return { head, collided: retained.some(p => p.r === head.r && p.c === head.c), body: [head, ...retained] };
}
export function sonarCount(ships, row, col) {
  return ships.filter(s => !s.isHit && Math.abs(s.r - row) <= 1 && Math.abs(s.c - col) <= 1 && (s.r !== row || s.c !== col)).length;
}
export function selectedWheelRotation(previous, selected, count) {
  return previous + 4 * 360 + ((360 - (selected + 0.5) * (360 / count) - previous % 360 + 360) % 360);
}
/** Only a full run crossing from unfinished to finished can claim completion. */
export function advanceCompletionLatch(announced, completed, preview = false) {
  if (!completed) return { announced: false, emit: false };
  if (preview) return { announced: true, emit: false };
  return { announced: true, emit: !announced };
}
