import {
	Environment,
	Para as ParaServer,
	WalletType,
} from "@getpara/server-sdk";
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
import TelegramBot from "node-telegram-bot-api";

const PARA_API_KEY = process.env.PARA_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PARA_ENVIRONMENT = Environment.DEVELOPMENT;

if (!PARA_API_KEY) {
	throw new Error("PARA_API_KEY is not set in environment variables");
}

if (!TELEGRAM_BOT_TOKEN) {
	throw new Error("TELEGRAM_BOT_TOKEN is not set in environment variables");
}

const paraServer = new ParaServer(PARA_ENVIRONMENT, PARA_API_KEY);
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

// Store user shares with 6-digit keys (in production, use a database)
const userShareStore = new Map<string, string>(); // 6-digit key -> user share
const phoneToKey = new Map<string, string>(); // phone number -> 6-digit key

// Generate a random 6-digit key
function generateKey(): string {
	return Math.floor(100000 + Math.random() * 900000).toString();
}

// Get a unique 6-digit key
function getUniqueKey(): string {
	let key = generateKey();
	let attempts = 0;
	while (userShareStore.has(key) && attempts < 100) {
		key = generateKey();
		attempts++;
	}
	if (attempts >= 100) {
		throw new Error("Could not generate unique key");
	}
	return key;
}

// Command: /start
bot.onText(/\/start/, (msg) => {
	const chatId = msg.chat.id;
	bot.sendMessage(
		chatId,
		`Welcome to Para Wallet Bot! 🚀
  
  Available commands:
  /createwallet <phone_number> - Create a new Solana wallet
  /balance <6_digit_key> - Check your wallet balance
  /send <6_digit_key> <receiver> <amount> - Send SOL to an address
  /myaddress <6_digit_key> - Get your wallet address
  /help - Show this help message
  
  Example: /createwallet +1234567890`
	);
});

// Command: /help
bot.onText(/\/help/, (msg) => {
	const chatId = msg.chat.id;
	bot.sendMessage(
		chatId,
		`Available commands:
  
  /createwallet <phone_number> - Create a new Solana wallet
  Example: /createwallet +1234567890
  
  /balance <6_digit_key> - Check your wallet balance
  Example: /balance 123456
  
  /send <6_digit_key> <receiver> <amount> - Send SOL
  Example: /send 123456 ABC...XYZ 0.1
  
  /myaddress <6_digit_key> - Get your wallet address
  Example: /myaddress 123456
  
  Note: Keep your 6-digit key secret! It's required for all wallet operations.`
	);
});

// Command: /createwallet <phone_number>
bot.onText(/\/createwallet(?:\s+(.+))?/, async (msg, match) => {
	const chatId = msg.chat.id;

	const phoneNumber = match?.[1]?.trim();

	if (!phoneNumber) {
		bot.sendMessage(
			chatId,
			"Please provide your phone number.\n\nUsage: /createwallet +1234567890"
		);
		return;
	}

	try {
		bot.sendMessage(chatId, "Creating your wallet... ⏳");

		// Check if user already created a wallet with this phone
		const existingKey = phoneToKey.get(phoneNumber);
		if (existingKey) {
			bot.sendMessage(
				chatId,
				`You already created a wallet with this phone number!
  
  🔑 Your 6-digit key: ${existingKey}
  
  Use this key for all operations.`
			);
			return;
		}

		// Check if wallet already exists
		const hasWallet = await paraServer.hasPregenWallet({
			pregenIdentifier: phoneNumber,
			pregenIdentifierType: "PHONE",
		});

		if (hasWallet) {
			bot.sendMessage(
				chatId,
				"A wallet already exists for this phone number in the system."
			);
			return;
		}

		// Create a fresh Para instance for this wallet
		const para = new ParaServer(PARA_ENVIRONMENT, PARA_API_KEY);

		// Create pregenerated wallet
		const pregenWallet = await para.createPregenWallet({
			type: WalletType.SOLANA,
			pregenIdentifier: phoneNumber,
			pregenIdentifierType: "PHONE",
		});

		const userShare = para.getUserShare();

		// Generate unique 6-digit key
		const key = getUniqueKey();

		// Store user share with the key and link phone to key
		//@ts-ignore
		userShareStore.set(key, userShare);
		phoneToKey.set(phoneNumber, key);

		console.log(`Created wallet for ${phoneNumber} with key ${key}`);
		console.log(`Total wallets: ${userShareStore.size}`);

		bot.sendMessage(
			chatId,
			`✅ Wallet created successfully!
  
  📱 Phone: ${phoneNumber}
  📍 Address: ${pregenWallet.address}
  
  🔑 Your 6-digit key: ${key}
  
  ⚠️ IMPORTANT: Save this key securely!
  You need it for all operations (balance, send, etc.)
  
  Example usage:
  /balance ${key}
  /send ${key} <receiver_address> <amount>`
		);
	} catch (error) {
		console.error("Error creating wallet:", error);
		bot.sendMessage(
			chatId,
			`Error creating wallet: ${
				error instanceof Error ? error.message : "Unknown error"
			}`
		);
	}
});

// Command: /myaddress <6_digit_key>
bot.onText(/\/myaddress(?:\s+(.+))?/, async (msg, match) => {
	const chatId = msg.chat.id;

	const key = match?.[1]?.trim();

	if (!key) {
		bot.sendMessage(
			chatId,
			"Please provide your 6-digit key.\n\nUsage: /myaddress <your_6_digit_key>"
		);
		return;
	}

	try {
		const userShare = userShareStore.get(key);

		if (!userShare) {
			bot.sendMessage(
				chatId,
				"Invalid key. Please check your 6-digit key and try again."
			);
			return;
		}

		const para = new ParaServer(PARA_ENVIRONMENT, PARA_API_KEY);
		await para.setUserShare(userShare);

		const connection = new Connection(clusterApiUrl("devnet"));
		const solanaSigner = new ParaSolanaWeb3Signer(para, connection);

		if (!solanaSigner.sender) {
			bot.sendMessage(chatId, "Error: Could not retrieve wallet address.");
			return;
		}

		bot.sendMessage(
			chatId,
			`📍 Your Solana address:
  ${solanaSigner.sender.toBase58()}`
		);
	} catch (error) {
		console.error("Error getting address:", error);
		bot.sendMessage(
			chatId,
			`Error retrieving wallet address: ${
				error instanceof Error ? error.message : "Unknown error"
			}`
		);
	}
});

// Command: /balance <6_digit_key>
bot.onText(/\/balance(?:\s+(.+))?/, async (msg, match) => {
	const chatId = msg.chat.id;

	const key = match?.[1]?.trim();

	if (!key) {
		bot.sendMessage(
			chatId,
			"Please provide your 6-digit key.\n\nUsage: /balance <your_6_digit_key>"
		);
		return;
	}

	try {
		const userShare = userShareStore.get(key);

		if (!userShare) {
			bot.sendMessage(
				chatId,
				"Invalid key. Please check your 6-digit key and try again."
			);
			return;
		}

		bot.sendMessage(chatId, "Fetching balance... ⏳");

		const para = new ParaServer(PARA_ENVIRONMENT, PARA_API_KEY);
		await para.setUserShare(userShare);

		const connection = new Connection(clusterApiUrl("devnet"));
		const solanaSigner = new ParaSolanaWeb3Signer(para, connection);

		if (!solanaSigner.sender) {
			bot.sendMessage(chatId, "Error: Could not initialize wallet.");
			return;
		}

		const balance = await connection.getBalance(solanaSigner.sender);
		const solBalance = balance / LAMPORTS_PER_SOL;

		bot.sendMessage(
			chatId,
			`💰 Your balance: ${solBalance} SOL
  
  📍 Address: ${solanaSigner.sender.toBase58()}`
		);
	} catch (error) {
		console.error("Error getting balance:", error);
		bot.sendMessage(
			chatId,
			`Error retrieving balance: ${
				error instanceof Error ? error.message : "Unknown error"
			}`
		);
	}
});

// Command: /send <6_digit_key> <receiver> <amount>
bot.onText(/\/send(?:\s+(.+))?/, async (msg, match) => {
	const chatId = msg.chat.id;

	const args = match?.[1]?.trim();

	if (!args) {
		bot.sendMessage(
			chatId,
			"Usage: /send <6_digit_key> <receiver_address> <amount>\n\nExample: /send 123456 ABC...XYZ 0.1"
		);
		return;
	}

	const parts = args.split(/\s+/);

	if (parts.length < 3) {
		bot.sendMessage(
			chatId,
			"Invalid format. Usage: /send <6_digit_key> <receiver_address> <amount>"
		);
		return;
	}

	const key = parts[0];
	const receiver = parts[1];
	//@ts-ignore
	const amount = parseFloat(parts[2]);

	if (isNaN(amount) || amount <= 0) {
		bot.sendMessage(
			chatId,
			"Error: Invalid amount. Please provide a valid number."
		);
		return;
	}

	try {
		//@ts-ignore
		const userShare = userShareStore.get(key);

		if (!userShare) {
			bot.sendMessage(
				chatId,
				"Invalid key. Please check your 6-digit key and try again."
			);
			return;
		}

		bot.sendMessage(chatId, "Processing transaction... ⏳");

		const para = new ParaServer(PARA_ENVIRONMENT, PARA_API_KEY);
		await para.setUserShare(userShare);

		const connection = new Connection(clusterApiUrl("devnet"));
		const solanaSigner = new ParaSolanaWeb3Signer(para, connection);

		if (!solanaSigner.sender) {
			bot.sendMessage(chatId, "Error: Could not initialize wallet.");
			return;
		}

		// Validate receiver address
		let receiverPubkey: PublicKey;
		try {
			//@ts-ignore
			receiverPubkey = new PublicKey(receiver);
		} catch {
			bot.sendMessage(chatId, "Error: Invalid receiver address.");
			return;
		}

		// Get recent blockhash
		const { blockhash } = await connection.getLatestBlockhash();

		const demoTx = new Transaction();
		demoTx.recentBlockhash = blockhash;
		demoTx.feePayer = solanaSigner.sender;

		const tx = demoTx.add(
			SystemProgram.transfer({
				fromPubkey: solanaSigner.sender,
				toPubkey: receiverPubkey,
				lamports: amount * LAMPORTS_PER_SOL,
			})
		);

		await solanaSigner.signTransaction(tx);

		const signature = await connection.sendRawTransaction(tx.serialize());
		await connection.confirmTransaction(signature);

		bot.sendMessage(
			chatId,
			`✅ Transaction successful!
  
  Sent: ${amount} SOL
  From: ${solanaSigner.sender.toBase58()}
  To: ${receiver}
  Signature: ${signature}
  
  View on explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`
		);
	} catch (error) {
		console.error("Error sending transaction:", error);
		bot.sendMessage(
			chatId,
			`Error sending transaction: ${
				error instanceof Error ? error.message : "Unknown error"
			}`
		);
	}
});

console.log("Telegram bot is running... 🤖");
