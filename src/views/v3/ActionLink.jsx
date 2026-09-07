import { Link } from 'react-router-dom'
import { clearPointerPolish, pulsePointerPolish, setPointerPolish, focusSkylineDistrict } from '../../components/public/motionPolish.js'

// Navigation actions render as links all the way through. This avoids the
// invalid link > button nesting that previously made some CTAs unreliable.
export default function ActionLink({ to, href, children, variant = 'ghost', size = 'md', icon,
  trailingIcon, full = false, className = '', style, onClick, district }) {
  // Hero CTAs tell the three.js skyline which district the visitor is
  // considering, so the city answers the intent before the click.
  const districtProps = district ? {
    onPointerEnter: () => focusSkylineDistrict(district),
    onFocus: () => focusSkylineDistrict(district),
    onBlur: () => focusSkylineDistrict(null),
  } : {}
  const classes = [
    'gh-action',
    `gh-action--${variant}`,
    `gh-action--${size}`,
    full ? 'gh-action--full' : '',
    className,
  ].filter(Boolean).join(' ')
  const content = <>
    {icon && <span className="material-symbols-outlined" aria-hidden>{icon}</span>}
    <span>{children}</span>
    {trailingIcon && <span className="material-symbols-outlined" aria-hidden>{trailingIcon}</span>}
  </>

  if (to) {
    return <Link to={to} className={classes} style={style} onClick={onClick} {...districtProps}
      onPointerMove={setPointerPolish}
      onPointerLeave={(e) => { clearPointerPolish(e); if (district) focusSkylineDistrict(null) }}
      onPointerDown={pulsePointerPolish}>{content}</Link>
  }
  return <a href={href} className={classes} style={style} onClick={onClick} {...districtProps}
    onPointerMove={setPointerPolish}
    onPointerLeave={(e) => { clearPointerPolish(e); if (district) focusSkylineDistrict(null) }}
    onPointerDown={pulsePointerPolish}>{content}</a>
}
