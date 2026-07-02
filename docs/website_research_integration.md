# Website research integration (Phase 5)

## Existing thesis/paper area (pre-Phase 5)

The homepage (`index.html`) already had a "Thesis" section (`#thesis`,
the `.manifesto` block) with a "Thesis status" button that opens a modal
(`#thesis-modal`) saying the full thesis is being written and a
preliminary version is expected in late July. That modal and section
were **not removed** -- Phase 5 only added a second CTA/link out of both
of them pointing to the new `/research` page, so the existing preview
still works standalone but now also connects to the fuller page.

## `/research` (new in Phase 5)

`research.html` (served at `/research` via the `_redirects` pretty-URL
rule) is the new, fuller research page. It intentionally stays simple
(per the phase brief: "do not overbuild -- the final paper text/PDF will
be edited in later manually") and is built entirely from placeholder
sections, each clearly marked with a bracketed tag so they're easy to
find and replace:

| Section | Placeholder tag(s) | What to replace it with |
|---|---|---|
| Status | `[PAPER_STATUS]`, `[PAPER_TITLE]`, `[PAPER_DATE]` | Final paper status, exact title, and publication date |
| Abstract | `[ABSTRACT]` | The final paper's abstract text |
| Methodology | `[METHODOLOGY_SUMMARY]` | The final paper's methodology summary (the current placeholder paragraph describes helicyn-sim's policy/scenario setup as an interim summary) |
| Selected findings | `[KEY_FINDINGS]`, `[SELECTED_FIGURES]` | The finalized, caveated key findings and the actual selected figure images/captions |
| Limitations | (plain bullet list, no tag) | Review and supersede with the final paper's own limitations section once it exists |

All of these live in `research.html` between the `<!-- Status -->`,
`<!-- Abstract -->`, etc. section comments, as plain text inside
`.researchplaceholder` blocks -- no templating system, just find-and-edit
the HTML directly.

### Where the final paper PDF should go

Add the PDF file at the repo root (e.g. `helicyn-thesis.pdf`) or under a
new `papers/` folder, then add a real download/view link in the
"Status" section of `research.html` (there is no PDF link yet -- add
`<a class="btn" href="papers/helicyn-thesis.pdf">Read the paper</a>` or
similar once the file exists).

## Figures/tables export (Task K) -- not yet run

Phase 5 checked for `research_outputs/` and a
`website_research_export` command in `helicyn-sim`; neither exists yet
in this checkout (no research-run/ablation/sensitivity experiment has
been executed here). Per the phase brief, this export is conditional
("only if needed for website/research page assets") and the research
page currently needs no real figures yet (`/research` uses the
`[SELECTED_FIGURES]` placeholder instead). Do not duplicate this work
speculatively -- when a real paper draft needs figures:

1. Run the existing `helicyn-sim` commands to produce
   `research_outputs/main_experiment`, `research_outputs/ablation`,
   `research_outputs/sensitivity`, `research_outputs/figures`,
   `research_outputs/tables`, `research_outputs/claims_audit.md`, and
   `research_outputs/research_report.md` (see `helicyn-sim/README.md`
   and `helicyn-sim/docs/`).
2. Add a `helicyn_sim export-website-research` CLI command (does not
   exist yet) that copies a small, selected subset of figures/tables plus
   `research_summary.json` / `key_findings.json` /
   `methodology_summary.md` / `limitations_summary.md` /
   `claims_audit_summary.json` / `captions.json` into
   `helicyn-sim/website_research_export/`, following the shape described
   in the Phase 5 brief.
3. Copy only the small selected images actually used on the site (e.g.
   `facility_energy_by_policy.png`, `carbon_by_policy.png`,
   `cost_by_policy.png`, `deadline_misses_by_policy.png`,
   `thermal_violations_by_policy.png`) into a root-level `assets/` or
   similar folder for the static site to serve. Never commit full run
   folders, raw datasets, or `research_outputs/` itself to the website
   half of the repo.

## Safe wording rules for anything added to `/research`

Every claim added to `/research` (or any figure caption copied there)
must say, explicitly or by clear context:

- simulated / modeled
- under [documented] assumptions
- research prototype
- concept-feasibility

And must avoid:

- "proven"
- "validated" (as in independently validated)
- "production savings"
- "real-world savings"

See `docs/website_claims_audit.md` for how this was checked across the
rest of the site, and `helicyn-sim/docs/limitations.md` /
`helicyn-sim/docs/model_assumptions.md` for the underlying simulator
caveats these public claims must stay consistent with.
