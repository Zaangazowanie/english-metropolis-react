// Short public educational excerpts. Original source links remain beside every player.
export const PREVIEW_CLIPS = {
  landmark: { word: 'landmark', meaning: 'charakterystyczny obiekt; punkt orientacyjny', ipa: '/ˈlændmɑːk/', video: 'qV_CJbh_rD0', start: 285, end: 291.014, creator: 'YouTube', title: 'A landmark in Houston', before: 'The mural has become a ', after: '…', assetRoot: '/media/keyword-cache-20260909', assetKey: 'qV_CJbh_rD0-286', note: ['A useful word for finding your way around a city.', 'Przydatne słowo, gdy zwiedzasz nowe miasto.'] },
  berth: { word: 'berth', meaning: 'koja; give a wide berth = omijać z daleka', ipa: '/bɜːθ/', video: 'H0zeipr-cVc', start: 530.3, end: 534.3, creator: 'TEDx Talks · Chris Haskell', title: 'Blowing up the gradebook', before: 'Or do I need to leave this teacher wide ', after: ', and just do what I’m told?', note: ['Hear how a familiar word becomes an expression.', 'Posłuchaj, jak słowo staje się częścią wyrażenia.'] },
  pescatarian: { word: 'pescatarian', meaning: 'osoba jedząca ryby, ale nie mięso', ipa: '/ˌpeskəˈteəriən/', video: '6d-LMzIlr5I', start: 3120.7, end: 3125.5, creator: 'Sydney Opera House · Michael Mosley', title: 'How to stay healthy', before: 'You know, to be honest, if you could be a ', after: '…', note: ['Catch the rhythm of a longer word in conversation.', 'Usłysz rytm dłuższego słowa w prawdziwej rozmowie.'] },
}
export const CLIP_ASSET_ROOT = '/media/word-previews-20260909'
export function clipSource(clip) { return `https://www.youtube.com/watch?v=${clip.video}&t=${Math.floor(clip.start)}s` }
