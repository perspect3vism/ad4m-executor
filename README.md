[![Project](https://img.shields.io/badge/Project-AD4M-brightgreen.svg)](http://ad4m.dev/)
[![Docs](https://img.shields.io/badge/Docs-AD4M-blue.svg)](http://docs.ad4m.dev/)
[![License: CAL 1.0](https://img.shields.io/badge/License-CAL%201.0-blue.svg)](https://github.com/holochain/cryptographic-autonomy-license)

![Logo](docs/public/images/ad4mlogo_green_angle2_colouremblem.png)

# AD4M

_The **A**gent-Centric **D**istributed **A**pplication **M**eta-ontology_
or just:
**\*A**gent-Centric **DA**pp **M**eta-ontology\*

- A new **meta-ontology** for interoperable, decentralized application design
- A **spanning-layer** to enable seamless integration between Holochain DNAs, blockchains, linked-data structures/ontologies and centralized back-ends
- The basis for turning distinct, monolithic and siloed apps into a global, open and interoperable **sense-making network**

## Core Docs

The main core documentation for AD4M exists [here](https://docs.ad4m.dev)

## Building AD4M

### Build tools

#### npm & pnpm
We use `pnpm` as the root build tool. 
Since we also need node for some build steps and tests,
start by installing [Node)(https://nodejs.org/en/download) version 18.
Depending on your operating system and choice, either by downloading the installer
or through [nvm](https://github.com/nvm-sh/nvm) (which we recommend for POSIX systems).

Then install `pnpm` through

```
npm install -g pnpm
```
(alternatively by visiting [here](https://pnpm.io/installation))

### Deno
The legacy JS ad4m-executor code, as well as ADAM Languages are run in ADAM's Deno runtime and thus are be build
and bundled using the Deno cmd tool, which needs to be installed on the host system.
Just follow the [installation instructions at https://deno.land/manual@v1.36.4/getting_started/installation](https://deno.land/manual@v1.36.4/getting_started/installation).

### Rust

Make sure you have `rustup` installed (follow instructions [here](https://www.rust-lang.org/tools/install)).
Use rustup to install the latest stable Rust version.

ADAM currently needs at least Rust version:
```
1.77.0
```

### Rust WASM target for Holochain based Languages
For building Holochain DNAs, which are part of the ADAM bootstrap languages included here
you need your Rust toolchain to be able to compile to WASM.

Run the following command to install the WASM target:
```
rustup target add wasm32-unknown-unknown
```


### Other dependencies

#### Go
Holochain currently depends on [Go](https://go.dev) being installed at version 1.21 or later.
Follow the installation instructions on [https://go.dev/doc/install](https://go.dev/doc/install).

Make sure `go` is in your `$PATH` before you continue. Output of `go version` should look like this:
```
go version go1.21.0 darwin/arm64
```

#### Platform specific dependencies
Run the following commands depending on your operating system to get all the system libraries installed that are needed by some of the Rust crates that Holochain and ADAM depend on.

##### macOS
Ensure you have [Homebrew](https://brew.sh/) installed and then run:
```
brew install protobuf cmake
```

##### Linux (Ubuntu / Debian)
```
sudo apt-get update
sudo apt-get install -y libgtk-3-dev webkit2gtk-4.0 libappindicator3-dev librsvg2-dev patchelf protobuf-compiler cmake
```

##### Windows
Ensure you have [Chocolatey](https://chocolatey.org/) installed and then run:
```
choco install strawberryperl protoc cmake curl cygwin gnuwin32-m4 msys2 make mingw
```


#### hc
Holochain commandline tool `hc` is needed for building Holochain Languages.
Install the right version we're currently using in ADAM by running:

```
cargo install holochain_cli@=0.3.0-beta-dev.39
```


### Build:

In order to build everyting that goes into the `ad4m` and `ad4m-executor` binaries, including all the boostrap Languages, run:
```
pnpm install && cd core && pnpm install && cd ../
pnpm run build
```

You can also exclude the bootstrap Languages (which will get downloaded through the Language-language on startup anyways, if those are unchanged) and run this instead:

```
pnpm install && cd core && pnpm install && cd ../
pnpm run build-libs
```

In order to build and package the ADAM Launcher, run:
```
pnpm install && cd core && pnpm install && cd ../
pnpm run package-ad4m
```

(Note that the last step of this might/will fail if you don't have the code signing keys. You can ignore that last error and find bundles in `target/release`.)

## Development
### Setup Git Hooks

After cloning the repository, run the following script to set up Git hooks:

```sh
./setup-hooks.sh
```

## Testing 

Full test run of all packages:
```
pnpm install && cd core && pnpm install && cd ../
pnpm test
```

Only integration tests:
```
pnpm install && cd core && pnpm install && cd ../
pnpm build
cd tests/js
pnpm install
pnpm run test-main
```


## Repo Structure

This is a mono-repository with all components making up a whole ADAM Layer implementation.

- `core`: Holds the core ontology types, the `Ad4mClient` and the GraphQL schema build automatically from the core types. This package gets published as https://www.npmjs.com/package/@coasys/ad4m and is thus holding most of the app/UI facing coding.
- `bootstrap-languages`: Holds all the core Languages used to make the ADAM Layer operate. These languages can be thought of as the mainnet configuration for the ADAM Layer.
- `executor`: Holds the core JS code, which manages an Agents ADAM Layer state. Their Perspectives, Languages and Expressions.
- `rust-executor`: Rust binary & library which facilitates the running of a GraphQL server, spawning of Deno runtime to execute the `executor` JS code. Running and communication with in built holochain conductor. Running and communication with Scryer Prolog engine to facilitate Prolog queries over Perspective data.
- `dapp`: UI which provides a connection to MetaMask allowing AD4M Layer to create a connection to blockchain systems. UI server by the `rust-executor` on `http://127.0.0.1:<configured_port>`
- `rust-client`: Rust based `Ad4mClient`. Wraps GraphQL and provides the same high-level interface to AD4M as the TypeScript based version in core. Published to Crates.io as `ad4m-client`: https://crates.io/crates/ad4m-client.
- `tests`: JS testing suit integration testing a built `rust-executor`. Contains 50+ integration tests covering most function calls to an Adam Layer GraphQL server.
- `cli`: Rust based CLI for either init'ing `ad4m init`, running `ad4m run` or communciating with a running AD4M GraphQL server. See [it's readme](cli/README.md) for more details. Published to Crates.io as `ad4m`: https://crates.io/crates/ad4m
- `ui`: Tauri based system-tray icon launcher UI which is the end-user deployment; includes the rust-executor & UI to interact with given executor.

---

- `connect`: Convenience library to connect to a (local or via proxy) AD4M-executor, potentially requesting or reusing capability tokens and creating an `Ad4mClient` ready for the app/UI to use.
- `docs-src` / `docs`: Documentation hosted under https://docs.ad4m.dev

## History

The project started in August 2020 in https://github.com/lucksus/perspectivism, then got broken down into the `ad4m` (core), `ad4m-executor` and [perspect3ve](https://github.com/perspect3vism/perspect3ve) repositories for simultaneuous use in [Flux](https://github.com/fluxsocial) and Perspect3ve. Other components got added over the years 2021, 2022.

In October/November 2022, these componentes were collected into a mono-repo again to avoid PR-chains across multiple repositories and to have version numbers be in lock-step.
