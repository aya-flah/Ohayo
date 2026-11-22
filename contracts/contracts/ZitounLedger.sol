// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title ZitounLedger: the margine passport and the grignon market of Sonae Zitoun.
 *
 * Who is who:
 *  - REGULATOR (the CRDA or the ANPE inspector) registers mills and the olive groves allowed to
 *    receive margine, each with a season cap computed from its area.
 *  - MILL (a maâsra) dispatches each tanker load to a grove and pays Sonae's small fee per m³.
 *  - The FARMER who owns the grove, or the ORACLE (tanker GPS and flow meter), confirms delivery.
 *  - Anyone can read every load, so an inspector or an exporter can check that a mill's margine
 *    ended up on approved land, within the cap, and never in a wadi.
 *
 * Grignon (pomace) is sold to hammams, bakeries and kilns with the money held in escrow until the
 * buyer confirms delivery. A mill whose loads are all traced can issue an oil batch certificate.
 * Payments use the pull pattern (credits, then withdraw).
 */
contract ZitounLedger is AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant REGULATOR_ROLE = keccak256("REGULATOR_ROLE");
    bytes32 public constant MILL_ROLE = keccak256("MILL_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    enum LoadStatus {
        None,
        Dispatched,
        Delivered,
        Expired
    }

    enum OrderStatus {
        None,
        Escrowed,
        Released,
        Refunded
    }

    struct Grove {
        address farmer;
        uint32 areaHa10; // hectares × 10
        uint32 capM3; // season cap
        uint32 appliedM3; // delivered and confirmed
        uint32 reservedM3; // dispatched, not yet confirmed
        bool active;
        string name;
    }

    struct Load {
        address mill;
        uint32 groveId;
        uint32 m3;
        uint64 dispatchedAt;
        uint64 deliveredAt;
        LoadStatus status;
        bytes32 labHash; // hash of the lab analysis or the pond reading for this load
        uint256 fee;
    }

    struct MillStats {
        string name;
        bool registered;
        uint64 declaredM3; // margine the mill reports producing
        uint64 deliveredM3; // margine confirmed on approved groves
        uint32 loads;
        uint32 expired; // loads nobody confirmed in time: a red flag
    }

    struct Lot {
        address mill;
        uint64 kg;
        uint64 remainingKg;
        uint256 pricePerTonne;
        bool active;
    }

    struct GrignonOrder {
        uint256 lotId;
        address buyer;
        uint64 kg;
        uint256 amount;
        uint64 deadline;
        OrderStatus status;
    }

    struct Certificate {
        address mill;
        bytes32 batchRef;
        uint32 litres;
        uint64 declaredM3;
        uint64 deliveredM3;
        uint32 loads;
        uint64 issuedAt;
    }

    uint256 public feePerM3;
    address public treasury;
    uint64 public deliveryWindow = 2 days;

    uint256 public nextGroveId = 1;
    uint256 public nextLoadId = 1;
    uint256 public nextLotId = 1;
    uint256 public nextOrderId = 1;
    uint256 public nextCertificateId = 1;

    mapping(uint256 => Grove) public groves;
    mapping(uint256 => Load) public loads;
    mapping(uint256 => Lot) public lots;
    mapping(uint256 => GrignonOrder) public orders;
    mapping(uint256 => Certificate) public certificates;
    mapping(address => MillStats) public millStats;
    mapping(address => uint256) public credits;

    event MillRegistered(address indexed mill, string name);
    event GroveRegistered(uint256 indexed groveId, address indexed farmer, uint32 areaHa10, uint32 capM3, string name);
    event GroveActive(uint256 indexed groveId, bool active);
    event MargineDeclared(address indexed mill, uint32 m3);
    event LoadDispatched(uint256 indexed loadId, address indexed mill, uint256 indexed groveId, uint32 m3, bytes32 labHash);
    event LoadDelivered(uint256 indexed loadId, address indexed by, uint32 m3);
    event LoadExpired(uint256 indexed loadId);
    event LotListed(uint256 indexed lotId, address indexed mill, uint64 kg, uint256 pricePerTonne);
    event LotCancelled(uint256 indexed lotId);
    event GrignonBought(uint256 indexed orderId, uint256 indexed lotId, address indexed buyer, uint64 kg, uint256 amount);
    event GrignonReleased(uint256 indexed orderId);
    event GrignonRefunded(uint256 indexed orderId);
    event CertificateIssued(uint256 indexed certificateId, address indexed mill, bytes32 batchRef, uint32 litres);
    event Withdrawn(address indexed to, uint256 amount);

    error NotAllowed();
    error BadInput();
    error GroveInactive();
    error CapExceeded(uint32 roomM3);
    error WrongPayment(uint256 expected);
    error BadStatus();
    error TooLate();
    error TooEarly();
    error NotEnough();
    error NotCompliant();
    error NothingToWithdraw();
    error TransferFailed();

    constructor(address admin, address oracle, address treasury_, uint256 feePerM3_) {
        if (admin == address(0) || treasury_ == address(0)) revert BadInput();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REGULATOR_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(ORACLE_ROLE, oracle == address(0) ? admin : oracle);
        treasury = treasury_;
        feePerM3 = feePerM3_;
    }

    /* ── Registry (regulator) ─────────────────────────────────────────── */

    function registerMill(address mill, string calldata name) external onlyRole(REGULATOR_ROLE) {
        if (mill == address(0)) revert BadInput();
        _grantRole(MILL_ROLE, mill);
        MillStats storage s = millStats[mill];
        s.name = name;
        s.registered = true;
        emit MillRegistered(mill, name);
    }

    function registerGrove(address farmer, uint32 areaHa10, uint32 capM3, string calldata name)
        external
        onlyRole(REGULATOR_ROLE)
        returns (uint256 groveId)
    {
        if (farmer == address(0) || areaHa10 == 0 || capM3 == 0) revert BadInput();
        groveId = nextGroveId++;
        groves[groveId] = Grove(farmer, areaHa10, capM3, 0, 0, true, name);
        emit GroveRegistered(groveId, farmer, areaHa10, capM3, name);
    }

    function setGroveActive(uint256 groveId, bool active) external onlyRole(REGULATOR_ROLE) {
        if (groves[groveId].farmer == address(0)) revert BadInput();
        groves[groveId].active = active;
        emit GroveActive(groveId, active);
    }

    /* ── Margine passport (mill, farmer, oracle) ──────────────────────── */

    function declareMargine(uint32 m3) external onlyRole(MILL_ROLE) {
        if (m3 == 0) revert BadInput();
        millStats[msg.sender].declaredM3 += m3;
        emit MargineDeclared(msg.sender, m3);
    }

    /// One tanker load to an approved grove. The grove's season cap is enforced here, on chain.
    function dispatch(uint256 groveId, uint32 m3, bytes32 labHash)
        external
        payable
        onlyRole(MILL_ROLE)
        whenNotPaused
        returns (uint256 loadId)
    {
        Grove storage g = groves[groveId];
        if (g.farmer == address(0) || m3 == 0) revert BadInput();
        if (!g.active) revert GroveInactive();
        uint32 used = g.appliedM3 + g.reservedM3;
        if (used + m3 > g.capM3) revert CapExceeded(g.capM3 > used ? g.capM3 - used : 0);
        uint256 fee = feePerM3 * m3;
        if (msg.value != fee) revert WrongPayment(fee);
        g.reservedM3 += m3;
        loadId = nextLoadId++;
        loads[loadId] = Load(msg.sender, uint32(groveId), m3, uint64(block.timestamp), 0, LoadStatus.Dispatched, labHash, fee);
        emit LoadDispatched(loadId, msg.sender, groveId, m3, labHash);
    }

    /// The farmer (or the tanker's GPS and flow-meter oracle) confirms the load reached the grove.
    function confirmDelivery(uint256 loadId) external nonReentrant {
        Load storage l = loads[loadId];
        if (l.status != LoadStatus.Dispatched) revert BadStatus();
        Grove storage g = groves[l.groveId];
        if (msg.sender != g.farmer && !hasRole(ORACLE_ROLE, msg.sender)) revert NotAllowed();
        if (block.timestamp > l.dispatchedAt + deliveryWindow) revert TooLate();
        l.status = LoadStatus.Delivered;
        l.deliveredAt = uint64(block.timestamp);
        g.reservedM3 -= l.m3;
        g.appliedM3 += l.m3;
        MillStats storage s = millStats[l.mill];
        s.deliveredM3 += l.m3;
        s.loads += 1;
        credits[treasury] += l.fee;
        emit LoadDelivered(loadId, msg.sender, l.m3);
    }

    /// A load nobody confirmed in time: the fee goes back to the mill, and the mill gets a red flag.
    function expire(uint256 loadId) external nonReentrant {
        Load storage l = loads[loadId];
        if (l.status != LoadStatus.Dispatched) revert BadStatus();
        if (block.timestamp <= l.dispatchedAt + deliveryWindow) revert TooEarly();
        l.status = LoadStatus.Expired;
        groves[l.groveId].reservedM3 -= l.m3;
        millStats[l.mill].expired += 1;
        credits[l.mill] += l.fee;
        emit LoadExpired(loadId);
    }

    /* ── Grignon market (escrow) ──────────────────────────────────────── */

    function listGrignon(uint64 kg, uint256 pricePerTonne) external onlyRole(MILL_ROLE) whenNotPaused returns (uint256 lotId) {
        if (kg == 0 || pricePerTonne == 0) revert BadInput();
        lotId = nextLotId++;
        lots[lotId] = Lot(msg.sender, kg, kg, pricePerTonne, true);
        emit LotListed(lotId, msg.sender, kg, pricePerTonne);
    }

    function cancelLot(uint256 lotId) external {
        Lot storage lot = lots[lotId];
        if (lot.mill != msg.sender) revert NotAllowed();
        lot.active = false;
        emit LotCancelled(lotId);
    }

    function priceOf(uint256 lotId, uint64 kg) public view returns (uint256) {
        return (lots[lotId].pricePerTonne * kg) / 1000;
    }

    function buyGrignon(uint256 lotId, uint64 kg) external payable nonReentrant whenNotPaused returns (uint256 orderId) {
        Lot storage lot = lots[lotId];
        if (!lot.active || kg == 0) revert BadInput();
        if (msg.sender == lot.mill) revert NotAllowed();
        if (kg > lot.remainingKg) revert NotEnough();
        uint256 amount = priceOf(lotId, kg);
        if (amount == 0 || msg.value != amount) revert WrongPayment(amount);
        lot.remainingKg -= kg;
        orderId = nextOrderId++;
        orders[orderId] = GrignonOrder(lotId, msg.sender, kg, amount, uint64(block.timestamp) + deliveryWindow, OrderStatus.Escrowed);
        emit GrignonBought(orderId, lotId, msg.sender, kg, amount);
    }

    function confirmGrignon(uint256 orderId) external nonReentrant {
        GrignonOrder storage o = orders[orderId];
        if (o.status != OrderStatus.Escrowed) revert BadStatus();
        if (msg.sender != o.buyer && !hasRole(ORACLE_ROLE, msg.sender)) revert NotAllowed();
        o.status = OrderStatus.Released;
        credits[lots[o.lotId].mill] += o.amount;
        emit GrignonReleased(orderId);
    }

    function refundGrignon(uint256 orderId) external nonReentrant {
        GrignonOrder storage o = orders[orderId];
        if (o.status != OrderStatus.Escrowed) revert BadStatus();
        if (msg.sender != o.buyer) revert NotAllowed();
        if (block.timestamp <= o.deadline) revert TooEarly();
        o.status = OrderStatus.Refunded;
        lots[o.lotId].remainingKg += o.kg;
        credits[o.buyer] += o.amount;
        emit GrignonRefunded(orderId);
    }

    /* ── Oil batch certificate ────────────────────────────────────────── */

    /// Only a mill with traced loads and no expired load can certify a batch; the certificate keeps a snapshot.
    function issueCertificate(bytes32 batchRef, uint32 litres) external onlyRole(MILL_ROLE) returns (uint256 certificateId) {
        MillStats storage s = millStats[msg.sender];
        if (litres == 0 || batchRef == bytes32(0)) revert BadInput();
        if (s.loads == 0 || s.expired > 0) revert NotCompliant();
        certificateId = nextCertificateId++;
        certificates[certificateId] = Certificate(msg.sender, batchRef, litres, s.declaredM3, s.deliveredM3, s.loads, uint64(block.timestamp));
        emit CertificateIssued(certificateId, msg.sender, batchRef, litres);
    }

    /* ── Money ────────────────────────────────────────────────────────── */

    function withdraw() external nonReentrant {
        uint256 amount = credits[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        credits[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, amount);
    }

    /* ── Admin ────────────────────────────────────────────────────────── */

    function setFeePerM3(uint256 fee) external onlyRole(DEFAULT_ADMIN_ROLE) {
        feePerM3 = fee;
    }

    function setDeliveryWindow(uint64 seconds_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (seconds_ < 1 hours || seconds_ > 30 days) revert BadInput();
        deliveryWindow = seconds_;
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /* ── Reads for the website ────────────────────────────────────────── */

    function getGroves(uint256 fromId, uint256 count) external view returns (Grove[] memory list) {
        uint256 end = _end(fromId, count, nextGroveId);
        list = new Grove[](end > fromId ? end - fromId : 0);
        for (uint256 i = fromId; i < end; i++) list[i - fromId] = groves[i];
    }

    function getLoads(uint256 fromId, uint256 count) external view returns (Load[] memory list) {
        uint256 end = _end(fromId, count, nextLoadId);
        list = new Load[](end > fromId ? end - fromId : 0);
        for (uint256 i = fromId; i < end; i++) list[i - fromId] = loads[i];
    }

    function getLots(uint256 fromId, uint256 count) external view returns (Lot[] memory list) {
        uint256 end = _end(fromId, count, nextLotId);
        list = new Lot[](end > fromId ? end - fromId : 0);
        for (uint256 i = fromId; i < end; i++) list[i - fromId] = lots[i];
    }

    function getOrders(uint256 fromId, uint256 count) external view returns (GrignonOrder[] memory list) {
        uint256 end = _end(fromId, count, nextOrderId);
        list = new GrignonOrder[](end > fromId ? end - fromId : 0);
        for (uint256 i = fromId; i < end; i++) list[i - fromId] = orders[i];
    }

    function getCertificates(uint256 fromId, uint256 count) external view returns (Certificate[] memory list) {
        uint256 end = _end(fromId, count, nextCertificateId);
        list = new Certificate[](end > fromId ? end - fromId : 0);
        for (uint256 i = fromId; i < end; i++) list[i - fromId] = certificates[i];
    }

    function _end(uint256 fromId, uint256 count, uint256 next) private pure returns (uint256) {
        if (fromId == 0) fromId = 1;
        uint256 end = fromId + count;
        return end > next ? next : end;
    }
}
