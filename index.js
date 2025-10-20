#!/usr/bin/env node

const { encodeFunctionData, createWalletClient, http, parseEther, createPublicClient } = require("viem");
const { encodeBatchExecution, BATCH_DEFAULT_MODE } = require("@metamask/delegation-utils");
const { hexToBytes, addHexPrefix } = require("@ethereumjs/util");
const { JsonRpcProvider } = require("@ethersproject/providers");
const { abiERC721, abiERC20 } = require("@metamask/metamask-eth-abis");
const { Contract } = require("@ethersproject/contracts");
const { privateKeyToAccount } = require("viem/accounts");
const { fromWei } = require("@metamask/ethjs-unit");
const { Wallet } = require("@ethereumjs/wallet");
const readlineSync = require("readline-sync");
const { sepolia } = require("viem/chains");
const { Command } = require("commander");
const path = require("path");
const fs = require("fs");

const multicallAbi = require("./multicall.json");
const abi = require("./abi.json");

const METAMASK_EIP7702_CONTRACT = "0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B";
const MULTICALL_CONTRACT = "0xcA11bde05977b3631167028862bE2a173976CA11";
const keystoreDir = path.join(__dirname, "keystore");

const NETWORK = {
  ethereum: "https://rpc.therpc.io/ethereum",
  bsc: "https://bsc-dataseed.binance.org",
  polygon: "https://polygon-rpc.com"
};

const derivePrivateKey = async (file, password) => {
  const relativePath = path.relative(__dirname, file);
  const absolutePath = path.resolve(__dirname, relativePath);
  const keystore = JSON.parse(fs.readFileSync(absolutePath, "utf-8"));
  const wallet = await Wallet.fromV3(keystore, password);
  const privateKey = wallet.getPrivateKeyString();
  return privateKey;
};

const getFirstKeystoreFile = () => {
  const files = fs.readdirSync(keystoreDir);
  const keystoreFiles = files.filter((file) => file.startsWith("UTC--"));
  if (keystoreFiles.length === 0) {
    return null;
  }
  return path.join(keystoreDir, keystoreFiles[0]);
};

const validateKeystore = (keystore) => {
  if (!keystore) {
    throw new Error("No keystore file provided");
  }
  const relativePath = path.relative(__dirname, keystore);
  const absolutePath = path.resolve(__dirname, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Keystore file ${absolutePath} does not exist`);
  }
};

const createClient = (account) => {
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http()
  });
  return walletClient;
};

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http()
});

const program = new Command();

program
  .name("test-eip-7702")
  .description("test for EIP-7702")
  .version("1.0.0", "-v, --version", "Output the current version")
  .option(
    "-k, --keystore [keystore]",
    "keystore file, default is the first file that starts with 'UTC--' in the keystore directory",
    getFirstKeystoreFile()
  );

program
  .command("import-private-key")
  .description("import private key to keystore")
  .action(async () => {
    const secret = readlineSync.question("Private key:", {
      hideEchoBack: true
    });
    const wallet = Wallet.fromPrivateKey(hexToBytes(addHexPrefix(secret)));
    const filename = wallet.getV3Filename();
    const password = readlineSync.question("Password:", { hideEchoBack: true });
    const keystore = await wallet.toV3(password);
    fs.writeFileSync(path.join(keystoreDir, filename), JSON.stringify(keystore, null, 2), "utf-8");
  });

program
  .command("derive-private-key")
  .description("export private key from keystore")
  .action(async () => {
    const { keystore } = program.opts();
    validateKeystore(keystore);
    const password = readlineSync.question("Password:", { hideEchoBack: true });
    const privateKey = await derivePrivateKey(keystore, password);
    const eoa = privateKeyToAccount(privateKey);
    console.log(`EOA address: ${eoa.address}`);
    console.log(`Private key: ${privateKey}`);
  });

program
  .command("revoke")
  .description("revoke metamask eip7702 contract authorization")
  .action(async () => {
    const { keystore } = program.opts();
    validateKeystore(keystore);
    const password = readlineSync.question("Password:", { hideEchoBack: true });
    const privateKey = await derivePrivateKey(keystore, password);
    const eoa = privateKeyToAccount(privateKey);
    console.log(`EOA address: ${eoa.address}`);
    const walletClient = createClient(eoa);
    const nonce = await publicClient.getTransactionCount({
      address: eoa.address,
      blockTag: "latest"
    });
    console.log(`Nonce: ${nonce}`);
    const authorization = await walletClient.signAuthorization({
      account: eoa,
      contractAddress: "0x0000000000000000000000000000000000000000",
      executor: "self"
    });
    console.log(`Authorization: `, authorization);
    const hash = await walletClient.sendTransaction({
      to: eoa.address,
      authorizationList: [authorization]
    });
    console.log(`Transaction hash: ${hash}`);
  });

program
  .command("authorize")
  .description("authorize to metamask eip7702 contract")
  .action(async () => {
    const { keystore } = program.opts();
    validateKeystore(keystore);
    const password = readlineSync.question("Password:", { hideEchoBack: true });
    const privateKey = await derivePrivateKey(keystore, password);
    const eoa = privateKeyToAccount(privateKey);
    console.log(`EOA address: ${eoa.address}`);
    const walletClient = createClient(eoa);
    const nonce = await publicClient.getTransactionCount({
      address: eoa.address,
      blockTag: "latest"
    });
    console.log(`Nonce: ${nonce}`);
    const authorization = await walletClient.signAuthorization({
      account: eoa,
      contractAddress: METAMASK_EIP7702_CONTRACT,
      executor: "self"
    });
    console.log(`Authorization: `, authorization);
    const hash = await walletClient.sendTransaction({
      to: eoa.address,
      authorizationList: [authorization]
    });
    console.log(`Transaction hash: ${hash}`);
  });

program
  .command("batch-transfer")
  .description("batch transfer eth to multiple addresses")
  .argument("<amount>", "amount to transfer")
  .argument("<destinations...>", "destination addresses")
  .action(async (amount, destinations) => {
    const { keystore } = program.opts();
    validateKeystore(keystore);
    const password = readlineSync.question("Password:", { hideEchoBack: true });
    const privateKey = await derivePrivateKey(keystore, password);
    const eoa = privateKeyToAccount(privateKey);
    console.log(`EOA address: ${eoa.address}`);
    const walletClient = createClient(eoa);
    const calldata = encodeBatchExecution(
      destinations.map((destination) => {
        return {
          target: destination,
          value: parseEther(amount),
          callData: "0x"
        };
      })
    );
    console.log(`Calldata: ${calldata}`);
    const hash = await walletClient.sendTransaction({
      data: encodeFunctionData({
        abi,
        functionName: "execute",
        args: [BATCH_DEFAULT_MODE, calldata]
      }),
      to: eoa.address
    });
    console.log(`Transaction hash: ${hash}`);
  });

program
  .command("get-code")
  .description("get code of the account")
  .argument("<account>", "account address")
  .action(async (address) => {
    const byteCode = await publicClient.getCode({
      address
    });
    console.log(`Byte code: ${byteCode}`);
  });

program
  .command("fetch-balances")
  .description("fetch balances of the accounts using multicall")
  .argument("<network>", "Blockchain network (e.g., ethereum, bsc, polygon)")
  .argument("<account...>", "account address")
  .action(async (network, accounts) => {
    const rpcNode = NETWORK[network];
    if (!rpcNode) {
      console.error(`Unsupported network: ${network}`);
      return;
    }
    const multicallContract = new Contract(MULTICALL_CONTRACT, multicallAbi, new JsonRpcProvider(rpcNode));

    const calls = accounts.map((account) => {
      return {
        contract: multicallContract,
        functionSignature: "getEthBalance(address)",
        arguments: [account]
      };
    });

    const calldata = calls.map((call) => ({
      target: call.contract.address,
      callData: call.contract.interface.encodeFunctionData(
        call.contract.interface.functions[call.functionSignature],
        call.arguments
      )
    }));

    const results = await multicallContract.callStatic.tryAggregate(false, calldata);

    const balances = results.map((r, i) => ({
      success: r.success,
      value:
        r.success && r.returnData !== "0x"
          ? calls[i].contract.interface.decodeFunctionResult(calls[i].functionSignature, r.returnData)[0]
          : undefined
    }));
    const len = accounts.length;
    for (let i = 0; i < len; i++) {
      const { value } = balances[i];
      const account = accounts[i];
      console.log(`${account} balance: `, value ? fromWei(value.toString(), "ether") : undefined);
    }
  });

program
  .command("erc721")
  .description("fetch ERC721 token info")
  .argument("<network>", "Blockchain network (e.g., ethereum, bsc, polygon)")
  .argument("<contractAddress>", "NFT contract address")
  .argument("[tokenId]", "NFT token ID")
  .action(async (network, contractAddress, tokenId) => {
    const rpcNode = NETWORK[network];
    if (!rpcNode) {
      console.error(`Unsupported network: ${network}`);
      return;
    }

    const contract = new Contract(contractAddress, abiERC721, new JsonRpcProvider(rpcNode));
    const name = await contract.callStatic.name();
    const totalSupply = await contract.callStatic.totalSupply();
    const symbol = await contract.callStatic.symbol();
    console.log(`Contract Name: ${name}`);
    console.log(`Contract Symbol: ${symbol}`);
    console.log(`Total Supply: ${totalSupply}`);

    if (tokenId) {
      const tokenUri = await contract.callStatic.tokenURI(tokenId);
      console.log(`Token URI of ${tokenId}: ${tokenUri}`);
      const tokenOwner = await contract.callStatic.ownerOf(tokenId);
      console.log(`Token Owner of ${tokenId}: ${tokenOwner}`);
    }
  });

program
  .command("erc20")
  .description("fetch ERC20 token info")
  .argument("<network>", "Blockchain network (e.g., ethereum, bsc, polygon)")
  .argument("<contractAddress>", "ERC20 contract address")
  .action(async (network, contractAddress) => {
    const rpcNode = NETWORK[network];
    if (!rpcNode) {
      console.error(`Unsupported network: ${network}`);
      return;
    }

    const contract = new Contract(contractAddress, abiERC20, new JsonRpcProvider(rpcNode));
    const name = await contract.callStatic.name();
    const symbol = await contract.callStatic.symbol();
    const decimals = await contract.callStatic.decimals();
    const totalSupply = await contract.callStatic.totalSupply();
    console.log(`Contract Name: ${name}`);
    console.log(`Contract Symbol: ${symbol}`);
    console.log(`Contract Decimals: ${decimals}`);
    console.log(`Total Supply: ${totalSupply}`);
  });

program
  .command("fetch-erc721-tokens")
  .description("fetch all ERC721 tokens for a given owner via multicall")
  .argument("<network>", "Blockchain network (e.g., ethereum, bsc, polygon)")
  .argument("<ownerAddress>", "Owner address")
  .argument("<ERC721_CONTRACT>", "ERC721 contract address")
  .action(async (network, ownerAddress, ERC721_CONTRACT) => {
    const rpcNode = NETWORK[network];
    if (!rpcNode) {
      console.error(`Unsupported network: ${network}`);
      return;
    }

    const contract = new Contract(ERC721_CONTRACT, abiERC721, new JsonRpcProvider(rpcNode));
    const balance = await contract.callStatic.balanceOf(ownerAddress);
    console.log(`Owner ${ownerAddress} has ${balance} ERC721 tokens`);

    const calls = Array.from({ length: balance }, (_, i) => i).map((_, i) => ({
      contract,
      functionSignature: "tokenOfOwnerByIndex(address,uint256)",
      arguments: [ownerAddress, i]
    }));

    const calldata = calls.map((call) => ({
      target: call.contract.address,
      callData: call.contract.interface.encodeFunctionData(
        call.contract.interface.functions[call.functionSignature],
        call.arguments
      )
    }));

    const multicallContract = new Contract(MULTICALL_CONTRACT, multicallAbi, new JsonRpcProvider(rpcNode));
    const results = await multicallContract.callStatic.tryAggregate(false, calldata);

    const tokenIds = results
      .map((r, i) =>
        r.success
          ? calls[i].contract.interface.decodeFunctionResult(calls[i].functionSignature, r.returnData)[0]
          : undefined
      )
      .filter(Boolean)
      .map((id) => id.toString());

    console.log(`Token IDs owned by ${ownerAddress}: `, tokenIds);

    const tokenUrisCalldata = tokenIds.map((tokenId) => ({
      target: contract.address,
      callData: contract.interface.encodeFunctionData("tokenURI", [tokenId])
    }));

    const uriResults = await multicallContract.callStatic.tryAggregate(false, tokenUrisCalldata);

    const tokenUris = uriResults.map((r, i) =>
      r.success ? contract.interface.decodeFunctionResult("tokenURI", r.returnData)[0] : undefined
    );

    tokenIds.forEach((tokenId, index) => {
      console.log(`Token ID: ${tokenId}, Token URI: ${tokenUris[index]}`);
    });
  });

program.parse(process.argv);
