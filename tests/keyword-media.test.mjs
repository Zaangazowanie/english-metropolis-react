import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import { captionAt, excerptKey } from '../src/components/media/keyword-media.mjs'

const root = new URL('../public/media/keyword-cache-20260909/', import.meta.url)
const { clips } = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'))

test('the existing three-word catalogue retains all 30 excerpts and 26 videos', () => {
  assert.equal(Object.keys(clips).length, 30)
  assert.equal(new Set(Object.values(clips).map(clip => clip.videoId)).size, 26)
  for (const word of ['mural', 'berth', 'pescatarian']) {
    assert.equal(Object.values(clips).filter(clip => clip.word === word).length, 10)
  }
})

test('every cached option has seekable media, a poster and bounded, ordered caption timings', () => {
  for (const [key, clip] of Object.entries(clips)) {
    assert.equal(key, excerptKey(clip.videoId, clip.occurrenceStart))
    const video = readFileSync(new URL(`${key}.mp4`, root))
    assert.equal(video.length, clip.bytes)
    assert.ok(video.indexOf('moov') > 0 && video.indexOf('moov') < video.indexOf('mdat'), `${key}: faststart`)
    assert.ok(statSync(new URL(`${key}.jpg`, root)).size > 1000)
    const captions = readFileSync(new URL(`${key}.vtt`, root), 'utf8')
    assert.match(captions, /^WEBVTT\r?\n/)
    assert.ok(captions.includes('-->'))
    let previousEnd = clip.clipStart
    for (const cue of clip.words) {
      assert.ok(cue.start >= previousEnd - 0.001, `${key}: ordered cue ${cue.word}`)
      assert.ok(cue.end > cue.start, `${key}: nonempty cue ${cue.word}`)
      assert.ok(cue.end <= clip.clipStart + clip.duration + 0.002, `${key}: within clip`)
      previousEnd = cue.end
    }
  }
})

test('captions follow media position through pauses, backward seeks and cue boundaries', () => {
  const cues = [{ word: 'a', start: 15, end: 15.2 }, { word: 'mural', start: 15.3, end: 15.8 }]
  assert.equal(captionAt(cues, null), -1)
  assert.equal(captionAt(cues, NaN), -1)
  assert.equal(captionAt(cues, 14.9), -1)
  assert.equal(captionAt(cues, 15), 0)
  assert.equal(captionAt(cues, 15.2), -1)
  assert.equal(captionAt(cues, 15.5), 1)
  assert.equal(captionAt(cues, 15.5), 1)
  assert.equal(captionAt(cues, 15.1), 0)
  assert.equal(captionAt(cues, 15.8), -1)
})
