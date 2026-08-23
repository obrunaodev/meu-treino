# Meu Treino design system

This document preserves the visual decisions that must survive across people,
tools, and AI agents. It describes intent and invariants; the CSS and shared
React components remain the executable specification.

## Source of truth

Use this precedence when references disagree:

1. `web/src/styles.css` defines current tokens, dimensions, and breakpoints.
2. `web/src/components/ui.tsx` defines the supported shared primitives.
3. This document explains why those choices exist and how to extend them.

The implemented application is canonical. No external mockup is required to
understand or maintain the interface.

## Visual character

Meu Treino is compact, direct, and utilitarian. It uses warm neutral surfaces,
a restrained brick-red accent, condensed display headings, and monospace data
labels. Dark is the primary theme and light is a complete user-selectable
variant.

Avoid decorative gradients, glass effects, neon colors, excessive shadows,
and oversized empty areas. Elevation is normally communicated by surface color
and a one-pixel border. Shadows are reserved for overlays such as modals and
toasts.

## Color tokens

| Role | Dark | Light | Use |
|---|---:|---:|---|
| Shell | `#16150f` | `#e7e4dd` | Page canvas |
| Chrome | `#0d0c08` | `#d8d4cb` | Navigation chrome |
| Surface | `#1c1a15` | `#ffffff` | Cards and dialogs |
| Hot surface | `#221f19` | `#f4f2ee` | Hover and selected regions |
| Raised / line | `#2b2820` | `#ece8e0` | Raised controls |
| Strong line | `#3b382f` | `#d3ccbc` | Emphasis and field borders |
| Ink | `#f2efe8` | `#16150f` | Primary text |
| Secondary ink | `#c2bcae` | `#34302a` | Supporting text |
| Muted | `#8f8a7d` | `#6d685c` | Labels and metadata |
| Dim | `#6d685c` | `#8b8578` | Disabled and low emphasis |
| Accent | `#b23a26` | `#b23a26` | Primary actions and active state |
| Accent hover | `#7d2617` | `#7d2617` | Accent interaction |
| Positive | `#7f9a6a` | `#5d7a48` | Success and completion |

Always consume these through CSS variables. Add a semantic token before
repeating a new raw color across components.

## Type

- **Barlow Condensed 700** is for page titles, large numbers, and display text.
- **IBM Plex Sans** is the reading and control font.
- **IBM Plex Mono** is for eyebrows, metadata, data labels, and compact actions.
- Page titles use `clamp(30px, 3.4vw, 38px)`.
- Section labels are 11 px, uppercase, and spaced at `0.16em`.
- Ordinary interface copy starts at 14 px. Entity headings use 14.5 px / 600.

Do not use display type for paragraphs or monospace type for entity names.

## Shape, density, and spacing

- Cards: 14 px radius, 20 px padding, 14 px internal gap.
- Fields: 12 px radius with a strong-line border.
- Pills and primary buttons: 999 px radius.
- Media and compact tiles: 8 px radius.
- Page sections: 20 px gap. Normal stacks: 14 px. Tight stacks: 8 px.
- Grids use a 14 px gap unless a domain layout specifies otherwise.

Primary actions are compact pills with 11 px vertical and 22 px horizontal
padding. They remain content-sized and left-aligned unless the flow requires a
full-width action, such as the main session action on mobile.

## Responsive layout

Design from a 390–420 px viewport first. Mobile uses a compact top bar and four
sticky bottom destinations: Today, Progress, Workouts, and More. Secondary
destinations live under More so labels never wrap into undersized touch areas.

At 56 rem the application switches to a 232 px sidebar and removes the mobile
chrome. Main content gains desktop padding without changing component order or
meaning. Dashboard content starts as one column; statistics use two columns on
mobile and four at 64 rem.

Do not solve desktop layout by hiding information required on mobile. Reflow,
collapse, or progressively disclose it instead.

## Shared component language

- `Card title` is a quiet monospace section label.
- `Card heading` is the accessible name of an exercise, workout, or equipment.
- `Select` keeps its label explicitly associated with the control.
- `Stepper` is used for bounded numeric adjustments.
- `Modal` uses the native dialog element and restores focus on close.
- Toasts communicate transient notifications. Persistent unresolved sync
  conflicts remain visible until acted on.
- Forms use visible labels, tokenized focus outlines, and semantic controls.

Reuse these primitives before introducing a page-local equivalent. A new
primitive belongs in `ui.tsx` only after it recurs with the same behavior and
visual role.

## Domain layouts

The exercise library supports grid and list views. Grid cards are one column by
default, two from 40 rem, and never more than three from 68 rem. Exercise media
uses a 6:5 preview ratio; full-resolution media opens in a modal. List previews
are 7.5 rem wide on mobile and 11 rem from 40 rem.

Recorded sets are grouped under their exercise. Each exercise is an accordion
whose rows keep weight, repetitions, RIR, side, warm-up, and skipped state tied
to that exercise.

## Data visualization

Single-series charts use gray context marks and the accent color for the latest
or selected mark. Do not add a legend when the title already names the only
series. Every chart must expose direct values and a table-view alternative so
color is never the sole channel.

The pain intensity ramp is ordinal and theme-specific. Preserve monotonic
lightness when changing it and validate the palette before merging.

## Interaction and accessibility

- Preserve keyboard access, visible focus, semantic labels, and native control
  behavior.
- Respect `prefers-reduced-motion`; motion cannot carry essential meaning.
- Use concise pt-BR copy by default and provide the equivalent en-US key.
- Images require useful alternative text when informative and empty alt text
  when decorative.
- Error, completion, warm-up, and skipped states must have a textual cue in
  addition to color.

## Agent workflow

Before editing:

1. Read this file and the relevant CSS/component implementation.
2. Identify an existing token, primitive, and responsive pattern to reuse.
3. Inspect the affected page at mobile size before optimizing desktop.

Before finishing:

1. Check both themes and both supported locales where the change affects copy.
2. Check approximately 390 px and the desktop shell breakpoint.
3. Run web tests, type checking, and production build.
4. Update this document only when the design system itself changed, not for a
   one-page implementation detail.
