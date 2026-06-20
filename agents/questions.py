"""Default Q&A pool. Override by putting one question per line in
_local/questions.txt.
"""
from __future__ import annotations

from common import ROOT

_DEFAULT = [
    "What is the capital of Japan?",
    "Explain in one sentence why the sky appears blue.",
    "What is 17 multiplied by 23?",
    "Name the largest planet in our solar system.",
    "What does the acronym HTTP stand for?",
    "Who wrote the play 'Hamlet'?",
    "What is the boiling point of water at sea level in Celsius?",
    "In one line, what is a hash function?",
]


def load_questions() -> list[str]:
    p = ROOT / "_local" / "questions.txt"
    if p.exists():
        qs = [q.strip() for q in p.read_text().splitlines() if q.strip()]
        if qs:
            return qs
    return _DEFAULT
