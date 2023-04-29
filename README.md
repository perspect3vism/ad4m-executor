[![Project](https://img.shields.io/badge/Project-AD4M-brightgreen.svg)](http://ad4m.dev/)
[![Docs](https://img.shields.io/badge/Docs-AD4M-blue.svg)](http://docs.ad4m.dev/)
[![License: CAL 1.0](https://img.shields.io/badge/License-CAL%201.0-blue.svg)](https://github.com/holochain/cryptographic-autonomy-license)

![Logo](docs-src/ad4mlogo_green_angle2_colouremblem.png)

# AD4M

_The **A**gent-Centric **D**istributed **A**pplication **M**eta-ontology_
or just:
**\*A**gent-Centric **DA**pp **M**eta-ontology\*

- A new **meta-ontology** for interoperable, decentralized application design
- A **spanning-layer** to enable seamless integration between Holochain DNAs, blockchains, linked-data structures/ontologies and centralized back-ends
- The basis for turning distinct, monolithic and siloed apps into a global, open and interoperable **sense-making network**

## Repo Structure / History

This is the new mono-repository with all components making up a whole AD4M implementation merged back into what formerly was only the `ad4m-executor`.

- `core`: Former [ad4m repository](https://github.com/perspect3vism/ad4m-core-deprecated). Holds the core ontology types, the `Ad4mClient` and the GraphQL schema build automatically from the core types. This package gets published as https://www.npmjs.com/package/@perspect3vism/ad4m and is thus holding most of the app/UI facing coding.
- `executor`: All the code running inside an AD4M instance. UI-less GraphQL server, managing Agent keys, Perspectives and running Languages. TypeScript library without runnable main / executable.
- `host`: Former [ad4m-host repository](https://github.com/perspect3vism/ad4m-host). Imports and wraps executor and uses vercel/pkg to create runnable binary.
- `ui`: Former [ad4min repository](https://github.com/perspect3vism/ad4min). Tauri based system-tray icon launcher UI which is the end-user deployment including the `host` executable and providing and AD4M admin (_AD4Min_) UI interface.

---

- `connect`: Former [ad4m-connect repository](https://github.com/perspect3vism/ad4m-connect). Convenience library to connect to a (local or via proxy) AD4M-executor, potentially requesting or reusing capability tokens and creating an `Ad4mClient` ready for the app/UI to use.
- `docs-src` / `docs`: Documentation hosted under https://docs.ad4m.dev

---

 - `cli`: The new Rust based `ad4m` command-line based generic UI. See [it's readme](cli/README.md) for more details. Published to Crates.io as `ad4m`: https://crates.io/crates/ad4m
 - `rust-client`: Rust based `Ad4mClient`. Wraps GraphQL and provides the same high-level interface to AD4M as the TypeScript based version in core. Published to Crates.io as `ad4m-client`: https://crates.io/crates/ad4m-client.

The project started in August 2020 in https://github.com/lucksus/perspectivism, then got broken down into the `ad4m` (core), `ad4m-executor` and [perspect3ve](https://github.com/perspect3vism/perspect3ve) repositories for simultaneous use in [Flux](https://github.com/fluxsocial) and Perspect3ve. Other components got added over the years 2021, 2022.

In October/November 2022, these components were collected into a mono-repo again to avoid PR-chains across multiple repositories and to have version numbers be in lock-step.

## Build

Install Rust by visiting [here](https://www.rust-lang.org/tools/install)

### Fresh build:

```
yarn install
yarn run build-linux/macos/windows (choose version for your OS)
```

### Subsequent builds

```
yarn run build-all-linux/macos/windows (choose version for your OS)
```

## Testing

```
yarn install
yarn test
```

## Building ad4m-host

```
yarn install
yarn run package-linux/macos/windows (choose version for your OS)
```

## Building ad4m launcher

```
yarn install
yarn run build-linux/macos/windows (choose version for your OS)
```
