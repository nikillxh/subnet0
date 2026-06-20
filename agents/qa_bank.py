"""Fixed Q&A knowledge bank for the demo miners.

Loaded from data/qa_bank.json (shared with the frontend). Honest miners answer
known questions (with non-deterministic phrasing); unknown questions get
"Currently unable to answer."
"""
from __future__ import annotations

import json
import random
import re

from common import ROOT

_BANK_PATH = ROOT / "data" / "qa_bank.json"
UNABLE = "Currently unable to answer."


def _norm(q: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", q.lower()).strip()


def _load() -> dict[str, str]:
    raw = json.loads(_BANK_PATH.read_text())
    return {_norm(item["q"]): item["a"] for item in raw}


_BANK = _load()


def questions() -> list[str]:
    return [item["q"] for item in json.loads(_BANK_PATH.read_text())]


def lookup(question: str) -> str | None:
    return _BANK.get(_norm(question))


_TEMPLATES = [
    "{a}",
    "{a}.",
    "The answer is {a}.",
    "It's {a}.",
    "I'd say {a}.",
    "Answer: {a}",
    "That would be {a}.",
]


def vary(answer: str) -> str:
    """Return a non-deterministic phrasing of a correct answer."""
    return random.choice(_TEMPLATES).format(a=answer)
