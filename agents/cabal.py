"""Cabal validator: ignores answer quality and votes only for its own clique.

This is the collusion attack from Section 10 of the whitepaper. Because the
clique holds < 50% stake, its self-dealt weights produce trust from a minority,
so consensus stays below kappa and emissions starve it over epochs.
"""
from __future__ import annotations

from common import Account


class CabalValidator:
    def __init__(self, acct: Account, name: str):
        self.acct = acct
        self.name = name

    def ensure_registered(self):
        if self.acct.uid is None:
            self.acct.send(self.acct.contract.functions.register())
        return self.acct.uid

    def vote(self, clique_uids: list[int]) -> dict[int, float]:
        dests = list(clique_uids)
        weights = [1] * len(dests)  # equal self-dealing, quality-blind
        self.acct.send(self.acct.contract.functions.setWeights(dests, weights))
        return {u: 1.0 for u in dests}
