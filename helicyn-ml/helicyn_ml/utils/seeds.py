import random

import numpy as np

DEFAULT_SEED = 42


def set_all_seeds(seed: int = DEFAULT_SEED) -> None:
    random.seed(seed)
    np.random.seed(seed)
