# Trakon CLI

Snapshot your hardhat and truffle compiled smart contracts with [Trakon](https://trakon.xyz). Then review, share, and deploy them from a [private dashboard](https://trakon.xyz/projects).

## Installation & Usage

![Snapshot example in terminal](/docs/stage-example.gif)
### Prerequisites

Trakon requires [node 16.x](https://nodejs.org/en/download/) and contracts to be compiled in a [Hardhat](https://hardhat.org/) or [Truffle](https://trufflesuite.com/) project
before snapshotting.

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

### Run the trakon snapshot command

#### Yarn 2
```shell
yarn dlx -p trakon-cli trakon snapshot --api-key <your-api-key>
```


#### Yarn 1

```shell
yarn global add trakon-cli
trakon snapshot --api-key <your-api-key>
```

#### NPM

```shell
npm install -g trakon-cli
trakon snapshot --api-key <your-api-key>
```

Trakon will search in your local project for any compiled contracts and present a list of found contracts ready to be snapshotted. Select a contract to snapshot. Once the selected contract has successfully been snapshotted and upload, you will be given a link to view the resulting project containing your contracts.
