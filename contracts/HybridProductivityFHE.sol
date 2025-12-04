// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

// Minimal annotations for hybrid work productivity analysis.
contract HybridProductivityFHE is SepoliaConfig {
    struct EncryptedMetric {
        uint256 id;
        euint32 encryptedOutput;
        euint32 encryptedHours;
        euint32 encryptedTasks;
        uint256 timestamp;
    }

    struct RevealedMetric {
        uint256 output;
        uint256 hours;
        uint256 tasks;
        bool revealed;
    }

    uint256 public metricCount;
    mapping(uint256 => EncryptedMetric) private encryptedMetrics;
    mapping(uint256 => RevealedMetric) private revealedMetrics;

    mapping(string => euint32) private encryptedTaskCounters;
    string[] private taskCategories;

    mapping(uint256 => uint256) private requestToMetricId;
    mapping(uint256 => bytes32) private requestToCategoryHash;

    event MetricSubmitted(uint256 indexed id, uint256 timestamp);
    event MetricDecryptionRequested(uint256 indexed id);
    event MetricRevealed(uint256 indexed id);
    event CategoryCountDecryptionRequested(string category);
    event CategoryCountDecrypted(string category, uint32 count);

    modifier onlyEmployee(uint256 metricId) {
        _;
    }

    modifier onlyManager() {
        _;
    }

    function submitEncryptedMetric(
        euint32 encryptedOutput,
        euint32 encryptedHours,
        euint32 encryptedTasks
    ) external {
        metricCount += 1;
        uint256 newId = metricCount;

        encryptedMetrics[newId] = EncryptedMetric({
            id: newId,
            encryptedOutput: encryptedOutput,
            encryptedHours: encryptedHours,
            encryptedTasks: encryptedTasks,
            timestamp: block.timestamp
        });

        revealedMetrics[newId] = RevealedMetric({
            output: 0,
            hours: 0,
            tasks: 0,
            revealed: false
        });

        emit MetricSubmitted(newId, block.timestamp);
    }

    function requestMetricDecryption(uint256 metricId) external onlyEmployee(metricId) {
        require(!revealedMetrics[metricId].revealed, "Already revealed");

        EncryptedMetric storage em = encryptedMetrics[metricId];
        bytes32 ;
        ciphers[0] = FHE.toBytes32(em.encryptedOutput);
        ciphers[1] = FHE.toBytes32(em.encryptedHours);
        ciphers[2] = FHE.toBytes32(em.encryptedTasks);

        uint256 reqId = FHE.requestDecryption(ciphers, this.handleMetricDecryption.selector);
        requestToMetricId[reqId] = metricId;

        emit MetricDecryptionRequested(metricId);
    }

    function handleMetricDecryption(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 metricId = requestToMetricId[requestId];
        require(metricId != 0, "Invalid request");

        RevealedMetric storage rm = revealedMetrics[metricId];
        require(!rm.revealed, "Already revealed");

        FHE.checkSignatures(requestId, cleartexts, proof);

        uint256[] memory results = abi.decode(cleartexts, (uint256[]));
        rm.output = results[0];
        rm.hours = results[1];
        rm.tasks = results[2];
        rm.revealed = true;

        string memory category = string(abi.encodePacked("TaskCategory"));
        if (!FHE.isInitialized(encryptedTaskCounters[category])) {
            encryptedTaskCounters[category] = FHE.asEuint32(0);
            taskCategories.push(category);
        }
        encryptedTaskCounters[category] = FHE.add(encryptedTaskCounters[category], FHE.asEuint32(1));

        emit MetricRevealed(metricId);
    }

    function getRevealedMetric(uint256 metricId) external view returns (uint256 output, uint256 hours, uint256 tasks, bool revealed) {
        RevealedMetric storage r = revealedMetrics[metricId];
        return (r.output, r.hours, r.tasks, r.revealed);
    }

    function getEncryptedTaskCounter(string memory category) external view returns (euint32) {
        return encryptedTaskCounters[category];
    }

    function requestCategoryDecryption(string memory category) external onlyManager {
        euint32 count = encryptedTaskCounters[category];
        require(FHE.isInitialized(count), "Category unknown");

        bytes32 ;
        ciphers[0] = FHE.toBytes32(count);

        uint256 reqId = FHE.requestDecryption(ciphers, this.handleCategoryDecryption.selector);
        requestToCategoryHash[reqId] = keccak256(abi.encodePacked(category));

        emit CategoryCountDecryptionRequested(category);
    }

    function handleCategoryDecryption(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        bytes32 categoryHash = requestToCategoryHash[requestId];
        require(categoryHash != bytes32(0), "Unknown request");

        FHE.checkSignatures(requestId, cleartexts, proof);

        uint32 count = abi.decode(cleartexts, (uint32));
        string memory category = _categoryFromHash(categoryHash);
        emit CategoryCountDecrypted(category, count);
    }

    function _categoryFromHash(bytes32 h) private view returns (string memory) {
        for (uint i = 0; i < taskCategories.length; i++) {
            if (keccak256(abi.encodePacked(taskCategories[i])) == h) {
                return taskCategories[i];
            }
        }
        revert("Category not found");
    }

    receive() external payable {}
    fallback() external payable {}
}
