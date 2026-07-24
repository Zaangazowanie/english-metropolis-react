# Dark → light token migration map

The console shell is light; the view interiors are still dark-theme. This is the
single authoritative mapping. Every agent migrating a view uses THIS table, so
nineteen files migrated in parallel land on the same answer.

Tokens are defined in `src/views/admin/superadmin/console.css` on `.sa-root`.
Always emit `var(--sa-…)`, never a raw hex. If a value is not in this table, do
not invent a hex — pick the closest role below and say so in your report.

## Ink

| Old (dark) | Role | New |
|---|---|---|
| `#F4F0FF`, `#fff`, `#ffffff`, `white` as *text* | primary text | `var(--sa-text)` |
| `#CEC8E8` | body text | `var(--sa-text)` |
| `#8A83AE`, `#5E567C` | secondary/label text | `var(--sa-text-muted)` |
| `#94a3b8`, `#cbd5e1`, `#e2e8f0` | secondary text | `var(--sa-text-muted)` |
| `#f8fafc`, `#f1f5f9` as *text* | primary text | `var(--sa-text)` |

## Surfaces and structure

| Old (dark) | Role | New |
|---|---|---|
| `rgba(255,255,255,0.04)`, `…0.05` | card surface | `var(--sa-surface)` |
| `rgba(255,255,255,0.07)`, `…0.09` | raised/hover surface | `var(--sa-surface-soft)` |
| `rgba(8,4,20,0.55)`, `#060410`, `#0A0718`, `#11092A` | page/inset | `var(--sa-surface-soft)` |
| `rgba(255,255,255,0.08)`, `…0.05` as *border* | border | `var(--sa-border)` |
| `rgba(255,255,255,0.16)` as *border* | strong border | `var(--sa-border-strong)` |

## Brand

| Old (dark) | Role | New |
|---|---|---|
| `#8B5CF6` | brand | `var(--sa-violet-500)` |
| `#D946EF`, `#F472B6`, `#A855F7`, `#a78bfa`, `#F0ABFC` | brand accent | `var(--sa-violet-600)` |
| `linear-gradient(…8B5CF6…D946EF…)` | brand gradient | **delete it.** Solid `var(--sa-violet-600)` on primary actions, `var(--sa-violet-100)` behind them. The gradient survives ONLY on the active nav indicator and `.sa-progress` fill. |

## Semantics

| Old (dark) | Role | New |
|---|---|---|
| `#34D399`, `#10B981` | success | `var(--sa-good)` on `var(--sa-good-soft)` |
| `#FB7185`, `#E11D48`, `#fca5a5` | error/danger | `var(--sa-bad)` on `var(--sa-bad-soft)` |
| `#FCD34D`, `#fcd34d`, `#F59E0B`, `#FB923C` | warning/pending | `var(--sa-warm-ink)` on `var(--sa-warm-soft)` |
| `#60A5FA`, `#38bdf8`, `#7dd3fc`, `#a5f3fc`, `#3B82F6` | "info"/sky | `var(--sa-violet-600)` on `var(--sa-violet-100)` |

**There is deliberately no blue.** The palette ratio is 68% white / 20% lavender
/ 8% violet / 3% warm / 1% semantic. Adding an info-blue breaks it. Anything that
was sky-blue for emphasis becomes violet; anything that was sky-blue merely to be
"not white" becomes `var(--sa-text-muted)`.

## Contrast floor — this is the point of the exercise

`#a5f3fc` on white is 1.4:1. It is invisible. Every migrated pair must clear
**4.5:1 for text** and **3:1 for borders and icons**. `--sa-warm` (#FFB84D) is a
FILL colour only — never text on white. Use `--sa-warm-ink` (#8A5A08) for warning
text, which clears 4.5:1.

## Rules

1. Inline `style={{…}}` colour values become `var(--sa-…)`. Keep them inline;
   do not restructure a working component into CSS classes. Surgical changes only.
2. Where a bespoke inline block duplicates a primitive that now exists
   (`.sa-table`, `.sa-badge`, `.sa-kpi`, `.sa-empty`, `.sa-chip`), switch to the
   class and drop the inline styles.
3. Do not change logic, data flow, props, queries or copy. Colour and the
   primitive swap only.
4. Shadows: any `0 …px …px -…px rgba(…)` glow becomes
   `0 1px 2px rgba(42,27,61,.06), 0 4px 12px rgba(42,27,61,.04)` or nothing.
5. `backdrop-filter` is deleted wherever found.
6. After migrating a file, grep it for `#` and confirm zero raw hex colours remain.
