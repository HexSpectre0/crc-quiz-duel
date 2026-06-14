// src/circles.js
// Wallet + settlement layer, modeled on the Circles Jukebox example.
// Key difference: we settle in PERSONAL CRC (tokenId = uint256(payer address))
// and pay the WINNER (known only at the end), not a fixed treasury.

// @ts-nocheck
import { onWalletChange, sendTransactions, isMiniappMode } from '@aboutcircles/miniapp-sdk';
import { Sdk } from '@aboutcircles/sdk';
import { circlesConfig } from '@aboutcircles/sdk-utils';
import { hubV2Abi } from '@aboutcircles/sdk-abis';
import { getAddress, encodeFunctionData, createPublicClient, http } from 'viem';
import { gnosis } from 'viem/chains';
import { RPC_FALLBACKS, HUB_V2_ADDRESS, ONE_CRC_WEI } from './constants.js';

// Read-only SDK (indexer queries: profile, balances, trust).
// Lazy construction (AGENTS.md: never `new Sdk()` at module scope — can fail
// silently with a blank screen). Config: circlesConfig[100] for Gnosis Chain,
// the canonical source per AGENTS.md.
let _readSdk = null;
function getReadSdk() {
  if (!_readSdk) _readSdk = new Sdk(circlesConfig[100]);
  return _readSdk;
}

// viem clients for receipt polling (same pattern as jukebox).
const rpcClients = RPC_FALLBACKS.map((url) =>
  createPublicClient({ chain: gnosis, transport: http(url) })
);

export { onWalletChange, isMiniappMode };

// --- Reads -----------------------------------------------------------------

export async function getProfile(address) {
  const sdk = getReadSdk();
  try {
    return await sdk.rpc.profile.getProfileByAddress(getAddress(address));
  } catch {
    try {
      return await sdk.rpc.profile.getProfileByAddress(address.toLowerCase());
    } catch {
      return null;
    }
  }
}

// Trust graph -> friends list for matchmaking. We only match players linked in
// the trust graph (the social link is what guarantees settlement).
//
// Uses the official trust read: avatar.trust.getAll() returns aggregated
// relations, each with a `relation` field: 'trusts' | 'trustedBy' |
// 'mutuallyTrusts' | 'selfTrusts', plus subjectAvatar (me) and objectAvatar
// (the other person). We surface everyone with a trust link, ranking mutual
// trust highest (best settlement guarantee).
export async function getFriends(address) {
  const sdk = getReadSdk();
  const me = getAddress(address).toLowerCase();

  let relations = [];
  try {
    const avatar = await sdk.getAvatar(getAddress(address));
    relations = await avatar.trust.getAll();
  } catch (e) {
    console.warn('[circles] trust lookup failed:', e);
    return [];
  }

  const friends = [];
  for (const r of relations || []) {
    const relation = r.relation;
    if (relation === 'selfTrusts') continue; // skip self
    const other = String(r.objectAvatar || '').toLowerCase();
    if (!other || other === me) continue;
    const mutual = relation === 'mutuallyTrusts';
    friends.push({ address: other, mutual, relation, trustLevel: mutual ? 2 : 1 });
  }

  // mutual trust first (settlement guaranteed by the two-way social link)
  friends.sort((a, b) => b.trustLevel - a.trustLevel);
  return friends;
}

export async function getRandomOpponent(address) {
  const friends = await getFriends(address);
  if (friends.length === 0) return null;
  const mutuals = friends.filter((f) => f.mutual);
  const pool = mutuals.length > 0 ? mutuals : friends;
  return pool[Math.floor(Math.random() * pool.length)];
}

// --- Settlement: loser pays winner in personal CRC -------------------------

// Sends `stakeCrc` CRC of the LOSER's personal CRC to the winner.
// Called in the loser's wallet (Metri) after the result is known.
// tokenId for personal CRC == uint256(uint160(payerAddress)).
export async function settleLoss(loserAddress, winnerAddress, stakeCrc) {
  const from = getAddress(loserAddress);
  const to = getAddress(winnerAddress);
  const amountWei = BigInt(stakeCrc) * ONE_CRC_WEI;
  const tokenId = BigInt(from); // personal CRC token id = payer address as uint256

  const payTx = {
    to: getAddress(HUB_V2_ADDRESS),
    data: encodeFunctionData({
      abi: hubV2Abi,
      functionName: 'safeTransferFrom',
      args: [from, to, tokenId, amountWei, '0x'],
    }),
    value: '0x0',
  };

  const hashes = await sendTransactions([payTx]);
  if (!hashes || hashes.length === 0) {
    throw new Error('Wallet returned no transaction hash');
  }
  const receipt = await waitForReceipt(hashes[hashes.length - 1]);
  if (receipt.status !== 'success') {
    throw new Error('Transaction reverted on-chain');
  }
  return hashes[hashes.length - 1];
}

async function waitForReceipt(hash) {
  const POLL_MS = 3000;
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    for (const client of rpcClients) {
      try {
        const r = await client.getTransactionReceipt({ hash });
        if (r) return r;
      } catch {
        /* try next rpc */
      }
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error('Timed out waiting for transaction');
}
