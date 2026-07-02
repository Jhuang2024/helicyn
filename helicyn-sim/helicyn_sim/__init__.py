"""Helicyn Sim: independent research-prototype data-center scheduling simulator.

See README.md and docs/limitations.md before drawing any conclusions from
run output. This package does not import or depend on helicyn-ml at runtime;
ML integration is opt-in via CLI flags (resource trace shaping) or, in a
later phase, an HTTP call to a running `helicyn-ml serve` process.
"""

__version__ = "0.1.0"
