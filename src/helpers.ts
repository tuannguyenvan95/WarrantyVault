/**
 * Helper functions for WarrantyVault
 * These functions are extracted from App.tsx for better testability.
 */

// Helper to format expiry time in human-readable format
export const formatExpiryTime = (expiryTimestamp: string): { text: string; isExpired: boolean } => {
  const now = Math.floor(Date.now() / 1000);
  const expiry = parseInt(expiryTimestamp);
  const diff = expiry - now;
  
  if (diff <= 0) {
    return { text: 'Expired', isExpired: true };
  }
  
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  
  if (days > 365) {
    const years = Math.floor(days / 365);
    const remainingDays = days % 365;
    return { text: `${years}y ${remainingDays}d left`, isExpired: false };
  } else if (days > 30) {
    const months = Math.floor(days / 30);
    const remainingDays = days % 30;
    return { text: `${months}mo ${remainingDays}d left`, isExpired: false };
  } else if (days > 0) {
    return { text: `${days}d ${hours}h left`, isExpired: false };
  } else if (hours > 0) {
    return { text: `${hours}h ${minutes}m left`, isExpired: false };
  } else {
    return { text: `${minutes}m left`, isExpired: false };
  }
};

// ESCALATE timeout: 7 days in seconds (604800s)
export const ESCALATE_TIMEOUT = 604800;

// Helper to check if ESCALATE funds can be released
export const canReleaseEscalated = (claim: any): { canRelease: boolean; timeRemaining: number } => {
  if (claim.verdict !== 'ESCALATE' || claim.status !== 'ADJUDICATED') {
    return { canRelease: false, timeRemaining: 0 };
  }
  const now = Math.floor(Date.now() / 1000);
  const adjudicatedAt = parseInt(claim.adjudicated_at || '0');
  
  // If adjudicated_at timestamp is recorded, check dispute grace period
  if (adjudicatedAt > 0) {
    const elapsed = now - adjudicatedAt;
    if (elapsed >= ESCALATE_TIMEOUT) {
      return { canRelease: true, timeRemaining: 0 };
    }
    return { canRelease: true, timeRemaining: Math.max(0, ESCALATE_TIMEOUT - elapsed) };
  }
  
  // If timestamp not yet recorded, allow authorized release
  return { canRelease: true, timeRemaining: 0 };
};

// Helper to get badge class for claim status
export const getClaimBadgeClass = (claim: any): string => {
  if (claim.status === 'RELEASED') return 'released';
  if (claim.status === 'ADJUDICATED') {
    return (claim.verdict || 'ESCALATE').toLowerCase();
  }
  return claim.status.toLowerCase();
};

// Helper to get badge display text
export const getClaimBadgeText = (claim: any): string => {
  if (claim.status === 'RELEASED') return 'RELEASED';
  if (claim.status === 'ADJUDICATED') return claim.verdict;
  return claim.status;
};

// Helper to format wallet address
export const formatAddress = (address: string): string => {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

// Helper to convert ETH to Wei
export const ethToWei = (eth: number): bigint => {
  return BigInt(Math.floor(eth * 1e18));
};

// Helper to convert Wei to ETH
export const weiToEth = (wei: bigint | string): number => {
  return Number(wei) / 1e18;
};
