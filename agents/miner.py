"""Miner agent: registers an identity, answers the epoch question with an LLM."""
from __future__ import annotations

from common import Account
from llm import answer as llm_answer


class Miner:
    def __init__(self, acct: Account, name: str, persona: str, quality: float):
        self.acct = acct
        self.name = name
        self.persona = persona
        self.quality = quality  # hidden ground-truth competence (drives mock + fallback)
        self.last_answer = ""

    def ensure_registered(self):
        if self.acct.uid is None:
            self.acct.send(self.acct.contract.functions.register())
        return self.acct.uid

    def answer(self, question: str) -> str:
        self.last_answer = llm_answer(question, self.persona, self.quality)
        return self.last_answer
