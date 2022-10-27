# Trakon CLI

Review your smart contracts with [Trakon Reviews](https://reviews.trakon.xyz). Snapshot the contract states in your hardhat or truffle repo, then review and share them.

## Installation & Usage

### Prerequisites

Trakon Reviews requires [node 16.x](https://nodejs.org/en/download/) and contracts to be compiled in a [Hardhat](https://hardhat.org/) or [Truffle](https://trufflesuite.com/) project
before snapshotting.

An API key from https://reviews.trakon.xyz is required to snapshot your contracts. If you have connected your wallet, you can find the API key by navigating to your [profile](https://reviews.trakon.xyz/profile).

### Compile your local contracts

In a Hardhat or Truffle project, compile your contracts using the framework's respective compile command.

#### Hardhat

```shell
npx hardhat compile
```

#### Truffle

```shell
truffle compile
```

### Run the trakon review command

#### Yarn 2
```shell
yarn dlx -p trakon-cli trakon review --api-key <your-api-key>
```


#### Yarn 1

```shell
yarn global add trakon-cli
trakon review --api-key <your-api-key>
```

#### NPM

```shell
npm install -g trakon-cli
trakon review --api-key <your-api-key>
```

Trakon will search in your local project for any compiled contracts and present a list of found contracts ready to be snapshotted. Once the selected contracts have successfully been snapshotted and uploaded, you will be given a link to view the resulting project containing your contracts.
