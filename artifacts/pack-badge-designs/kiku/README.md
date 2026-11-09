# Kiku badge demo — issue #181

Open `/artifacts/pack-badge-designs/kiku/index.html` on the Vite development server. The page imports the actual `PackBadges`, `PackBadgeMedal`, `HomeIntensity` and production styles, including the static circular arrangement around Kiku. Controls compare earned mastery levels, WK/Travel families, 1/6/10 badges and all five Kiku moods. All samples remain in component memory; no storage, scheduling or sync code is invoked by the demo.

Validation: ESLint and a standalone strict TypeScript check passed. Chromium and WebKit browser checks covered controls, default six badges, ten Mastered Travel badges, 320px layout without horizontal overflow or Kiku overlap, no page errors and unchanged empty localStorage/IndexedDB. Screenshots are saved alongside this README. This supplements real iPhone acceptance.

Badges remain upright around a stationary circle. Positions fill symmetrically from the top, continuing down the sides toward the bottom. Odd counts have a top-center badge and mirrored pairs; even counts have mirrored pairs starting just to either side of the top. No floating or rotation animation.

Symmetry verification: all counts 1–10 were checked at 320, 390 and 1100px in Chromium and WebKit. Mirrored pairs share heights and equal distance from the vertical centerline; each badge follows the same circular radius. Badges remain upright and static, clear of Kiku and one another, with no horizontal overflow. The four Home badge browser journeys also pass, including persistence, current mastery, keyboard details and the symmetric ten-pack layout.

Badge enlargement: Home badge dimensions are exactly 150% of the prior responsive values (57–84px). The circle radius expands slightly and is capped by viewport clearance; the main button has extra clearance below the ring. All counts 1–10 were checked at 320, 360, 390, 440 and 1100px in Chromium and WebKit for symmetry, upright/static placement, no badge/Kiku overlap and no horizontal overflow. The four Home badge browser journeys also passed.

## Ordering and earned celebrations (#205)

The demo now uses the same presentation controller as Home. Mastery runs highest first from the top slots outward; ties keep source pack order. Use **Earn a badge** for a centered pop/fireworks award, or choose a badge and press **Upgrade badge** for a replacement celebration in its existing slot. Only after that celebration do the medals move into their newly sorted, symmetric slots. They remain still afterward. The Mastery/Packs/Badges selectors and Reset establish a fresh silent baseline; Kiku mood changes do not trigger awards.

The controller is ephemeral: real Home keeps its accepted snapshot while practice hides the badges, but resets across language/account changes. Initial page load/reload never celebrates existing badges. Reduced-motion mode shows a short static celebration and settles without movement. Pending/failed history is not an empty badge list. Newer snapshots, removals, downgrades, leaving Home and disposal cancel or reconcile pending effects without changing earned progress.
