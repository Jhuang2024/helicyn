from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np


def plot_pred_vs_actual(y_true, y_pred, title: str, out_path: Path) -> None:
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig, ax = plt.subplots(figsize=(5, 5))
    ax.scatter(y_true, y_pred, s=8, alpha=0.4)
    lo = float(np.min([np.min(y_true), np.min(y_pred)]))
    hi = float(np.max([np.max(y_true), np.max(y_pred)]))
    ax.plot([lo, hi], [lo, hi], "r--", linewidth=1)
    ax.set_xlabel("actual")
    ax.set_ylabel("predicted")
    ax.set_title(title)
    fig.tight_layout()
    fig.savefig(out_path, dpi=110)
    plt.close(fig)


def plot_residual_hist(y_true, y_pred, title: str, out_path: Path) -> None:
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    residuals = np.asarray(y_true, dtype=float) - np.asarray(y_pred, dtype=float)
    fig, ax = plt.subplots(figsize=(5, 4))
    ax.hist(residuals, bins=30)
    ax.set_xlabel("residual (actual - predicted)")
    ax.set_title(title)
    fig.tight_layout()
    fig.savefig(out_path, dpi=110)
    plt.close(fig)
