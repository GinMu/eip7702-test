# EIP7702 TEST

test EIP7702 feature on sepolia network and the eip7702 contract is [Metamask EIP7702](https://sepolia.etherscan.io/address/0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B).

## Commands

```shell
# import private key to keystore
./index import-private-key

# derive private key
./index derive-private-key

# authorize to metamask eip7702 contract
./index authorize

# revoke metamask eip7702 contract authorization
./index revoke

# batch transfer
./index batch-transfer $amount $to $to
```
