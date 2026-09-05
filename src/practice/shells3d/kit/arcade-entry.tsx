import { type ComponentType } from 'react';
import { ArcadeCabinet } from '../../components/ArcadeCabinet';
import { ShellProgressPersistenceContext } from '../../lib/convex-stubs';
import type { Game3DComponent, Game3DProps } from '../types';
import { citySessionResult, type ArcadeDemoResult } from './arcade-entry-result';
import '../../styles/system.css';
import '../../styles/global.css';
import '../../styles/arcade.css';

interface DemoProps { onSessionComplete?: (result: ArcadeDemoResult) => void }

/** City errands use the same playable demo and score cabinet as Practice.
 * Lesson-specific puzzles continue through StudentPractice's typed adapters. */
export async function loadArcadeEntry(
  shellKey: string, title: string, number: number,
  load: () => Promise<{ default: ComponentType<DemoProps> }>,
  accent = '#00d9ff',
): Promise<{ default: Game3DComponent }> {
  const { default: Game } = await load();
  function ArcadeEntry({ onSessionComplete }: Game3DProps) {
    return <ShellProgressPersistenceContext.Provider value={false}><div className="em-practice-root em-city-arcade-entry">
      <ArcadeCabinet shellId={shellKey} title={title} number={number} accent={accent}>
        <div className="em-shell-host"><Game onSessionComplete={result => onSessionComplete?.(citySessionResult(shellKey, result))}/></div>
      </ArcadeCabinet>
    </div></ShellProgressPersistenceContext.Provider>;
  }
  return { default: ArcadeEntry };
}
