# Founding partner program (Phase 5)

Canonical description of Helicyn's staged business model, and the
allowed/disallowed wording for it across the site, docs, and any future
paper/investor materials.

## Stage 1 -- Founding Partner (current)

Helicyn is pre-commercial. Companies join as founding partners and
receive:

- early access
- direct input on the product
- priority onboarding
- 1 year free or permanently discounted pricing when Helicyn launches

This stage is about relationships, validation, and design partnership --
**not** a paid production product. No production customers, no billing,
no live infrastructure integration exist at this stage.

## Stage 2 -- Commercial Launch (future)

Once Helicyn is production-ready, customers pay an annual enterprise
SaaS/platform subscription. Helicyn coordinates workloads, energy,
cooling, and infrastructure through the platform. This stage has not
started; it is a proposed future state.

## Stage 3 -- Performance-Based Pricing (future)

Once Helicyn demonstrates *verified* savings, customers keep most of the
savings and Helicyn takes an agreed percentage of verified savings.

**Example math:** if Helicyn saves a customer $10M/year and the
agreement is 15%, Helicyn earns $1.5M/year. This is illustrative of the
pricing mechanism, not a real customer figure -- no customer has reached
this stage.

This aligns incentives because Helicyn earns meaningfully only when
verified savings are generated -- not for unproven promises. "Verified"
implies an agreed measurement/verification methodology exists before
performance pricing applies; that methodology itself is future work.

## Current vs. future -- at a glance

| | Stage 1 (now) | Stage 2 (future) | Stage 3 (future) |
|---|---|---|---|
| Status | Active | Proposed | Proposed |
| Revenue model | None (pre-commercial) | Annual SaaS/platform subscription | % of agreed, verified savings |
| Who's involved | Founding partners (design partnership) | Paying enterprise customers | Customers with verified savings |
| Product state | Research prototype + simulator | Production-ready platform | Production-ready platform + verification |

## Allowed claims

- "pre-commercial", "founding partner", "research/prototype"
- "proposed", "future", "when production-ready", "once verified",
  "expected", "intended" for anything about Stage 2/3
- Illustrative/example math for the Stage 3 percentage mechanism, clearly
  labeled as an example
- "simulated", "modeled", "illustrative" for any current simulator/demo
  numbers

## Disallowed claims

- "guaranteed savings", "proven savings"
- "production-ready today"
- "current customers", "our customers", "live deployments"
- Any present-tense claim that Stage 2 or Stage 3 already exists or has
  already been executed with a real customer
- Presenting the $10M/$1.5M example as a real, historical result

See `docs/website_claims_audit.md` for the audit of where this wording
was checked across the live site copy.

## Preferred wording (reference sentences)

- "Helicyn is currently pre-commercial. Founding partners receive early
  access, direct product input, priority onboarding, and preferred
  launch pricing when the platform launches."
- "Pre-commercial now. Platform subscription at launch. Performance-based
  pricing only after verified savings."
- "Once Helicyn demonstrates verified savings, customers keep most of the
  savings and Helicyn takes an agreed percentage."

## Where this shows up

- `partners.html` -- the full public explanation (hero, who this is for,
  what founding partners receive, the three stages, incentive alignment,
  CTA).
- `index.html` -- the "Founding Partner Program" section (condensed
  Stage 1/2/3 summary) and hero/footer links.
- `partner-portal.html` -- "Founding partner program" and "Product
  stages" cards, shown to signed-in users.
- `onboarding.html` -- the required consent checkbox ("I understand
  Helicyn is currently a pre-commercial research/prototype project.")
  before an application can be submitted.
