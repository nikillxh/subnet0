"""Questions the demo poses to miners. Defaults to the Q&A bank (so honest
miners can actually answer them). Override with _local/questions.txt.
"""
from __future__ import annotations

from common import ROOT
from qa_bank import questions as bank_questions


def load_questions() -> list[str]:
    p = ROOT / "_local" / "questions.txt"
    if p.exists():
        qs = [q.strip() for q in p.read_text().splitlines() if q.strip()]
        if qs:
            return qs
    return bank_questions()
