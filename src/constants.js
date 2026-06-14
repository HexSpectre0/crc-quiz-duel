// Shared constants for CRC Quiz Duel.
// Modeled on the Circles Jukebox example, adapted for PERSONAL CRC settlement.

export const RPC_URL = 'https://rpc.aboutcircles.com/';

// Fallback RPCs for receipt polling.
export const RPC_FALLBACKS = [
  RPC_URL,
  'https://rpc.gnosischain.com',
  'https://1rpc.io/gnosis',
];

// Circles Hub V2 (ERC-1155). Settlement is a native CRC transfer via
// safeTransferFrom(from, to, tokenId, amount, "0x").
// For PERSONAL CRC, tokenId == uint256(uint160(payerAddress)).
export const HUB_V2_ADDRESS = '0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8';

// Game config
export const QUESTIONS_PER_DUEL = 5;
export const SECONDS_PER_QUESTION = 15;

// 1 CRC = 1e18 wei (native Hub V2 balances are demurraged, 1e18 == 1 CRC at par)
export const ONE_CRC_WEI = 10n ** 18n;

// Your backend base URL (the API routes that hold match state / scoring).
// In dev with `vite --host`, the API can run separately; set this to your
// deployed backend or a local one. Empty string = same origin (if you proxy).
export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';
