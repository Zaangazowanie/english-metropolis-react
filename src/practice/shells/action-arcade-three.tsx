import { Component, Suspense, lazy, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ActionSceneData } from '../shells3d/action-arcade-scene-kit';
import './action-arcade-three.css';

const scenes = {
  snake: lazy(() => import('../shells3d/ActionSnake3D')),
  mazechase: lazy(() => import('../shells3d/ActionMazeChase3D')),
  battleship: lazy(() => import('../shells3d/ActionBattleship3D')),
  airplane: lazy(() => import('../shells3d/ActionAirplane3D')),
  flyingfruit: lazy(() => import('../shells3d/ActionFlyingFruit3D')),
  whackamole: lazy(() => import('../shells3d/ActionWhackAMole3D')),
  balloonpop: lazy(() => import('../shells3d/ActionBalloonPop3D')),
  spinthewheel: lazy(() => import('../shells3d/ActionSpinTheWheel3D')),
  randomwheel: lazy(() => import('../shells3d/ActionRandomWheel3D')),
  openthebox: lazy(() => import('../shells3d/ActionOpenTheBox3D')),
};

const playGuides: Record<keyof typeof scenes, [string, string]> = {
  openthebox: ['Open a safe. Match the clue to crack its lock.', '1–9 safe · A–D answer · ← → dial · Enter unlock'],
  spinthewheel: ['Choose your word, then lock it in with a spin.', 'A–D / 1–4 choose · Space spin'],
  randomwheel: ['Spin for a challenge. Clear every category.', 'Space spin · A–D / 1–4 answer'],
  whackamole: ['Catch the conductor whose word matches the clue.', '1–6 hole · F focus / arcade · Tab + Enter controls'],
  balloonpop: ['Launch, then pop the word that matches the clue.', '1–4 balloon · P launch / pause · F freeze'],
  flyingfruit: ['Catch the matching fruit. Aim at the top for a bonus.', '1–4 fruit · P launch / pause · B blade mode'],
  airplane: ['Choose the matching gate, then fly through it.', '↑ ↓ / W S steer · P launch / pause'],
  snake: ['Steer your train into the matching word. Edges wrap.', '↑ ↓ ← → / WASD steer · Space pause / resume'],
  mazechase: ['Collect the matching word. Lamps protect you from shadows.', '↑ ↓ ← → / WASD move · Tap a path to steer'],
  battleship: ['Ping the harbour. Solve clues to sink all four ships.', '↑ ↓ ← → aim · Enter / Space ping'],
};

class LoadBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/** Uses the same actor/grid data and callbacks when a canvas cannot be created. */
function AccessiblePlayfield({kind,data,hasControls}:{kind:keyof typeof scenes;data:ActionSceneData;hasControls:boolean}) {
  const gridGame=kind==='snake'||kind==='mazechase'||kind==='battleship';
  const rows=kind==='battleship'?8:data.grid?.rows??1,cols=kind==='battleship'?8:data.grid?.cols??1;
  const player=data.player??data.body?.[0];
  return <div className="action-three-fallback" aria-label="Arcade play area">
    {gridGame?<>
      <div className="action-three-fallback-grid" style={{gridTemplateColumns:`repeat(${cols},minmax(0,1fr))`}}>
        {Array.from({length:rows*cols},(_,id)=>{
          const r=Math.floor(id/cols),c=id%cols;
          const actor=data.actors?.find(a=>a.x===c&&a.y===r);
          const wall=Boolean(data.grid?.walls?.[r]?.[c]);
          const head=player?.r===r&&player?.c===c,body=data.body?.some(s=>s.r===r&&s.c===c),shadow=data.shadow?.r===r&&data.shadow?.c===c;
          const coordinate=`${String.fromCharCode(65+c)}${r+1}`;
          const label=kind==='battleship'?`${coordinate}${actor?actor.state==='hit'?', hit':`, sonar ${actor.value??0}`:''}`:`Row ${r+1}, column ${c+1}${head?', you':shadow?', shadow':wall?', wall':actor?`, ${actor.label}`:''}`;
          return <button key={id} aria-label={label} disabled={wall} data-head={head} data-body={body&&!head} data-wall={wall} data-token={!!actor} data-hit={actor?.state==='hit'} onClick={()=>{
            if(kind==='battleship'){data.onPick?.(id);return;}
            if(!player)return;
            const dx=c-player.c,dz=r-player.r;
            if(dx||dz)data.onMove?.(Math.abs(dx)>Math.abs(dz)?dx>0?'right':'left':dz>0?'down':'up');
          }}>{kind==='battleship'?(actor?actor.state==='hit'?'✓':actor.value??0:coordinate):head?'●':shadow?'◆':actor?actor.id+1:''}</button>;
        })}
      </div>
      {player&&<p role="status">{kind==='battleship'?'Cursor':'You'}: {String.fromCharCode(65+player.c)}{player.r+1}{data.shield?' · Shield active':''}</p>}
      {data.onMove&&<div className="action-three-controls">{(['up','left','down','right'] as const).map(direction=><button key={direction} aria-label={`Move ${direction}`} onClick={()=>data.onMove?.(direction)}>{{up:'↑',left:'←',down:'↓',right:'→'}[direction]}</button>)}</div>}
      {kind==='mazechase'&&<div className="action-arcade-option-list">{data.actors?.map(a=><span key={a.id}><b>{a.id+1}</b>{a.label}</span>)}</div>}
    </>:<>
      {!hasControls&&data.onPick&&<div className="action-three-controls">{data.actors?.filter(a=>!a.hidden).map(a=><button key={a.id} disabled={a.enabled===false} aria-pressed={a.selected} onClick={()=>data.onPick?.(a.id)}>{a.label??`Safe ${a.id+1}`}</button>)}</div>}
      {data.onSpin&&<div className="action-three-controls"><button disabled={data.running} onClick={data.onSpin}>{data.running?'Spinning…':'Spin the wheel'}</button></div>}
      {data.onDial&&data.actors?.some(a=>a.selected&&a.state==='open')&&<div className="action-three-controls"><button onClick={data.onDial}>Turn dial · {String.fromCharCode(65+(data.dial??0))}</button></div>}
    </>}
  </div>;
}

/** The canonical shell owns every run; both renderers share its live state. */
export function ActionPlayfield3D({ kind, data, controls, onShortcut, hud }: {
  kind: keyof typeof scenes;
  data: ActionSceneData;
  controls?: ReactNode;
  hud?: ReactNode;
  /** Return true only for a key handled by the canonical shell. */
  onShortcut?: (key: string) => boolean;
}) {
  const [failed, setFailed] = useState(false);
  const field = useRef<HTMLDivElement>(null);
  const live = useRef({data, onShortcut});
  live.current = {data, onShortcut};
  useEffect(() => {
    const root = field.current?.closest('[role="application"]') ?? field.current;
    if (!root) return;
    const handle = (event: Event) => {
      const e = event as KeyboardEvent;
      const target = e.target as HTMLElement;
      if (e.defaultPrevented || e.repeat || e.altKey || e.ctrlKey || e.metaKey || target.isContentEditable || target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      // Space/Enter on native buttons must keep their usual single activation.
      if ((e.key === ' ' || e.key === 'Enter') && target.closest('button, a, summary')) return;
      const {data: current, onShortcut: shortcut} = live.current;
      let handled = shortcut?.(e.key.toLowerCase()) ?? false;
      if (!handled && ['openthebox','spinthewheel','balloonpop','flyingfruit'].includes(kind) && /^[1-9]$/.test(e.key)) {
        const actor = current.actors?.[Number(e.key) - 1];
        if (actor && actor.enabled !== false && !actor.hidden && current.onPick) { current.onPick(actor.id); handled = true; }
      }
      if (handled) { e.preventDefault(); e.stopPropagation(); field.current?.focus({preventScroll:true}); }
    };
    root.addEventListener('keydown', handle);
    return () => root.removeEventListener('keydown', handle);
  }, [kind]);
  const Scene = scenes[kind];
  const fallback=<AccessiblePlayfield kind={kind} data={data} hasControls={!!controls}/>;
  return <>
    <div ref={field} role="group" tabIndex={0} aria-label={`${kind} playfield. ${playGuides[kind][1]}`} className={`action-three-playfield action-three-${kind}`} data-three-game={kind} onPointerDownCapture={e => { if ((e.target as HTMLElement).tagName === 'CANVAS') field.current?.focus({preventScroll:true}); }}>
    {failed?fallback:<LoadBoundary fallback={fallback}>
      <Suspense fallback={<div className="action-three-loading" role="status">Opening the district…</div>}>
        <Scene {...data} onError={() => setFailed(true)} />
      </Suspense>
    </LoadBoundary>}
    <div className="action-three-overlay"><div className="action-three-instructions"><strong>{playGuides[kind][0]}</strong><span>{playGuides[kind][1]}</span></div></div>
    </div>
    {hud && <div className="action-three-status">{hud}</div>}
    {controls && <div className="action-three-controls">{controls}</div>}
  </>;
}
