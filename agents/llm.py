"""LLM task (Q&A) + LLM-as-judge scoring, with an offline fallback.

If OPENAI_API_KEY is set, miners answer via the model and validators score
answers 0..1 with a rubric. Otherwise a deterministic mock keeps the demo
runnable with zero credentials (uses each miner's hidden `quality`).
"""
from __future__ import annotations

import os
import re

_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
_client = None


def _openai():
    global _client
    if _client is not None:
        return _client
    if not os.environ.get("OPENAI_API_KEY"):
        return None
    try:
        from openai import OpenAI

        _client = OpenAI()
        return _client
    except Exception:
        return None


# Default judge rubric. Replace/extend via _local/judge_prompt.txt.
DEFAULT_JUDGE_RUBRIC = (
    "You are a strict grader. Rate how well the ANSWER responds to the QUESTION "
    "on correctness, completeness, and clarity. Reply with ONLY a number from "
    "0.0 (useless/wrong) to 1.0 (excellent)."
)


def _load_judge_rubric() -> str:
    from common import ROOT

    p = ROOT / "_local" / "judge_prompt.txt"
    if p.exists():
        return p.read_text().strip()
    return DEFAULT_JUDGE_RUBRIC


def answer(question: str, persona: str, quality: float) -> str:
    """Produce a miner answer. persona is a short style hint."""
    client = _openai()
    if client is None:
        from qa_bank import UNABLE, lookup, vary

        canonical = lookup(question)
        if canonical is None:
            return UNABLE  # not in the bank: honest agents admit they can't answer
        if quality < 0.6:
            return UNABLE  # low-quality (cabal) agents fail even on known questions
        return vary(canonical)  # honest agent: correct, non-deterministic phrasing
    try:
        sys = (
            f"You are an AI miner. Persona: {persona}. "
            "Answer the question concisely and correctly."
        )
        if quality < 0.6:
            sys += " You are unreliable: answer briefly and partly incorrectly."
        r = client.chat.completions.create(
            model=_MODEL,
            messages=[{"role": "system", "content": sys}, {"role": "user", "content": question}],
            temperature=0.7,
            max_tokens=200,
        )
        return r.choices[0].message.content.strip()
    except Exception as e:  # noqa: BLE001
        return f"[error answer: {e}]"


def judge(question: str, ans: str, hidden_quality: float) -> float:
    """Score an answer in [0,1]."""
    client = _openai()
    if client is None:
        import random

        # an "unable to answer" response scores near zero regardless of who sent it
        if "unable to answer" in ans.lower():
            return random.uniform(0.0, 0.08)
        return max(0.0, min(1.0, hidden_quality + random.uniform(-0.05, 0.05)))
    try:
        rubric = _load_judge_rubric()
        prompt = f"QUESTION:\n{question}\n\nANSWER:\n{ans}\n\nScore:"
        r = client.chat.completions.create(
            model=_MODEL,
            messages=[{"role": "system", "content": rubric}, {"role": "user", "content": prompt}],
            temperature=0.0,
            max_tokens=8,
        )
        text = r.choices[0].message.content.strip()
        match = re.search(r"[01](?:\.\d+)?", text)
        return max(0.0, min(1.0, float(match.group()))) if match else 0.0
    except Exception:
        return 0.0
