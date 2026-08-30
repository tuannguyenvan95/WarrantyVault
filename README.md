# 🛡️ WarrantyVault: AI-Powered Decentralized Escrow & Adjudication Protocol

WarrantyVault is an Intelligent Contract protocol built on **GenLayer** that revolutionizes hardware warranty management. It secures customer claims and merchant escrows on-chain, utilizing decentralized AI validators (LLMs) to adjudicate disputes based on natural language warranty policies and claim evidence.

---

## 🎯 The Core Problem

1. **Corporate Bias**: Traditional warranty claims are reviewed by the merchants themselves, leading to conflicts of interest and unfair rejections.
2. **High Friction**: Claim resolution takes weeks, requiring manual paperwork and shipping before verification.
3. **Lack of Automation**: There is no trustless way to lock up warranty funds in escrow and automatically disburse them upon valid hardware failures.

---

## 💡 The GenLayer Solution

WarrantyVault implements a synthetic judicial system for consumer protection:
* **Trustless Escrow**: The merchant locks up warranty claim funds (in GEN) on-chain during creation.
* **AI Consensus Adjudication**: When a claim is filed, a decentralized jury of GenLayer AI validators reads the official policy, analyzes the customer's natural-language claim and web-hosted evidence (e.g. proof-of-damage images or logs), and reaches consensus on a verdict.
* **Instant On-Chain Settlements**: Payouts are executed automatically upon AI consensus, eliminating intermediaries.

---

## 🏗️ Protocol Architecture & Flow

```mermaid
sequenceDiagram
    autonumber
    participant Merchant as Retailer / Merchant
    participant Contract as WarrantyVault Contract
    participant Customer as Customer / Claimant
    participant AI as GenLayer AI Validators (LLM Consensus)

    Merchant->>Contract: create_warranty(deposit GEN, customer_address, policy_url, expiry)
    Note over Contract: Status: ACTIVE (Escrow Locked)
    
    Customer->>Contract: file_claim(warranty_id, claim_description, evidence_urls)
    Note over Contract: Status: CLAIMED (Awaiting Adjudication)

    Contract->>AI: Trigger Nondet Adjudication (Policy URL + Evidence URLs)
    Note over AI: Multi-LLM Review with Canary Token Verification
    AI->>Contract: Consensus Verdict (COVERED / REJECTED / PARTIAL / ESCALATE)

    alt Verdict: COVERED
        Contract->>Customer: Transfer 100% Escrow Payout
        Note over Contract: Status: CLOSED
    else Verdict: REJECTED
        Contract->>Merchant: Refund 100% Escrow
        Note over Contract: Status: CLOSED
    else Verdict: PARTIAL
        Contract->>Customer: Transfer 50% Escrow Payout
        Contract->>Merchant: Refund 50% Escrow
        Note over Contract: Status: CLOSED
    else Verdict: ESCALATE (Or Low AI Confidence / Error)
        Contract->>Contract: Transition to ESCALATED state
        Note over Contract: Either party can trigger release_escalated_funds() to split escrow 50/50
    end
```

---

## 🔒 Security Hardening (Milestone 1 Improvements)

We have upgraded the protocol with enterprise-grade blockchain AI security features:
1. **Prompt Injection Canary Defense**: All user-controlled parameters (`product_info`, `claim_description`, `evidence_urls`) are enclosed inside strict XML-like boundary tags in the LLM prompt. A deterministic, transaction-derived SHA-256 canary token is generated. The AI must return this token in its JSON response. Any mismatch triggers an immediate consensus veto and scales the state to `ESCALATE` to prevent prompt injection attacks from draining the escrow.
2. **Trusted Runtime Timestamp Parser**: Bypasses sandbox limitations (no standard library datetime imports allowed) with a manual, zero-dependency ISO-8601 parser. It extracts the trusted timestamp from `gl.message_raw['datetime']` to enforce strict warranty expiry validation.
3. **Address Normalization**: Input validation ensures that customer addresses conform to hex address specifications to prevent runtime VM crashes.
4. **Exceptions Standard**: Replaced generic exceptions with `UserError` to supply clear revert logs to the dApp frontend.

---

## 🛠️ Tech Stack & Structure

* **Smart Contract**: Python (GenVM Intelligent Contract framework)
* **Frontend**: React (Vite, TypeScript, Tailwind CSS, Framer Motion)
* **Web3 Library**: `genlayer-js`
* **Test Suite**: `gltest` (pytest for GenVM)

```
├── contracts/
│   └── warranty_vault.py        # Intelligent Contract
├── src/
│   ├── App.tsx                  # React Frontend dApp
│   └── main.tsx
├── scripts/
│   ├── e2e_onchain_test.js      # On-chain Integration Test Script
│   └── verify_contract.py       # AST Structure Verification Checks
├── tests/
│   └── test_warranty_vault.py   # Unit Test Suite
└── README.md
```

---

## 🚀 How to Run Locally

### 1. Prerequisite: Node.js & Python 3
Ensure you have Node.js (v18+) and Python (v3.10+) installed.

### 2. Install Dependencies
```bash
# Install frontend packages
npm install
```

### 3. Run Unit Tests
```bash
python -m unittest tests/test_warranty_vault.py
```

### 4. Run AST Validation
```bash
python scripts/verify_contract.py
```

### 5. Launch the Frontend
```bash
npm run dev
```

---

## 🌐 Deployed Network Config (GenLayer Studionet)

* **Target Network**: GenLayer Studionet
* **Contract Address**: `0x1B7a7b6A5701449811A4595b45D0492c47989Fd5`
* **Explorer URL**: [GenLayer Studio Explorer](https://explorer-studio.genlayer.com/address/0x1B7a7b6A5701449811A4595b45D0492c47989Fd5)
* **Live dApp URL**: [https://warranty-vault-genlayer.vercel.app](https://warranty-vault-genlayer.vercel.app)
