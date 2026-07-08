# Burnwise — Design System

> The single source of truth for tokens, type, and motion. Implemented in
> `src/index.css` (`@theme` + `:root`/`.dark`). See `PRODUCT.md` for intent.

## Color (OKLCH)

All colors are OKLCH for perceptually uniform ramps. Neutrals carry a tiny cool
chroma (~0.006–0.015, hue 265) to cohere with the steel-blue brick in the mark.
Semantic tokens are redefined per theme; utilities reference them via CSS vars.

### Accent — flame orange (the one accent)

| Token | Dark | Light | Use |
|---|---|---|---|
| `--primary` | `oklch(0.70 0.175 47)` | `oklch(0.66 0.185 45)` | primary action, active nav, selection |
| `--primary-foreground` | `oklch(0.20 0.03 45)` | `oklch(0.20 0.03 45)` | ink on accent (dark, both modes) |
| `--accent-strong` | `oklch(0.80 0.15 52)` | `oklch(0.52 0.19 42)` | rare accent *text* / links (contrast-safe) |
| `--ring` | = `--primary` | = `--primary` | focus ring (fixes the WCAG-fail gray ring) |

Accent budget ≈ 10% of visual weight. If it feels like more, pull it back.

### Neutral ramp (dark-first; depth via lightness, not shadow)

Fixes the baseline's flat dark mode (bg == sidebar == card). Three distinct dark
surfaces:

| Token | Dark | Light |
|---|---|---|
| `--background` | `oklch(0.16 0.006 265)` | `oklch(0.985 0.002 265)` |
| `--card` / surface 1 | `oklch(0.196 0.007 265)` | `oklch(1 0 0)` |
| `--popover` / surface 2 (raised) | `oklch(0.235 0.008 265)` | `oklch(1 0 0)` |
| `--muted` (subtle fill) | `oklch(0.24 0.008 265)` | `oklch(0.965 0.003 265)` |
| `--accent-surface` (neutral hover) | `oklch(0.255 0.009 265)` | `oklch(0.955 0.004 265)` |
| `--border` (hairline) | `oklch(0.27 0.008 265)` | `oklch(0.915 0.004 265)` |
| `--input` / border-strong | `oklch(0.32 0.01 265)` | `oklch(0.87 0.006 265)` |
| `--foreground` (primary ink) | `oklch(0.97 0.004 265)` | `oklch(0.21 0.012 265)` |
| `--muted-foreground` (secondary ink) | `oklch(0.72 0.012 265)` | `oklch(0.455 0.015 265)` |

`muted-foreground` is a *genuine mid* (≥4.5:1 on its background), not the
baseline wash. It is for secondary text only — not the default for everything.

### Semantic (state) — replaces the baseline's single `destructive` token

| Token | Dark | Light | Meaning |
|---|---|---|---|
| `--success` | `oklch(0.72 0.15 155)` | `oklch(0.55 0.14 155)` | on-budget, healthy, done |
| `--warning` | `oklch(0.80 0.14 78)` | `oklch(0.66 0.14 70)` | approaching threshold (kills `bg-amber-500`) |
| `--destructive` | `oklch(0.64 0.20 25)` | `oklch(0.58 0.22 27)` | over budget, error, destructive |
| `--info` | `oklch(0.70 0.13 240)` | `oklch(0.55 0.15 245)` | neutral informational |

Never rely on color alone — pair with icon/label/number.

## Type

- **Sans (UI):** `Inter Variable` (weight axis), self-hosted via
  `@fontsource-variable/inter`. System stack fallback.
- **Mono (metrics, IDs, tokens):** `JetBrains Mono Variable`, self-hosted via
  `@fontsource-variable/jetbrains-mono`. Use for token counts, costs, IDs.
- **Scale:** Tailwind default rem scale (~1.2 ratio). Body is `text-sm`/`text-base`;
  nothing below `text-xs` except uppercase eyebrow labels.
- **Numerals:** `tabular-nums` on every column/metric people compare.
- Dark body weight sits slightly lighter (light ink reads heavier on dark).

## Radius

`--radius: 0.5rem`. `lg` = 0.5rem (cards/panels), `md` = 0.375rem (buttons,
inputs), `sm` = 0.25rem (badges, chips). Consistent — not `rounded-lg` on
everything.

## Motion

- Duration: `--duration-fast: 120ms` (hover/press), `--duration: 180ms` (state),
  `--duration-slow: 240ms` (enters). Never > 250ms.
- Easing: `--ease-out: cubic-bezier(0.2, 0, 0, 1)`. No bounce.
- Transition only what changes state. No page-load choreography.
- **`prefers-reduced-motion: reduce` disables all non-essential animation** (global
  base rule) — every effect degrades to an instant state change.

## Elevation / z-index

Dark-mode depth = **surface lightness**, not shadow. Shadows reserved for true
overlays (popover, modal, mobile drawer) and stay subtle.

| Layer | z |
|---|---|
| base | 0 · sticky header/table head | 10 · dropdown/popover | 40 · overlay/drawer/modal | 50 · toast | 60 |

## Rules (enforced)

- No `border-left/right > 1px` colored accent stripe (impeccable ban).
- No purple→blue gradients; no gradient text.
- No gray text on colored backgrounds.
- Cards are not the default container — reach for a plain section first.
- Skeletons for loading inside content, not spinners.
