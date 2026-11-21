// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title Sonae ledger anchor
/// @notice Once a day the Sonae server writes the latest hash of each GDA's
///         water ledger here. Anyone can then check that no past record of
///         turns and litres was changed.
contract LedgerAnchor is AccessControl {
    bytes32 public constant ANCHOR_ROLE = keccak256("ANCHOR_ROLE");

    /// gdaId => day (days since 1970-01-01) => ledger hash
    mapping(bytes32 => mapping(uint64 => bytes32)) public roots;

    event Anchored(bytes32 indexed gdaId, uint64 indexed day, bytes32 root, address by);

    error AlreadyAnchored();
    error EmptyRoot();

    constructor(address admin, address anchorer) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ANCHOR_ROLE, anchorer == address(0) ? admin : anchorer);
    }

    function anchor(bytes32 gdaId, uint64 day, bytes32 root) external onlyRole(ANCHOR_ROLE) {
        if (root == bytes32(0)) revert EmptyRoot();
        if (roots[gdaId][day] != bytes32(0)) revert AlreadyAnchored();
        roots[gdaId][day] = root;
        emit Anchored(gdaId, day, root, msg.sender);
    }
}
