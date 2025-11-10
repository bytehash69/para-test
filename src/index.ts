import { Environment, Para as ParaServer, WalletType } from "@getpara/server-sdk";
import { clusterApiUrl } from "@solana/web3.js";
import express from "express";
import "dotenv/config";

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
    pregenIdentifier: `+91${number}`,
    pregenIdentifierType: 'PHONE'
  });
  
  // Create a pregenerated wallet if needed
  if (!hasWallet) {
    const pregenWallet = await paraServer.createPregenWallet({
      type: WalletType.SOLANA, // or 'SOLANA', 'COSMOS'
      pregenIdentifier: `+91${number}`,
      pregenIdentifierType: 'PHONE'
    });
    
    // Now use the pregenerated wallet
    
    console.log(pregenWallet.address);

    res.json({ status: "Ok", pubkey: pregenWallet.address});
  }
})

app.listen(port, () => {
  console.log("Port running on: ", port);
})