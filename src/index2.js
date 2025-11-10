import { Environment, Para as ParaServer } from "@getpara/server-sdk";
import { ParaSolanaWeb3Signer } from "@getpara/solana-web3.js-v1-integration";
import {
  Connection,
  clusterApiUrl,
  SystemProgram,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import "dotenv/config";

const PARA_API_KEY = process.env.PARA_API_KEY;
const PARA_ENVIRONMENT = Environment.DEVELOPMENT;
const paraServer = new ParaServer(PARA_ENVIRONMENT, PARA_API_KEY);

// Set up Solana connection
const solanaConnection = new Connection(clusterApiUrl("devnet"));

// Create the Para Solana Signer
const solanaSigner = new ParaSolanaWeb3Signer(paraServer, solanaConnection);

// Get the wallet address
const walletAddress = solanaSigner.sender.toBase58();
console.log(`Wallet address: ${walletAddress}`);

// Create and send a transaction
const transaction = await solanaSigner.createTransaction({
  instructions: [
    SystemProgram.transfer({
      fromPubkey: solanaSigner.sender,
      toPubkey: new PublicKey("6nboEL1qiAMG2kWhcUubMGREBYMeLAr7ggt9ZDojh1XR"),
      lamports: 0.01 * LAMPORTS_PER_SOL,
    }),
  ],
});

const signature = await solanaSigner.sendTransaction(transaction);
console.log(`Transaction signature: ${signature}`);
