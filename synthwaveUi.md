# Synthwave / Vaporwave UI Restyle

## Overview

Restyle PipelineHQ from the light mint SaaS look into a modern dark synthwave/vaporwave theme by retokenizing CSS variables, swapping expressive fonts, and updating shared chrome/components so all pages inherit the new look.

## Todos

- [x] Retokenize globals.css + swap Orbitron/Space Grotesk in layout.tsx
- [x] Restyle ui.tsx cards/buttons/inputs/badges for dark neon surfaces
- [x] **4. App chrome** — AppShell frosted header, magenta HQ, cyan nav/logout
- [x] **5. Login hero** — PipelineHQ brand moment + motion
- [x] **6. Charts + overlays** — neon charts, search modal, notifications
- [x] **7. Hardcoded cleanup** — `--danger` errors + dark modals

## Direction

Dark modern synthwave (not pastel vaporwave): deep midnight base, magenta + cyan neon accents, expressive display type, subtle sunset/horizon atmosphere. Keep the existing CRM layout and component structure; change the visual system globally.

**Palette (CSS tokens):**
- `--bg`: deep midnight (`#0b0614`)
- `--surface`: raised panel (`#16102a`)
- `--ink`: near-white (`#f4f0ff`)
- `--muted`: soft lavender-gray
- `--line`: translucent magenta/violet border
- `--accent`: hot magenta (`#ff2bd6`)
- `--accent-soft` / `--accent-ink`: dim magenta wash + bright cyan-adjacent text
- New `--danger`, `--cyan` tokens so hardcodes can die

**Fonts:** Orbitron (display / logo / page titles) + Space Grotesk (body) via `next/font/google` in [`frontend/src/app/layout.tsx`](frontend/src/app/layout.tsx).

## Scope (highest leverage first)

### 1. Global tokens + atmosphere — [`frontend/src/app/globals.css`](frontend/src/app/globals.css)

Replace `:root` tokens. Restyle `body` with layered radials (sunset magenta → cyan → deep navy) plus a subtle perspective grid / horizon wash so the app reads synthwave without per-page decoration. Keep table styles on tokens; optionally tint header rows with muted neon letter-spacing (already uppercase).

### 2. Fonts — [`frontend/src/app/layout.tsx`](frontend/src/app/layout.tsx)

Swap Fraunces/Manrope → Orbitron + Space Grotesk; keep CSS variable wiring (`--font-display`, `--font-body`).

### 3. Shared primitives — [`frontend/src/components/ui.tsx`](frontend/src/components/ui.tsx)

- `Card`: dark surface, thin neon border, soft single-edge glow (restrained, not stacked shadows)
- `Button`: primary = magenta fill + light hover glow; ghost = cyan-tint hover; danger uses `--danger`
- `Input` / `Select` / `Textarea`: replace `bg-white` with `bg-[var(--surface)]` (or a new `--input` token); focus ring in cyan/magenta
- `Badge`: replace slate/amber/emerald with token-based neon tones
- `PageHeader`: slight neon letter-spacing on display titles

### 4. App chrome — [`frontend/src/components/AppShell.tsx`](frontend/src/components/AppShell.tsx)

Dark frosted header, logo with magenta “HQ”, active nav as magenta soft pill + cyan text, logout as cyan-outline or ink-inverted synth control.

### 5. Login hero — [`frontend/src/app/login/page.tsx`](frontend/src/app/login/page.tsx)

Strongest brand moment: large PipelineHQ wordmark, short tagline, atmosphere from body gradients. Demo/password cards inherit restyled `Card`. Light motion (logo/accent fade or horizon pulse) via CSS keyframes in `globals.css` — 2–3 intentional motions, not noise.

### 6. Charts + overlays

- [`frontend/src/components/charts.tsx`](frontend/src/components/charts.tsx): bar tracks off `bg-slate-100` → `var(--line)` / surface; bars use accent; optional cyan→magenta gradient fill
- [`frontend/src/components/GlobalSearch.tsx`](frontend/src/components/GlobalSearch.tsx) + [`frontend/src/components/NotificationBell.tsx`](frontend/src/components/NotificationBell.tsx): ensure modals/dropdowns use surface/line tokens (fix any remaining light hardcodes)

### 7. Hardcoded cleanup

Replace `#b42318` error text across app pages + login with `text-[var(--danger)]` (one new token). No structural page rewrites — pipeline/kanban/dashboard keep layout; they pick up the theme via tokens.

## Out of scope

- No theme toggle / light mode
- No layout or routing changes
- No new UI libraries

## Result

One coherent dark synthwave CRM: midnight atmosphere, magenta CTAs, cyan accents on focus/nav, Orbitron branding, shared components and login carrying the look so every route updates together.
