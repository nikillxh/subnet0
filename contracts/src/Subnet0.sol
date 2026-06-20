// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title Subnet0 - on-chain Yuma Consensus incentive market for AI agents.
/// @notice Port of the Bittensor whitepaper incentive mechanism (Sec 1-3, 10)
///         to a single Monad contract. Agents register an identity, validators
///         score miners via a weight matrix W, and per-epoch the contract
///         computes rank R = W^T S, consensus C = sigma(rho(T^T S - kappa)),
///         incentive I = R * C, bonds B (EMA of W*S), validator dividends
///         D = B^T I, and emits stake dS = 0.5 D + 0.5 I. Collusion (self-voting
///         sub-graphs below 50% stake) is suppressed because their consensus
///         stays under the kappa inflection.
contract Subnet0 {
    uint256 internal constant WAD = 1e18;
    uint8 public constant MAX_AGENTS = 16;

    // --- parameters (WAD unless noted) ---
    uint256 public rho;        // consensus steepness (plain integer multiplier, e.g. 10)
    uint256 public kappa;      // consensus shift (WAD, e.g. 0.5e18)
    uint256 public alpha;      // bond EMA factor (WAD)
    uint256 public emission;   // stake minted per epoch (WAD)
    uint256 public initStake;  // stake granted at registration (WAD)

    // --- registry ---
    uint8 public n;
    mapping(uint8 => address) public agentOf;     // uid -> address
    mapping(address => uint8) internal _uidPlus1; // address -> uid+1 (0 = unregistered)

    // --- core state (indexed by uid) ---
    uint256[MAX_AGENTS] public stake;                 // S
    uint256[MAX_AGENTS][MAX_AGENTS] internal weight;  // W[v][m]
    uint256[MAX_AGENTS][MAX_AGENTS] internal bond;     // B[v][m]

    // --- last epoch outputs (indexed by uid) ---
    uint256[MAX_AGENTS] public rank;        // R
    uint256[MAX_AGENTS] public consensus;   // C
    uint256[MAX_AGENTS] public incentive;   // I
    uint256[MAX_AGENTS] public dividend;    // D
    uint256[MAX_AGENTS] public pending;     // claimable rewards ledger

    uint256 public epoch;
    address public owner;

    event Registered(uint8 indexed uid, address indexed agent);
    event WeightsSet(uint8 indexed uid, uint8[] dests, uint256[] weights);
    event EpochSettled(
        uint256 indexed epoch,
        uint8 n,
        uint256[MAX_AGENTS] stake,
        uint256[MAX_AGENTS] consensus,
        uint256[MAX_AGENTS] incentive,
        uint256[MAX_AGENTS] dividend
    );
    event Claimed(uint8 indexed uid, address indexed agent, uint256 amount);

    error NotRegistered();
    error AlreadyRegistered();
    error Full();
    error BadInput();

    constructor() {
        owner = msg.sender;
        rho = 10;
        kappa = WAD / 2;          // 0.5
        alpha = WAD / 2;          // 0.5 bond EMA
        emission = WAD;           // 1 unit minted per epoch
        initStake = WAD;          // 1 unit at registration
    }

    function uidOf(address a) public view returns (uint8) {
        uint8 p = _uidPlus1[a];
        if (p == 0) revert NotRegistered();
        return p - 1;
    }

    function isRegistered(address a) public view returns (bool) {
        return _uidPlus1[a] != 0;
    }

    /// @notice Register caller as an agent: assigns a uid + grants test stake.
    function register() external returns (uint8 uid) {
        if (_uidPlus1[msg.sender] != 0) revert AlreadyRegistered();
        if (n >= MAX_AGENTS) revert Full();
        uid = n;
        agentOf[uid] = msg.sender;
        _uidPlus1[msg.sender] = uid + 1;
        stake[uid] = initStake;
        n = uid + 1;
        emit Registered(uid, msg.sender);
    }

    /// @notice Validator sets its row of W. Weights normalized to sum WAD.
    /// @param dests miner uids being scored
    /// @param weights raw weights (any scale); normalized internally
    function setWeights(uint8[] calldata dests, uint256[] calldata weights) external {
        uint8 v = uidOf(msg.sender);
        if (dests.length != weights.length || dests.length == 0) revert BadInput();

        uint256 total;
        for (uint256 k = 0; k < weights.length; k++) {
            if (dests[k] >= n) revert BadInput();
            total += weights[k];
        }
        if (total == 0) revert BadInput();

        // clear existing row
        for (uint8 j = 0; j < n; j++) {
            weight[v][j] = 0;
        }
        // write normalized row
        for (uint256 k = 0; k < dests.length; k++) {
            weight[v][dests[k]] = (weights[k] * WAD) / total;
        }
        emit WeightsSet(v, dests, weights);
    }

    /// @notice Run one epoch of Yuma Consensus and mint stake.
    function runEpoch() external {
        uint8 m = n;
        if (m == 0) revert BadInput();

        uint256 totalStake;
        for (uint8 i = 0; i < m; i++) {
            totalStake += stake[i];
        }
        if (totalStake == 0) revert BadInput();

        // 1) rank R[j] = sum_v W[v][j] * S[v]   (R = W^T S)
        //    trust stake[j] = sum_v (W[v][j] > 0 ? S[v] : 0)   (T^T S)
        uint256[MAX_AGENTS] memory R;
        uint256[MAX_AGENTS] memory trustStake;
        for (uint8 j = 0; j < m; j++) {
            uint256 r;
            uint256 t;
            for (uint8 v = 0; v < m; v++) {
                uint256 w = weight[v][j];
                if (w != 0) {
                    r += (w * stake[v]) / WAD;
                    t += stake[v];
                }
            }
            R[j] = r;
            trustStake[j] = t;
        }

        // 2) consensus C[j] = sigma(rho * (trustFrac - kappa))
        uint256[MAX_AGENTS] memory C;
        for (uint8 j = 0; j < m; j++) {
            uint256 trustFrac = (trustStake[j] * WAD) / totalStake; // [0,WAD]
            int256 x = int256(rho) * (int256(trustFrac) - int256(kappa)); // WAD scale
            C[j] = _sigmoid(x);
        }

        // 3) incentive I = normalize(R * C)
        uint256[MAX_AGENTS] memory I;
        uint256 iTotal;
        for (uint8 j = 0; j < m; j++) {
            uint256 raw = (R[j] * C[j]) / WAD;
            I[j] = raw;
            iTotal += raw;
        }
        if (iTotal > 0) {
            for (uint8 j = 0; j < m; j++) {
                I[j] = (I[j] * WAD) / iTotal;
            }
        }

        // 4) bonds B[v][j] = EMA of (W[v][j]*S[v]); then column-normalize per miner
        for (uint8 v = 0; v < m; v++) {
            for (uint8 j = 0; j < m; j++) {
                uint256 delta = (weight[v][j] * stake[v]) / WAD;
                bond[v][j] = ((WAD - alpha) * bond[v][j]) / WAD + (alpha * delta) / WAD;
            }
        }
        for (uint8 j = 0; j < m; j++) {
            uint256 colSum;
            for (uint8 v = 0; v < m; v++) {
                colSum += bond[v][j];
            }
            if (colSum > 0) {
                for (uint8 v = 0; v < m; v++) {
                    bond[v][j] = (bond[v][j] * WAD) / colSum;
                }
            }
        }

        // 5) validator dividends D[v] = sum_j B[v][j] * I[j]; normalize
        uint256[MAX_AGENTS] memory D;
        uint256 dTotal;
        for (uint8 v = 0; v < m; v++) {
            uint256 d;
            for (uint8 j = 0; j < m; j++) {
                d += (bond[v][j] * I[j]) / WAD;
            }
            D[v] = d;
            dTotal += d;
        }
        if (dTotal > 0) {
            for (uint8 v = 0; v < m; v++) {
                D[v] = (D[v] * WAD) / dTotal;
            }
        }

        // 6) emission dS[k] = 0.5 D[k] + 0.5 I[k]; mint -> stake + claimable
        for (uint8 k = 0; k < m; k++) {
            uint256 share = (D[k] + I[k]) / 2; // sums to ~WAD across agents
            uint256 minted = (emission * share) / WAD;
            stake[k] += minted;
            pending[k] += minted;
            rank[k] = R[k];
            consensus[k] = C[k];
            incentive[k] = I[k];
            dividend[k] = D[k];
        }

        epoch += 1;
        emit EpochSettled(epoch, m, stake, consensus, incentive, dividend);
    }

    /// @notice Subnet owner tunes mechanism parameters.
    function setParams(uint256 _rho, uint256 _kappa, uint256 _alpha, uint256 _emission) external {
        if (msg.sender != owner) revert BadInput();
        rho = _rho;
        kappa = _kappa;
        alpha = _alpha;
        emission = _emission;
    }

    /// @notice Subnet owner seeds an agent's stake (bootstrap / demo scenarios).
    function seedStake(uint8 uid, uint256 amount) external {
        if (msg.sender != owner) revert BadInput();
        if (uid >= n) revert BadInput();
        stake[uid] = amount;
    }

    /// @notice Withdraw accrued rewards ledger (symbolic in this demo build).
    function claim() external returns (uint256 amount) {
        uint8 uid = uidOf(msg.sender);
        amount = pending[uid];
        pending[uid] = 0;
        emit Claimed(uid, msg.sender, amount);
    }

    // --- views for dashboard / agents ---
    function getStake() external view returns (uint256[MAX_AGENTS] memory) {
        return stake;
    }

    function getConsensus() external view returns (uint256[MAX_AGENTS] memory) {
        return consensus;
    }

    function getIncentive() external view returns (uint256[MAX_AGENTS] memory) {
        return incentive;
    }

    function getDividend() external view returns (uint256[MAX_AGENTS] memory) {
        return dividend;
    }

    function getWeightRow(uint8 v) external view returns (uint256[MAX_AGENTS] memory row) {
        for (uint8 j = 0; j < MAX_AGENTS; j++) {
            row[j] = weight[v][j];
        }
    }

    function snapshot()
        external
        view
        returns (
            uint8 count,
            uint256 ep,
            address[MAX_AGENTS] memory agents,
            uint256[MAX_AGENTS] memory s,
            uint256[MAX_AGENTS] memory c,
            uint256[MAX_AGENTS] memory inc,
            uint256[MAX_AGENTS] memory div,
            uint256[MAX_AGENTS] memory pend
        )
    {
        count = n;
        ep = epoch;
        for (uint8 i = 0; i < n; i++) {
            agents[i] = agentOf[i];
        }
        s = stake;
        c = consensus;
        inc = incentive;
        div = dividend;
        pend = pending;
    }

    /// @dev Smooth logistic-style S-curve approximation of sigmoid in WAD.
    ///      f(x) = 0.5 * (1 + x / (1 + |x|)). Monotonic, f(0)=0.5, range (0,1).
    ///      Cheap on-chain stand-in for 1/(1+e^-x); preserves the kappa threshold.
    function _sigmoid(int256 x) internal pure returns (uint256) {
        int256 ax = x >= 0 ? x : -x;
        // frac = x*WAD/(WAD+|x|), range (-WAD, WAD)
        int256 frac = (x * int256(WAD)) / (int256(WAD) + ax);
        int256 c = (int256(WAD) + frac) / 2; // (0, WAD)
        if (c < 0) c = 0;
        return uint256(c);
    }
}
