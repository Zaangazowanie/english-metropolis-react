import { Component, Suspense, lazy, useState } from 'react';
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
export function ActionPlayfield3D({ kind, data, controls }: {
  kind: keyof typeof scenes;
  data: ActionSceneData;
  controls?: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  const Scene = scenes[kind];
  const fallback=<AccessiblePlayfield kind={kind} data={data} hasControls={!!controls}/>;
  return <>
    <div className={`action-three-playfield action-three-${kind}`} data-three-game={kind}>
    {failed?fallback:<LoadBoundary fallback={fallback}>
      <Suspense fallback={<div className="action-three-loading" role="status">Opening the district…</div>}>
        <Scene {...data} onError={() => setFailed(true)} />
      </Suspense>
    </LoadBoundary>}
    </div>
    {controls && <div className="action-three-controls">{controls}</div>}
  </>;
}
