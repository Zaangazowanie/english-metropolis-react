import { createContext } from 'react';

// UI-only notifications; the existing persistence hook remains authoritative.
export const ArcadeFeedbackContext = createContext<null | ((shellId: string, state: { progress: number; completed: boolean }) => void)>(null);
