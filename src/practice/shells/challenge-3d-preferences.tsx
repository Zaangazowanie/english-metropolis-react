import { createContext, useContext } from 'react';
import type { Game3DProps } from '../shells3d/types';
type Preferences=Pick<Game3DProps,'quality'|'reducedMotion'>;
const Context=createContext<Preferences>({});
export const Challenge3DPreferences=Context.Provider;
export const useChallenge3DPreferences=()=>useContext(Context);
