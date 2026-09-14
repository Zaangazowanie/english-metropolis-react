import { createContext, useContext } from 'react'
export const PresenceContext = createContext(null)
export const usePresenceContext = () => useContext(PresenceContext)
