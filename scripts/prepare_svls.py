#!/usr/bin/env python3
"""Build the svls dataset. Delegates to prepare_engine_set.py."""
from prepare_engine_set import build_set

if __name__ == "__main__":
    build_set("svls")
