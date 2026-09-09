import test from 'node:test'
import assert from 'node:assert/strict'
import { analysisCamera, analysisTimeline } from '../src/previews/analysis-film.mjs'

test('every analysis section is shown, including the bottom of tall mobile sections', () => {
  const sections = [
    { key: 'overview', top: 24, bottom: 70 },
    { key: 'scores', top: 94, bottom: 994 },
    { key: 'summary', top: 1018, bottom: 1718 },
    { key: 'recommendations', top: 1742, bottom: 2842 },
  ]
  const viewport = 570
  const timeline = analysisTimeline(sections, 2866, viewport)
  for (const section of sections) {
    const shots = timeline.segments.filter(shot => shot.section === section.key)
    assert.ok(shots.length, `${section.key} must have playback time`)
    assert.ok(Math.min(...shots.map(shot => shot.from)) <= section.top)
    assert.ok(Math.max(...shots.map(shot => shot.to)) + viewport >= section.bottom,
      `${section.key} must remain in view through its final line`)
  }
})

test('seeking stays within the report and forward playback never reverses or jumps', () => {
  const timeline = analysisTimeline([
    { key: 'scores', top: 20, bottom: 850 },
    { key: 'recommendations', top: 874, bottom: 1600 },
  ], 1624, 500)
  assert.equal(analysisCamera(timeline, -10), 0)
  assert.equal(analysisCamera(timeline, timeline.duration + 10), 1124)
  let previous = 0
  for (let time = 0; time <= timeline.duration; time += .02) {
    const camera = analysisCamera(timeline, time)
    assert.ok(camera >= previous && camera <= timeline.maxScroll)
    previous = camera
  }
  for (let i = 1; i < timeline.segments.length; i++) {
    assert.equal(timeline.segments[i].start, timeline.segments[i - 1].end)
    assert.equal(timeline.segments[i].from, timeline.segments[i - 1].to)
  }
  // Native range inputs serialize values; the final value must still be an
  // exact endpoint so the player can offer Replay rather than a near-end Play.
  assert.equal(Number(timeline.duration.toFixed(3)), timeline.duration)
})

test('a report that fits in the player remains still for a finite playback', () => {
  const timeline = analysisTimeline([{ key: 'scores', top: 20, bottom: 200 }], 224, 570)
  assert.ok(Number.isFinite(timeline.duration) && timeline.duration > 0)
  assert.equal(analysisCamera(timeline, timeline.duration / 2), 0)
  assert.equal(analysisCamera(timeline, timeline.duration), 0)
})

test('an empty loading layout has a safe stationary camera', () => {
  const timeline = analysisTimeline([], 0, 570)
  assert.ok(Number.isFinite(timeline.duration))
  assert.equal(analysisCamera(timeline, 0), 0)
  assert.equal(analysisCamera(timeline, 100), 0)
})
