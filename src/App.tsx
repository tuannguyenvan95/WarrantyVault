import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from 'genlayer-js';
import { studionet as originalStudionet } from 'genlayer-js/chains';
import { Icons } from './utils';
import { motion, AnimatePresence } from 'framer-motion';
import { formatExpiryTime, canReleaseEscalated, getClaimBadgeClass, getClaimBadgeText, formatAddress, weiToEth, ethToWei } from './helpers';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { QRCodeCanvas } from 'qrcode.react';
import './index.css';

const studionet = {
  ...originalStudionet,
  rpcUrls: {
    default: { http: ['/api/genlayer'] }
  }
};

const CONTRACT_ADDRESS = "0x5443C7633B1A85F680D045e21f2C507CDCF24928";

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } }
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
};

export default function App() {
  const [client, setClient] = useState<any>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [warranties, setWarranties] = useState<any[]>([]);
  const [claims, setClaims] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingIPFS, setUploadingIPFS] = useState(false);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'create' | 'claims' | 'analytics'>('dashboard');
  const [selectedWarranty, setSelectedWarranty] = useState<any | null>(null);
  const [filterWarrantyId, setFilterWarrantyId] = useState<string>('all');
  
  const [userRole, setUserRole] = useState<'RETAILER' | 'CUSTOMER'>('RETAILER');
  const [newWarrantyId, setNewWarrantyId] = useState<string | null>(null);

  useEffect(() => {
    const initClient = createClient({
      chain: studionet,
      provider: typeof window !== 'undefined' ? (window as any).ethereum : undefined
    });
    setClient(initClient);
    
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      (window as any).ethereum.request({ method: 'eth_accounts' }).then((accounts: string[]) => {
        if (accounts.length > 0) {
          setAccount(accounts[0]);
          const newClient = createClient({
            chain: studionet,
            provider: (window as any).ethereum,
            account: accounts[0]
          } as any);
          setClient(newClient);
        }
      }).catch(console.error);
    }
  }, []);

  const connectWallet = async () => {
    try {
      if (!(window as any).ethereum) throw new Error('MetaMask is required');
      
      // Try to switch to GenLayer Studionet
      try {
        await (window as any).ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0xf22f' }], // 61999 in hex
        });
      } catch (switchError: any) {
        // If the network is not added to MetaMask
        if (switchError.code === 4902) {
          await (window as any).ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: '0xf22f',
                chainName: 'GenLayer Studionet',
                rpcUrls: ['https://studio.genlayer.com/api'],
                nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
              },
            ],
          });
        } else {
          throw switchError;
        }
      }

      const accounts = await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
      setAccount(accounts[0]);
      
      const newClient = createClient({
        chain: studionet,
        provider: (window as any).ethereum,
        account: accounts[0]
      } as any);
      setClient(newClient);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to connect wallet');
      setTimeout(() => setErrorMsg(null), 5000);
    }
  };

  const disconnectWallet = () => {
    setAccount(null);
    const newClient = createClient({
      chain: studionet,
      provider: typeof window !== 'undefined' ? (window as any).ethereum : undefined
    });
    setClient(newClient);
  };

  const fetchWarranties = useCallback(async () => {
    if (!CONTRACT_ADDRESS || !client) return;
    try {
      setLoading(true);
      const res: any = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: 'get_all_warranties',
        args: []
      });
      const warrantiesObj = typeof res === 'string' && res.trim() ? JSON.parse(res) : {};
      setWarranties(Object.values(warrantiesObj));
      
      const claimsRes: any = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: 'get_all_claims',
        args: []
      });
      const claimsObj = typeof claimsRes === 'string' && claimsRes.trim() ? JSON.parse(claimsRes) : {};
      setClaims(Object.values(claimsObj));
    } catch (err: any) {
      console.error(err);
      setErrorMsg(`Failed to fetch data from contract: ${err?.message || err}`);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (account && CONTRACT_ADDRESS) {
      fetchWarranties();
    }
  }, [account, client, fetchWarranties]);

  // Filtered claims based on selected warranty
  const filteredClaims = useMemo(() => {
    if (filterWarrantyId === 'all') {
      return claims;
    }
    return claims.filter(c => c.warranty_id.toString() === filterWarrantyId);
  }, [claims, filterWarrantyId]);

  // Forms
  const [productInfo, setProductInfo] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [category, setCategory] = useState("Electronics");
  const [customerAddress, setCustomerAddress] = useState("");
  
  const [policyUrl, setPolicyUrl] = useState("");
  const [duration, setDuration] = useState("31536000"); // 1 year default
  const [amount, setAmount] = useState("");

  const handleCreateWarranty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !account) return;
    
    // Debugging logs
    console.log("CONTRACT_ADDRESS", CONTRACT_ADDRESS);
    console.log("account", account);
    
    try {
      setLoading(true);
      const parsedAmount = parseFloat(amount.replace(',', '.'));
      const weiAmount = ethToWei(parsedAmount);
      
      const combinedProductInfo = `Product: ${productInfo}
Serial: ${serialNumber || 'N/A'}
Category: ${category}
Customer: ${customerAddress || 'N/A'}`;

      const durationSeconds = parseInt(duration);
      const expiryTimestamp = Math.floor(Date.now() / 1000) + durationSeconds;

      const hash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'create_warranty',
        args: [policyUrl, combinedProductInfo, expiryTimestamp.toString()],
        value: weiAmount
      } as any);
      const receipt = await client.waitForTransactionReceipt({ 
        hash,
        timeout: 120_000 // 2 minutes timeout for studionet
      });
      if (receipt.status === 'reverted' || receipt.status === 7 || receipt.status === 0 || String(receipt.status) === '0x0' || String(receipt.status) === '0x7') {
        throw new Error("Transaction was reverted by the GenLayer network! Please check your input or GEN balance.");
      }
      setSuccessMsg("Warranty created successfully!");
      setNewWarrantyId(productInfo);
      setTimeout(() => setSuccessMsg(null), 5000);
      setActiveTab('dashboard');
      fetchWarranties();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to create warranty");
      setTimeout(() => setErrorMsg(null), 5000);
    } finally {
      setLoading(false);
    }
  };

  // Claim
  const [activeWarrantyId, setActiveWarrantyId] = useState<string | null>(null);
  const [claimDesc, setClaimDesc] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");

  const handleFileClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !account || !activeWarrantyId) return;
    try {
      setLoading(true);
      const hash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'file_claim',
        args: [activeWarrantyId, claimDesc, evidenceUrl]
      } as any);
      const receipt = await client.waitForTransactionReceipt({ 
        hash,
        timeout: 120_000 
      });
      if (receipt.status === 'reverted' || receipt.status === 7 || receipt.status === 0 || String(receipt.status) === '0x0' || String(receipt.status) === '0x7') {
        throw new Error("Transaction was reverted by the network.");
      }
      setSuccessMsg("Claim filed successfully!");
      setTimeout(() => setSuccessMsg(null), 5000);
      setActiveWarrantyId(null);
      fetchWarranties();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to file claim");
      setTimeout(() => setErrorMsg(null), 5000);
    } finally {
      setLoading(false);
    }
  };

  const handleAdjudicate = async (claimId: string) => {
    if (!client || !account) return;
    try {
      setLoading(true);
      const hash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'adjudicate_claim',
        args: [claimId]
      } as any);
      const receipt = await client.waitForTransactionReceipt({ 
        hash,
        timeout: 120_000 
      });
      if (receipt.status === 'reverted') throw new Error("Transaction reverted by the network.");
      setSuccessMsg("Adjudication completed!");
      setTimeout(() => setSuccessMsg(null), 5000);
      fetchWarranties();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to adjudicate");
      setTimeout(() => setErrorMsg(null), 5000);
    } finally {
      setLoading(false);
    }
  };

  const handleReleaseEscalated = async (claimId: string) => {
    if (!client || !account) return;
    try {
      setLoading(true);
      const hash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'release_escalated_funds',
        args: [claimId]
      } as any);
      await client.waitForTransactionReceipt({ 
        hash,
        timeout: 120_000 
      });
      setSuccessMsg("Escalated funds released! 50/50 split applied.");
      setTimeout(() => setSuccessMsg(null), 5000);
      fetchWarranties();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to release funds");
      setTimeout(() => setErrorMsg(null), 5000);
    } finally {
      setLoading(false);
    }
  };
  const analyticsData = useMemo(() => {
    const verdictCounts: Record<string, number> = { COVERED: 0, REJECTED: 0, PARTIAL: 0, ESCALATE: 0 };
    claims.forEach(c => {
      if (c.status === 'ADJUDICATED' || c.status === 'RELEASED') {
        if (verdictCounts[c.verdict] !== undefined) {
          verdictCounts[c.verdict]++;
        }
      }
    });
    const pieData = Object.keys(verdictCounts)
      .map(key => ({ name: key, value: verdictCounts[key] }))
      .filter(item => item.value > 0);
      
    let cumulativeTVL = 0;
    const tvlTimeline = warranties.map(w => {
      cumulativeTVL += weiToEth(w.locked_amount);
      return { name: `W#${w.id.toString()}`, TVL: cumulativeTVL };
    });

    return { pieData, tvlTimeline };
  }, [claims, warranties]);

  const COLORS: Record<string, string> = {
    COVERED: '#10b981',
    REJECTED: '#ef4444',
    PARTIAL: '#3b82f6',
    ESCALATE: '#f59e0b'
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileUpload = (file: File) => {
    setUploadingIPFS(true);
    // Simulate IPFS upload delay
    setTimeout(() => {
      setEvidenceUrl(`ipfs://QmMockHash1234567890/${file.name.replace(/\s+/g, '_')}`);
      setUploadingIPFS(false);
      setSuccessMsg(`Evidence "${file.name}" uploaded to IPFS successfully!`);
      setTimeout(() => setSuccessMsg(null), 3000);
    }, 2000);
  };

  return (
    <div className="min-h-screen" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header className="glass-panel" style={{ borderRadius: 0, borderTop: 0, borderLeft: 0, borderRight: 0, padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Icons.Shield style={{ color: 'var(--accent-color)' }} />
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }} className="text-gradient">WarrantyVault</h1>
        </div>
        <div>
          {!account ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {/* Role Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: '999px', padding: '0.25rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                <button 
                  onClick={() => setUserRole('RETAILER')}
                  style={{ 
                    padding: '0.25rem 0.75rem', 
                    borderRadius: '999px', 
                    fontSize: '0.75rem', 
                    fontWeight: 600,
                    background: userRole === 'RETAILER' ? 'var(--accent-color)' : 'transparent',
                    color: userRole === 'RETAILER' ? '#fff' : 'var(--text-secondary)',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  🏢 Retailer
                </button>
                <button 
                  onClick={() => { setUserRole('CUSTOMER'); setActiveTab('dashboard'); }}
                  style={{ 
                    padding: '0.25rem 0.75rem', 
                    borderRadius: '999px', 
                    fontSize: '0.75rem', 
                    fontWeight: 600,
                    background: userRole === 'CUSTOMER' ? 'var(--accent-color)' : 'transparent',
                    color: userRole === 'CUSTOMER' ? '#fff' : 'var(--text-secondary)',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  🧑 Customer
                </button>
              </div>
              <button className="btn btn-primary" onClick={connectWallet}>
                <Icons.Wallet style={{ marginRight: '0.5rem', width: 16, height: 16 }} />
                Connect Wallet
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {/* Role Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: '999px', padding: '0.25rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                <button 
                  onClick={() => setUserRole('RETAILER')}
                  style={{ 
                    padding: '0.25rem 0.75rem', 
                    borderRadius: '999px', 
                    fontSize: '0.75rem', 
                    fontWeight: 600,
                    background: userRole === 'RETAILER' ? 'var(--accent-color)' : 'transparent',
                    color: userRole === 'RETAILER' ? '#fff' : 'var(--text-secondary)',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  🏢 Retailer
                </button>
                <button 
                  onClick={() => { setUserRole('CUSTOMER'); setActiveTab('dashboard'); }}
                  style={{ 
                    padding: '0.25rem 0.75rem', 
                    borderRadius: '999px', 
                    fontSize: '0.75rem', 
                    fontWeight: 600,
                    background: userRole === 'CUSTOMER' ? 'var(--accent-color)' : 'transparent',
                    color: userRole === 'CUSTOMER' ? '#fff' : 'var(--text-secondary)',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  🧑 Customer
                </button>
              </div>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.05)', padding: '0.5rem 1rem', borderRadius: '999px', border: '1px solid rgba(255,255,255,0.1)' }}>
                {formatAddress(account)}
              </span>
              <button className="btn btn-secondary" onClick={disconnectWallet} style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }} title="Disconnect Wallet">
                Disconnect
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="container" style={{ flex: 1, marginTop: '2rem', paddingBottom: '4rem', width: '100%' }}>
        
        {/* Toasts */}
        <div style={{ position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <AnimatePresence>
            {errorMsg && (
              <motion.div initial={{ opacity: 0, x: 50, scale: 0.9 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 50, scale: 0.9 }} style={{ padding: '1rem 1.5rem', background: 'rgba(239, 68, 68, 0.9)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', gap: '0.75rem', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', fontWeight: 500 }}>
                <Icons.AlertTriangle style={{ width: 20, height: 20 }} /> {errorMsg}
              </motion.div>
            )}
            {successMsg && (
              <motion.div initial={{ opacity: 0, x: 50, scale: 0.9 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 50, scale: 0.9 }} style={{ padding: '1rem 1.5rem', background: 'rgba(16, 185, 129, 0.9)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', gap: '0.75rem', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', fontWeight: 500 }}>
                <Icons.Check style={{ width: 20, height: 20 }} /> {successMsg}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* QR Code Modal */}
        <AnimatePresence>
          {newWarrantyId && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <motion.div initial={{ y: 50, scale: 0.9 }} animate={{ y: 0, scale: 1 }} exit={{ y: 50, scale: 0.9 }} className="card glass-panel" style={{ width: '100%', maxWidth: '400px', textAlign: 'center', padding: '3rem 2rem' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                  <Icons.Check style={{ width: '32px', height: '32px', color: 'var(--success-color)' }} />
                </div>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Warranty Created</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Scan this QR code to view the warranty on-chain.</p>
                <div style={{ background: '#fff', padding: '1.5rem', borderRadius: 'var(--radius-lg)', display: 'inline-block', marginBottom: '2rem', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                  <QRCodeCanvas value={`https://warrantyvault.app/verify/${encodeURIComponent(newWarrantyId)}`} size={200} />
                </div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '2rem' }}>{newWarrantyId}</h3>
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setNewWarrantyId(null)}>
                  Close
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {!CONTRACT_ADDRESS ? (
          <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
            <Icons.AlertTriangle style={{ margin: '0 auto 1rem', width: 48, height: 48, color: 'var(--warning-color)' }} />
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Contract Address Missing</h2>
            <p style={{ color: 'var(--text-secondary)' }}>Please deploy the smart contract on GenLayer Studio and set <code>VITE_CONTRACT_ADDRESS</code> in your .env file.</p>
          </div>
        ) : !account ? (
          <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
            <h2 style={{ fontSize: '2rem', marginBottom: '1rem' }} className="text-gradient">Decentralized AI Escrow & Adjudication</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', maxWidth: '600px', margin: '0 auto 2rem' }}>
              Lock funds in smart warranties. If disputes arise, GenLayer's nondeterministic validators act as decentralized judges to automatically fetch evidence and adjudicate claims based on your policy.
            </p>
            <button className="btn btn-primary" onClick={connectWallet} style={{ padding: '0.75rem 2rem', fontSize: '1rem' }}>
              Connect MetaMask to studionet
            </button>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', overflowX: 'auto', whiteSpace: 'nowrap' }}>
              <button className={`btn ${activeTab === 'dashboard' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('dashboard')}>Dashboard</button>
              {userRole === 'RETAILER' && (
                <>
                  <button className={`btn ${activeTab === 'analytics' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('analytics')}>
                    <Icons.Brain style={{ width: 16, height: 16, marginRight: '0.5rem', display: 'inline' }} /> Vault Analytics
                  </button>
                  <button className={`btn ${activeTab === 'create' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('create')}>Create Warranty</button>
                </>
              )}
              <button className={`btn ${activeTab === 'claims' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('claims')}>Claims</button>
            </div>

            {loading && (
              <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', border: '4px solid rgba(59, 130, 246, 0.1)', borderTopColor: 'var(--accent-color)', animation: 'spin 1s linear infinite', margin: '0 auto 1.5rem', boxShadow: '0 0 20px rgba(59, 130, 246, 0.2)' }}></div>
                <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', fontWeight: 600 }}>Syncing with GenLayer</h3>
                <p style={{ color: 'var(--text-secondary)' }}>Awaiting non-deterministic consensus from validators...</p>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            )}

            {/* Dashboard Tab */}
            {activeTab === 'dashboard' && !loading && (
              <div>
                {selectedWarranty ? (
                  // Warranty Detail View
                  <div>
                    <button 
                      className="btn btn-secondary" 
                      onClick={() => setSelectedWarranty(null)}
                      style={{ marginBottom: '1.5rem' }}
                    >
                      ← Back to Dashboard
                    </button>
                    <div className="card glass-panel" style={{ maxWidth: '800px', margin: '0 auto' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                        <h2 style={{ fontSize: '1.75rem', fontWeight: 700 }}>{selectedWarranty.product_info}</h2>
                        <span className={`badge badge-${selectedWarranty.status.toLowerCase()}`}>
                          {selectedWarranty.status === 'ACTIVE' && <span className="pulse-dot"></span>}
                          {selectedWarranty.status}
                        </span>
                      </div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                        <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.3)', borderRadius: 'var(--radius-md)' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Warranty ID</span>
                          <span style={{ fontSize: '1rem', fontWeight: 600 }}>#{selectedWarranty.id.toString()}</span>
                        </div>
                        <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.3)', borderRadius: 'var(--radius-md)' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Locked Amount</span>
                          <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent-color)' }}>{weiToEth(selectedWarranty.locked_amount)} GEN</span>
                        </div>
                        <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.3)', borderRadius: 'var(--radius-md)' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Time Remaining</span>
                          {(() => {
                            const expiryInfo = formatExpiryTime(selectedWarranty.expiry);
                            return (
                              <span style={{ fontSize: '1rem', fontWeight: 600, color: expiryInfo.isExpired ? 'var(--danger-color)' : 'var(--success-color)' }}>
                                {expiryInfo.text}
                              </span>
                            );
                          })()}
                        </div>
                        <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.3)', borderRadius: 'var(--radius-md)' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Creator</span>
                          <span style={{ fontSize: '0.875rem', fontWeight: 500, wordBreak: 'break-all' }}>{selectedWarranty.creator}</span>
                        </div>
                      </div>

                      <div style={{ marginBottom: '2rem' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>Warranty Policy</h3>
                        <a 
                          href={selectedWarranty.policy_url} 
                          target="_blank" 
                          rel="noreferrer" 
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: 'var(--radius-md)', fontSize: '0.875rem' }}
                        >
                          <Icons.ExternalLink style={{ width: 16, height: 16 }} /> {selectedWarranty.policy_url}
                        </a>
                      </div>

                      <div style={{ display: 'flex', gap: '1rem' }}>
                        {selectedWarranty.status === 'ACTIVE' && (
                          <button 
                            className="btn btn-primary" 
                            style={{ flex: 1, padding: '0.75rem' }}
                            onClick={() => { setActiveWarrantyId(selectedWarranty.id.toString()); setActiveTab('claims'); }}
                          >
                            File Claim for This Warranty
                          </button>
                        )}
                        <button 
                          className="btn btn-secondary" 
                          style={{ flex: 1, padding: '0.75rem' }}
                          onClick={() => {
                            setFilterWarrantyId(selectedWarranty.id.toString());
                            setActiveTab('claims');
                            setSelectedWarranty(null);
                          }}
                        >
                          View Claims for This Warranty
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  // Warranties Grid
                  <motion.div variants={containerVariants} initial="hidden" animate="show">
                    {userRole === 'RETAILER' && (
                      <div style={{ marginBottom: '3rem' }}>
                        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Vault Overview</h2>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
                          <div className="card glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', padding: '1.5rem' }}>
                            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(59, 130, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Icons.Shield style={{ color: 'var(--accent-color)', width: 24, height: 24 }} />
                            </div>
                            <div>
                              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Total Warranties</p>
                              <h3 style={{ fontSize: '1.75rem', fontWeight: 700 }}>{warranties.length}</h3>
                            </div>
                          </div>
                          <div className="card glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', padding: '1.5rem' }}>
                            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Icons.Wallet style={{ color: 'var(--success-color)', width: 24, height: 24 }} />
                            </div>
                            <div>
                              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Total Value Locked</p>
                              <h3 style={{ fontSize: '1.75rem', fontWeight: 700 }}>{warranties.reduce((acc, w) => acc + weiToEth(w.locked_amount), 0).toFixed(2)} GEN</h3>
                            </div>
                          </div>
                          <div className="card glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', padding: '1.5rem' }}>
                            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(139, 92, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Icons.Brain style={{ color: 'var(--warning-color)', width: 24, height: 24 }} />
                            </div>
                            <div>
                              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Pending Claims</p>
                              <h3 style={{ fontSize: '1.75rem', fontWeight: 700 }}>{claims.filter(c => c.status === 'PENDING').length}</h3>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>{userRole === 'RETAILER' ? 'All Warranties' : 'My Warranties'}</h2>
                    {warranties.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '4rem 2rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--border-color)' }}>
                        <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(59, 130, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                          <Icons.Shield style={{ width: '32px', height: '32px', color: 'var(--accent-color)' }} />
                        </div>
                        <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', fontWeight: 600 }}>No Warranties Yet</h3>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', maxWidth: '400px', margin: '0 auto 2rem' }}>
                          Your vault is empty. Secure your first product by creating a smart warranty backed by GenLayer.
                        </p>
                        <button className="btn btn-primary" onClick={() => setActiveTab('create')}>
                          Create Warranty
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
                        {warranties.map((w, idx) => {
                          const expiryInfo = formatExpiryTime(w.expiry);
                          return (
                            <motion.div 
                              variants={itemVariants}
                              key={idx} 
                              className="card glass-panel"
                              style={{ cursor: 'pointer' }}
                              whileHover={{ scale: 1.02 }}
                              onClick={() => setSelectedWarranty(w)}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>ID: {w.id.toString()}</span>
                                <span className={`badge badge-${w.status.toLowerCase()}`}>
                                  {w.status === 'ACTIVE' && <span className="pulse-dot"></span>}
                                  {w.status}
                                </span>
                              </div>
                              <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', fontWeight: 600 }}>{w.product_info.split('\n')[0].replace('Product: ', '')}</h3>
                              {w.product_info.includes('\n') && (
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', whiteSpace: 'pre-line', opacity: 0.8 }}>
                                  {w.product_info.split('\n').slice(1).join('\n')}
                                </p>
                              )}
                              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', marginTop: '1rem' }}>
                                <a href={w.policy_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }} onClick={e => e.stopPropagation()}>
                                  Policy Link <Icons.ExternalLink style={{ width: 14, height: 14 }} />
                                </a>
                              </p>
                              <p style={{ fontSize: '0.875rem', color: expiryInfo.isExpired ? 'var(--danger-color)' : 'var(--success-color)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                {expiryInfo.isExpired ? '⏰' : '⏱️'} {expiryInfo.text}
                              </p>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                                <div>
                                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>Locked Amount</span>
                                  <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent-color)' }}>{weiToEth(w.locked_amount)} GEN</span>
                                </div>
                                {w.status === "ACTIVE" && (
                                  <button className="btn btn-secondary" onClick={(e) => { e.stopPropagation(); setActiveWarrantyId(w.id.toString()); setActiveTab('claims'); }}>
                                    File Claim
                                  </button>
                                )}
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            )}

            {/* Analytics Tab */}
            {activeTab === 'analytics' && !loading && (
              <motion.div variants={containerVariants} initial="hidden" animate="show">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                  <h2 style={{ fontSize: '1.75rem' }}>Vault Analytics</h2>
                  <span className="badge badge-active"><span className="pulse-dot"></span> Live On-Chain Data</span>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem', marginBottom: '2rem' }}>
                  {/* Verdict Distribution Pie Chart */}
                  <div className="card glass-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', alignSelf: 'flex-start' }}>AI Verdict Distribution</h3>
                    {analyticsData.pieData.length > 0 ? (
                      <div style={{ width: '100%', height: 300 }}>
                        <ResponsiveContainer>
                          <PieChart>
                            <Pie
                              data={analyticsData.pieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={80}
                              outerRadius={120}
                              paddingAngle={5}
                              dataKey="value"
                            >
                              {analyticsData.pieData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[entry.name] || '#8884d8'} />
                              ))}
                            </Pie>
                            <Tooltip 
                              contentStyle={{ background: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                              itemStyle={{ color: 'white' }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                        No claims adjudicated yet.
                      </div>
                    )}
                    
                    <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                      {Object.keys(COLORS).map(key => (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                          <span style={{ width: 12, height: 12, borderRadius: '50%', background: COLORS[key] }}></span>
                          {key}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* TVL Timeline */}
                  <div className="card glass-panel">
                    <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Total Value Locked (TVL) Growth</h3>
                    {analyticsData.tvlTimeline.length > 0 ? (
                      <div style={{ width: '100%', height: 300 }}>
                        <ResponsiveContainer>
                          <BarChart data={analyticsData.tvlTimeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <XAxis dataKey="name" stroke="rgba(255,255,255,0.2)" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                            <YAxis stroke="rgba(255,255,255,0.2)" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                            <Tooltip 
                              contentStyle={{ background: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                              cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                              formatter={(value: any) => [`${value.toFixed(2)} GEN`, 'TVL']}
                            />
                            <Bar dataKey="TVL" fill="var(--accent-color)" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                        No TVL data available.
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Create Warranty Tab */}
            {activeTab === 'create' && !loading && (
              <div className="card glass-panel" style={{ maxWidth: '600px', margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h2 style={{ fontSize: '1.5rem' }}>Create Smart Warranty</h2>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem' }}
                    onClick={() => {
                      setProductInfo("MacBook Pro M3 Max (2023)");
                      setSerialNumber("C02XQ0ABCDEF");
                      setCategory("Electronics");
                      setCustomerAddress("0x742d35Cc6634C0532925a3b844Bc454e4438f44e");
                      setPolicyUrl("https://raw.githubusercontent.com/tuannguyenvan95/WarrantyVault/master/README.md");
                      setAmount("10.5");
                      setDuration("31536000");
                    }}
                  >
                    ✨ Fill Demo Data
                  </button>
                </div>
                <form onSubmit={handleCreateWarranty}>
                  <div className="input-group">
                    <label className="input-label">Product Name / Description</label>
                    <input className="input-field" required value={productInfo} onChange={e => setProductInfo(e.target.value)} placeholder="e.g. MacBook Pro M3 Max" />
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                    <div className="input-group" style={{ marginBottom: 0 }}>
                      <label className="input-label">Serial Number / IMEI</label>
                      <input className="input-field" value={serialNumber} onChange={e => setSerialNumber(e.target.value)} placeholder="e.g. C02X..." />
                    </div>
                    <div className="input-group" style={{ marginBottom: 0 }}>
                      <label className="input-label">Category</label>
                      <select className="input-field" value={category} onChange={e => setCategory(e.target.value)}>
                        <option value="Electronics">Electronics</option>
                        <option value="Automotive">Automotive</option>
                        <option value="Appliances">Appliances</option>
                        <option value="Real Estate">Real Estate</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>

                  <div className="input-group">
                    <label className="input-label">Customer Wallet / Email (Optional)</label>
                    <input className="input-field" value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} placeholder="0x... or user@email.com" />
                  </div>

                  <div className="input-group">
                    <label className="input-label">Warranty Policy (Public URL)</label>
                    <input className="input-field" type="url" required value={policyUrl} onChange={e => setPolicyUrl(e.target.value)} placeholder="https://example.com/policy.txt" />
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
                    <div className="input-group" style={{ marginBottom: 0 }}>
                      <label className="input-label">Locked Deposit (GEN)</label>
                      <input className="input-field" type="number" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} placeholder="10.5" />
                    </div>
                    <div className="input-group" style={{ marginBottom: 0 }}>
                      <label className="input-label">Duration</label>
                      <select className="input-field" required value={duration} onChange={e => setDuration(e.target.value)}>
                        <option value="2592000">1 Month</option>
                        <option value="15552000">6 Months</option>
                        <option value="31536000">1 Year</option>
                        <option value="63072000">2 Years</option>
                        <option value="94608000">3 Years</option>
                        <option value="157680000">5 Years</option>
                      </select>
                    </div>
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.75rem' }}>Create Warranty & Lock Funds</button>
                </form>
              </div>
            )}

            {/* Claims Tab */}
            {activeTab === 'claims' && !loading && (
              <div>
                {activeWarrantyId && (
                  <div className="card glass-panel" style={{ maxWidth: '600px', margin: '0 auto 2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                      <h2 style={{ fontSize: '1.5rem' }}>File Claim for Warranty #{activeWarrantyId}</h2>
                      <button 
                        type="button" 
                        className="btn btn-secondary" 
                        style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem' }}
                        onClick={() => {
                          setClaimDesc("My MacBook Pro screen cracked unexpectedly while I was using it. There was no physical impact or drop.");
                          setEvidenceUrl("https://raw.githubusercontent.com/tuannguyenvan95/WarrantyVault/master/src/assets/hero.png");
                        }}
                      >
                        ✨ Fill Demo Data
                      </button>
                    </div>
                    <form onSubmit={handleFileClaim}>
                      <div className="input-group">
                        <label className="input-label">Description of Issue</label>
                        <textarea className="input-field" required rows={3} value={claimDesc} onChange={e => setClaimDesc(e.target.value)} placeholder="Screen cracked after normal use..."></textarea>
                      </div>
                      <div className="input-group" style={{ marginBottom: '2rem' }}>
                        <label className="input-label">Evidence Link (Photo/Video/Invoice)</label>
                        
                        <div 
                          style={{
                            border: `2px dashed ${isDragging ? 'var(--accent-color)' : 'var(--border-color)'}`,
                            borderRadius: 'var(--radius-md)',
                            padding: '2rem',
                            textAlign: 'center',
                            background: isDragging ? 'rgba(59, 130, 246, 0.05)' : 'rgba(0,0,0,0.2)',
                            transition: 'all 0.2s ease',
                            cursor: 'pointer',
                            marginBottom: '1rem'
                          }}
                          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                          onDragLeave={() => setIsDragging(false)}
                          onDrop={handleDrop}
                          onClick={() => document.getElementById('file-upload')?.click()}
                        >
                          <input 
                            type="file" 
                            id="file-upload" 
                            style={{ display: 'none' }} 
                            onChange={(e) => {
                              if (e.target.files && e.target.files.length > 0) {
                                handleFileUpload(e.target.files[0]);
                              }
                            }} 
                          />
                          {uploadingIPFS ? (
                            <div style={{ color: 'var(--accent-color)', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                              <Icons.Brain style={{ animation: 'spin 2s linear infinite' }} /> Uploading to IPFS Network...
                            </div>
                          ) : (
                            <div>
                              <Icons.Layers style={{ width: 32, height: 32, margin: '0 auto 1rem', color: 'var(--text-secondary)' }} />
                              <p style={{ margin: 0, fontWeight: 500 }}>Drag & Drop evidence file here</p>
                              <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>or click to browse</p>
                            </div>
                          )}
                        </div>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', whiteSpace: 'nowrap' }}>OR paste URL:</span>
                          <input className="input-field" type="url" required value={evidenceUrl} onChange={e => setEvidenceUrl(e.target.value)} placeholder="ipfs://... or https://..." />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '1rem' }}>
                        <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setActiveWarrantyId(null)}>Cancel</button>
                        <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>Submit Claim</button>
                      </div>
                    </form>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                  <h2 style={{ fontSize: '1.5rem' }}>Claims {filterWarrantyId !== 'all' ? `for Warranty #${filterWarrantyId}` : ''}</h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Filter by Warranty:</label>
                    <select 
                      className="input-field" 
                      style={{ width: 'auto', minWidth: '200px' }}
                      value={filterWarrantyId}
                      onChange={e => setFilterWarrantyId(e.target.value)}
                    >
                      <option value="all">All Warranties</option>
                      {warranties.map(w => (
                        <option key={w.id.toString()} value={w.id.toString()}>
                          #{w.id.toString()} - {w.product_info.split('\n')[0].replace('Product: ', '').substring(0, 30)}
                        </option>
                      ))}
                    </select>
                    {filterWarrantyId !== 'all' && (
                      <button 
                        className="btn btn-secondary" 
                        onClick={() => setFilterWarrantyId('all')}
                        style={{ padding: '0.5rem 0.75rem' }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
                
                {filteredClaims.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '4rem 2rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--border-color)' }}>
                    <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(139, 92, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                      <Icons.AlertTriangle style={{ width: '32px', height: '32px', color: 'var(--warning-color)' }} />
                    </div>
                    <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', fontWeight: 600 }}>No Claims Found</h3>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', maxWidth: '400px', margin: '0 auto 2rem' }}>
                      {claims.length === 0 ? 'Everything is running smoothly. No claims have been filed yet.' : 'There are no claims associated with this specific warranty.'}
                    </p>
                    <button className="btn btn-secondary" onClick={() => setActiveTab('dashboard')}>
                      Return to Dashboard
                    </button>
                  </div>
                ) : (
                  <motion.div variants={containerVariants} initial="hidden" animate="show" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {filteredClaims.map((c, idx) => {
                      // Find the associated warranty for expiry info
                      const associatedWarranty = warranties.find(w => w.id.toString() === c.warranty_id.toString());
                      const expiryInfo = associatedWarranty ? formatExpiryTime(associatedWarranty.expiry) : null;
                      
                      return (
                      <motion.div variants={itemVariants} key={idx} className="card glass-panel">
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                          <div>
                            <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', display: 'block' }}>Claim ID: {c.id.toString()}</span>
                            <span style={{ fontSize: '0.875rem', color: 'var(--accent-color)', cursor: 'pointer' }} onClick={() => { setFilterWarrantyId(c.warranty_id.toString()); }}>
                              Warranty #{c.warranty_id.toString()}{associatedWarranty ? ` - ${associatedWarranty.product_info.split('\n')[0].replace('Product: ', '').substring(0, 30)}` : ''}
                            </span>
                            {expiryInfo && (
                              <span style={{ fontSize: '0.75rem', color: expiryInfo.isExpired ? 'var(--danger-color)' : 'var(--success-color)', display: 'block', marginTop: '0.25rem' }}>
                                {expiryInfo.isExpired ? '⏰' : '⏱️'} {expiryInfo.text}
                              </span>
                            )}
                          </div>
                          <span className={`badge badge-${getClaimBadgeClass(c)}`}>
                            {getClaimBadgeText(c)}
                          </span>
                        </div>
                        
                        <p style={{ color: 'var(--text-primary)', marginBottom: '1rem' }}><strong>Issue:</strong> {c.description}</p>
                        
                        {c.evidence_urls && c.evidence_urls.length > 0 && (
                          <div style={{ marginBottom: '1.5rem' }}>
                            <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Evidence:</span>
                            {c.evidence_urls.split(',').filter((url: string) => url.trim()).map((url: string, i: number) => (
                              <a key={i} href={url.trim()} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem', background: 'rgba(255,255,255,0.05)', padding: '0.25rem 0.75rem', borderRadius: '99px', marginRight: '0.5rem', marginBottom: '0.5rem' }}>
                                Link {i+1} <Icons.ExternalLink style={{ width: 12, height: 12 }} />
                              </a>
                            ))}
                          </div>
                        )}

                        {/* Audit Trail Timeline */}
                        <div className="audit-timeline" style={{ marginTop: '1.5rem', position: 'relative', paddingLeft: '1.5rem', borderLeft: '2px solid rgba(255,255,255,0.1)' }}>
                          {/* Step 1: Submitted */}
                          <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
                            <div style={{ position: 'absolute', left: '-1.85rem', top: '0', width: '12px', height: '12px', borderRadius: '50%', background: 'var(--success-color)' }}></div>
                            <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 0.25rem' }}>Claim Submitted</h4>
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>Evidence provided via IPFS.</p>
                          </div>
                          
                          {/* Step 2: Adjudication */}
                          <div style={{ position: 'relative', marginBottom: c.status === 'PENDING' ? '0' : '1.5rem' }}>
                            <div style={{ position: 'absolute', left: '-1.85rem', top: '0', width: '12px', height: '12px', borderRadius: '50%', background: c.status === 'PENDING' ? 'var(--warning-color)' : 'var(--success-color)' }}></div>
                            <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 0.25rem' }}>GenLayer Nondeterministic AI</h4>
                            {c.status === 'PENDING' ? (
                              <>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0 0 0.75rem' }}>Awaiting validator consensus to fetch evidence and execute LLM equivalence logic.</p>
                                {userRole === 'RETAILER' ? (
                                  <button className="btn btn-primary" onClick={() => handleAdjudicate(c.id.toString())} style={{ padding: '0.5rem 1rem', fontSize: '0.75rem' }}>
                                    <Icons.Brain style={{ width: 14, height: 14, marginRight: '0.5rem', display: 'inline' }} /> Trigger AI Adjudication
                                  </button>
                                ) : (
                                  <p style={{ fontSize: '0.75rem', color: 'var(--warning-color)' }}>Awaiting Retailer to trigger adjudication.</p>
                                )}
                              </>
                            ) : (
                              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>Consensus reached. Evidence analyzed.</p>
                            )}
                          </div>

                          {/* Step 3: Verdict */}
                          {c.status !== 'PENDING' && (
                            <div style={{ position: 'relative' }}>
                              <div style={{ position: 'absolute', left: '-1.85rem', top: '0', width: '12px', height: '12px', borderRadius: '50%', background: `var(--${c.verdict === 'COVERED' ? 'success' : c.verdict === 'REJECTED' ? 'danger' : c.verdict === 'PARTIAL' ? 'accent' : 'warning'}-color)` }}></div>
                              <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                AI Verdict: <span className={`badge badge-${c.verdict.toLowerCase()}`}>{c.verdict}</span>
                              </h4>
                              
                              <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: 'var(--radius-md)', borderLeft: `3px solid var(--${c.verdict === 'COVERED' ? 'success' : c.verdict === 'REJECTED' ? 'danger' : c.verdict === 'PARTIAL' ? 'accent' : 'warning'}-color)` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                  <strong style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                                    <Icons.Brain style={{ width: 14, height: 14 }} /> Reasoning Log
                                  </strong>
                                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Confidence: {c.confidence.toString()}%</span>
                                </div>
                                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{c.reason}</p>
                              </div>

                              {/* ESCALATE Release Button */}
                              {c.verdict === 'ESCALATE' && (() => {
                                const { canRelease, timeRemaining } = canReleaseEscalated(c);
                                return (
                                  <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                                    {canRelease ? (
                                      <>
                                        {userRole === 'RETAILER' && (
                                          <button className="btn btn-primary" onClick={() => handleReleaseEscalated(c.id.toString())} style={{ width: '100%', marginBottom: '0.5rem' }}>
                                            <Icons.Shield style={{ width: 16, height: 16, marginRight: '0.5rem' }} /> Release Escalated Funds (50/50 Split)
                                          </button>
                                        )}
                                        <p style={{ fontSize: '0.75rem', color: 'var(--success-color)', margin: 0 }}>
                                          ✓ 7-day timeout reached. Funds can be released.
                                        </p>
                                      </>
                                    ) : (
                                      <p style={{ fontSize: '0.875rem', color: 'var(--warning-color)', margin: 0 }}>
                                        ⏳ ESCALATE timeout: {formatExpiryTime(String(Math.floor(Date.now() / 1000) + timeRemaining)).text} until funds can be released.
                                      </p>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      </motion.div>
                      );
                    })}
                  </motion.div>
                )}
              </div>
            )}
          </>
        )}
      </main>
      
      {/* VIP Footer */}
      <footer style={{ 
        borderTop: '1px solid rgba(255,255,255,0.05)', 
        background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.5))',
        padding: '4rem 2rem 2rem', 
        marginTop: 'auto',
        color: 'var(--text-secondary)' 
      }}>
        <div className="container" style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
            gap: '3rem',
            marginBottom: '3rem'
          }}>
            {/* Branding Column */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <Icons.Layers style={{ color: 'var(--text-primary)', width: 24, height: 24 }} />
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>About the Project</h3>
              </div>
              <p style={{ lineHeight: 1.6, fontSize: '0.95rem', opacity: 0.8, marginBottom: '1.5rem' }}>
                The next-generation smart warranty platform powered by GenLayer. 
                Securing physical and digital products with AI-driven dispute resolution and decentralized escrow.
              </p>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <a href="https://github.com/tuannguyenvan95/WarrantyVault" target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ padding: '0.5rem', borderRadius: '50%' }} title="GitHub">
                  <Icons.Github style={{ width: 20, height: 20 }} />
                </a>
                <a href="#" className="btn btn-secondary" style={{ padding: '0.5rem', borderRadius: '50%' }} title="Twitter">
                  <Icons.Twitter style={{ width: 20, height: 20 }} />
                </a>
              </div>
            </div>

            {/* Quick Links */}
            <div>
              <h3 style={{ color: 'var(--text-primary)', fontSize: '1.1rem', fontWeight: 600, marginBottom: '1.5rem' }}>Quick Links</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <li><a href="#" style={{ color: 'inherit', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={e => e.currentTarget.style.color='var(--accent-color)'} onMouseOut={e => e.currentTarget.style.color='inherit'}>Dashboard Overview</a></li>
                <li><a href="#" style={{ color: 'inherit', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={e => e.currentTarget.style.color='var(--accent-color)'} onMouseOut={e => e.currentTarget.style.color='inherit'}>Create Smart Warranty</a></li>
                <li><a href="#" style={{ color: 'inherit', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={e => e.currentTarget.style.color='var(--accent-color)'} onMouseOut={e => e.currentTarget.style.color='inherit'}>File a Claim</a></li>
                <li><a href="#" style={{ color: 'inherit', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={e => e.currentTarget.style.color='var(--accent-color)'} onMouseOut={e => e.currentTarget.style.color='inherit'}>GenLayer Explorer</a></li>
              </ul>
            </div>

            {/* Technology */}
            <div>
              <h3 style={{ color: 'var(--text-primary)', fontSize: '1.1rem', fontWeight: 600, marginBottom: '1.5rem' }}>Technology</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <li>
                  <a href="https://genlayer.com" target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'inherit', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={e => e.currentTarget.style.color='var(--accent-color)'} onMouseOut={e => e.currentTarget.style.color='inherit'}>
                    <Icons.Layers style={{ width: 16, height: 16 }} /> GenLayer Intelligent Contracts
                  </a>
                </li>
                <li>
                  <a href="#" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'inherit', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={e => e.currentTarget.style.color='var(--accent-color)'} onMouseOut={e => e.currentTarget.style.color='inherit'}>
                    <Icons.Brain style={{ width: 16, height: 16 }} /> LLM Equivalence Principle
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div style={{ 
            borderTop: '1px solid rgba(255,255,255,0.05)', 
            paddingTop: '2rem', 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            flexWrap: 'wrap', 
            gap: '1rem',
            fontSize: '0.85rem'
          }}>
            <p style={{ margin: 0 }}>© 2026 WarrantyVault. All rights reserved.</p>
            <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              Built with <Icons.Heart style={{ width: 14, height: 14, color: '#ff4b4b' }} /> for the GenLayer Hackathon
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
