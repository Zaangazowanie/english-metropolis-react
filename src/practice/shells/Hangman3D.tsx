// Hangman3D — CSS + SVG "Lantern Alley" scene.
//
// Pure-visual companion to Hangman.tsx. Ricky 2026-05-03 — port of Mike's
// CSS+SVG prototype (/tmp/hangman-handoff/00-hangman-reference/) into the
// EnglishMetro practice shell. Replaces the previous r3f/three.js
// implementation (CD audit 2026-05-03 — procedural Three.js geometry didn't
// match Mike's GPT-image reference).
//
// What this renders:
//   • Backdrop (dusk sky gradient + grain + 80 deterministic twinkling
//     stars + moon + London skyline silhouette with Big Ben + St Paul's).
//   • LanternRow (N paper lanterns hanging from a sagging gold rope, swaying
//     individually; right-to-left dim drives wrong-guess feedback; embers
//     fire on the just-extinguished lantern).
//   • Bajla (purple owl) — continuous low-opacity idle loop near the
//     leftmost lantern + a dramatic full-arc flyby on win.
//
// Bundle weight target: shell-Hangman3D chunk under ~30KB gzipped (was
// ~250KB gzipped with r3f).
//
// Lazy-loaded from Hangman.tsx via React.lazy() — the parent owns the
// Suspense fallback so this file can render inline.

import { useEffect, useMemo, useRef, useState } from 'react';
import '../styles/shells/hangman-3d.css';

export interface Hangman3DProps {
  /** 0..maxWrong — drives which lanterns are dark (right-to-left dim). */
  wrongCount: number;
  /** Total lanterns in the row (matches MAX_WRONG = 6 in the parent). */
  maxWrong?: number;
  /** True when the player has solved the puzzle this round. Triggers full
   *  alley re-illumination + a dramatic Bajla flyby. */
  won: boolean;
  /** True when lives reach 0. Forces all lanterns dark. */
  lost: boolean;
  /** Monotonically-increasing tick that bumps every wrong guess so the
   *  embers fire on the just-extinguished lantern even if React batches
   *  the wrongCount transition. */
  wrongTick?: number;
  /** Monotonically-increasing tick that bumps every CORRECT letter pick
   *  (Mike 2026-05-03 — wants a clear bright-flash + animation feedback
   *  so the student sees the lanterns reward the right guess). */
  correctTick?: number;
}

const LANTERN_COUNT_DEFAULT = 6;

// ─────────────────────────────────────────────────────────────────────
// Backdrop — dusk sky + 80 deterministic twinkling stars + moon
// + London skyline silhouette (Big Ben left, St Paul's right).
// ─────────────────────────────────────────────────────────────────────
function Backdrop() {
  // Deterministic seeded scatter so stars don't twitch on re-render.
  const stars = useMemo(() => {
    const arr: { x: number; y: number; r: number; d: number; op: number }[] = [];
    let s = 7;
    const rand = () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
    for (let i = 0; i < 80; i++) {
      arr.push({
        x: rand() * 100,
        y: rand() * 65,
        r: 0.4 + rand() * 1.2,
        d: rand() * 5,
        op: 0.3 + rand() * 0.7,
      });
    }
    return arr;
  }, []);

  const skyGradient =
    'linear-gradient(180deg, #1a0f2e 0%, #2A1B45 32%, #4A1B5C 62%, #6F3580 88%, #C57195 100%)';

  return (
    <div className="hm-backdrop" aria-hidden="true">
      <div className="hm-sky" style={{ background: skyGradient }} />
      <div className="hm-grain" />
      <svg className="hm-stars" viewBox="0 0 100 100" preserveAspectRatio="none">
        {stars.map((st, i) => (
          <circle
            key={i}
            cx={st.x}
            cy={st.y}
            r={st.r * 0.18}
            fill="#FFE9B0"
            opacity={st.op}
            style={{ animation: `em-hm-twinkle ${3 + st.d}s ease-in-out ${st.d}s infinite` }}
          />
        ))}
      </svg>
      <div className="hm-moon" />
      <div className="hm-moon-glow" />
      {/* London skyline silhouette — Big Ben left, St Paul's right. */}
      <svg
        className="hm-skyline"
        viewBox="0 0 1600 600"
        preserveAspectRatio="xMidYEnd slice"
      >
        <defs>
          <linearGradient id="em-hm-skylineFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0a0418" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#0a0418" stopOpacity="1" />
          </linearGradient>
        </defs>
        <g fill="url(#em-hm-skylineFade)">
          {/* Far left buildings */}
          <rect x="0" y="440" width="80" height="160" />
          <rect x="60" y="410" width="50" height="190" />
          {/* Big Ben tower */}
          <rect x="120" y="280" width="42" height="320" />
          <polygon points="120,280 141,255 162,280" />
          <rect x="125" y="320" width="32" height="32" fill="#1a0f2e" />
          <circle cx="141" cy="336" r="9" fill="#FFE48A" opacity="0.75" />
          <polygon points="141,255 145,235 137,235" />
          {/* Mid buildings */}
          <rect x="180" y="430" width="70" height="170" />
          <rect x="245" y="395" width="55" height="205" />
          <rect x="300" y="450" width="60" height="150" />
          {/* London Eye-ish wheel */}
          <circle
            cx="420"
            cy="420"
            r="55"
            fill="none"
            stroke="#0a0418"
            strokeWidth="3"
            opacity="0.7"
          />
          <circle cx="420" cy="420" r="6" fill="#0a0418" />
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return (
              <line
                key={i}
                x1="420"
                y1="420"
                x2={420 + Math.cos(a) * 55}
                y2={420 + Math.sin(a) * 55}
                stroke="#0a0418"
                strokeWidth="1.5"
                opacity="0.55"
              />
            );
          })}
          <rect x="415" y="475" width="10" height="125" />
          {/* Centre fill */}
          <rect x="490" y="460" width="80" height="140" />
          <rect x="565" y="430" width="60" height="170" />
          <rect x="620" y="470" width="50" height="130" />
          <rect x="670" y="450" width="80" height="150" />
          <rect x="745" y="420" width="60" height="180" />
          <rect x="800" y="465" width="90" height="135" />
          <rect x="885" y="445" width="50" height="155" />
          <rect x="930" y="475" width="70" height="125" />
          <rect x="995" y="430" width="60" height="170" />
          {/* St Paul's dome */}
          <rect x="1080" y="380" width="120" height="220" />
          <ellipse cx="1140" cy="380" rx="60" ry="50" />
          <rect x="1132" y="320" width="16" height="60" />
          <circle cx="1140" cy="318" r="6" />
          {/* Right side */}
          <rect x="1220" y="450" width="80" height="150" />
          <rect x="1295" y="410" width="60" height="190" />
          <rect x="1350" y="430" width="50" height="170" />
          <rect x="1395" y="380" width="80" height="220" />
          <rect x="1470" y="450" width="60" height="150" />
          <rect x="1525" y="420" width="75" height="180" />
        </g>
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Single paper lantern (cord + body + ribs + glow + optional embers).
// Lit = warm amber gradient; dark = deep violet; celebrating = brighter
// with extra inner glow. Right-to-left dim drives the lit prop.
// ─────────────────────────────────────────────────────────────────────
interface LanternProps {
  index: number;
  lit: boolean;
  celebrating: boolean;
  justExtinguished: boolean;
  flashing: boolean;
  hookX: number;
  ropeY: number;
}

function Lantern({
  index,
  lit,
  celebrating,
  justExtinguished,
  flashing,
  hookX,
  ropeY,
}: LanternProps) {
  const swayDelay = -(index * 0.7);
  const cordLen = 48 + (index % 2) * 8;
  const isLit = lit || celebrating;

  return (
    <div
      className={`hm-lantern-wrap${flashing ? ' is-flashing' : ''}`}
      style={{
        left: `${hookX}px`,
        top: `${ropeY}px`,
        animationDelay: `${swayDelay}s`,
      }}
    >
      <svg
        className="hm-lantern-cord"
        width="20"
        height={cordLen + 14}
        viewBox={`0 0 20 ${cordLen + 14}`}
      >
        <path d="M10 0 Q 14 4 10 8 Q 6 12 10 14" stroke="#D4A24C" strokeWidth="2" fill="none" />
        <line x1="10" y1="14" x2="10" y2={cordLen + 14} stroke="#3A2418" strokeWidth="1.2" />
      </svg>
      <svg
        className="hm-lantern-body"
        width="74"
        height="110"
        viewBox="0 0 74 110"
        style={{ marginTop: cordLen + 14 - 6 }}
      >
        <defs>
          <radialGradient id={`em-hm-lit-${index}`} cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#FFF1B8" />
            <stop offset="35%" stopColor="#FFCD6E" />
            <stop offset="70%" stopColor="#E68A3C" />
            <stop offset="100%" stopColor="#7C3A18" />
          </radialGradient>
          <radialGradient id={`em-hm-dark-${index}`} cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#3A1F58" />
            <stop offset="60%" stopColor="#1F0E3A" />
            <stop offset="100%" stopColor="#0A0418" />
          </radialGradient>
          <linearGradient id={`em-hm-cap-${index}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5A3820" />
            <stop offset="100%" stopColor="#2A1810" />
          </linearGradient>
          <filter id={`em-hm-glow-${index}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>

        {/* Top cap */}
        <ellipse cx="37" cy="10" rx="18" ry="3.5" fill={`url(#em-hm-cap-${index})`} />
        <rect x="19" y="8" width="36" height="6" fill={`url(#em-hm-cap-${index})`} rx="1" />
        <ellipse cx="37" cy="13" rx="18" ry="2" fill="#D4A24C" opacity="0.5" />

        {/* Body */}
        <ellipse
          cx="37"
          cy="55"
          rx="28"
          ry="38"
          fill={isLit ? `url(#em-hm-lit-${index})` : `url(#em-hm-dark-${index})`}
        />
        {/* Vertical bamboo ribs */}
        <g opacity={isLit ? 0.45 : 0.6}>
          {[-22, -14, -6, 2, 10, 18].map((dx, i) => (
            <path
              key={i}
              d={`M ${37 + dx} 22 Q ${37 + dx * 0.7} 55 ${37 + dx} 88`}
              stroke={isLit ? '#7C3A18' : '#0A0418'}
              strokeWidth="0.8"
              fill="none"
              opacity="0.7"
            />
          ))}
        </g>
        {/* Horizontal bands */}
        <ellipse
          cx="37"
          cy="22"
          rx="22"
          ry="3"
          fill="none"
          stroke={isLit ? '#7C3A18' : '#0A0418'}
          strokeWidth="1"
          opacity="0.7"
        />
        <ellipse
          cx="37"
          cy="88"
          rx="22"
          ry="3"
          fill="none"
          stroke={isLit ? '#7C3A18' : '#0A0418'}
          strokeWidth="1"
          opacity="0.7"
        />

        {/* Branch motif (cherry blossom hint) — only on lit lanterns */}
        {isLit && (
          <g opacity="0.55" stroke="#7C3A18" strokeWidth="0.9" fill="none">
            <path d="M 24 40 Q 30 50 28 62" />
            <path d="M 28 45 Q 33 47 36 44" />
            <path d="M 26 55 Q 32 56 35 52" />
            <circle cx="36" cy="44" r="1" fill="#7C3A18" />
            <circle cx="35" cy="52" r="1" fill="#7C3A18" />
          </g>
        )}

        {/* Bottom cap */}
        <rect x="29" y="92" width="16" height="4" fill={`url(#em-hm-cap-${index})`} rx="1" />
        <ellipse cx="37" cy="96" rx="8" ry="2" fill={`url(#em-hm-cap-${index})`} />
        <line x1="37" y1="98" x2="37" y2="105" stroke="#D4A24C" strokeWidth="1" opacity="0.7" />

        {/* Inner glow halo (only when lit) */}
        {isLit && (
          <ellipse
            cx="37"
            cy="55"
            rx="32"
            ry="42"
            fill="#FFCD6E"
            opacity={celebrating ? 0.55 : 0.32}
            filter={`url(#em-hm-glow-${index})`}
          >
            <animate
              attributeName="opacity"
              values={celebrating ? '0.55;0.7;0.55' : '0.28;0.4;0.28'}
              dur="3s"
              repeatCount="indefinite"
            />
          </ellipse>
        )}
      </svg>

      {/* Embers — fire when this lantern just went dark */}
      {justExtinguished && (
        <div className="hm-embers" style={{ marginTop: cordLen + 14 + 50 }}>
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i / 12) * Math.PI * 2;
            const dx = Math.cos(angle) * (18 + Math.random() * 10);
            const dy = Math.sin(angle) * (18 + Math.random() * 10) - 20;
            return (
              <span
                key={i}
                className="hm-ember"
                style={
                  {
                    '--dx': `${dx}px`,
                    '--dy': `${dy}px`,
                    animationDelay: `${i * 18}ms`,
                  } as React.CSSProperties
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Lantern row — sagging gold rope strung across with N lanterns hanging.
// Lanterns dim right-to-left as wrong guesses pile up.
// ─────────────────────────────────────────────────────────────────────
interface LanternRowProps {
  wrongCount: number;
  maxWrong: number;
  won: boolean;
  lost: boolean;
  justExtinguishedIdx: number | null;
  flashIdx: number | null;
  width: number;
}

function LanternRow({
  wrongCount,
  maxWrong,
  won,
  lost,
  justExtinguishedIdx,
  flashIdx,
  width,
}: LanternRowProps) {
  const ropeStartX = 80;
  const ropeEndX = width - 80;
  const ropeStartY = 30;
  const ropeEndY = 36;
  const sag = 26;

  const hooks = useMemo(() => {
    const arr: { x: number; y: number }[] = [];
    for (let i = 0; i < maxWrong; i++) {
      const t = maxWrong === 1 ? 0.5 : (i + 0.5) / maxWrong;
      const x = ropeStartX + (ropeEndX - ropeStartX) * t;
      const y =
        (1 - t) * (1 - t) * ropeStartY +
        2 * (1 - t) * t * (ropeStartY + sag * 2) +
        t * t * ropeEndY;
      arr.push({ x, y });
    }
    return arr;
  }, [maxWrong, ropeStartX, ropeEndX]);

  const ropePath = `M ${ropeStartX} ${ropeStartY} Q ${(ropeStartX + ropeEndX) / 2} ${ropeStartY + sag * 2} ${ropeEndX} ${ropeEndY}`;

  return (
    <div className="hm-lantern-row">
      <svg
        className="hm-rope"
        viewBox={`0 0 ${width} 80`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: 80 }}
      >
        <path d={ropePath} stroke="#0a0418" strokeWidth="3.5" fill="none" opacity="0.5" />
        <path d={ropePath} stroke="#D4A24C" strokeWidth="2.5" fill="none" />
        <path
          d={ropePath}
          stroke="#FFE48A"
          strokeWidth="0.8"
          fill="none"
          opacity="0.6"
          strokeDasharray="4 3"
        />
      </svg>
      <div className="hm-lanterns-container">
        {hooks.map((h, i) => {
          const lit = !lost && i < maxWrong - wrongCount;
          return (
            <Lantern
              key={i}
              index={i}
              hookX={h.x}
              ropeY={h.y}
              lit={lit}
              celebrating={won}
              justExtinguished={justExtinguishedIdx === i}
              flashing={flashIdx === i}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Bajla — purple owl mascot SVG. Two render modes:
//   • idle: continuous low-opacity loop near the leftmost lantern (always
//     mounted — the GPT image shows Bajla in the scene at all times).
//   • flyby: dramatic full-arc across the scene, mounted on win and
//     re-mounted via a key bump so the keyframe restarts cleanly.
// ─────────────────────────────────────────────────────────────────────
interface BajlaProps {
  variant: 'idle' | 'flyby';
}

function Bajla({ variant }: BajlaProps) {
  return (
    <div
      className={`hm-bajla-flyby${variant === 'idle' ? ' is-idle' : ''}`}
      aria-hidden="true"
    >
      <svg width="120" height="100" viewBox="0 0 120 100">
        {/* Body */}
        <ellipse cx="55" cy="55" rx="30" ry="20" fill="#6E5C8E" />
        <ellipse cx="55" cy="50" rx="28" ry="16" fill="#8B7BA8" />
        {/* Head */}
        <circle cx="80" cy="42" r="14" fill="#6E5C8E" />
        <circle cx="79" cy="40" r="12" fill="#8B7BA8" />
        {/* Iridescent neck */}
        <ellipse cx="73" cy="50" rx="10" ry="6" fill="#22D3EE" opacity="0.5" />
        <ellipse cx="73" cy="50" rx="8" ry="4" fill="#A78BFA" opacity="0.6" />
        {/* Eye */}
        <circle cx="83" cy="40" r="2" fill="#0a0418" />
        <circle cx="83.5" cy="39.5" r="0.6" fill="#FFE48A" />
        {/* Beak */}
        <polygon points="92,42 102,44 92,46" fill="#FBBF24" />
        {/* Wing — flap animation */}
        <g className="hm-bajla-wing">
          <path d="M 40 40 Q 30 22 18 30 Q 24 42 38 50 Z" fill="#5C4A7A" />
          <path d="M 40 40 Q 32 28 22 32 Q 28 40 38 46 Z" fill="#7B6A99" />
        </g>
        {/* Tail */}
        <polygon points="25,58 8,62 12,68 28,64" fill="#5C4A7A" />
        {/* Feet */}
        <line x1="50" y1="74" x2="48" y2="80" stroke="#FBBF24" strokeWidth="1.5" />
        <line x1="60" y1="74" x2="62" y2="80" stroke="#FBBF24" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Public component.
// ─────────────────────────────────────────────────────────────────────
const Hangman3D: React.FC<Hangman3DProps> = ({
  wrongCount,
  maxWrong = LANTERN_COUNT_DEFAULT,
  won,
  lost,
  wrongTick = 0,
  correctTick = 0,
}) => {
  // Measure container width so the lantern row's hook positions scale to
  // the rendered scene size. Falls back to 920 (prototype default).
  const sceneRef = useRef<HTMLDivElement>(null);
  const [sceneWidth, setSceneWidth] = useState(920);
  useEffect(() => {
    const node = sceneRef.current;
    if (!node) return;
    const update = () => {
      setSceneWidth(Math.max(640, node.clientWidth));
    };
    update();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(update);
      ro.observe(node);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Track which lantern just went dark so we can fire embers on it.
  // We key off wrongTick (parent-bumped on every wrong guess) instead of
  // wrongCount so StrictMode double-renders don't mis-trigger.
  const [justExtinguishedIdx, setJustExtinguishedIdx] = useState<number | null>(null);
  const lastTickRef = useRef(wrongTick);
  useEffect(() => {
    if (wrongTick !== lastTickRef.current && wrongCount > 0 && wrongCount <= maxWrong) {
      // Lanterns dim right-to-left, mirroring the prototype.
      const idx = maxWrong - wrongCount;
      setJustExtinguishedIdx(idx);
      lastTickRef.current = wrongTick;
      const id = window.setTimeout(() => {
        setJustExtinguishedIdx((cur) => (cur === idx ? null : cur));
      }, 1200);
      return () => window.clearTimeout(id);
    }
    lastTickRef.current = wrongTick;
  }, [wrongTick, wrongCount, maxWrong]);

  // Bump a key on win so the flyby keyframe restarts cleanly each round.
  const [flybyKey, setFlybyKey] = useState(0);
  useEffect(() => {
    if (won) setFlybyKey((k) => k + 1);
  }, [won]);

  // Per Mike 2026-05-03: every correct letter triggers a bright flash on
  // the next-still-lit lantern (rightmost lit). We pick a deterministic
  // index that cycles through the lit lanterns on each correct so all
  // remaining lanterns share the love across a round.
  const [flashIdx, setFlashIdx] = useState<number | null>(null);
  const lastCorrectRef = useRef(correctTick);
  useEffect(() => {
    if (correctTick === lastCorrectRef.current) return;
    lastCorrectRef.current = correctTick;
    if (lost || won) return;
    const litCount = Math.max(0, maxWrong - wrongCount);
    if (litCount === 0) return;
    // Cycle: correctTick % litCount picks among the still-lit lanterns
    // (which occupy indices [0..litCount-1] since dimming is right-to-left).
    const idx = correctTick % litCount;
    setFlashIdx(idx);
    const id = window.setTimeout(() => {
      setFlashIdx((cur) => (cur === idx ? null : cur));
    }, 700);
    return () => window.clearTimeout(id);
  }, [correctTick, wrongCount, maxWrong, won, lost]);

  return (
    <div
      ref={sceneRef}
      className="em-hm-3d-scene"
      aria-hidden="true"
      style={{
        width: '100%',
        height: 'min(54vh, 480px)',
        minHeight: 320,
        borderRadius: 14,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <Backdrop />
      <LanternRow
        wrongCount={wrongCount}
        maxWrong={maxWrong}
        won={won}
        lost={lost}
        justExtinguishedIdx={justExtinguishedIdx}
        flashIdx={flashIdx}
        width={sceneWidth}
      />
      {/* Restored 2026-05-03 (Mike re-clarification): the perched-Bajla in
          Hangman.tsx was the bird Mike wanted gone (now hidden when 3D=on).
          The idle Bajla here matches the GPT-image reference and is the
          intended scene element. */}
      <Bajla variant="idle" />
      {won && <Bajla key={flybyKey} variant="flyby" />}
    </div>
  );
};

export default Hangman3D;
