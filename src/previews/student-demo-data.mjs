// Public teaching data only. Rendered by the very same views as learner data.
export const DEMO_SLUG = 'preview-student'
export const DEMO_LESSON_ID = 'preview-lesson'
export const LESSON_TOUR = [
  ['keywords', 'Lesson vocabulary', 'Słownictwo z lekcji'],
  ['analysis', 'Open the full analysis', 'Otwórz pełną analizę'],
  ['topics', 'Topics covered', 'Omówione tematy'],
  ['scores', 'Five skill scores', 'Wyniki pięciu umiejętności'],
  ['summary', 'Lesson summary', 'Podsumowanie lekcji'],
  ['deeper', 'Deeper details', 'Więcej szczegółów'],
  ['strengths', 'Strengths', 'Mocne strony'],
  ['improvements', 'Improvements', 'Obszary do poprawy'],
  ['errors', 'Key errors', 'Najważniejsze błędy'],
  ['practice', 'Practice advice', 'Wskazówki do ćwiczeń'],
  ['recommendations', 'Personal recommendations', 'Osobiste rekomendacje'],
]

export function studentDemoData(lang = 'en') {
  const pl = lang === 'pl', pick = (en, polish) => pl ? polish : en
  const title = pick('Art, journeys and food', 'Sztuka, podróże i jedzenie')
  const date = '2026-08-10'
  const topics = [pick('Travel', 'Podróże'), pick('Art', 'Sztuka'), pick('Food', 'Jedzenie')]
  const words = [
    { word: 'mural', ipa: '/ˈmjʊərəl/', respelling: 'MYOOR-uhl', translation: 'mural / malowidło ścienne', cefr_level: 'B2',
      definition_en: 'A large picture painted directly on a wall.', definition_pl: 'Duży obraz namalowany bezpośrednio na ścianie.',
      example_en: 'The artist painted a colourful mural on the wall.', example_pl: 'Artysta namalował kolorowy mural na ścianie.',
      collocations: { commonCollocations: ['paint a mural', 'a colourful mural', 'a street mural'], contexts: ['Public art and city walks'], usagePatterns: [{ phrase: 'a mural by an artist', example: 'We stopped to admire a mural by a local artist.' }] } },
    { word: 'berth', ipa: '/bɜːθ/', respelling: 'BURTH', translation: 'koja; give a wide berth — omijać z daleka', cefr_level: 'B2',
      definition_en: 'A bed on a ship or train; also a place where a ship can stay. “Give a wide berth” means to avoid someone or something.',
      definition_pl: 'Miejsce do spania na statku lub w pociągu; także miejsce cumowania. „Give a wide berth” znaczy omijać z daleka.',
      example_en: 'I booked a berth on the night train.', example_pl: 'Zarezerwowałem koję w nocnym pociągu.',
      collocations: { commonCollocations: ['book a berth', 'a sleeping berth', 'give someone a wide berth'], contexts: ['Train journeys', 'Ships', 'Avoiding something'], usagePatterns: [{ phrase: 'give something a wide berth', example: 'We gave the crowded streets a wide berth.' }] } },
    { word: 'pescatarian', ipa: '/ˌpeskəˈteəriən/', respelling: 'pes-kuh-TAIR-ee-uhn', translation: 'osoba jedząca ryby, ale nie mięso', cefr_level: 'C1',
      definition_en: 'Someone who eats fish but does not eat meat.', definition_pl: 'Osoba, która je ryby, ale nie je mięsa.',
      example_en: 'She is a pescatarian, so she ordered the fish.', example_pl: 'Jest peskatarianką, więc zamówiła rybę.',
      collocations: { commonCollocations: ['a pescatarian diet', 'a pescatarian option'], contexts: ['Food preferences', 'Ordering at a restaurant'], usagePatterns: [{ phrase: 'be a pescatarian', example: 'I am a pescatarian. Do you have any fish dishes?' }] } },
  ]
  const keywords = words.map((word, i) => ({ ...word, id: `preview-keyword-${i}`, lessonId: DEMO_LESSON_ID,
    lessonTitle: title, lessonDate: date, lessonNumber: 6, topics, mastery_level: 'learning',
    definition: word.definition_en, definitionPl: word.definition_pl, example: word.example_en,
    searchText: Object.values(word).filter(value => typeof value === 'string').join(' ').toLowerCase() }))
  const commentary = {
    vocabularyRange: pick('You used specific words to describe public art and food preferences.', 'Używałeś konkretnych słów do opisywania sztuki ulicznej i preferencji żywieniowych.'),
    grammaticalAccuracy: pick('Prepositions and articles need more consistency when speaking quickly.', 'Przy szybszym mówieniu przyimki i przedimki wymagają większej konsekwencji.'),
    fluencyAndCoherence: pick('You connected ideas and explained your preferences with examples.', 'Łączyłeś myśli i wyjaśniałeś swoje preferencje na przykładach.'),
    pronunciation: pick('Your message was clear. Practise the stressed syllable in pescatarian.', 'Wypowiedź była zrozumiała. Poćwicz akcentowaną sylabę w słowie pescatarian.'),
    communicativeEffectiveness: pick('You kept the conversation going and asked relevant follow-up questions.', 'Podtrzymywałeś rozmowę i zadawałeś trafne pytania dodatkowe.'),
  }
  const recommendations = {
    intro: pick('Your interest in art and travel gives you useful ways to keep practising between lessons.', 'Zainteresowanie sztuką i podróżami daje Ci okazje do ćwiczenia między lekcjami.'),
    recommendations: [
      { type: 'youtube', title: 'The Surreal World of René Magritte', creator: 'Art History School', url: 'https://www.youtube.com/watch?v=sNFh9bL5yzg',
        whyThisMatches: pick('Continue the art conversation with paintings that give you clear visual context.', 'Kontynuuj rozmowę o sztuce, korzystając z obrazów jako kontekstu.'),
        howToNavigate: pick('Watch two minutes. Choose a painting and describe it in three sentences.', 'Obejrzyj dwie minuty. Wybierz obraz i opisz go w trzech zdaniach.'), focusVocab: ['mural', 'artist', 'perspective'] },
      { type: 'book', title: 'Around the World in Eighty Days', creator: 'Jules Verne', url: 'https://www.gutenberg.org/ebooks/103',
        whyThisMatches: pick('A travel story gives you more language for journeys and destinations.', 'Opowieść podróżnicza poszerzy Twój język związany z podróżami i ich celami.'),
        howToNavigate: pick('Read a short passage. Keep three useful phrases and retell the scene in your own words.', 'Przeczytaj krótki fragment. Zapisz trzy przydatne zwroty i opowiedz scenę własnymi słowami.'), focusVocab: ['journey', 'departure', 'destination'] },
    ],
  }
  const analysis = {
    id: 'preview-analysis', cefrBand: 'B2', overallScore: 75,
    vocabularyRange: 78, grammaticalAccuracy: 68, fluencyAndCoherence: 76, pronunciation: 72, communicativeEffectiveness: 82,
    lessonSummary: pick(
      'You planned a weekend in a new city and compared travelling by train with flying. You described a street mural and explained your food preferences. You used examples to support your choices.\n\nYou practised “depend on” when comparing prices. You used “a berth” to describe a sleeping place on a night train. You explored the expression “give a wide berth” and practised the stressed syllable in “pescatarian”.',
      'Zaplanowałeś weekend w nowym mieście i porównałeś podróż pociągiem z lotem. Opisałeś mural i wyjaśniłeś swoje preferencje żywieniowe. Uzasadniałeś wybory za pomocą przykładów.\n\nĆwiczyłeś „depend on” podczas porównywania cen. Używałeś „a berth”, opisując miejsce do spania w nocnym pociągu. Poznałeś zwrot „give a wide berth” i ćwiczyłeś akcentowaną sylabę w słowie „pescatarian”.'),
    strengths: [pick('You explained why you preferred travelling slowly, using clear examples.', 'Jasno wyjaśniłeś na przykładach, dlaczego wolisz podróżować powoli.'), pick('You asked follow-up questions and kept the art conversation moving.', 'Zadawałeś pytania dodatkowe i rozwijałeś rozmowę o sztuce.')],
    improvements: [pick('Practise prepositions in useful chunks: depend on the price, interested in art.', 'Ćwicz przyimki w przydatnych zwrotach: depend on the price, interested in art.'), pick('Keep the article with singular countable nouns: a berth, a mural.', 'Pamiętaj o przedimku przy rzeczownikach policzalnych w liczbie pojedynczej: a berth, a mural.')],
    keyErrors: [{ error: 'It depends of the price.', correction: 'It depends on the price.', category: 'grammar' }, { error: 'I booked berth on the train.', correction: 'I booked a berth on the train.', category: 'grammar' }],
    practiceAdvice: [pick('Practise prepositions with five sentences about your next journey.', 'Poćwicz przyimki, układając pięć zdań o następnej podróży.'), pick('Use pronunciation drills to practise the word stress in pescatarian.', 'Poćwicz wymowę i akcent wyrazowy w słowie pescatarian.')],
    personalDetails: ['metricCommentary:' + JSON.stringify(commentary), 'personalizedRecs:' + JSON.stringify(recommendations)],
  }
  const lesson = { id: DEMO_LESSON_ID, title, date, status: 'completed', lessonNumber: 6, topics,
    keywords, keywordCount: keywords.length, analysis, materials: [{ type: 'video', name: 'The Surreal World of René Magritte', url: 'https://www.youtube.com/watch?v=sNFh9bL5yzg' }] }
  return { profile: { slug: DEMO_SLUG, firstName: 'Student', name: 'English Metro', level: 'B2' },
    lessons: [lesson], keywords, analyses: [analysis], lessonCount: 1, keywordCount: 3, loading: false, pdfMap: {} }
}
