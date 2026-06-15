/**
 * x402 server-side agent payment.
 *
 * A pre-funded testnet account (X402_AGENT_MNEMONIC) auto-pays the recipient
 * a small ALGO amount whenever a paid resource is used. This produces a REAL
 * on-chain transaction with a REAL txId — viewable on the Algorand explorer —
 * while keeping the payment fully automatic (no per-tx wallet popup), matching
 * the agentic-commerce x402 flow.
 *
 * If the agent isn't configured/funded, callers should fall back to demo-pay.
 */
import algosdk from 'algosdk';
import { getAlgodClient } from './wallet';

export interface AgentPaymentResult {
  txId: string;
  confirmedRound: number;
  amountMicroAlgos: number;
  amountAlgo: string;
  sender: string;
  recipient: string;
  explorerUrl: string;
}

export class AgentNotConfiguredError extends Error {}
export class AgentUnfundedError extends Error {}

function getAgentAccount(): algosdk.Account {
  const mnemonic = process.env.X402_AGENT_MNEMONIC?.trim();
  if (!mnemonic) {
    throw new AgentNotConfiguredError(
      'X402_AGENT_MNEMONIC is not set — real on-chain payments are disabled. Fund an agent wallet and run `npm run setup`.'
    );
  }
  return algosdk.mnemonicToSecretKey(mnemonic);
}

/** Address the agent pays from (for funding / balance display). */
export function getAgentAddress(): string | null {
  try {
    return getAgentAccount().addr.toString();
  } catch {
    return process.env.X402_AGENT_ADDRESS ?? null;
  }
}

/**
 * Send a real testnet ALGO micro-payment from the agent to the recipient.
 * Waits for confirmation and returns the on-chain txId.
 */
export async function sendAgentPayment(
  amountMicroAlgos?: number
): Promise<AgentPaymentResult> {
  const account = getAgentAccount();
  const sender = account.addr.toString();
  const recipient =
    process.env.X402_RECIPIENT_ADDRESS?.trim() ||
    'EW5HE3PN3K62CXZKPJPDLWV7REAKYESNVYDHQKJTD276BAU7BW6VXP777I';
  const amount =
    amountMicroAlgos ?? parseInt(process.env.X402_ALGO_AMOUNT || '50000', 10);

  const client = getAlgodClient();

  // Make sure the agent can actually pay (amount + min-balance + fee).
  const info = (await client.accountInformation(sender).do()) as { amount?: number | bigint };
  const balance = Number(info.amount ?? 0);
  if (balance < amount + 101_000) {
    throw new AgentUnfundedError(
      `Agent wallet ${sender} has insufficient balance (${balance} microALGO). Fund it at https://lora.algokit.io/testnet`
    );
  }

  const suggestedParams = await client.getTransactionParams().do();
  const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender,
    receiver: recipient,
    amount,
    suggestedParams,
    note: new Uint8Array(Buffer.from('x402:corrfarm')),
  });

  const signed = txn.signTxn(account.sk);
  const { txid } = await client.sendRawTransaction(signed).do();
  const confirmed = await algosdk.waitForConfirmation(client, txid, 6);
  const confirmedRound = Number(
    (confirmed as { confirmedRound?: number | bigint })['confirmedRound'] ?? 0
  );

  return {
    txId: txid,
    confirmedRound,
    amountMicroAlgos: amount,
    amountAlgo: (amount / 1_000_000).toFixed(6),
    sender,
    recipient,
    explorerUrl: `https://testnet.explorer.perawallet.app/tx/${txid}`,
  };
}
