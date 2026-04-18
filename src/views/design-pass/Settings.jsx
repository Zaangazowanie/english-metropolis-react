import { useTheme } from '../../design-system/ThemeContext'
import { FONTS } from '../../design-system/tokens'
import { Eyebrow, Btn } from '../../design-system/primitives'
import { useStudentAuth } from '../../contexts/StudentAuthContext.jsx'

export default function Settings({ data }) {
  const { T, mode, setMode } = useTheme()
  const { profile } = data || {}
  const { signOutStudent } = useStudentAuth() || {}

  return (
    <div style={{ background: T.bg, color: T.text, minHeight: '100vh' }}>
      <div style={{ padding: '40px 56px 24px', borderBottom: `1px solid ${T.ruleSoft}` }}>
        <Eyebrow>Account</Eyebrow>
        <h1 style={{
          fontFamily: FONTS.serif, fontStyle: 'italic', fontWeight: 300,
          fontSize: 'clamp(40px, 5vw, 76px)', lineHeight: 0.95, letterSpacing: -2,
          margin: '8px 0 0', color: T.text,
        }}>
          The <span style={{ color: T.brand }}>preferences</span>.
        </h1>
      </div>

      <div style={{ padding: 56, maxWidth: 920 }}>
        <Section title="Profile">
          <Row label="Name" value={profile?.name || '—'}/>
          <Row label="Slug" value={profile?.slug || '—'}/>
          <Row label="Current band" value={profile?.level || '—'}/>
          {profile?.targetLevel && <Row label="Working towards" value={profile.targetLevel}/>}
        </Section>

        <Section title="Reading mode">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {[
              { k: 'dark',  n: 'Midnight Library', s: 'Brass on indigo. After-hours.', swatches: ['#0B1020', '#171E37', '#C9A24B'] },
              { k: 'light', n: 'Daybreak Salon',   s: 'Cream and terracotta. Morning.', swatches: ['#F5EFE4', '#FFFFFF', '#8F3B1B'] },
            ].map(m => (
              <button key={m.k} onClick={() => setMode(m.k)}
                style={{
                  padding: 20,
                  background: m.k === mode ? T.panel : 'transparent',
                  border: `1px solid ${m.k === mode ? T.brand : T.ruleSoft}`,
                  cursor: 'pointer', textAlign: 'left',
                }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                  {m.swatches.map((c, i) =>
                    <div key={i} style={{
                      width: 20, height: 20, background: c,
                      border: `1px solid ${T.ruleSoft}`,
                    }}/>
                  )}
                </div>
                <div style={{
                  fontFamily: FONTS.serif, fontStyle: 'italic',
                  fontSize: 22, color: T.text,
                }}>{m.n}</div>
                <div style={{
                  fontFamily: FONTS.body, fontSize: 13, color: T.textMute,
                  marginTop: 4,
                }}>{m.s}</div>
              </button>
            ))}
          </div>
        </Section>

        <Section title="Sign out">
          <Btn kind="danger" onClick={() => {
            if (signOutStudent) signOutStudent()
            try { localStorage.removeItem('studentSlug') } catch {}
            window.location.assign('/login')
          }}>End session</Btn>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  const { T } = useTheme()
  return (
    <div style={{
      marginBottom: 56, paddingBottom: 32,
      borderBottom: `1px solid ${T.ruleSoft}`,
    }}>
      <Eyebrow>{title}</Eyebrow>
      <div style={{ marginTop: 16 }}>{children}</div>
    </div>
  )
}

function Row({ label, value }) {
  const { T } = useTheme()
  return (
    <div style={{
      padding: '14px 0',
      display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16,
      borderTop: `1px solid ${T.ruleHair}`,
    }}>
      <div style={{
        fontFamily: FONTS.label, fontSize: 10,
        letterSpacing: '0.2em', textTransform: 'uppercase', color: T.textMute,
      }}>{label}</div>
      <div style={{
        fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: 18, color: T.text,
      }}>{value}</div>
    </div>
  )
}
