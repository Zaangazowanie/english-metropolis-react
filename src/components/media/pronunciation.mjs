// These public examples are rendered once by Kokoro, in every English voice.
// Ordinary learner text still uses the existing synthesis service.
export const DEMO_SPEECH_ROOT = '/media/kokoro-demo-20260909'
export const DEMO_SPEECH = {
  landmark: 'landmark',
  'landmark-example': 'The castle is the most famous landmark in the city.',
  berth: 'berth',
  'berth-example': 'I booked a berth on the night train.',
  pescatarian: 'pescatarian',
  'pescatarian-example': 'She is a pescatarian, so she ordered the fish.',
}
export const DEMO_VOICES = ['af_heart', 'bf_emma', 'af_bella', 'af_alloy', 'af_aoede', 'af_jessica', 'af_kore', 'af_nicole', 'af_nova', 'af_river', 'af_sarah', 'af_sky', 'am_adam', 'am_echo', 'am_eric', 'am_fenrir', 'am_liam', 'am_michael', 'am_onyx', 'am_puck', 'am_santa', 'bf_alice', 'bf_isabella', 'bf_lily', 'bm_daniel', 'bm_fable', 'bm_george', 'bm_lewis']
const namesByText = new Map(Object.entries(DEMO_SPEECH).map(([name, text]) => [text, name]))
const sources = new Map()
const warmedVoices = new Set()

export function selectedVoice() {
  try { return localStorage.getItem('tts_voice') || 'af_heart' } catch { return 'af_heart' }
}

export function preparedPronunciationUrl(text, voice = selectedVoice()) {
  const name = namesByText.get(String(text || '').trim().replace(/\s+/g, ' '))
  return name && DEMO_VOICES.includes(voice) ? `${DEMO_SPEECH_ROOT}/${voice}-${name}.wav` : null
}

export async function pronunciationSource(text, voice = selectedVoice()) {
  const prepared = preparedPronunciationUrl(text, voice)
  if (prepared) return prepared
  const key = JSON.stringify([text, voice])
  if (!sources.has(key)) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)
    sources.set(key, fetch('/api/tts/tts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice, lang: voice[0] || 'a' }), signal: controller.signal,
    }).then(response => {
      if (!response.ok) throw new Error(`Pronunciation unavailable (${response.status})`)
      return response.blob()
    }).then(blob => URL.createObjectURL(blob)).catch(error => {
      sources.delete(key)
      throw error
    }).finally(() => clearTimeout(timeout)))
  }
  return sources.get(key)
}

export function warmDemoPronunciations(voice = selectedVoice()) {
  if (!DEMO_VOICES.includes(voice) || warmedVoices.has(voice)) return
  warmedVoices.add(voice)
  for (const text of Object.values(DEMO_SPEECH)) {
    fetch(preparedPronunciationUrl(text, voice), { cache: 'force-cache' }).catch(() => {})
  }
}
