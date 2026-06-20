"""Honest validator: judges miner answers and sets weights on-chain.

Only miners scoring >= THRESHOLD receive a (nonzero) weight edge. Low-quality
miners get no edge -> no trust -> they fall below the consensus kappa inflection.
"""
from __future__ import annotations

from common import Account
from llm import judge

THRESHOLD = 0.5


class Validator:
    def __init__(self, acct: Account, name: str):
        self.acct = acct
        self.name = name

    def ensure_registered(self):
        if self.acct.uid is None:
            self.acct.send(self.acct.contract.functions.register())
        return self.acct.uid

    def vote(self, question: str, miners: list) -> dict[int, float]:
        """miners: list of Miner. Returns {uid: score} for logging."""
        dests: list[int] = []
        weights: list[int] = []
        scores: dict[int, float] = {}
        for m in miners:
            uid = m.acct.uid
            s = judge(question, m.last_answer, m.quality)
            scores[uid] = s
            if s >= THRESHOLD:
                dests.append(uid)
                weights.append(int(s * 1000) + 1)
        if dests:
            self.acct.send(self.acct.contract.functions.setWeights(dests, weights))
        return scores
