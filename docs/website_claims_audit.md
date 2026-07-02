# Website claims audit (Phase 5)

Audit of risky marketing claims across the Helicyn static site
(`*.html`, `*.js` at the repo root), checked against the list: proven,
guaranteed, verified savings, production savings, customer, live
telemetry, autonomous control, real-world savings, deployed, pilot,
saves, optimization impact, carbon reduction.

Method: `grep -i` for each term across all root-level `.html`/`.js` files,
then manual review of every match for whether the surrounding context is
simulated/illustrative/future-conditional (keep) or an unqualified
present-tense production/customer claim (must fix). See the commands
below to reproduce.

```
grep -rniE "proven|guaranteed|verified savings|production savings|customer|live telemetry|autonomous control|real-world savings|deployed|pilot|saves|optimization impact|carbon reduction" --include="*.html" --include="*.js" .
```

## Findings

| Claim found | File / location | Action taken | Final safe wording |
|---|---|---|---|
| "Limited intake" framing implied a scarce/exclusive current product rather than a pre-commercial program | `index.html`, `#access` section | Renamed the section's role; added a dedicated Founding Partner Program section above it with explicit Stage 1/2/3 language | "Founding Partner Program" + "Pre-commercial now. Platform subscription at launch. Performance-based pricing only after verified savings." |
| "Request access" CTA implied an existing gated product | `index.html` hero, nav, footer | Replaced primary CTAs with "Apply as founding partner" / onboarding links; kept the quick-contact email form as a secondary, clearly-labeled "Quick contact" option | "Apply as founding partner" (primary), "Quick contact" (secondary email form) |
| "verified savings" | `index.html` (Founding Partner Program section), `partners.html` (Stage 3, incentive alignment) | Kept -- always phrased as a future/conditional Stage 3 mechanism ("performance-based pricing only after verified savings", "once savings are verified"), never as a claim that savings exist today | "Performance-based pricing only after verified savings" / "once savings are verified" |
| "$10M/year ... $1.5M/year" example | `partners.html`, Stage 3 card | Kept -- explicitly labeled as an illustrative example ("Example: if Helicyn saves a customer $10M/year...") of the pricing mechanism, not a real customer figure | "Example: if Helicyn saves a customer $10M/year and the agreement is 15%, Helicyn would earn $1.5M/year." |
| "customer" (multiple) | `research.html`, `partners.html`, `control-plane.html`, `partner-portal.js` | Kept -- every instance either explicitly negates a real customer relationship ("not connected to any customer's real facility", "does not represent live customer infrastructure") or refers to the future Stage 2/3 business model in conditional language ("the customer keeps most of the savings", "no fake customer data") | See file locations; no unqualified present-tense "we have customers" claim exists |
| "live telemetry" / "customer infrastructure" | `control-plane.html`, assumptions drawer (pre-existing, Phase 4) | Preserved as-is -- already correctly phrased as a negation ("not connected to live telemetry or customer infrastructure") | Unchanged |
| "verified operational savings" | `control-plane.html`, simulation notice (pre-existing) | Preserved as-is -- already a negation ("does not represent ... verified operational savings") | Unchanged |
| "Lifetime optimization impact" numbers (52.4 GWh, $14.9M, etc.) | `control-plane.html` | Preserved as-is -- already labeled "Simulated control plane data", "(modeled)", "Illustrative metrics ... for demonstration purposes" | Unchanged |
| "pilot" (as a founding-partner interest option) | `onboarding.html` | Kept -- refers to a future opt-in interest ("Pilot later"), not a claim of an existing pilot | "Pilot later" (checkbox label) |
| "deployed" / "production savings" / "autonomous control" / "real-world savings" / "proven" / "guaranteed" | site-wide | No unqualified/present-tense matches found | N/A |

## Result

No page makes an unqualified present-tense claim of proven/guaranteed
savings, existing customers, live infrastructure integration, or
production-verified impact. Every occurrence of a savings- or
customer-related term is either a negation, an illustrative/simulated
label, or explicitly future/conditional (Stage 2/3 language: "proposed",
"future", "when production-ready", "once verified", "expected",
"intended"). New Phase 5 copy (Founding Partner Program section,
`partners.html`, `research.html`) was written to match this pattern from
the start.

This audit was re-run manually against the final diff before commit; no
follow-up edits were required beyond the Phase 5 copy itself.
