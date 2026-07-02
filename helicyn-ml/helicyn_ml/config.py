from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent

DATA_DIR = PROJECT_ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
INTERIM_DIR = DATA_DIR / "interim"
PROCESSED_DIR = DATA_DIR / "processed"
SPLITS_DIR = DATA_DIR / "splits"
SAMPLES_DIR = DATA_DIR / "samples"

ARTIFACTS_DIR = PROJECT_ROOT / "artifacts"
MODELS_DIR = ARTIFACTS_DIR / "models"
EVAL_DIR = ARTIFACTS_DIR / "eval"
REPORTS_DIR = ARTIFACTS_DIR / "reports"
MODEL_CARDS_DIR = REPORTS_DIR / "model_cards"
FIGURES_DIR = REPORTS_DIR / "figures"

CONFIGS_DIR = PROJECT_ROOT / "configs"
EXAMPLES_DIR = PROJECT_ROOT / "examples"

SYNTHETIC_SAMPLE_SOURCE = "synthetic_sample"
