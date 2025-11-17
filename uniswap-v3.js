const { Token, ChainId, Ether } = require("@uniswap/sdk-core");
const { computePoolAddress, FeeAmount } = require("@uniswap/v3-sdk");
const { Contract } = require("@ethersproject/contracts");
const { JsonRpcProvider } = require("@ethersproject/providers");
const { parseUnits, formatUnits } = require("@ethersproject/units");

const Quoter = require("@uniswap/v3-periphery/artifacts/contracts/lens/Quoter.sol/Quoter.json");
const IUniswapV3PoolABI = require("@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json");

const POOL_FACTORY_CONTRACT_ADDRESS = "0x1F98431c8aD98523631AE4a59f267346ea31F984";

const QUOTER_CONTRACT_ADDRESS = "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6";

const config = {
  rpc: {
    mainnet: "https://polygon-rpc.com"
  }
};

const NATIVE_TOKEN = Ether.onChain(ChainId.POLYGON).wrapped;
const USDT0_TOKEN = new Token(ChainId.POLYGON, "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", 6, "USDT0", "USDT0");

const provider = new JsonRpcProvider(config.rpc.mainnet);

const poolAddress = computePoolAddress({
  factoryAddress: POOL_FACTORY_CONTRACT_ADDRESS,
  tokenA: NATIVE_TOKEN,
  tokenB: USDT0_TOKEN,
  fee: FeeAmount.MEDIUM
});

console.log("Pool Address:", poolAddress);

const poolContract = new Contract(poolAddress, IUniswapV3PoolABI.abi, provider);

const quoterContract = new Contract(QUOTER_CONTRACT_ADDRESS, Quoter.abi, provider);

const quoteExactInputSingle = async () => {
  const fee = await poolContract.fee();
  const amount = parseUnits("1", NATIVE_TOKEN.decimals).toString();

  const quotedAmountOut = await quoterContract.callStatic.quoteExactInputSingle(
    NATIVE_TOKEN.address,
    USDT0_TOKEN.address,
    fee,
    amount,
    0
  );

  console.log(
    `Quoted amount out for 1 ${NATIVE_TOKEN.symbol}:`,
    formatUnits(quotedAmountOut.toString(), USDT0_TOKEN.decimals),
    USDT0_TOKEN.symbol
  );
};

const quoteExactOutputSingle = async () => {
  const fee = await poolContract.fee();
  const amountOut = parseUnits("1", USDT0_TOKEN.decimals).toString();

  const quotedAmountIn = await quoterContract.callStatic.quoteExactOutputSingle(
    NATIVE_TOKEN.address,
    USDT0_TOKEN.address,
    fee,
    amountOut,
    0
  );

  console.log(
    `Quoted amount in for 1 ${USDT0_TOKEN.symbol}:`,
    formatUnits(quotedAmountIn.toString(), NATIVE_TOKEN.decimals),
    NATIVE_TOKEN.symbol
  );
};

module.exports = {
  quoteExactInputSingle,
  quoteExactOutputSingle
};
