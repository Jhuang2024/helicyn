"""`claims-audit`: categorize every claim this project might make about
itself as supported / partially_supported / unsupported, with the evidence
file backing it (or the lack of one) and a caveat. Meant to be read before
writing anything marketing-shaped about this project.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pandas as pd


@dataclass
class Claim:
    claim: str
    status: str  # "supported" | "partially_supported" | "unsupported"
    evidence_file: str
    caveat: str


def _check_results(results_dir: Path) -> dict:
    all_runs_path = results_dir / "aggregate" / "all_runs_summary.csv"
    checks = {
        "all_runs_summary_exists": all_runs_path.exists(),
        "policies": [],
        "external_included": False,
    }
    if all_runs_path.exists():
        df = pd.read_csv(all_runs_path)
        if "policy_name" in df.columns:
            checks["policies"] = sorted(df["policy_name"].unique().tolist())
            checks["external_included"] = "external_helicyn" in checks["policies"]
    return checks


def build_claims_audit(results_dir: str | Path) -> list[Claim]:
    results_dir = Path(results_dir)
    checks = _check_results(results_dir)
    all_runs_evidence = "aggregate/all_runs_summary.csv" if checks["all_runs_summary_exists"] else "(not found)"

    claims: list[Claim] = []

    claims.append(
        Claim(
            claim="Helicyn ML v1 trains a workload forecaster on real BurstGPT LLM request traces.",
            status="supported",
            evidence_file="helicyn-ml/docs/limitations.md, helicyn-ml `python -m helicyn_ml status`",
            caveat="Evaluated on held-out BurstGPT splits only; not evaluated against any other production trace.",
        )
    )
    claims.append(
        Claim(
            claim="Helicyn ML v1 trains a CPU/memory resource predictor on preprocessed Google Cluster traces.",
            status="supported",
            evidence_file="helicyn-ml/docs/limitations.md, ../helicyn-ml/data/processed/resources/google_cpu_memory.parquet",
            caveat="research_usable=yes for CPU/memory targets only; no GPU labels exist in this or any ingested dataset.",
        )
    )
    claims.append(
        Claim(
            claim="The simulator implements a reduced-order, CPU/memory-first data-center scheduling environment.",
            status="supported",
            evidence_file="docs/model_assumptions.md, docs/equations.md",
            caveat="Power/PUE/thermal equations are documented engineering assumptions, not fit to any real facility.",
        )
    )
    claims.append(
        Claim(
            claim=(
                "The simulator compares baseline, heuristic, integrated coordination, and external Helicyn "
                "policies under documented assumptions."
            ),
            status="supported" if checks["external_included"] else "partially_supported",
            evidence_file=all_runs_evidence,
            caveat=(
                "All policy types present in this results directory."
                if checks["external_included"]
                else "external_helicyn was not included in this results directory "
                "(no reachable --helicyn-url at run time); comparison covers baseline + heuristics + "
                "integrated_coordination only. Policies present: " + ", ".join(checks["policies"])
            ),
        )
    )
    claims.append(
        Claim(
            claim="integrated_coordination (a simulator-native, hand-weighted coordination-layer heuristic) can be evaluated against baseline in simulated scenarios.",
            status="supported" if "integrated_coordination" in checks["policies"] else "unsupported",
            evidence_file=all_runs_evidence,
            caveat=(
                "Evaluation is simulation-only, under this project's documented model assumptions; "
                "integrated_coordination is not trained ML and is not a validated real-world controller."
            ),
        )
    )

    unsupported_claims = [
        ("This project has demonstrated production energy savings.", "No production deployment exists anywhere in this project."),
        ("This project has verified real-world energy/carbon/cost reductions.", "All results are simulated; no real facility was measured."),
        ("This project performs real GPU optimization.", "No GPU-trained model exists; GPU fields are inert scaffolding in both projects."),
        ("This project performs real cooling optimization.", "The cooling/PUE model is an analytical proxy, not a real cooling-plant controller."),
        ("This project has a real, validated PUE prediction model.", "PUE is a formula with hand-set coefficients, not fit to any facility's measured PUE."),
        ("This project has a real, validated SLA prediction model.", "helicyn-ml's sla_risk_model is unavailable/degenerate (no real SLA-violation labels)."),
        ("This project has been validated against real facility telemetry.", "No real facility telemetry (power, thermal, PUE) has ever been used anywhere in this project."),
        ("This project controls customer/production infrastructure.", "Neither helicyn-ml nor helicyn-sim has ever been connected to any real infrastructure."),
    ]
    for claim_text, caveat in unsupported_claims:
        claims.append(Claim(claim=claim_text, status="unsupported", evidence_file="(none)", caveat=caveat))

    return claims


def write_claims_audit(results_dir: str | Path, out_path: str | Path) -> Path:
    claims = build_claims_audit(results_dir)
    out_path = Path(out_path)

    lines = [
        "# Claims audit",
        "",
        "Every claim this project's evidence package could plausibly support or refute, categorized "
        "honestly. If a claim you want to make isn't `supported` here with real evidence, don't make it.",
        "",
        "## Supported",
        "",
    ]
    for status in ("supported", "partially_supported", "unsupported"):
        section_claims = [c for c in claims if c.status == status]
        if status != "supported":
            lines.append(f"## {status.replace('_', ' ').title()}")
            lines.append("")
        for c in section_claims:
            lines.append(f"- **{c.claim}**")
            lines.append(f"  - status: `{c.status}`")
            lines.append(f"  - evidence: {c.evidence_file}")
            lines.append(f"  - caveat: {c.caveat}")
        lines.append("")

    out_path.write_text("\n".join(lines))
    return out_path
