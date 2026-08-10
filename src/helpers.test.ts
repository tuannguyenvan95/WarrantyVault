import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatExpiryTime,
  canReleaseEscalated,
  getClaimBadgeClass,
  getClaimBadgeText,
  formatAddress,
  ethToWei,
  weiToEth,
  ESCALATE_TIMEOUT,
} from './helpers';

describe('formatExpiryTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "Expired" for past timestamps', () => {
    const now = Math.floor(Date.now() / 1000);
    const pastTimestamp = String(now - 1000);
    const result = formatExpiryTime(pastTimestamp);
    expect(result.text).toBe('Expired');
    expect(result.isExpired).toBe(true);
  });

  it('returns "Expired" for zero timestamp', () => {
    const result = formatExpiryTime('0');
    expect(result.text).toBe('Expired');
    expect(result.isExpired).toBe(true);
  });

  it('formats minutes for short durations', () => {
    const now = Math.floor(Date.now() / 1000);
    const fiveMinutesLater = String(now + 300);
    const result = formatExpiryTime(fiveMinutesLater);
    expect(result.text).toBe('5m left');
    expect(result.isExpired).toBe(false);
  });

  it('formats hours and minutes for medium durations', () => {
    const now = Math.floor(Date.now() / 1000);
    const twoHoursLater = String(now + 7200);
    const result = formatExpiryTime(twoHoursLater);
    expect(result.text).toBe('2h 0m left');
    expect(result.isExpired).toBe(false);
  });

  it('formats days and hours for multi-day durations', () => {
    const now = Math.floor(Date.now() / 1000);
    const threeDaysLater = String(now + 259200);
    const result = formatExpiryTime(threeDaysLater);
    expect(result.text).toBe('3d 0h left');
    expect(result.isExpired).toBe(false);
  });

  it('formats months and days for month-long durations', () => {
    const now = Math.floor(Date.now() / 1000);
    const twoMonthsLater = String(now + 5184000); // ~60 days
    const result = formatExpiryTime(twoMonthsLater);
    expect(result.text).toMatch(/^\d+mo \d+d left$/);
    expect(result.isExpired).toBe(false);
  });

  it('formats years and days for year-long durations', () => {
    const now = Math.floor(Date.now() / 1000);
    const twoYearsLater = String(now + 63072000); // ~2 years
    const result = formatExpiryTime(twoYearsLater);
    expect(result.text).toMatch(/^\d+y \d+d left$/);
    expect(result.isExpired).toBe(false);
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

  it('returns false for non-ESCALATE verdict', () => {
    const claim = {
      verdict: 'COVERED',
      status: 'ADJUDICATED',
      adjudicated_at: '1704067200', // Jan 1, 2024
    };
    const result = canReleaseEscalated(claim);
    expect(result.canRelease).toBe(false);
    expect(result.timeRemaining).toBe(0);
  });

  it('returns false for non-ADJUDICATED status', () => {
    const claim = {
      verdict: 'ESCALATE',
      status: 'PENDING',
      adjudicated_at: '1704067200',
    };
    const result = canReleaseEscalated(claim);
    expect(result.canRelease).toBe(false);
    expect(result.timeRemaining).toBe(0);
  });

  it('returns false when adjudicated_at is 0', () => {
    const claim = {
      verdict: 'ESCALATE',
      status: 'ADJUDICATED',
      adjudicated_at: '0',
    };
    const result = canReleaseEscalated(claim);
    expect(result.canRelease).toBe(false);
    expect(result.timeRemaining).toBe(ESCALATE_TIMEOUT);
  });

  it('returns false when timeout not reached', () => {
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
    expect(result.timeRemaining).toBeLessThan(ESCALATE_TIMEOUT);
  });

  it('returns true when timeout reached', () => {
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
});

describe('getClaimBadgeClass', () => {
  it('returns "released" for RELEASED status', () => {
    const claim = { status: 'RELEASED', verdict: 'ESCALATE' };
    expect(getClaimBadgeClass(claim)).toBe('released');
  });

  it('returns verdict class for ADJUDICATED status', () => {
    expect(getClaimBadgeClass({ status: 'ADJUDICATED', verdict: 'COVERED' })).toBe('covered');
    expect(getClaimBadgeClass({ status: 'ADJUDICATED', verdict: 'REJECTED' })).toBe('rejected');
    expect(getClaimBadgeClass({ status: 'ADJUDICATED', verdict: 'PARTIAL' })).toBe('partial');
    expect(getClaimBadgeClass({ status: 'ADJUDICATED', verdict: 'ESCALATE' })).toBe('escalate');
  });

  it('returns lowercase status for other statuses', () => {
    expect(getClaimBadgeClass({ status: 'PENDING', verdict: '' })).toBe('pending');
    expect(getClaimBadgeClass({ status: 'ACTIVE', verdict: '' })).toBe('active');
  });

  it('defaults to "escalate" when verdict is missing for ADJUDICATED', () => {
    const claim = { status: 'ADJUDICATED', verdict: '' };
    expect(getClaimBadgeClass(claim)).toBe('escalate');
  });
});

describe('getClaimBadgeText', () => {
  it('returns "RELEASED" for RELEASED status', () => {
    const claim = { status: 'RELEASED', verdict: 'ESCALATE' };
    expect(getClaimBadgeText(claim)).toBe('RELEASED');
  });

  it('returns verdict for ADJUDICATED status', () => {
    expect(getClaimBadgeText({ status: 'ADJUDICATED', verdict: 'COVERED' })).toBe('COVERED');
    expect(getClaimBadgeText({ status: 'ADJUDICATED', verdict: 'REJECTED' })).toBe('REJECTED');
  });

  it('returns status for other statuses', () => {
    expect(getClaimBadgeText({ status: 'PENDING', verdict: '' })).toBe('PENDING');
  });
});

describe('formatAddress', () => {
  it('formats a valid Ethereum address', () => {
    const address = '0x1234567890abcdef1234567890abcdef12345678';
    expect(formatAddress(address)).toBe('0x1234...5678');
  });

  it('returns empty string for empty address', () => {
    expect(formatAddress('')).toBe('');
  });

  it('handles short addresses', () => {
    const address = '0x1234';
    expect(formatAddress(address)).toBe('0x1234...1234');
  });
});

describe('ethToWei', () => {
  it('converts 1 ETH to wei', () => {
    expect(ethToWei(1)).toBe(BigInt('1000000000000000000'));
  });

  it('converts 0.5 ETH to wei', () => {
    expect(ethToWei(0.5)).toBe(BigInt('500000000000000000'));
  });

  it('converts 10.5 ETH to wei', () => {
    expect(ethToWei(10.5)).toBe(BigInt('10500000000000000000'));
  });

  it('converts 0 ETH to 0 wei', () => {
    expect(ethToWei(0)).toBe(BigInt(0));
  });
});

describe('weiToEth', () => {
  it('converts wei to ETH as number', () => {
    expect(weiToEth(BigInt('1000000000000000000'))).toBe(1);
  });

  it('converts string wei to ETH', () => {
    expect(weiToEth('500000000000000000')).toBe(0.5);
  });

  it('converts 0 wei to 0 ETH', () => {
    expect(weiToEth(BigInt(0))).toBe(0);
  });
});
