// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {Subnet0} from "../src/Subnet0.sol";

contract Subnet0Test is Test {
    Subnet0 sn;

    // honest cluster A: validators 0,1 -> miners 2,3
    // cabal B: validators 4,5 self-vote (4<->5)
    address constant A_VAL0 = address(0xA0);
    address constant A_VAL1 = address(0xA1);
    address constant A_MIN2 = address(0xA2);
    address constant A_MIN3 = address(0xA3);
    address constant B_VAL4 = address(0xB4);
    address constant B_VAL5 = address(0xB5);

    uint256 constant WAD = 1e18;

    function setUp() public {
        sn = new Subnet0();

        _register(A_VAL0); // uid 0
        _register(A_VAL1); // uid 1
        _register(A_MIN2); // uid 2
        _register(A_MIN3); // uid 3
        _register(B_VAL4); // uid 4
        _register(B_VAL5); // uid 5

        // stake: honest A = 60% , cabal B = 40% (<50%)
        sn.seedStake(0, 30 * WAD);
        sn.seedStake(1, 30 * WAD);
        sn.seedStake(2, 0);
        sn.seedStake(3, 0);
        sn.seedStake(4, 20 * WAD);
        sn.seedStake(5, 20 * WAD);

        // honest validators score honest miners 2,3
        _vote(A_VAL0, _u2(2, 3), _w2(1, 1));
        _vote(A_VAL1, _u2(2, 3), _w2(1, 1));

        // cabal validators only score each other (disjoint sub-graph)
        _vote(B_VAL4, _u1(5), _w1(1));
        _vote(B_VAL5, _u1(4), _w1(1));
    }

    function test_HonestMinersOutrankCabal() public {
        sn.runEpoch();
        uint256[16] memory c = sn.getConsensus();
        // honest miners (2,3) above kappa inflection; cabal (4,5) below
        assertGt(c[2], c[4], "honest miner consensus should exceed cabal");
        assertGt(c[3], c[5], "honest miner consensus should exceed cabal");
        assertGt(c[2], WAD / 2, "honest above 0.5");
        assertLt(c[4], WAD / 2, "cabal below 0.5");
    }

    function test_CabalStakeShareDecays() public {
        uint256 startShare = _cabalShare();
        assertApproxEqAbs(startShare, 4e17, 1e15, "cabal starts ~40%");

        uint256 prev = startShare;
        for (uint256 i = 0; i < 20; i++) {
            sn.runEpoch();
            uint256 share = _cabalShare();
            assertLe(share, prev + 1, "cabal share never grows");
            prev = share;
        }
        uint256 endShare = _cabalShare();
        assertLt(endShare, startShare, "cabal share must shrink over time");
    }

    function test_ClaimDrainsPending() public {
        sn.runEpoch();
        (, , , , , , , uint256[16] memory pend) = sn.snapshot();
        assertGt(pend[2], 0, "honest miner earned emissions");
        vm.prank(A_MIN2);
        sn.claim();
        (, , , , , , , uint256[16] memory pend2) = sn.snapshot();
        assertEq(pend2[2], 0, "pending cleared after claim");
    }

    function test_TaskFlow() public {
        uint256 fee = sn.taskFee();
        vm.deal(A_MIN2, 1 ether);
        vm.prank(A_MIN2);
        uint256 id = sn.requestTask{value: fee}("What is 2+2?");
        assertEq(id, 0);

        vm.prank(A_MIN2);
        sn.submitAnswer(id, "4");
        vm.prank(A_MIN3);
        sn.submitAnswer(id, "four");

        (address requester, string memory prompt, , uint8 answerCount) = sn.getTask(id);
        assertEq(requester, A_MIN2);
        assertEq(prompt, "What is 2+2?");
        assertEq(answerCount, 2);

        (uint8[] memory uids, string[] memory texts) = sn.getAnswers(id);
        assertEq(uids.length, 2);
        assertEq(texts[0], "4");
        assertEq(uids[0], 2);
    }

    function test_SubmitAnswerRevertsUnregistered() public {
        uint256 fee = sn.taskFee();
        vm.deal(A_MIN2, 1 ether);
        vm.prank(A_MIN2);
        uint256 id = sn.requestTask{value: fee}("q");
        vm.prank(address(0xdead));
        vm.expectRevert(Subnet0.NotRegistered.selector);
        sn.submitAnswer(id, "x");
    }

    function test_SubmitAnswerRevertsDuplicate() public {
        uint256 fee = sn.taskFee();
        vm.deal(A_MIN2, 1 ether);
        vm.prank(A_MIN2);
        uint256 id = sn.requestTask{value: fee}("q");
        vm.prank(A_MIN2);
        sn.submitAnswer(id, "a");
        vm.prank(A_MIN2);
        vm.expectRevert(Subnet0.BadInput.selector);
        sn.submitAnswer(id, "a2");
    }

    function test_RequestRevertsEmptyPrompt() public {
        uint256 fee = sn.taskFee();
        vm.deal(A_MIN2, 1 ether);
        vm.prank(A_MIN2);
        vm.expectRevert(Subnet0.BadInput.selector);
        sn.requestTask{value: fee}("");
    }

    function test_RequestRevertsUnderpaid() public {
        vm.deal(A_MIN2, 1 ether);
        vm.prank(A_MIN2);
        vm.expectRevert(Subnet0.BadInput.selector);
        sn.requestTask{value: 0}("q");
    }

    function test_FeePoolPaysAgentsAndClaim() public {
        uint256 fee = sn.taskFee();
        vm.deal(A_MIN2, 1 ether);
        vm.prank(A_MIN2);
        sn.requestTask{value: fee}("paid task");

        // honest validators score honest miners already in setUp
        sn.runEpoch();

        // a top honest miner should have native pending and be able to claim it
        uint256 owed = sn.nativePending(2);
        assertGt(owed, 0, "miner earned native fee");
        uint256 before = A_MIN2.balance;
        vm.prank(A_MIN2);
        uint256 got = sn.claim();
        assertEq(got, owed);
        assertEq(A_MIN2.balance, before + owed);
        assertEq(sn.nativePending(2), 0);
    }

    // --- helpers ---
    function _cabalShare() internal view returns (uint256) {
        uint256[16] memory s = sn.getStake();
        uint256 total;
        for (uint8 i = 0; i < 6; i++) total += s[i];
        uint256 cabal = s[4] + s[5];
        return (cabal * WAD) / total;
    }

    function _register(address a) internal {
        vm.prank(a);
        sn.register();
    }

    function _vote(address a, uint8[] memory dests, uint256[] memory w) internal {
        vm.prank(a);
        sn.setWeights(dests, w);
    }

    function _u1(uint8 a) internal pure returns (uint8[] memory r) {
        r = new uint8[](1);
        r[0] = a;
    }

    function _u2(uint8 a, uint8 b) internal pure returns (uint8[] memory r) {
        r = new uint8[](2);
        r[0] = a;
        r[1] = b;
    }

    function _w1(uint256 a) internal pure returns (uint256[] memory r) {
        r = new uint256[](1);
        r[0] = a;
    }

    function _w2(uint256 a, uint256 b) internal pure returns (uint256[] memory r) {
        r = new uint256[](2);
        r[0] = a;
        r[1] = b;
    }
}
