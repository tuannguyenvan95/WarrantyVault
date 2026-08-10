import React, { useState, useEffect } from 'react';
import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { Icons } from './utils';
import { motion, AnimatePresence } from 'framer-motion';
import './index.css';

// We will let user paste their contract address or use VITE_CONTRACT_ADDRESS
const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || "";

export default function App() {
  const [client, setClient] = useState<any>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [warranties, setWarranties] = useState<any[]>([]);
  const [claims, setClaims] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState<'dashboard' | 'create' | 'claims'>('dashboard');

  useEffect(() => {
    const initClient = createClient({
      chain: studionet,
      provider: typeof window !== 'undefined' ? (window as any).ethereum : undefined
    });
    setClient(initClient);
    
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      (window as any).ethereum.request({ method: 'eth_accounts' }).then((accounts: string[]) => {
        if (accounts.length > 0) setAccount(accounts[0]);
      }).catch(console.error);
    }
  }, []);

  const connectWallet = async () => {
    try {
      if (!(window as any).ethereum) throw new Error('MetaMask is required');
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

  const fetchWarranties = async () => {
    if (!CONTRACT_ADDRESS || !client) return;
    try {
      setLoading(true);
      const res: any = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: 'get_all_warranties',
        args: []
      });
      const warrantiesObj = JSON.parse(res);
      setWarranties(Object.values(warrantiesObj));
      
      const claimsRes: any = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: 'get_all_claims',
        args: []
      });
      const claimsObj = JSON.parse(claimsRes);
      setClaims(Object.values(claimsObj));
    } catch (err: any) {
      console.error(err);
      setErrorMsg("Failed to fetch data from contract.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (account && CONTRACT_ADDRESS) {
      fetchWarranties();
    }
  }, [account, client]);

  // Forms
  const [productInfo, setProductInfo] = useState("");
  const [policyUrl, setPolicyUrl] = useState("");
  const [duration, setDuration] = useState("31536000"); // 1 year default
  const [amount, setAmount] = useState("");

  const handleCreateWarranty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !account) return;
    try {
      setLoading(true);
      const weiAmount = BigInt(parseFloat(amount) * 1e18);
      const { hash } = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'create_warranty',
        args: [policyUrl, productInfo, duration.toString()],
        value: weiAmount
      });
      await client.waitForTransactionReceipt({ hash });
      setSuccessMsg("Warranty created successfully!");
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
      const { hash } = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'file_claim',
        args: [activeWarrantyId, claimDesc, evidenceUrl]
      });
      await client.waitForTransactionReceipt({ hash });
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
      const { hash } = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'adjudicate_claim',
        args: [claimId]
      });
      await client.waitForTransactionReceipt({ hash });
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

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="glass-panel" style={{ borderRadius: 0, borderTop: 0, borderLeft: 0, borderRight: 0, padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Icons.Shield style={{ color: 'var(--accent-color)' }} />
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }} className="text-gradient">WarrantyVault</h1>
        </div>
        <div>
          {!account ? (
            <button className="btn btn-primary" onClick={connectWallet}>
              <Icons.Wallet style={{ marginRight: '0.5rem', width: 16, height: 16 }} />
              Connect Wallet
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                {account.slice(0,6)}...{account.slice(-4)}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="container" style={{ marginTop: '2rem', paddingBottom: '4rem' }}>
        
        {/* Alerts */}
        <AnimatePresence>
          {errorMsg && (
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger-color)', color: 'var(--danger-color)', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Icons.AlertTriangle /> {errorMsg}
            </motion.div>
          )}
          {successMsg && (
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ padding: '1rem', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--success-color)', color: 'var(--success-color)', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Icons.Check /> {successMsg}
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
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
              <button className={`btn ${activeTab === 'dashboard' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('dashboard')}>Dashboard</button>
              <button className={`btn ${activeTab === 'create' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('create')}>Create Warranty</button>
              <button className={`btn ${activeTab === 'claims' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('claims')}>Claims</button>
            </div>

            {loading && (
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid var(--border-color)', borderTopColor: 'var(--accent-color)', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }}></div>
                <p style={{ color: 'var(--text-secondary)' }}>Processing on GenLayer... this may take a moment for consensus.</p>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            )}

            {/* Dashboard Tab */}
            {activeTab === 'dashboard' && !loading && (
              <div>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>Active Warranties</h2>
                {warranties.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)' }}>No warranties found.</p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
                    {warranties.map((w, idx) => (
                      <div key={idx} className="card glass-panel">
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                          <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>ID: {w.id.toString()}</span>
                          <span className={`badge badge-${w.status.toLowerCase()}`}>{w.status}</span>
                        </div>
                        <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', fontWeight: 600 }}>{w.product_info}</h3>
                        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                          <a href={w.policy_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            Policy Link <Icons.ExternalLink style={{ width: 14, height: 14 }} />
                          </a>
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                          <div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>Locked Amount</span>
                            <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent-color)' }}>{Number(w.locked_amount) / 1e18} GEN</span>
                          </div>
                          {w.status === "ACTIVE" && (
                            <button className="btn btn-secondary" onClick={() => { setActiveWarrantyId(w.id.toString()); setActiveTab('claims'); }}>
                              File Claim
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Create Warranty Tab */}
            {activeTab === 'create' && !loading && (
              <div className="card glass-panel" style={{ maxWidth: '600px', margin: '0 auto' }}>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>Create Smart Warranty</h2>
                <form onSubmit={handleCreateWarranty}>
                  <div className="input-group">
                    <label className="input-label">Product Name / Description</label>
                    <input className="input-field" required value={productInfo} onChange={e => setProductInfo(e.target.value)} placeholder="e.g. MacBook Pro M3 Max" />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Warranty Policy (Public URL)</label>
                    <input className="input-field" type="url" required value={policyUrl} onChange={e => setPolicyUrl(e.target.value)} placeholder="https://example.com/policy.txt" />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Locked Deposit (GEN)</label>
                    <input className="input-field" type="number" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} placeholder="10.5" />
                  </div>
                  <div className="input-group" style={{ marginBottom: '2rem' }}>
                    <label className="input-label">Duration (Seconds)</label>
                    <input className="input-field" type="number" required value={duration} onChange={e => setDuration(e.target.value)} />
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
                    <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>File Claim for Warranty #{activeWarrantyId}</h2>
                    <form onSubmit={handleFileClaim}>
                      <div className="input-group">
                        <label className="input-label">Description of Issue</label>
                        <textarea className="input-field" required rows={3} value={claimDesc} onChange={e => setClaimDesc(e.target.value)} placeholder="Screen cracked after normal use..."></textarea>
                      </div>
                      <div className="input-group" style={{ marginBottom: '2rem' }}>
                        <label className="input-label">Evidence Link (Photo/Video/Invoice)</label>
                        <input className="input-field" type="url" required value={evidenceUrl} onChange={e => setEvidenceUrl(e.target.value)} placeholder="https://imgur.com/... or Google Drive public link" />
                      </div>
                      <div style={{ display: 'flex', gap: '1rem' }}>
                        <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setActiveWarrantyId(null)}>Cancel</button>
                        <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>Submit Claim</button>
                      </div>
                    </form>
                  </div>
                )}

                <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>All Claims</h2>
                {claims.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)' }}>No claims filed yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {claims.map((c, idx) => (
                      <div key={idx} className="card glass-panel">
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                          <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Claim ID: {c.id.toString()} | Warranty ID: {c.warranty_id.toString()}</span>
                          <span className={`badge badge-${c.status === "ADJUDICATED" ? (c.verdict || "ESCALATE").toLowerCase() : c.status.toLowerCase()}`}>
                            {c.status === "ADJUDICATED" ? c.verdict : c.status}
                          </span>
                        </div>
                        
                        <p style={{ color: 'var(--text-primary)', marginBottom: '1rem' }}><strong>Issue:</strong> {c.description}</p>
                        
                        {c.evidence_urls && c.evidence_urls.length > 0 && (
                          <div style={{ marginBottom: '1.5rem' }}>
                            <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Evidence:</span>
                            {c.evidence_urls.map((url: string, i: number) => (
                              <a key={i} href={url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem', background: 'rgba(255,255,255,0.05)', padding: '0.25rem 0.75rem', borderRadius: '99px', marginRight: '0.5rem' }}>
                                Link {i+1} <Icons.ExternalLink style={{ width: 12, height: 12 }} />
                              </a>
                            ))}
                          </div>
                        )}

                        {c.status === "PENDING" && (
                          <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                            <button className="btn btn-primary" onClick={() => handleAdjudicate(c.id.toString())}>
                              <Icons.Brain style={{ width: 16, height: 16, marginRight: '0.5rem' }} /> Adjudicate Claim via AI
                            </button>
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                              This will trigger a nondeterministic consensus mechanism on GenLayer.
                            </p>
                          </div>
                        )}

                        {c.status === "ADJUDICATED" && (
                          <div style={{ marginTop: '1rem', background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: 'var(--radius-md)', borderLeft: `3px solid var(--${c.verdict === 'COVERED' ? 'success' : c.verdict === 'REJECTED' ? 'danger' : c.verdict === 'PARTIAL' ? 'accent' : 'warning'}-color)` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                              <strong style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Icons.Brain style={{ width: 16, height: 16 }} /> AI Reasoning
                              </strong>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Confidence: {c.confidence.toString()}%</span>
                            </div>
                            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{c.reason}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
