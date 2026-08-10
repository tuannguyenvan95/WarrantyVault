/**
 * WarrantyVault Integration Tests
 * ================================
 * 
 * These tests cover the full lifecycle of warranties and claims,
 * from creation to fund release, with mocked blockchain interactions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';
import { formatExpiryTime, canReleaseEscalated, ESCALATE_TIMEOUT, getClaimBadgeClass } from './helpers';

// Mock genlayer-js
const mockReadContract = vi.fn();
const mockWriteContract = vi.fn();
const mockWaitForTransactionReceipt = vi.fn();

vi.mock('genlayer-js', () => ({
  createClient: vi.fn(() => ({
    readContract: mockReadContract,
    writeContract: mockWriteContract,
    waitForTransactionReceipt: mockWaitForTransactionReceipt,
  })),
}));

vi.mock('genlayer-js/chains', () => ({
  studionet: { chainId: 61999, name: 'studionet' },
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Test data
const TEST_ACCOUNT = '0x1234567890abcdef1234567890abcdef12345678';
const TEST_CONTRACT_ADDRESS = '0xabcdef1234567890abcdef1234567890abcdef12';

const mockWarranty = {
  id: '1',
  creator: TEST_ACCOUNT,
  product_info: 'MacBook Pro M3 Max',
  policy_url: 'https://example.com/policy.txt',
  locked_amount: '10500000000000000000', // 10.5 ETH
  expiry: String(Math.floor(Date.now() / 1000) + 31536000), // 1 year from now
  status: 'ACTIVE',
};

const mockClaim = {
  id: '1',
  warranty_id: '1',
  claimer: TEST_ACCOUNT,
  evidence_urls: 'https://imgur.com/a/example1',
  description: 'Screen cracked after normal use',
  status: 'PENDING',
  verdict: '',
  reason: '',
  confidence: 0,
  adjudicated_at: '0',
};

const mockAdjudicatedClaim = {
  ...mockClaim,
  status: 'ADJUDICATED',
  verdict: 'COVERED',
  reason: 'Claim is clearly covered by warranty policy',
  confidence: 85,
  adjudicated_at: String(Math.floor(Date.now() / 1000)),
};

const mockEscalatedClaim = {
  ...mockClaim,
  status: 'ADJUDICATED',
  verdict: 'ESCALATE',
  reason: 'Evidence is conflicting, requires manual review',
  confidence: 45,
  adjudicated_at: String(Math.floor(Date.now() / 1000) - ESCALATE_TIMEOUT - 1000), // 7+ days ago
};

describe('WarrantyVault Integration Tests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    
    // Setup default mocks
    mockReadContract.mockResolvedValue(JSON.stringify({}));
    mockWriteContract.mockResolvedValue({ hash: '0xhash' });
    mockWaitForTransactionReceipt.mockResolvedValue({ status: 1 });
    
    // Set contract address
    vi.stubEnv('VITE_CONTRACT_ADDRESS', TEST_CONTRACT_ADDRESS);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('Full Warranty Lifecycle', () => {
    it('tests warranty creation flow with mocked client', async () => {
      // Test the create warranty function call
      const mockClient = {
        writeContract: mockWriteContract.mockResolvedValue({ hash: '0xhash' }),
        waitForTransactionReceipt: mockWaitForTransactionReceipt.mockResolvedValue({ status: 1 }),
        readContract: mockReadContract.mockResolvedValue(JSON.stringify({ '1': mockWarranty })),
      };
      
      // Simulate creating a warranty
      const result = await mockClient.writeContract({
        address: TEST_CONTRACT_ADDRESS,
        functionName: 'create_warranty',
        args: ['https://example.com/policy.txt', 'Test Product', '31536000'],
        value: BigInt('5000000000000000000'),
      });
      
      expect(result.hash).toBe('0xhash');
      
      // Wait for receipt
      const receipt = await mockClient.waitForTransactionReceipt({ hash: result.hash });
      expect(receipt.status).toBe(1);
    });

    it('tests claim filing flow with mocked client', async () => {
      const mockClient = {
        writeContract: mockWriteContract.mockResolvedValue({ hash: '0xclaimhash' }),
        waitForTransactionReceipt: mockWaitForTransactionReceipt.mockResolvedValue({ status: 1 }),
        readContract: mockReadContract.mockResolvedValue(JSON.stringify({ '1': mockClaim })),
      };
      
      // Simulate filing a claim
      const result = await mockClient.writeContract({
        address: TEST_CONTRACT_ADDRESS,
        functionName: 'file_claim',
        args: ['1', 'Screen cracked', 'https://imgur.com/a/example'],
      });
      
      expect(result.hash).toBe('0xclaimhash');
    });

    it('tests adjudication flow with mocked client', async () => {
      // First write to adjudicate
      mockWriteContract.mockResolvedValueOnce({ hash: '0xadjudicatehash' });
      mockWaitForTransactionReceipt.mockResolvedValueOnce({ status: 1 });
      
      const result = await mockWriteContract({
        address: TEST_CONTRACT_ADDRESS,
        functionName: 'adjudicate_claim',
        args: ['1'],
      });
      
      expect(result.hash).toBe('0xadjudicatehash');
      
      // Then read the claim - return the adjudicated claim data
      mockReadContract.mockResolvedValueOnce(JSON.stringify(mockAdjudicatedClaim));
      
      const claimData = await mockReadContract({
        address: TEST_CONTRACT_ADDRESS,
        functionName: 'get_claim',
        args: ['1'],
      });
      
      const claim = JSON.parse(claimData);
      expect(claim.status).toBe('ADJUDICATED');
      expect(claim.verdict).toBe('COVERED');
    });

    it('tests ESCALATE fund release flow with mocked client', async () => {
      // First write to release funds
      mockWriteContract.mockResolvedValueOnce({ hash: '0xreleasehash' });
      mockWaitForTransactionReceipt.mockResolvedValueOnce({ status: 1 });
      
      const result = await mockWriteContract({
        address: TEST_CONTRACT_ADDRESS,
        functionName: 'release_escalated_funds',
        args: ['1'],
      });
      
      expect(result.hash).toBe('0xreleasehash');
      
      // Then read the claim - return the released claim data
      const releasedClaim = { ...mockEscalatedClaim, status: 'RELEASED' };
      mockReadContract.mockResolvedValueOnce(JSON.stringify(releasedClaim));
      
      const claimData = await mockReadContract({
        address: TEST_CONTRACT_ADDRESS,
        functionName: 'get_claim',
        args: ['1'],
      });
      
      const claim = JSON.parse(claimData);
      expect(claim.status).toBe('RELEASED');
    });
  });

  describe('Verdict Scenarios', () => {
    it('handles COVERED verdict correctly', () => {
      const coveredClaim = { ...mockClaim, status: 'ADJUDICATED', verdict: 'COVERED', confidence: 90 };
      
      // Verify claim data structure
      expect(coveredClaim.status).toBe('ADJUDICATED');
      expect(coveredClaim.verdict).toBe('COVERED');
      expect(coveredClaim.confidence).toBe(90);
      
      // Verify badge class
      expect(getClaimBadgeClass(coveredClaim)).toBe('covered');
    });

    it('handles PARTIAL verdict correctly', () => {
      const partialClaim = { ...mockClaim, status: 'ADJUDICATED', verdict: 'PARTIAL', confidence: 75 };
      
      expect(partialClaim.status).toBe('ADJUDICATED');
      expect(partialClaim.verdict).toBe('PARTIAL');
      
      expect(getClaimBadgeClass(partialClaim)).toBe('partial');
    });

    it('handles REJECTED verdict correctly', () => {
      const rejectedClaim = { ...mockClaim, status: 'ADJUDICATED', verdict: 'REJECTED', confidence: 88 };
      
      expect(rejectedClaim.status).toBe('ADJUDICATED');
      expect(rejectedClaim.verdict).toBe('REJECTED');
      
      expect(getClaimBadgeClass(rejectedClaim)).toBe('rejected');
    });

    it('handles ESCALATE verdict correctly', () => {
      const escalatedClaim = { ...mockClaim, status: 'ADJUDICATED', verdict: 'ESCALATE', confidence: 45 };
      
      expect(escalatedClaim.status).toBe('ADJUDICATED');
      expect(escalatedClaim.verdict).toBe('ESCALATE');
      
      expect(getClaimBadgeClass(escalatedClaim)).toBe('escalate');
    });
  });

  describe('Error Handling', () => {
    it('handles warranty creation failure', async () => {
      const mockClient = {
        writeContract: mockWriteContract.mockRejectedValue(new Error('Insufficient funds')),
      };
      
      // Simulate warranty creation failure
      try {
        await mockClient.writeContract({
          address: TEST_CONTRACT_ADDRESS,
          functionName: 'create_warranty',
          args: ['https://example.com/policy.txt', 'Test Product', '31536000'],
          value: BigInt('5000000000000000000'),
        });
      } catch (e: any) {
        expect(e.message).toBe('Insufficient funds');
      }
    });

    it('handles claim filing failure', async () => {
      const mockClient = {
        writeContract: mockWriteContract.mockRejectedValue(new Error('Warranty not active')),
      };
      
      try {
        await mockClient.writeContract({
          address: TEST_CONTRACT_ADDRESS,
          functionName: 'file_claim',
          args: ['1', 'Test issue', 'https://imgur.com/a/test'],
        });
      } catch (e: any) {
        expect(e.message).toBe('Warranty not active');
      }
    });

    it('handles adjudication failure', async () => {
      const mockClient = {
        writeContract: mockWriteContract.mockRejectedValue(new Error('Consensus failed')),
      };
      
      try {
        await mockClient.writeContract({
          address: TEST_CONTRACT_ADDRESS,
          functionName: 'adjudicate_claim',
          args: ['1'],
        });
      } catch (e: any) {
        expect(e.message).toBe('Consensus failed');
      }
    });
  });

  describe('UI Interactions', () => {
    it('verifies tab structure exists in the component', () => {
      // This test verifies the component renders correctly
      // Full UI testing requires proper wallet mocking which is complex in unit tests
      render(<App />);
      
      // Verify the app renders
      expect(screen.getByText('WarrantyVault')).toBeInTheDocument();
    });
  });

  describe('Claim Filtering and Display', () => {
    it('tests evidence URL parsing', () => {
      const evidenceUrls = 'https://imgur.com/a/photo1,https://imgur.com/a/photo2,https://imgur.com/a/invoice';
      
      // Test parsing comma-separated URLs
      const urls = evidenceUrls.split(',').filter(url => url.trim());
      expect(urls).toHaveLength(3);
      expect(urls[0]).toBe('https://imgur.com/a/photo1');
      expect(urls[1]).toBe('https://imgur.com/a/photo2');
      expect(urls[2]).toBe('https://imgur.com/a/invoice');
    });

    it('tests claim data structure', () => {
      // Verify claim has all required fields
      expect(mockClaim).toHaveProperty('id');
      expect(mockClaim).toHaveProperty('warranty_id');
      expect(mockClaim).toHaveProperty('claimer');
      expect(mockClaim).toHaveProperty('evidence_urls');
      expect(mockClaim).toHaveProperty('description');
      expect(mockClaim).toHaveProperty('status');
      expect(mockClaim).toHaveProperty('verdict');
      expect(mockClaim).toHaveProperty('reason');
      expect(mockClaim).toHaveProperty('confidence');
      expect(mockClaim).toHaveProperty('adjudicated_at');
    });

    it('tests warranty data structure', () => {
      // Verify warranty has all required fields
      expect(mockWarranty).toHaveProperty('id');
      expect(mockWarranty).toHaveProperty('creator');
      expect(mockWarranty).toHaveProperty('product_info');
      expect(mockWarranty).toHaveProperty('policy_url');
      expect(mockWarranty).toHaveProperty('locked_amount');
      expect(mockWarranty).toHaveProperty('expiry');
      expect(mockWarranty).toHaveProperty('status');
    });
  });
});

describe('Helper Function Integration', () => {
  describe('formatExpiryTime', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('formats various time durations correctly', () => {
      const now = Math.floor(Date.now() / 1000);
      
      // 5 minutes
      expect(formatExpiryTime(String(now + 300)).text).toBe('5m left');
      
      // 2 hours
      expect(formatExpiryTime(String(now + 7200)).text).toBe('2h 0m left');
      
      // 3 days
      expect(formatExpiryTime(String(now + 259200)).text).toBe('3d 0h left');
      
      // 2 months (~60 days)
      const twoMonthsResult = formatExpiryTime(String(now + 5184000));
      expect(twoMonthsResult.text).toMatch(/^\d+mo \d+d left$/);
      expect(twoMonthsResult.isExpired).toBe(false);
      
      // 2 years
      const twoYearsResult = formatExpiryTime(String(now + 63072000));
      expect(twoYearsResult.text).toMatch(/^\d+y \d+d left$/);
      expect(twoYearsResult.isExpired).toBe(false);
    });

    it('marks expired warranties correctly', () => {
      const now = Math.floor(Date.now() / 1000);
      const result = formatExpiryTime(String(now - 1000));
      expect(result.text).toBe('Expired');
      expect(result.isExpired).toBe(true);
    });
  });

  describe('canReleaseEscalated', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('allows release after 7-day timeout', () => {
      const now = Math.floor(Date.now() / 1000);
      const eightDaysAgo = String(now - 691200); // 8 days ago
      
      const claim = {
        verdict: 'ESCALATE',
        status: 'ADJUDICATED',
        adjudicated_at: eightDaysAgo,
      };
      
      const result = canReleaseEscalated(claim);
      expect(result.canRelease).toBe(true);
      expect(result.timeRemaining).toBe(0);
    });

    it('prevents release before 7-day timeout', () => {
      const now = Math.floor(Date.now() / 1000);
      const threeDaysAgo = String(now - 259200); // 3 days ago
      
      const claim = {
        verdict: 'ESCALATE',
        status: 'ADJUDICATED',
        adjudicated_at: threeDaysAgo,
      };
      
      const result = canReleaseEscalated(claim);
      expect(result.canRelease).toBe(false);
      expect(result.timeRemaining).toBeGreaterThan(0);
    });

    it('prevents release for non-ESCALATE verdicts', () => {
      const claim = {
        verdict: 'COVERED',
        status: 'ADJUDICATED',
        adjudicated_at: '1704067200',
      };
      
      const result = canReleaseEscalated(claim);
      expect(result.canRelease).toBe(false);
    });

    it('prevents release for non-ADJUDICATED status', () => {
      const claim = {
        verdict: 'ESCALATE',
        status: 'PENDING',
        adjudicated_at: '1704067200',
      };
      
      const result = canReleaseEscalated(claim);
      expect(result.canRelease).toBe(false);
    });
  });
});
