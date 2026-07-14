// Shared measurements for every system that occupies a radial boulevard.
// Keeping vehicles, rails, and road markings on one contract prevents drift.
export const BOULEVARD = Object.freeze({
  startD: 14,
  endD: 410,
  length: 396,
  midZ: -212,
  tramLaneX: 3.3,
  railHalfGauge: 0.76,
  reservationInnerX: 1.82,
  carLanes: Object.freeze([-2.9, 0.18]),
  carStartD: 31,
  carEndD: 390,
});

export const TRANSIT_ANGLES = Object.freeze([
  Math.PI / 2,
  Math.PI / 2 + (2 * Math.PI) / 3,
  Math.PI / 2 - (2 * Math.PI) / 3,
]);
