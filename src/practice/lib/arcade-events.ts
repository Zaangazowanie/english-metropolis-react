import { createContext, useContext } from 'react';
import type { ArcadeEvent } from './arcade-run';

const ignore = (_event: ArcadeEvent) => {};
export const ArcadeEventsContext = createContext<(event: ArcadeEvent) => void>(ignore);
export const useArcadeEvents = () => useContext(ArcadeEventsContext);
export type { ArcadeEvent } from './arcade-run';
