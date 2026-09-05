import { useChallenge3DPreferences } from './challenge-3d-preferences';
import { lazy, Suspense } from 'react';
import type { MachineProps } from '../shells3d/challenge-machine';
const MultipleChoice = lazy(() => import('../shells3d/MultipleChoice3D'));
const TrueFalse = lazy(() => import('../shells3d/TrueFalse3D'));
const QuizShow = lazy(() => import('../shells3d/QuizShow3D'));
const RandomCards = lazy(() => import('../shells3d/RandomCards3D'));
const Concentration = lazy(() => import('../shells3d/Concentration3D'));
const FindTheMatch = lazy(() => import('../shells3d/FindTheMatch3D'));
const GapFill = lazy(() => import('../shells3d/GapFill3D'));
const ReadingComp = lazy(() => import('../shells3d/ReadingComp3D'));
const ListeningComp = lazy(() => import('../shells3d/ListeningComp3D'));
const PictureQuiz = lazy(() => import('../shells3d/PictureQuiz3D'));
const SpeakingCards = lazy(() => import('../shells3d/SpeakingCards3D'));
const LabelledDiagram = lazy(() => import('../shells3d/LabelledDiagram3D'));
const RankOrder = lazy(() => import('../shells3d/RankOrder3D'));
const Unjumble = lazy(() => import('../shells3d/Unjumble3D'));
const machines = { MultipleChoice, TrueFalse, QuizShow, RandomCards, Concentration, FindTheMatch, GapFill, ReadingComp, ListeningComp, PictureQuiz, SpeakingCards, LabelledDiagram, RankOrder, Unjumble };
export function Challenge3D({game,...props}:MachineProps & {game:keyof typeof machines}) { const Machine=machines[game]; const preferences=useChallenge3DPreferences(); return <Suspense fallback={<div className="challenge-3d-loading" role="status">Opening the 3D arcade…</div>}><Machine {...preferences} {...props}/></Suspense>; }
