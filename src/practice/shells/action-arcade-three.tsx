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

/** The canonical shell owns the run. This replaces only its interactive playfield. */
export function ActionPlayfield3D({ kind, data, children, controls }: {
  kind: keyof typeof scenes;
  data: ActionSceneData;
  children?: ReactNode;
  controls?: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  const Scene = scenes[kind];
  if (failed) return <>{children}</>;
  return <LoadBoundary fallback={children}>
    <div className={`action-three-playfield action-three-${kind}`} data-three-game={kind}>
      <Suspense fallback={<div className="action-three-loading" role="status">Opening the district…</div>}>
        <Scene {...data} onError={() => setFailed(true)} />
      </Suspense>
    </div>
    {controls && <div className="action-three-controls">{controls}</div>}
  </LoadBoundary>;
}
