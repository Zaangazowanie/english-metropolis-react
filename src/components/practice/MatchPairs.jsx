// MatchPairs — two columns. Click an item in each side -> pair locks green.
// Library question shape:
//   { id, type: 'match-pairs', prompt?,
//     pairs: [{ left: string, right: string }],
//     explanation?, pl_hint? }
// Both columns are independently shuffled per session.

import { useMemo, useState, useEffect } from 'react'
import { useV3Theme } from '../../design/v3/ThemeProvider.jsx'
import { FONT } from '../../design/v3/tokens.js'
import { seededShuffle, hashSeed, shuffleSeedFor } from './shuffle.js'

export default function MatchPairs({ question, onAnswer, answered, accent, sessionSalt }) {
  const { T } = useV3Theme()
  const pairs = Array.isArray(question?.pairs) ? question.pairs : []
  const seed = shuffleSeedFor(question, sessionSalt)

  const leftItems = useMemo(
    () => seededShuffle(pairs.map((p, i) => ({ id: `L${i}`, text: p.left, key: i })), seed),
    [question, sessionSalt],
  )
  const rightItems = useMemo(
    () => seededShuffle(pairs.map((p, i) => ({ id: `R${i}`, text: p.right, key: i })), hashSeed('R|' + seed)),
    [question, sessionSalt],
  )

  const [selectedLeft, setSelectedLeft] = useState(null)
  const [selectedRight, setSelectedRight] = useState(null)
  // matches: Map<leftKey, rightKey>
  const [matches, setMatches] = useState(() => new Map())

  useEffect(() => {
    setMatches(new Map())
    setSelectedLeft(null)
    setSelectedRight(null)
  }, [question?.id])

  function tryMatch(lKey, rKey) {
    const next = new Map(matches)
    next.set(lKey, rKey)
    setMatches(next)
    setSelectedLeft(null)
    setSelectedRight(null)
    if (next.size === pairs.length) {
      // Score: count how many lKey -> rKey matches the original index pairing.
      let correct = 0
      next.forEach((rk, lk) => { if (rk === lk) correct++ })
      const ok = correct === pairs.length
      onAnswer(`${correct}/${pairs.length}`, ok)
    }
  }

  function clickLeft(item) {
    if (answered || matches.has(item.key)) return
    if (selectedRight !== null) {
      tryMatch(item.key, selectedRight)
    } else {
      setSelectedLeft(item.key === selectedLeft ? null : item.key)
    }
  }
  function clickRight(item) {
    if (answered) return
    // Right side: not yet matched? (rKey already used)
    const usedRight = new Set([...matches.values()])
    if (usedRight.has(item.key)) return
    if (selectedLeft !== null) {
      tryMatch(selectedLeft, item.key)
    } else {
      setSelectedRight(item.key === selectedRight ? null : item.key)
    }
  }

  const usedRightKeys = new Set([...matches.values()])

  function leftStyle(item) {
    const matched = matches.has(item.key)
    const correctMatch = answered && matched && matches.get(item.key) === item.key
    const wrongMatch = answered && matched && !correctMatch
    const isSel = selectedLeft === item.key
    let border = T.border, bg = T.surface, color = T.text
    if (matched) {
      if (answered) {
        if (correctMatch) { border = T.good; bg = 'rgba(52,211,153,0.15)' }
        else if (wrongMatch) { border = T.rose; bg = 'rgba(251,113,133,0.15)' }
      } else {
        border = accent.solid; bg = 'rgba(217,70,239,0.10)'
      }
    } else if (isSel) {
      border = accent.solid; bg = 'rgba(217,70,239,0.10)'
    }
    return { border, bg, color }
  }
  function rightStyle(item) {
    const matched = usedRightKeys.has(item.key)
    let pairedLeft = null
    matches.forEach((rk, lk) => { if (rk === item.key) pairedLeft = lk })
    const correctMatch = answered && matched && pairedLeft === item.key
    const wrongMatch = answered && matched && !correctMatch
    const isSel = selectedRight === item.key
    let border = T.border, bg = T.surface, color = T.text
    if (matched) {
      if (answered) {
        if (correctMatch) { border = T.good; bg = 'rgba(52,211,153,0.15)' }
        else if (wrongMatch) { border = T.rose; bg = 'rgba(251,113,133,0.15)' }
      } else {
        border = accent.solid; bg = 'rgba(217,70,239,0.10)'
      }
    } else if (isSel) {
      border = accent.solid; bg = 'rgba(217,70,239,0.10)'
    }
    return { border, bg, color }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <div style={{ display: 'grid', gap: 8 }}>
        {leftItems.map(item => {
          const s = leftStyle(item)
          return (
            <button key={item.id} type="button" onClick={() => clickLeft(item)} disabled={answered}
              style={{
                padding: '12px 16px', borderRadius: 12,
                background: s.bg, color: s.color,
                border: `2px solid ${s.border}`,
                fontSize: 14, fontFamily: FONT.body, fontWeight: 600, textAlign: 'left',
                cursor: answered ? 'default' : 'pointer', transition: 'all 160ms',
              }}>{item.text}</button>
          )
        })}
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {rightItems.map(item => {
          const s = rightStyle(item)
          return (
            <button key={item.id} type="button" onClick={() => clickRight(item)} disabled={answered}
              style={{
                padding: '12px 16px', borderRadius: 12,
                background: s.bg, color: s.color,
                border: `2px solid ${s.border}`,
                fontSize: 14, fontFamily: FONT.body, fontWeight: 600, textAlign: 'left',
                cursor: answered ? 'default' : 'pointer', transition: 'all 160ms',
              }}>{item.text}</button>
          )
        })}
      </div>
    </div>
  )
}
