import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DEMO_SPEECH, DEMO_VOICES, preparedPronunciationUrl, pronunciationSource } from '../src/components/media/pronunciation.mjs'
import { studentDemoData } from '../src/previews/student-demo-data.mjs'
import { PREPARED_KEYWORDS } from '../src/components/media/prepared-keywords.mjs'
import { timedWords, captionAt } from '../src/components/media/keyword-media.mjs'

test('every public word and example has a real WAV in all 28 English voices', () => {
  assert.equal(DEMO_VOICES.length,28)
  for (const keyword of studentDemoData().keywords) {
    for (const text of [keyword.word,keyword.example]) {
      assert.ok(Object.values(DEMO_SPEECH).includes(text))
      for (const voice of DEMO_VOICES) {
        const path=preparedPronunciationUrl(text,voice)
        assert.ok(path)
        const wav=readFileSync(new URL(`../public${path}`,import.meta.url))
        assert.equal(wav.toString('ascii',0,4),'RIFF')
        assert.equal(wav.toString('ascii',8,12),'WAVE')
        assert.equal(wav.readUInt32LE(4)+8,wav.length)
        assert.equal(wav.readUInt32LE(24),24000)
        assert.equal(wav.readUInt16LE(22),1)
        assert.equal(wav.readUInt16LE(34),16)
        assert.ok(wav.length>4800)
      }
    }
  }
})

test('public examples resolve immediately without calling the synthesis server', async () => {
  const original=globalThis.fetch
  globalThis.fetch=()=>{throw new Error('A cached example must not synthesize')}
  try {
    for (const text of Object.values(DEMO_SPEECH)) {
      assert.equal(await pronunciationSource(text,'af_heart'),preparedPronunciationUrl(text,'af_heart'))
    }
    assert.equal(preparedPronunciationUrl('A private learner sentence','af_heart'),null)
    assert.equal(preparedPronunciationUrl('landmark','ff_siwis'),null)
  } finally {globalThis.fetch=original}
})

test('live speech shares concurrent requests, separates voices and retries failures', async () => {
  const original=globalThis.fetch, requests=[]
  globalThis.fetch=async (_url,options)=>{
    requests.push(JSON.parse(options.body))
    return new Response(new Blob(['audio']),{status:requests.length===1?503:200})
  }
  try {
    await assert.rejects(pronunciationSource('A new practice sentence.','af_heart'))
    const [a,b]=await Promise.all([pronunciationSource('A new practice sentence.','af_heart'),pronunciationSource('A new practice sentence.','af_heart')])
    assert.equal(a,b)
    assert.equal(requests.length,2)
    assert.equal(await pronunciationSource('A new practice sentence.','af_heart'),a)
    assert.equal(requests.length,2)
    assert.notEqual(await pronunciationSource('A new practice sentence.','bf_emma'),a)
    assert.equal(requests[2].lang,'b')
  } finally {globalThis.fetch=original}
})

test('the replacement word occurs in its actual aligned source recording', () => {
  assert.equal(studentDemoData().keywords[0].word,'landmark')
  const manifest=JSON.parse(readFileSync(new URL('../public/media/keyword-cache-20260909/manifest.json',import.meta.url)))
  const video=PREPARED_KEYWORDS.landmark.videos[0]
  const clip=manifest.clips[`${video.videoId}-${video.occurrences[0].start}`]
  assert.ok(clip.words.some(cue=>cue.word==='landmark'))
})

test('only real word timestamps can drive highlighting; gaps and backward seeks stay exact', () => {
  const cues=timedWords([{word:'hello',start:12.35,end:12.78},{word:'world',start:13.1,end:13.6},{word:'bad',start:Infinity,end:Infinity},{word:'bad',start:null,end:1},{word:'bad',start:4,end:3}])
  assert.equal(cues.length,2)
  for (const [time,expected] of [[null,-1],[12.34,-1],[12.35,0],[12.78,-1],[13.4,1],[13.4,1],[12.4,0],[13.6,-1]]) assert.equal(captionAt(cues,time),expected)
  assert.deepEqual(timedWords(undefined),[])
})
