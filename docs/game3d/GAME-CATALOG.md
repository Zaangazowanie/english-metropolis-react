# Fluent City — Game Catalog (38 shells → 3 waves)

District concepts are storyboard *starting points* — the storyboard agent may
improve them, the mechanic mapping may not change. Shell keys are the route
keys in `src/practice/lib/shell-selector.ts`; every game wraps that shell's
existing generator.

## Wave 1 — Flagship action games (full 3D gameplay) + the Hub

| # | shellKey | Title | District / fantasy |
|---|----------|-------|--------------------|
| 0 | — | **City Hub (new home page)** | Stylized dusk London map; districts glow, Bajla flies you to games; header sign-in (universal login folded in) |
| 1 | snake | **Metro Snake** | YOU are a toy metro train in the Underground; collect carriages bearing correct words; wrong carriage = derail wobble |
| 2 | mazechase | **Museum After Dark** | Chased through a moonlit museum maze; grab the right exhibit cards before the statues catch up |
| 3 | balloonpop | **Thames Balloon Festival** | Riverside at dusk; lantern-balloons drift up carrying words; pop the right ones with a peashooter |
| 4 | whackamole | **Camden Pop-Up Pigeons** | Market stalls; cheeky pigeons pop up holding word signs; bop the correct one |
| 5 | airplane | **Paper Plane Post** | Pilot a paper plane over the rooftops; fly through word-clouds, dodge the wrong ones |
| 6 | battleship | **Bathtub Fleet** | Brass-periscope toy-boat battle on the Serpentine; call coordinates, reveal words |
| 7 | spinthewheel | **Pier Carnival Wheel** | Seaside pier at golden hour; big lacquered wheel, Bajla as carnival barker |
| 8 | openthebox | **The Vault Job** | Marble bank hall; crack brass vault doors by answering; confetti of banknotes on success |

## Wave 2 — Scene-staged games (3D set + staged mechanic)

| shellKey | Title | District |
|----------|-------|----------|
| hangman | Lantern Alley (upgrade of existing CSS pilot to full 3D) | the canonical alley, lanterns dim per miss |
| quizshow | Telly Studio | game-show set, podiums, spotlights, audience plush owls |
| picturequiz | The Gallery | national-gallery hall, paintings reveal |
| flashcards | The Reading Room | cozy library, cards as flying book pages |
| matching | String Board | detective's evidence board in a Baker-Street attic |
| concentration | Tea Room Pairs | flip teacups to match pairs |
| findthematch | Market Pairs | match stall goods on a barrow |
| randomcards | Card Parlour | velvet club room, dealt cards |
| randomwheel | Busker's Wheel | street performer's wheel in Covent Garden |
| flyingfruit | Borough Market Toss | catch the right flying produce |
| speakingcards | Speakers' Corner | soapbox podium, park crowd of owls |
| listeningcomp | The West End | theatre box; listen to the stage, answer |

## Wave 3 — Diorama frames (3D set dressing, crisp DOM text mechanic)

crossword (Print Shop), wordsearch (Letterpress Tray), gapfill (Postcard
Desk), dragdrop (Sorting Office), groupsort (Left-Luggage Room), truefalse
(Courtroom), anagram (Scrabble Café), multiplechoice (Phone Box Quiz),
opencloze (Telegraph Office), sentencetransform (Editor's Desk),
wordformation (Type Foundry), sentencecorrection (Proofreader's Loupe),
spellingbee (Bee Garden gazebo), typingtest (Fleet Street Newsroom),
readingcomp (Paddington Platform — read the notice), labelleddiagram
(Architect's Table), rankorder (Auction House), unjumble (Tube-Map Scramble).

Rule for Wave 3: the 3D layer is a frame/diorama around the existing readable
mechanic — text stays DOM/HTML, never baked into textures.
