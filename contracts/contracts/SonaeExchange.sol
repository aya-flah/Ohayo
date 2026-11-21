// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title Sonae Yui exchange
/// @notice Neighbours share or sell spare water (litres) and solar energy (Wh).
///         The buyer's payment is held in escrow until the delivery is confirmed
///         by the buyer, or measured by the GDA's meter oracle (pro rata).
///         No platform fee: there is no middleman.
/// @dev    Pull payments: sellers and refunded buyers call withdraw(). Withdrawals,
///         confirmations and refunds keep working while paused, so funds are never stuck.
contract SonaeExchange is AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    enum Resource {
        Water, // litres
        Energy // watt-hours
    }

    enum Status {
        Escrowed,
        Released,
        Refunded
    }

    struct Offer {
        address seller;
        Resource resource;
        uint128 quantity;
        uint128 remaining;
        uint256 pricePerUnit; // wei per litre or per Wh
        uint64 expiresAt;
        bool active;
        string meta; // plot, GDA, note
    }

    struct Order {
        uint256 offerId;
        address buyer;
        uint128 quantity;
        uint128 delivered;
        uint256 amount; // escrowed wei
        uint64 deliverBy;
        Status status;
    }

    uint64 public deliveryWindow = 2 days;
    uint256 public nextOfferId = 1;
    uint256 public nextOrderId = 1;

    mapping(uint256 => Offer) public offers;
    mapping(uint256 => Order) public orders;
    mapping(address => uint256) public credits;

    event Listed(uint256 indexed offerId, address indexed seller, Resource resource, uint128 quantity, uint256 pricePerUnit, uint64 expiresAt, string meta);
    event Cancelled(uint256 indexed offerId);
    event Purchased(uint256 indexed orderId, uint256 indexed offerId, address indexed buyer, uint128 quantity, uint256 amount, uint64 deliverBy);
    event Delivered(uint256 indexed orderId, uint128 delivered, uint256 paidToSeller, uint256 refundedToBuyer, bool byOracle);
    event Refunded(uint256 indexed orderId, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);
    event DeliveryWindowSet(uint64 seconds_);

    error ZeroQuantity();
    error ZeroPrice();
    error BadExpiry();
    error MetaTooLong();
    error NotSeller();
    error OfferInactive();
    error OfferExpired();
    error SelfTrade();
    error BadQuantity();
    error WrongPayment(uint256 expected, uint256 sent);
    error NotEscrowed();
    error NotAllowed();
    error NotBuyer();
    error TooEarly();
    error NothingToWithdraw();
    error TransferFailed();
    error BadWindow();

    constructor(address admin, address oracle) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        if (oracle != address(0)) _grantRole(ORACLE_ROLE, oracle);
    }

    /// @notice Post spare water or energy for sale.
    function listOffer(Resource resource, uint128 quantity, uint256 pricePerUnit, uint64 expiresAt, string calldata meta)
        external
        whenNotPaused
        returns (uint256 offerId)
    {
        if (quantity == 0) revert ZeroQuantity();
        if (pricePerUnit == 0) revert ZeroPrice();
        if (expiresAt <= block.timestamp) revert BadExpiry();
        if (bytes(meta).length > 200) revert MetaTooLong();
        offerId = nextOfferId++;
        offers[offerId] = Offer(msg.sender, resource, quantity, quantity, pricePerUnit, expiresAt, true, meta);
        emit Listed(offerId, msg.sender, resource, quantity, pricePerUnit, expiresAt, meta);
    }

    /// @notice The seller withdraws the unsold part of an offer.
    function cancelOffer(uint256 offerId) external {
        Offer storage o = offers[offerId];
        if (o.seller != msg.sender) revert NotSeller();
        if (!o.active) revert OfferInactive();
        o.active = false;
        emit Cancelled(offerId);
    }

    /// @notice Buy part or all of an offer. The exact price is locked in escrow.
    function buy(uint256 offerId, uint128 quantity) external payable nonReentrant whenNotPaused returns (uint256 orderId) {
        Offer storage o = offers[offerId];
        if (!o.active) revert OfferInactive();
        if (block.timestamp >= o.expiresAt) revert OfferExpired();
        if (msg.sender == o.seller) revert SelfTrade();
        if (quantity == 0 || quantity > o.remaining) revert BadQuantity();
        uint256 cost = uint256(quantity) * o.pricePerUnit;
        if (msg.value != cost) revert WrongPayment(cost, msg.value);

        o.remaining -= quantity;
        if (o.remaining == 0) o.active = false;

        orderId = nextOrderId++;
        uint64 deliverBy = uint64(block.timestamp) + deliveryWindow;
        orders[orderId] = Order(offerId, msg.sender, quantity, 0, cost, deliverBy, Status.Escrowed);
        emit Purchased(orderId, offerId, msg.sender, quantity, cost, deliverBy);
    }

    /// @notice The buyer confirms full delivery, or the meter oracle confirms the measured quantity.
    ///         The seller is credited for what was delivered and the buyer for the rest.
    function confirmDelivery(uint256 orderId, uint128 deliveredQty) external nonReentrant {
        Order storage ord = orders[orderId];
        if (ord.status != Status.Escrowed) revert NotEscrowed();
        bool byOracle = hasRole(ORACLE_ROLE, msg.sender);
        if (!byOracle && msg.sender != ord.buyer) revert NotAllowed();

        uint128 qty = byOracle ? deliveredQty : ord.quantity;
        if (qty > ord.quantity) qty = ord.quantity;
        uint256 pay = (ord.amount * qty) / ord.quantity;
        uint256 back = ord.amount - pay;

        ord.delivered = qty;
        ord.status = Status.Released;
        credits[offers[ord.offerId].seller] += pay;
        if (back > 0) credits[ord.buyer] += back;
        emit Delivered(orderId, qty, pay, back, byOracle);
    }

    /// @notice If nothing was confirmed before the deadline, the buyer takes the money back.
    function refund(uint256 orderId) external nonReentrant {
        Order storage ord = orders[orderId];
        if (ord.status != Status.Escrowed) revert NotEscrowed();
        if (msg.sender != ord.buyer) revert NotBuyer();
        if (block.timestamp < ord.deliverBy) revert TooEarly();
        ord.status = Status.Refunded;
        credits[ord.buyer] += ord.amount;
        emit Refunded(orderId, ord.amount);
    }

    /// @notice Send your credited balance to your wallet.
    function withdraw() external nonReentrant {
        uint256 amount = credits[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        credits[msg.sender] = 0;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, amount);
    }

    function setDeliveryWindow(uint64 seconds_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (seconds_ < 1 hours || seconds_ > 14 days) revert BadWindow();
        deliveryWindow = seconds_;
        emit DeliveryWindowSet(seconds_);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /// @notice Page through offers for the website (ids start at 1).
    function getOffers(uint256 fromId, uint256 count) external view returns (Offer[] memory list) {
        uint256 end = fromId + count;
        if (end > nextOfferId) end = nextOfferId;
        if (fromId == 0) fromId = 1;
        if (fromId >= end) return new Offer[](0);
        list = new Offer[](end - fromId);
        for (uint256 i = fromId; i < end; i++) list[i - fromId] = offers[i];
    }

    /// @notice Page through orders for the website (ids start at 1).
    function getOrders(uint256 fromId, uint256 count) external view returns (Order[] memory list) {
        uint256 end = fromId + count;
        if (end > nextOrderId) end = nextOrderId;
        if (fromId == 0) fromId = 1;
        if (fromId >= end) return new Order[](0);
        list = new Order[](end - fromId);
        for (uint256 i = fromId; i < end; i++) list[i - fromId] = orders[i];
    }
}
