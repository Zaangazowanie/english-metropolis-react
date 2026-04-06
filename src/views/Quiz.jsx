import { useState } from 'react';

// Placeholder quiz data — replace with API fetch
const PLACEHOLDER_QUIZZES = [
  {
    id: 1,
    question: 'Which word means "wszechobecny" in English?',
    options: ['ubiquitous', 'unique', 'uniform', 'unanimous'],
    correct: 0,
  },
  {
    id: 2,
    question: 'What does "prohibition" mean?',
    options: ['Encouragement', 'Forbidding by law', 'Permission', 'Tradition'],
    correct: 1,
  },
  {
    id: 3,
    question: 'Choose the correct collocation:',
    options: ['make a decision', 'do a decision', 'take a decision', 'have a decision'],
    correct: 0,
  },
];

export default function Quiz() {
  const [quizzes] = useState(PLACEHOLDER_QUIZZES);
  const [currentQ, setCurrentQ] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  const quiz = quizzes[currentQ];
  const totalAnswered = finished ? quizzes.length : submitted ? currentQ + 1 : currentQ;
  const average = totalAnswered > 0 ? Math.round((score / totalAnswered) * 100) : 0;

  function handleSelect(index) {
    if (submitted) return;
    setSelected(index);
  }

  function handleSubmit() {
    if (selected === null) return;
    const isCorrect = selected === quiz.correct;
    if (isCorrect) setScore(prev => prev + 1);
    setSubmitted(true);
  }

  function handleNext() {
    if (currentQ >= quizzes.length - 1) {
      setFinished(true);
    } else {
      setCurrentQ(prev => prev + 1);
      setSelected(null);
      setSubmitted(false);
    }
  }

  function handleRestart() {
    setCurrentQ(0);
    setSelected(null);
    setSubmitted(false);
    setScore(0);
    setFinished(false);
  }

  if (finished) {
    return (
      <div className="max-w-6xl mx-auto py-6">
        <div className="glass-panel rounded-[2rem] border border-white/50 editorial-shadow px-5 py-8 sm:px-8 sm:py-10 text-center">
          <span className="material-symbols-outlined text-5xl text-amber-400 mb-4 block" aria-hidden="true">emoji_events</span>
          <h2 className="font-headline text-3xl text-slate-900 mb-2">Quiz Complete!</h2>
          <p className="text-lg text-slate-600 mb-1">
            You scored <strong className="text-sky-700">{score}</strong> out of <strong>{quizzes.length}</strong>
          </p>
          <p className="text-2xl font-headline text-slate-900 mb-6">{Math.round((score / quizzes.length) * 100)}%</p>
          <button
            onClick={handleRestart}
            className="px-6 py-2.5 rounded-xl bg-sky-600 text-white font-semibold hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-6">
      <div className="glass-panel rounded-[2rem] border border-white/50 editorial-shadow px-5 py-4 sm:px-6 sm:py-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr),minmax(260px,0.7fr)]">
          <div>
            <p className="font-label text-xs font-bold uppercase tracking-[0.28em] text-slate-400">Quiz</p>
            <h2 className="font-headline text-4xl text-slate-900 mt-2">Quiz Snapshot</h2>
            <p className="text-slate-500 mt-2 max-w-2xl">
              Question {currentQ + 1} of {quizzes.length} — Select your answer and submit.
            </p>

            <div className="mt-6">
              <p className="text-lg font-medium text-slate-800 mb-4">{quiz.question}</p>
              <div className="space-y-2" role="radiogroup" aria-label="Quiz options">
                {quiz.options.map((option, i) => {
                  let classes = 'w-full text-left px-4 py-3 rounded-xl border transition-all ';
                  if (submitted) {
                    if (i === quiz.correct) {
                      classes += 'border-green-400 bg-green-50 text-green-800';
                    } else if (i === selected && i !== quiz.correct) {
                      classes += 'border-red-400 bg-red-50 text-red-800';
                    } else {
                      classes += 'border-slate-200 bg-white text-slate-400';
                    }
                  } else {
                    classes += selected === i
                      ? 'border-sky-400 bg-sky-50 text-sky-800 ring-2 ring-sky-200'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-slate-50';
                  }

                  return (
                    <button
                      key={i}
                      className={classes}
                      onClick={() => handleSelect(i)}
                      role="radio"
                      aria-checked={selected === i}
                      disabled={submitted}
                    >
                      <span className="font-mono text-xs mr-3 text-slate-400">{String.fromCharCode(65 + i)}</span>
                      {option}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex gap-3">
                {!submitted ? (
                  <button
                    onClick={handleSubmit}
                    disabled={selected === null}
                    className="px-6 py-2.5 rounded-xl bg-sky-600 text-white font-semibold hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 transition-colors"
                  >
                    Submit Answer
                  </button>
                ) : (
                  <button
                    onClick={handleNext}
                    className="px-6 py-2.5 rounded-xl bg-sky-600 text-white font-semibold hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 transition-colors"
                  >
                    {currentQ >= quizzes.length - 1 ? 'See Results' : 'Next Question'}
                  </button>
                )}
              </div>

              {submitted && (
                <p className={`mt-3 text-sm font-medium ${selected === quiz.correct ? 'text-green-700' : 'text-red-700'}`}>
                  {selected === quiz.correct ? '✓ Correct!' : `✗ Incorrect. The answer is: ${quiz.options[quiz.correct]}`}
                </p>
              )}
            </div>
          </div>
          <div className="liquid-glass-card rounded-[1.75rem] border border-slate-200/70 p-5 space-y-4 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-label text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Quiz Progress</p>
                  <p className="text-sm text-slate-500 mt-1">Session score tracking.</p>
                </div>
                <span className="material-symbols-outlined text-slate-300" aria-hidden="true">trophy</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl bg-slate-50 px-3 py-3">
                  <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Answered</p>
                  <p className="font-headline text-2xl text-slate-900 mt-2">{totalAnswered}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-3 py-3">
                  <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Score</p>
                  <p className="font-headline text-2xl text-slate-900 mt-2">{score}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-3 py-3">
                  <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Average</p>
                  <p className="font-headline text-2xl text-slate-900 mt-2">{average}%</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-label font-bold uppercase tracking-[0.18em] text-slate-400">
                  <span>Progress</span>
                  <span>{Math.round(((currentQ + (submitted ? 1 : 0)) / quizzes.length) * 100)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={Math.round(((currentQ + (submitted ? 1 : 0)) / quizzes.length) * 100)} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full rounded-full bg-gradient-to-r from-blue-500 via-sky-500 to-cyan-400 transition-all duration-500" style={{width: `${((currentQ + (submitted ? 1 : 0)) / quizzes.length) * 100}%`}}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
