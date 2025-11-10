import {
  Environment,
  Para as ParaServer,
  WalletType,
} from "@getpara/server-sdk";
import express from "express";
import "dotenv/config";
import { ParaSolanaWeb3Signer } from "@getpara/solana-web3.js-v1-integration";
import {
  Connection,
  clusterApiUrl,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";

const PARA_API_KEY = process.env.PARA_API_KEY;
const PARA_ENVIRONMENT = Environment.DEVELOPMENT;
const paraServer = new ParaServer(PARA_ENVIRONMENT, PARA_API_KEY);

const app = express();
const port = 8080;

app.use(express.json());

app.post("/create", async (req, res) => {
  const { number } = req.body;

  // Check if a wallet already exists for this identifier
  const hasWallet = await paraServer.hasPregenWallet({
    pregenIdentifier: number,
    pregenIdentifierType: "PHONE",
  });

  // Create a pregenerated wallet if needed
  if (!hasWallet) {
    const pregenWallet = await paraServer.createPregenWallet({
      type: WalletType.SOLANA, // or 'SOLANA', 'COSMOS'
      pregenIdentifier: number,
      pregenIdentifierType: "PHONE",
    });

    // Now use the pregenerated wallet

    console.log(pregenWallet.address);

    const userShare = paraServer.getUserShare();

    res.json({
      status: "Ok",
      walletId: pregenWallet.userId,
      pubkey: pregenWallet.address,
      userShare: userShare,
    });
  }
});

app.post("/sign", async (req, res) => {
  try {
    const number = req.body.number as string | undefined;
    const userShare = req.body.userShare as string;
    const receiver = req.body.receiver as string;
    const amount = req.body.amount as number;

    if (!number) {
      res.status(400).json({
        success: false,
        message: "Provide number in the request body",
      });
      return;
    }

    if (!PARA_API_KEY) {
      res
        .status(500)
        .json({ success: false, message: "PARA_API_KEY is not set" });
      return;
    }

    const para = new ParaServer(PARA_ENVIRONMENT, PARA_API_KEY);

    const hasPregenWallet = await paraServer.hasPregenWallet({
      pregenIdentifier: number,
      pregenIdentifierType: "PHONE",
    });

    if (!hasPregenWallet) {
      res.status(400).json({
        success: false,
        message: "No pre-generated wallet found for this number",
      });
      return;
    }

    await para.setUserShare(userShare);

    const connection = new Connection(clusterApiUrl("devnet"));
    const solanaSigner = new ParaSolanaWeb3Signer(para, connection);

    if (!solanaSigner.sender) {
      res.status(500).json({
        success: false,
        message: "Failed to initialize Solana sender address from Para wallet",
      });
      return;
    }

    // Get recent blockhash for the transaction
    const { blockhash } = await connection.getLatestBlockhash();

    const demoTx = new Transaction();
    demoTx.recentBlockhash = blockhash;
    demoTx.feePayer = solanaSigner.sender;

    const tx = demoTx.add(
      SystemProgram.transfer({
        fromPubkey: solanaSigner.sender,
        toPubkey: new PublicKey(receiver),
        lamports: amount * LAMPORTS_PER_SOL,
      }),
    );

    await solanaSigner.signTransaction(tx);

    const signature = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(signature);

    console.log("Sent:", signature);

    res.status(200).json({
      success: true,
      message: `Tx successful, sent ${amount} to ${receiver}`,
      sig: signature,
    });
  } catch (error) {
    console.error("Error in solanaPregenSignHandler:", error);
    res.status(500).json({
      success: false,
      message:
        error instanceof Error ? error.message : "Failed to sign transaction",
    });
  }
});

app.listen(port, () => {
  console.log("Port running on: ", port);
});
