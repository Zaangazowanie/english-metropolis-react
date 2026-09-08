// Short public educational excerpts. Original source links remain beside every player.
export const PREVIEW_CLIPS = {
  mural: { word: 'mural', meaning: 'mural / malowidło ścienne', ipa: '/ˈmjʊərəl/', video: 'sNFh9bL5yzg', start: 948, end: 957, creator: 'Art History School', title: 'The Surreal World of René Magritte', before: 'It was created using the same methods and techniques as the ', after: ' of 1953.', note: ['Art, stories and a word you can picture.', 'Sztuka, historie i słowo, które łatwo sobie wyobrazić.'] },
  berth: { word: 'berth', meaning: 'koja; give a wide berth = omijać z daleka', ipa: '/bɜːθ/', video: 'H0zeipr-cVc', start: 530.3, end: 534.3, creator: 'TEDx Talks · Chris Haskell', title: 'Blowing up the gradebook', before: 'Or do I need to leave this teacher wide ', after: ', and just do what I’m told?', note: ['Hear how a familiar word becomes an expression.', 'Posłuchaj, jak słowo staje się częścią wyrażenia.'] },
  pescatarian: { word: 'pescatarian', meaning: 'osoba jedząca ryby, ale nie mięso', ipa: '/ˌpeskəˈteəriən/', video: '6d-LMzIlr5I', start: 3120.7, end: 3125.5, creator: 'Sydney Opera House · Michael Mosley', title: 'How to stay healthy', before: 'You know, to be honest, if you could be a ', after: '…', note: ['Catch the rhythm of a longer word in conversation.', 'Usłysz rytm dłuższego słowa w prawdziwej rozmowie.'] },
}
export const CLIP_ASSET_ROOT = '/media/word-previews-20260909'
export function clipSource(clip) { return `https://www.youtube.com/watch?v=${clip.video}&t=${Math.floor(clip.start)}s` }
