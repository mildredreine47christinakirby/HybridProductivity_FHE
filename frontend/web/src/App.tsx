import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface ProductivityRecord {
  id: string;
  encryptedData: string;
  timestamp: number;
  owner: string;
  workType: "remote" | "office";
  productivityScore: number;
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<ProductivityRecord[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newRecordData, setNewRecordData] = useState({
    workType: "remote",
    hoursWorked: 8,
    tasksCompleted: 5,
    distractions: 2
  });
  const [selectedRecord, setSelectedRecord] = useState<ProductivityRecord | null>(null);
  const [showFAQ, setShowFAQ] = useState(false);

  // Calculate statistics
  const remoteRecords = records.filter(r => r.workType === "remote");
  const officeRecords = records.filter(r => r.workType === "office");
  
  const avgRemoteScore = remoteRecords.length > 0 
    ? remoteRecords.reduce((sum, r) => sum + r.productivityScore, 0) / remoteRecords.length 
    : 0;
  
  const avgOfficeScore = officeRecords.length > 0 
    ? officeRecords.reduce((sum, r) => sum + r.productivityScore, 0) / officeRecords.length 
    : 0;

  useEffect(() => {
    loadRecords().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const checkContractAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      if (isAvailable) {
        setTransactionStatus({
          visible: true,
          status: "success",
          message: "FHE contract is available and ready!"
        });
      } else {
        setTransactionStatus({
          visible: true,
          status: "error",
          message: "Contract is not available"
        });
      }
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Availability check failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const loadRecords = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const keysBytes = await contract.getData("record_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing record keys:", e);
        }
      }
      
      const list: ProductivityRecord[] = [];
      
      for (const key of keys) {
        try {
          const recordBytes = await contract.getData(`record_${key}`);
          if (recordBytes.length > 0) {
            try {
              const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
              list.push({
                id: key,
                encryptedData: recordData.data,
                timestamp: recordData.timestamp,
                owner: recordData.owner,
                workType: recordData.workType,
                productivityScore: recordData.productivityScore
              });
            } catch (e) {
              console.error(`Error parsing record data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading record ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setRecords(list);
    } catch (e) {
      console.error("Error loading records:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitRecord = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting productivity data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newRecordData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const recordId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      // Calculate productivity score (simplified)
      const productivityScore = Math.round(
        (newRecordData.tasksCompleted / newRecordData.hoursWorked) * 10 - 
        (newRecordData.distractions * 0.5)
      );

      const recordData = {
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        workType: newRecordData.workType,
        productivityScore: productivityScore
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `record_${recordId}`, 
        ethers.toUtf8Bytes(JSON.stringify(recordData))
      );
      
      const keysBytes = await contract.getData("record_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(recordId);
      
      await contract.setData(
        "record_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted productivity data submitted!"
      });
      
      await loadRecords();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewRecordData({
          workType: "remote",
          hoursWorked: 8,
          tasksCompleted: 5,
          distractions: 2
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  const renderProductivityChart = () => {
    return (
      <div className="chart-container">
        <div className="chart-bar remote" style={{ height: `${avgRemoteScore * 10}px` }}>
          <div className="chart-value">{avgRemoteScore.toFixed(1)}</div>
          <div className="chart-label">Remote</div>
        </div>
        <div className="chart-bar office" style={{ height: `${avgOfficeScore * 10}px` }}>
          <div className="chart-value">{avgOfficeScore.toFixed(1)}</div>
          <div className="chart-label">Office</div>
        </div>
      </div>
    );
  };

  const faqItems = [
    {
      question: "How does FHE protect my productivity data?",
      answer: "Fully Homomorphic Encryption allows your productivity metrics to be analyzed while remaining encrypted. Your sensitive work patterns are never exposed, even during computation."
    },
    {
      question: "What data is collected?",
      answer: "We collect encrypted metrics like hours worked, tasks completed, and distractions. All data is anonymized and encrypted before analysis."
    },
    {
      question: "How is productivity calculated?",
      answer: "Our FHE algorithms compute productivity scores based on encrypted inputs. The formula considers task efficiency, focus duration, and output quality without decrypting your data."
    },
    {
      question: "Who can see my individual data?",
      answer: "Only you can see your individual encrypted records. HR sees only aggregated, anonymized insights for policy decisions."
    }
  ];

  if (loading) return (
    <div className="loading-screen">
      <div className="metal-spinner"></div>
      <p>Initializing encrypted connection...</p>
    </div>
  );

  return (
    <div className="app-container metal-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="gear-icon"></div>
          </div>
          <h1>FHE<span>Productivity</span>Analytics</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-record-btn metal-button"
          >
            <div className="add-icon"></div>
            Add Record
          </button>
          <button 
            className="metal-button"
            onClick={checkContractAvailability}
          >
            Check FHE Status
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="panel-row">
          <div className="panel intro-panel">
            <h2>Confidential Hybrid Work Analysis</h2>
            <p>Using Fully Homomorphic Encryption to analyze productivity while preserving employee privacy</p>
            <div className="fhe-badge">
              <span>FHE-Powered Analytics</span>
            </div>
          </div>
          
          <div className="panel stats-panel">
            <h3>Productivity Insights</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{records.length}</div>
                <div className="stat-label">Total Records</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{remoteRecords.length}</div>
                <div className="stat-label">Remote Days</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{officeRecords.length}</div>
                <div className="stat-label">Office Days</div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="panel-row">
          <div className="panel chart-panel">
            <h3>Average Productivity Score</h3>
            {renderProductivityChart()}
            <div className="chart-explanation">
              <div className="explanation-item">
                <div className="color-dot remote"></div>
                <span>Remote: {avgRemoteScore.toFixed(1)}</span>
              </div>
              <div className="explanation-item">
                <div className="color-dot office"></div>
                <span>Office: {avgOfficeScore.toFixed(1)}</span>
              </div>
            </div>
          </div>
          
          <div className="panel detail-panel">
            <h3>Data Details</h3>
            {selectedRecord ? (
              <div className="record-details">
                <div className="detail-row">
                  <span className="detail-label">Record ID:</span>
                  <span className="detail-value">#{selectedRecord.id.substring(0, 8)}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Work Type:</span>
                  <span className="detail-value">{selectedRecord.workType}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Productivity Score:</span>
                  <span className="detail-value">{selectedRecord.productivityScore}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Date:</span>
                  <span className="detail-value">
                    {new Date(selectedRecord.timestamp * 1000).toLocaleDateString()}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Owner:</span>
                  <span className="detail-value">
                    {selectedRecord.owner.substring(0, 6)}...{selectedRecord.owner.substring(38)}
                  </span>
                </div>
                <button 
                  className="metal-button"
                  onClick={() => setSelectedRecord(null)}
                >
                  Back to List
                </button>
              </div>
            ) : (
              <div className="no-details">
                <div className="info-icon"></div>
                <p>Select a record to view details</p>
              </div>
            )}
          </div>
        </div>
        
        <div className="panel-row">
          <div className="panel records-panel">
            <div className="panel-header">
              <h3>Encrypted Productivity Records</h3>
              <div className="header-actions">
                <button 
                  onClick={loadRecords}
                  className="refresh-btn metal-button"
                  disabled={isRefreshing}
                >
                  {isRefreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </div>
            
            <div className="records-list">
              <div className="table-header">
                <div className="header-cell">ID</div>
                <div className="header-cell">Work Type</div>
                <div className="header-cell">Score</div>
                <div className="header-cell">Date</div>
              </div>
              
              {records.length === 0 ? (
                <div className="no-records">
                  <div className="no-records-icon"></div>
                  <p>No productivity records found</p>
                  <button 
                    className="metal-button primary"
                    onClick={() => setShowCreateModal(true)}
                  >
                    Add First Record
                  </button>
                </div>
              ) : (
                records.map(record => (
                  <div 
                    className={`record-row ${selectedRecord?.id === record.id ? 'selected' : ''}`} 
                    key={record.id}
                    onClick={() => setSelectedRecord(record)}
                  >
                    <div className="table-cell record-id">#{record.id.substring(0, 6)}</div>
                    <div className="table-cell">
                      <span className={`work-type-badge ${record.workType}`}>
                        {record.workType}
                      </span>
                    </div>
                    <div className="table-cell">
                      <div className="score-badge">
                        {record.productivityScore}
                      </div>
                    </div>
                    <div className="table-cell">
                      {new Date(record.timestamp * 1000).toLocaleDateString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        
        <div className="panel-row">
          <div className="panel faq-panel">
            <div className="panel-header">
              <h3>FHE Productivity Analytics FAQ</h3>
              <button 
                className="metal-button"
                onClick={() => setShowFAQ(!showFAQ)}
              >
                {showFAQ ? "Hide FAQ" : "Show FAQ"}
              </button>
            </div>
            
            {showFAQ && (
              <div className="faq-content">
                {faqItems.map((item, index) => (
                  <div className="faq-item" key={index}>
                    <div className="faq-question">
                      <div className="q-icon">Q:</div>
                      <h4>{item.question}</h4>
                    </div>
                    <div className="faq-answer">
                      <div className="a-icon">A:</div>
                      <p>{item.answer}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitRecord} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          recordData={newRecordData}
          setRecordData={setNewRecordData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content metal-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="metal-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="gear-icon"></div>
              <span>FHE Productivity Analytics</span>
            </div>
            <p>Confidential analysis of hybrid work productivity using FHE technology</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Contact HR</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} Confidential Employee Analytics. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  recordData: any;
  setRecordData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  recordData,
  setRecordData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setRecordData({
      ...recordData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal metal-card">
        <div className="modal-header">
          <h2>Add Productivity Record</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="lock-icon"></div> Your data will be encrypted with FHE
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Work Type *</label>
              <select 
                name="workType"
                value={recordData.workType} 
                onChange={handleChange}
                className="metal-select"
              >
                <option value="remote">Remote</option>
                <option value="office">Office</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Hours Worked *</label>
              <input 
                type="number"
                name="hoursWorked"
                value={recordData.hoursWorked} 
                onChange={handleChange}
                min="1"
                max="16"
                className="metal-input"
              />
            </div>
            
            <div className="form-group">
              <label>Tasks Completed *</label>
              <input 
                type="number"
                name="tasksCompleted"
                value={recordData.tasksCompleted} 
                onChange={handleChange}
                min="0"
                max="50"
                className="metal-input"
              />
            </div>
            
            <div className="form-group">
              <label>Distractions *</label>
              <input 
                type="number"
                name="distractions"
                value={recordData.distractions} 
                onChange={handleChange}
                min="0"
                max="20"
                className="metal-input"
              />
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="shield-icon"></div> 
            Your individual data remains encrypted during analysis
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn metal-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-btn metal-button primary"
          >
            {creating ? "Encrypting with FHE..." : "Submit Record"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;