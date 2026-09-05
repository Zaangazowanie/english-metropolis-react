# Current practice arcade

The 38 canonical controllers live in `src/practice/shells/`. They own puzzles,
answer validation, learning progress, hints, review and completion callbacks.
Each controller mounts its functional Three.js scene; there is no second
legacy implementation of the game. The homepage, student catalogue and city
registry route to these same controllers.

The user replaced the old muted storybook practice direction on 5 September
2026 with saturated, detailed arcade districts. Retired practice storyboards
and their superseded implementations were removed. Git history preserves
their previous versions. World and City Hub remain separate experiences.

## Scene families

| Family | Games | Scene files and shared models |
| --- | --- | --- |
| Word machines | Crossword, Wordsearch, Hangman, Matching, Flashcards, DragDrop, GroupSort, Anagram, OpenCloze, SentenceTransform, WordFormation, SentenceCorrection, SpellingBee, TypingTest | `shells3d/Word*3D.tsx`, `word-kit/` |
| Challenge machines | MultipleChoice, GapFill, TrueFalse, ReadingComp, ListeningComp, PictureQuiz, SpeakingCards, LabelledDiagram, RankOrder, Unjumble, QuizShow, Concentration, FindTheMatch, RandomCards | Named scene files, `challenge-machine.tsx`, `challenge-scenes.tsx` |
| Action games | OpenTheBox, SpinTheWheel, WhackAMole, BalloonPop, Snake, MazeChase, Battleship, RandomWheel, Airplane, FlyingFruit | `shells3d/Action*3D.tsx`, `action-arcade-scene-kit.tsx`, `action-arcade-wheel.tsx` |

## Visual direction

Use distinct cobalt, violet, magenta, cyan, jade and gold materials against
deep ink backgrounds. Neutral lighting and tone mapping preserve enamel
colour. Do not reintroduce a pastel wash or apply a saturation filter to the
whole interface. Keep language readable on contrasting DOM labels.

Details belong to each game: cargo markings and corrugated containers,
railway platforms and signals, instrument scales and acoustic panels,
safe hardware, fruit and orchard stalls, rooftop windows, foundry pipes,
printed circuit boards, carnival trim and runway lights. Batch repeated
details with instancing. Controls must operate the existing game state.

## Runtime requirements

- One canvas per game; keep individual scenes lazy loaded.
- DPR at most 1.5, target fewer than 150 draw calls, bounded geometry.
- Preserve keyboard/touch paths and a compact playable WebGL fallback.
- Respect reduced motion and stop background rendering offscreen.
- Arcade points stay separate from saved learning grades.
- City demos keep progress local to the demo session.
- Validate complete runs, incorrect answers, replay, mobile layouts and
  live deployment. Source checks alone do not establish a visual pass.

The production release script is
`deploy/deploy-functional-arcade-2026-09-05.sh`. Repository deployment rules
in the root `AGENTS.md` take precedence over historical orchestration notes.
