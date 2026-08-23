# Agent guide

## Interface changes

Read `docs/design-system.md` before changing any user interface.

The visual sources of truth, in descending order, are:

1. `web/src/styles.css` for executable tokens, layout, and responsive rules.
2. `web/src/components/ui.tsx` for shared interface primitives.
3. `docs/design-system.md` for intent, invariants, and agent workflow.

Build mobile first at 390–420 px and then validate the desktop layout at the
56 rem shell breakpoint. Use existing CSS variables and shared components.
Do not introduce raw colors, gradients, shadows, radii, or typography values
when an existing token or pattern expresses the same role.

An intentional change to the visual language must update both its executable
source and `docs/design-system.md` in the same commit. Product copy must remain
available in pt-BR and en-US; pt-BR is the default locale.

Before completing a web UI change, run `npm test`, `npm run typecheck`, and
`npm run build` from `web/`. Run the relevant browser journey when behavior or
responsive layout changes.
