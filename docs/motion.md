# EnglishMetro interaction motion

The shared layer in `src/design/v3/motion/` applies the installed Transitions.dev
and transitions-polish recipes. It adds no runtime dependency. Existing skyline,
flashcard, money, and gameplay animations keep their purpose and visual identity.

| Interaction | Open | Close | Treatment |
| --- | --- | --- | --- |
| Dropdown | 250 ms | 150 ms | Origin-based scale .97; closing scale .99 |
| Dialog | 250 ms | 150 ms | Scale .96 with opacity |
| Drawer | 400 ms | 350 ms | Smooth position and opacity |
| Disclosure, tab, page | 250 ms | 250 ms | Reversible layout/position; page enters only |
| Reveal, success, badge | 500 ms | — | Small emphasis; stagger 40 ms, capped at 280 ms |

`transitions-tokens.css` is the single shared token source. The copied recipe CSS
stays in `transitions-recipes.css`; application layout and specificity adapters
stay in `surface-motion.css`. Static information pages use the same small scale
in `public/legal/legal.css` without loading React.

Wrap conditionally rendered dialog content in `Presence`. Use `kind="drawer"`
for a bottom sheet. `Sheet` portals to the document body, traps keyboard focus,
and restores focus and scroll state. Nested dialogs only let the top dialog
handle Escape. `usePresence` cancels stale callbacks on rapid reopen and reads
the same CSS close duration, in either milliseconds or seconds. Closed controls
become inert during dismissal.

Use `MotionDropdown` for conditionally visible menus, `Collapse` for disclosures,
and `IconSwap` for changes of icon. Put padding inside the collapse clipping
track. Neither a closed nested disclosure nor its controls should remain exposed.
Portalled content must receive its own theme styles when it relied on inherited
styles; lesson and vocabulary dialogs already pass their explicit palette.

Both OS reduced motion and the in-app animation preference are respected. The
in-app reduced setting cancels delays; none disables animation. The JS motion
hook also stops practice/demo autoplay when the app preference requests reduction.

## Coverage

- Public homepage menus, theme/menu icons, course panels, game disclosures and reveals.
- Package basket, badge/item feedback, checkout disclosure and confirmation entrances.
- Cookie preferences; Bajla connect and live chat opening/closing.
- Voice/settings/profile menus; shared buttons, fields, pages and tab indicator.
- Student lesson/analysis/keyword disclosures, vocabulary YouTube dialogs, practice drill
  dialogs, upcoming course words and the native PDF viewer dialog.
- Shared analytics dialogs and console drawers/confirmations.
- Mobile menus and reveals on About, FAQ, contact and legal pages.

## Validation and release

The anonymous fixture is development-only:

```sh
npm run dev -- --config tests/motion/vite.config.js --port 5199
# Open /tests/motion/index.html
```

It exposes actual shared components, nested/rapid reopen controls, reduced/none
preferences, CSS time-unit overrides, and a generated one-page PDF. No account
or production write is needed. It is not a production build entry.

September 14 checks: production build and all 68 gameplay regression tests pass;
the gameplay budget gate passes. ESLint adds no errors relative to `149a459`.
TypeScript reports 13 diagnostics versus 15 at that base, with none added.
Browser checks cover desktop and 390-pixel mobile layouts, focus retention,
nested Escape/scroll lock, close timing, rapid reopen, accordions, return-to-first
tab, PDF rendering/dismissal, basket, consent, and static navigation. Authenticated
account workflows use the real shared components with anonymous fixture data.

Build and review on the PC. The frontend-only deploy script verifies the live
Convex contract, release source-tree identity, exact public bytes and MIME types,
preserved legacy motion assets, and at least 20 GiB of VPS headroom. It backs up
both HTML entries and every replaced static file and rolls them back on failure.
Do not upload the entire public directory or repopulate course worktrees.
