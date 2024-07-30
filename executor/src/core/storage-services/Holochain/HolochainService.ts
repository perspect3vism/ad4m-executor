import { AppSignalCb, AppSignal, CellId, CellType, AgentInfoResponse, InstallAppRequest, EncodedAppSignal } from '@holochain/client'
import path from 'node:path'
import fs from 'node:fs'
import HolochainLanguageDelegate from "./HolochainLanguageDelegate"
import type { Dna } from '@coasys/ad4m'
import { AsyncQueue } from './Queue'
import { decode, encode } from "@msgpack/msgpack"

import { HolochainUnlockConfiguration } from '../../Ad4mCore'
import AgentService from '../../agent/AgentService'

export interface HolochainConfiguration {
    conductorPath?: string,
    dataPath: string,
    resourcePath: string
    hcProxyUrl: string,
    hcBootstrapUrl: string,
    adminPort?: number;
    appPort?: number;
    useBootstrap?: boolean,
    useProxy?: boolean,
    useLocalProxy?: boolean;
    useMdns?: boolean;
    logHolochainMetrics?: boolean; 
}

export default class HolochainService {
    #ready?: Promise<void>
    #resourcePath: string
    #signalCallbacks: [CellId, AppSignalCb, string][];
    #queue: Map<string, AsyncQueue>
    #languageDnaHashes: Map<string, Uint8Array[]>
    #dataPath: string

    constructor(config: HolochainConfiguration) {
        let {
            resourcePath,
            useBootstrap,
            useProxy,
            useLocalProxy,
            useMdns,
            dataPath,
            logHolochainMetrics
        } = config;

        this.#dataPath = dataPath

        this.#signalCallbacks = [];

        if(useMdns === undefined) useMdns = false
        if(useBootstrap === undefined) useBootstrap = true
        if(useProxy === undefined) useProxy = true
        if(useLocalProxy === undefined) useLocalProxy = false
        this.#resourcePath = resourcePath;
        this.#queue = new Map();
        this.#languageDnaHashes = new Map();

        if (logHolochainMetrics) {
            // this.logDhtStatus();
        }
    }

    async logDhtStatus() {
        setInterval(async () => {
            if (this.#ready) {
                await HOLOCHAIN_SERVICE.logDhtStatus();
            }
        }, 60000);
    }

    async handleCallback(signal: EncodedAppSignal) {
        //console.log(new Date().toISOString(), "GOT CALLBACK FROM HC, checking against language callbacks");
        //console.dir(signal);
        //@ts-ignore
        let payload = decode(signal.signal);
        var TypedArray = Object.getPrototypeOf(Uint8Array);
        if (payload instanceof TypedArray) {
            //@ts-ignore
            payload = Buffer.from(payload);
        };
        let appSignalDecoded = {
            cell_id: signal.cell_id,
            zome_name: signal.zome_name,
            payload: payload
        } as AppSignal;
        if (this.#signalCallbacks.length != 0) {
            const signalDna = Buffer.from(appSignalDecoded.cell_id[0]).toString('hex')
            const signalPubkey = Buffer.from(appSignalDecoded.cell_id[1]).toString('hex')
            //console.debug("Looking for:", signalDna, signalPubkey)
            let callbacks = this.#signalCallbacks.filter(e => {
                const dna = Buffer.from(e[0][0]).toString('hex')
                const pubkey = Buffer.from(e[0][1]).toString('hex')
                //console.debug("Checking:", dna, pubkey)
                return ( dna === signalDna ) && (pubkey === signalPubkey)
            })
            for (const cb of callbacks) {
                if (cb && cb![1] != undefined) {
                    await cb![1](appSignalDecoded);
                };
            }
        };
        return appSignalDecoded;
    }

    async run(config: HolochainUnlockConfiguration) {
        let resolveReady: ((value: void | PromiseLike<void>) => void) | undefined;
        this.#ready = new Promise(resolve => resolveReady = resolve)

        await HOLOCHAIN_SERVICE.startHolochainConductor({
            passphrase: config.passphrase,
            conductorPath: config.conductorPath!,
            dataPath: config.dataPath,
            useBootstrap: config.useBootstrap!,
            useProxy: config.useProxy!,
            useLocalProxy: config.useLocalProxy!,
            useMdns: config.useMdns!,
            proxyUrl: config.hcProxyUrl,
            bootstrapUrl: config.hcBootstrapUrl,
            appPort: config.appPort!
        } as ConductorConfig);

        console.log("Holochain run complete");

        resolveReady!()
    }

    async stop() {
        await this.#ready
        console.log("HolochainService.stop(): Stopping holochain process");
        await HOLOCHAIN_SERVICE.shutdown();
    }

    async unpackDna(dnaPath: string): Promise<String> {
        let result = await HOLOCHAIN_SERVICE.unPackDna(dnaPath);
        let splitResult = result.split("Unpacked to directory ");
        if (splitResult.length == 2) {
            return splitResult[1]
        } else {
            return result
        }
    }

    async packDna(workdirPath: string): Promise<String> {
        let result = await HOLOCHAIN_SERVICE.packDna(workdirPath);
        let splitResult = result.split("Wrote bundle ");
        if (splitResult.length == 2) {
            return splitResult[1]
        } else {
            return result
        }
    }

    async ensureInstallDNAforLanguage(lang: string, dnas: Dna[], callback: AppSignalCb | undefined): Promise<CellId[]> {
        await this.#ready
        let cellIds = [] as CellId[];

        let appInfo = await HOLOCHAIN_SERVICE.getAppInfo(lang);

        if (!appInfo) {
            // 1. install app
            try {
                console.debug("HolochainService: Installing DNAs for language", lang);
                const roles = dnas.map(dna => {
                    const p = path.join(this.#dataPath, `${lang}-${dna.nick}.dna`);
                    fs.writeFileSync(p, dna.file);
                    return {
                        //note; this name value might have to be unique per role across different apps
                        //in which case we should use naming of dna file above
                        name: `${lang}-${dna.nick}`,
                        dna: {
                            //@ts-ignore
                            path: p
                        }
                    }
                });

                const did = AGENT.did();
                //Did should only ever be undefined when the system DNA's get init'd before agent create occurs
                //These system DNA's do not currently need EP proof's
                let membraneProof = {};
                const agentKey = await HOLOCHAIN_SERVICE.getAgentKey();
                if(did) {
                    const signedDid = await HOLOCHAIN_SERVICE.signString(did).toString();
                    const didHolochainEntanglement = await ENTANGLEMENT_SERVICE.generateHolochainProof(agentKey.toString(), signedDid);
                    membraneProof = {"ad4mDidEntanglement": Buffer.from(JSON.stringify(didHolochainEntanglement))};
                } else {
                    membraneProof = {};
                }

                const installAppResult = await HOLOCHAIN_SERVICE.installApp({
                    installed_app_id: lang, agent_key: agentKey, membrane_proofs: membraneProof, bundle: {
                        manifest: {
                            manifest_version: "1",
                            name: lang,
                            //@ts-ignore
                            roles
                        },
                        resources: {}
                    }
                } as InstallAppRequest)

                appInfo = installAppResult

                console.log("HolochainService: Installed DNA's:", roles)
                console.log(" with result:");
                console.dir(installAppResult);
            } catch(e) {
                console.error("HolochainService: InstallApp, got error: ", e);
                return [];
            }
        }

        const hashes: Uint8Array[] = [];
        Object.keys(appInfo.cell_info).forEach(async roleName => {
            const cellData = appInfo!.cell_info[roleName];

            for (const cellInfo of cellData) {
                const cellId = (CellType.Provisioned in cellInfo) ? cellInfo[CellType.Provisioned].cell_id : null
                if (!cellId) {
                    throw new Error(`HolochainService: ERROR: Could not get cellId from cell_info: ${cellInfo}`);
                }
                cellIds.push(cellId);

                let hash = cellId[0];
                if (hash) hashes.push(hash);

                //Register the callback to the cell internally
                if (callback != undefined) {
                    //Check for apps matching this language address and register the signal callbacks
                    console.log("HolochainService: setting holochains signal callback for language", lang);
                    this.#signalCallbacks.push([cellId, callback, lang]);
                }
            }
        });

        if (!this.#languageDnaHashes.has(lang)) {
            this.#languageDnaHashes.set(lang, hashes);
        }
        return cellIds;
    }

    async removeDnaForLang(lang: string) {
        await HOLOCHAIN_SERVICE.removeApp(lang);
    }

    getDelegateForLanguage(languageHash: string) {
        if (!this.#queue.has(languageHash)) {
            this.#queue.set(languageHash, new AsyncQueue());
        }

        return new HolochainLanguageDelegate(languageHash, this, this.#queue.get(languageHash)!)
    }

    static dnaID(languageHash: string, dnaNick: string) {
        return `${languageHash}-${dnaNick}`
    }

    async callZomeFunction(lang: string, dnaNick: string, zomeName: string, fnName: string, payload: any): Promise<any> {
        await this.#ready
        const installed_app_id = lang

        //4. Call the zome function
        try {
            if (fnName != "sync" && fnName != "current_revision") {
                console.debug("\x1b[34m", new Date().toISOString(), "HolochainService calling zome function:", dnaNick, zomeName, fnName, JSON.stringify(payload).substring(0, 50), "\nFor language with address", lang, "\x1b[0m");
            }

            let result = await HOLOCHAIN_SERVICE.callZomeFunction(installed_app_id, dnaNick, zomeName, fnName, encode(payload));
            if (result["Ok"]) {
                result = decode(result["Ok"])
            } else {
                result = decode(result["Err"])
            }

            if (fnName != "sync" && fnName != "current_revision") {
                if (typeof result === "string") {
                    console.debug("\x1b[32m", new Date().toISOString(),"HolochainService zome function result (string):", result.substring(0, 50), "... \x1b[0m")
                } else if (typeof result === "object") {
                    let resultString = JSON.stringify(result);
                    let endingLog = resultString.length > 50 ? "... \x1b[0m" : "\x1b[0m";
                    console.debug("\x1b[32m", new Date().toISOString(),"HolochainService zome function result (object):", resultString.substring(0, 50), endingLog)
                } else {
                    console.debug("\x1b[32m", new Date().toISOString(),"HolochainService zome function result (other):", result, "\x1b[0m")
                }
            }
            return result
        } catch(e) {
            console.error("\x1b[31m", "HolochainService: ERROR calling zome function:", e, "\x1b[0m")
            return e
        }
    }

    async requestAgentInfos(): Promise<AgentInfoResponse> {
        return await HOLOCHAIN_SERVICE.agentInfos()
    }

    async addAgentInfos(agent_infos: AgentInfoResponse) {
        await HOLOCHAIN_SERVICE.addAgentInfos(agent_infos)
    }
}
