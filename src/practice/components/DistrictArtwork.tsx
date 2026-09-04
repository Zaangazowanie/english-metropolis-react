import React, { useId } from 'react';

// Vector cabinet artwork stays crisp on every screen and costs no WebGL context.
const families: Record<string, string> = {
  crossword: 'grid', wordsearch: 'grid', labelleddiagram: 'grid', battleship: 'grid',
  matching: 'cards', flashcards: 'cards', dragdrop: 'cards', groupsort: 'cards',
  concentration: 'cards', findthematch: 'cards', randomcards: 'cards', speakingcards: 'cards',
  spinthewheel: 'wheel', randomwheel: 'wheel',
  snake: 'maze', mazechase: 'maze', airplane: 'flight', flyingfruit: 'flight',
  spellingbee: 'wave', listeningcomp: 'wave', typingtest: 'wave',
};

function Screen({ kind }: { kind: string }) {
  if (kind === 'grid') return <>{Array.from({ length: 20 }, (_, i) => <rect key={i} x={-34 + i % 5 * 14} y={-27 + Math.floor(i / 5) * 14} width="11" height="11" rx="2" fill="currentColor" opacity={[0, 3, 7, 11, 12, 18].includes(i) ? 1 : .14} />)}</>;
  if (kind === 'cards') return <><rect x="-32" y="-23" width="40" height="48" rx="5" transform="rotate(-14)" fill="#191830" stroke="currentColor"/><rect x="-3" y="-26" width="38" height="50" rx="5" transform="rotate(10)" fill="#23203e" stroke="currentColor" strokeWidth="2"/><path d="m10 0 7 7 13-16" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/></>;
  if (kind === 'wheel') return <><circle r="29" fill="none" stroke="currentColor" strokeWidth="6" strokeDasharray="20 4"/><circle r="8" fill="currentColor"/>{[0,60,120,180,240,300].map(a=><path key={a} d="M0 10 V26" transform={`rotate(${a})`} stroke="currentColor" strokeWidth="2"/>)}<path d="m-7-37 7 11 7-11" fill="#fff"/></>;
  if (kind === 'maze') return <><path d="M-35-26 H35 V26 H-35 V-12 H20 V12 H-18 V1" fill="none" stroke="currentColor" strokeWidth="3" opacity=".5"/><path d="M-26-20 H-5 V-5 H9" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round"/><circle cx="24" cy="20" r="4" fill="#ffdc87"/></>;
  if (kind === 'flight') return <><path d="m-25 9 57-35-18 57-12-23Z M2 8 32-26" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/><path d="M-33 22 -20 12 M-22 31 -10 19" stroke="currentColor" strokeWidth="2"/><circle cx="-27" cy="-21" r="3" fill="#ffdc87"/></>;
  if (kind === 'wave') return <>{[12,27,42,24,54,38,19,30,12].map((h,i)=><rect key={i} x={i*8-34} y={-h/2} width="4" height={h} rx="2" fill="currentColor" opacity={.5+i%3*.2}/>)}</>;
  return <><text x="-33" y="-10" fill="currentColor" fontFamily="monospace" fontSize="18" fontWeight="700">A B C</text><rect x="-35" y="3" width="70" height="25" rx="4" fill="currentColor" opacity=".13"/><path d="m-24 15 5 5 9-10" stroke="currentColor" strokeWidth="3" fill="none"/><path d="M-2 15 H23" stroke="currentColor" strokeWidth="3"/></>;
}

export function DistrictArtwork({ shell, accent = '#a99bff', index = 0 }: { shell: string; accent?: string; index?: number }) {
  const id = useId().replace(/:/g, '');
  return <svg className="em-district-art" viewBox="0 0 320 192" aria-hidden="true" focusable="false" style={{ color: accent }}>
    <defs>
      <radialGradient id={`${id}-halo`}><stop stopColor={accent} stopOpacity=".28"/><stop offset="1" stopColor={accent} stopOpacity="0"/></radialGradient>
      <linearGradient id={`${id}-body`} x2="1" y2="1"><stop stopColor="#393452"/><stop offset="1" stopColor="#141425"/></linearGradient>
    </defs>
    <ellipse cx="164" cy="105" rx="145" ry="96" fill={`url(#${id}-halo)`}/>
    <g opacity=".45" stroke={accent} strokeWidth=".6">
      {[0,1,2,3,4,5].map(i => {const h=25+(i*23+index*11)%57;return <g key={i}><path d={`M${22+i*49} 149 v-${h} l20-7 v${h}z`} fill="#1c1c33"/>{[0,1,2].map(j=><path key={j} d={`M${28+i*49} ${144-h+j*10} h8`} opacity=".6"/>)}</g>;})}
    </g>
    <path d="m34 159 123-28 131 27-123 31Z" fill="#27253b" stroke="#696181" strokeWidth=".6"/>
    <path d="m34 159 131 30 123-31 v6l-123 29-131-29Z" fill="#10111f"/>
    <path d="m52 162 111 24 106-25" fill="none" stroke={accent} strokeWidth="2" opacity=".6"/>
    <g transform="translate(157 81)">
      <path d="M-55-57 51-57 67-45 66 57 51 82-55 67Z" fill={`url(#${id}-body)`} stroke="#766d96"/>
      <path d="m51-57 16 12-1 102-15 25V39l-8-10 8-61Z" fill="#111223"/>
      <rect x="-49" y="-50" width="94" height="12" rx="2" fill={accent}/>
      <text x="-2" y="-41" textAnchor="middle" fontFamily="monospace" fontSize="7" letterSpacing="2" fill="#121326">METRO ARCADE</text>
      <path d="M-48-32 H43 L37 29 H-45Z" fill="#080d1c" stroke={accent} strokeOpacity=".7"/>
      <g transform="translate(-3 -2) scale(.86)"><Screen kind={families[shell] || 'choice'}/></g>
      <path d="m-45 33 82 0 14 15-101-1Z" fill="#49405d" stroke="#79708b" strokeWidth=".6"/>
      <ellipse cx="-23" cy="41" rx="8" ry="3" fill="#101220"/><path d="M-23 40v-11" stroke="#c1c7db" strokeWidth="3"/><circle cx="-23" cy="28" r="5" fill={accent}/>
      <ellipse cx="15" cy="40" rx="5" ry="3" fill="#ffcc86"/><ellipse cx="29" cy="40" rx="5" ry="3" fill={accent}/>
      <path d="M-43 52 H39 V70 L-43 59Z" fill="#151626"/>
      <path d="m-33 54 58 7" stroke={accent} strokeWidth="2" opacity=".65"/>
      <rect x="-7" y="61" width="11" height="3" rx="1" fill="#77738e"/>
    </g>
    <circle cx="64" cy="140" r="3" fill="#ffe1a0"/><path d="M64 144v17 M263 135v22" stroke="#756985" strokeWidth="2"/><circle cx="263" cy="132" r="3" fill={accent}/>
  </svg>;
}

export function ArcadeCity() {
  const id = useId().replace(/:/g, '');
  return <svg className="em-arcade-city" viewBox="0 0 1000 310" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs><linearGradient id={`${id}-tower`} x2="0" y2="1"><stop stopColor="#635093"/><stop offset="1" stopColor="#191a31"/></linearGradient></defs>
    {[0,1].map(row=><g key={row} opacity={row ? .95 : .4}>{Array.from({length:24},(_,i)=>{const x=i*46-30+row*12,h=40+(i*47+row*29)%143,y=255-row*9;return <g key={i}>
      <path d={`M${x} ${y}v-${h}l27-5v${h}Z`} fill={`url(#${id}-tower)`}/><path d={`m${x+27} ${y-h-5} 11 7v${h}l-11-2Z`} fill="#16172d"/>
      <path d={`M${x} ${y-h}l27-5 11 7-27 4Z`} fill="#756499"/>
      {h>135&&<path d={`M${x+14} ${y-h-3}v-23`} stroke="#ae98cf"/>}
      {Array.from({length:Math.floor(h/13)-1},(_,r)=><g key={r}>{[0,1,2].map(c=><rect className={(i+r+c)%5===0?'em-city-window':undefined} key={c} x={x+5+c*7} y={y-h+10+r*13} width="3" height="5" fill={(i+r+c)%3?'#edc998':'#a8bdf9'} opacity={(i+r*c)%4===0?.16:.72}/>)}</g>)}
    </g>;})}</g>)}
    <path d="M0 265Q500 234 1000 265" fill="none" stroke="#0d1223" strokeWidth="14"/><path d="M0 262Q500 231 1000 262" fill="none" stroke="#b095ed" strokeWidth="2"/>
    {[80,220,370,550,730,920].map(x=><path key={x} d={`M${x} 257v48`} stroke="#47405e" strokeWidth="6"/>)}
    <g transform="translate(620 239)"><rect x="0" y="-8" width="110" height="14" rx="5" fill="#c7c2df"/>{[0,1,2,3,4,5,6,7].map(i=><rect key={i} x={9+i*12} y="-5" width="8" height="5" rx="1" fill="#423662"/>)}<path d="M3 3h103" stroke="#e396ef" strokeWidth="2"/></g>
    <path d="M0 303h1000" stroke="#6c59a0" strokeWidth="1"/>
  </svg>;
}
