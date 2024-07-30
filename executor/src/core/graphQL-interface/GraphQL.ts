import { Agent, Expression, InteractionCall, Language, LanguageRef, PerspectiveExpression, PerspectiveState, PerspectiveUnsignedInput } from '@coasys/ad4m'
import { exprRef2String, parseExprUrl, LanguageMeta } from '@coasys/ad4m'
import type Ad4mCore from '../Ad4mCore'
import * as PubSubDefinitions from './SubscriptionDefinitions'
import { ad4mExecutorVersion } from '../Config';
import { OuterConfig } from '../../main';
import { getPubSub, tagExpressionSignatureStatus } from '../utils';


export function createResolvers(core: Ad4mCore, config: OuterConfig) {

    return {
        Query: {
            //@ts-ignore
            agentByDID: async (args, context) => {
                const { did } = args;
                if (did != core.agentService.did) {
                    const agentLanguage = core.languageController.getAgentLanguage().expressionAdapter;
                    if (!agentLanguage) {
                        throw Error("Agent language does not have an expression adapter")
                    }
                    const expr = await agentLanguage.get(did);
                    if (expr != null && Object.keys(expr).length > 0){
                        tagExpressionSignatureStatus(expr);
                        for(const link of expr.data.perspective.links) {
                            tagExpressionSignatureStatus(link)
                        }
                        return expr.data;
                    } else {
                        return null
                    }
                } else {
                    return core.agentService.agent
                }
            },
            //@ts-ignore
            expression: async (args, context) => {
                const url = args.url.toString();
                const ref = parseExprUrl(url)
                const expression = await core.languageController.getExpression(ref);
                console.log("GQL| expression:", JSON.stringify(expression));
                if (expression && Object.keys(expression).length === 0) {
                    return null;
                } else if(expression) {
                    console.log("GQL| expression 1:", JSON.stringify(expression));
                    expression.ref = ref
                    expression.url = url
                    expression.data = JSON.stringify(expression.data)

                    //Add the expression icon
                    expression.icon = { code: await core.languageController.getIcon(ref.language) }

                    //Add the language information
                    let lang

                    if(expression.ref.language.address === "literal") {
                        lang = { address: "literal", name: "literal" }
                    } else {
                        try {
                            lang = await core.languageController.languageForExpression(expression.ref) as any
                        } catch(e) {
                            console.error("While trying to get language for expression", expression, ":", e)
                            lang = {}
                        }
                    }

                    lang.address = expression.ref.language.address
                    expression.language = lang
                }
                return expression
            },
            //@ts-ignore
            expressionMany: async (args, context) => {
                const { urls } = args;
                const expressionPromises = [];
                for (const url of urls) {
                    expressionPromises.push(core.languageController.getExpression(parseExprUrl(url)));
                };
                const results = await Promise.all(expressionPromises);

                return await Promise.all(results.map(async (expression: Expression|null, index) => {
                    if (expression && Object.keys(expression).length === 0) {
                        return null;
                    } else if(expression && Object.keys(expression).length > 0) {
                        expression.ref = parseExprUrl(urls[index]);
                        expression.url = urls[index];
                        expression.data = JSON.stringify(expression.data);

                        //Add the expression icon
                        expression.icon = { code: await core.languageController.getIcon(expression.ref.language) }

                        //Add the language information
                        let lang

                        if(expression.ref.language.address === "literal") {
                            return { address: "literal", name: "literal" }
                        }

                        try {
                            lang = await core.languageController.languageForExpression(expression.ref) as any
                        } catch(e) {
                            console.error("While trying to get language for expression", expression, ":", e)
                            lang = {}
                        }

                        lang.address = expression.ref.language.address
                        expression.language = lang
                    }
                    return expression
                }))
            },
            //@ts-ignore
            expressionRaw: async (args, context) => {
                const ref = parseExprUrl(args.url.toString())
                const expression = await core.languageController.getExpression(ref) as any
                return JSON.stringify(expression)
            },
            //@ts-ignore
            expressionInteractions: async (args, context) => {
                const { url } = args
                const result = await core.languageController.expressionInteractions(url)
                return result
            },
            //@ts-ignore
            language: async (args, context) => {
                const { address } = args
                const lang = await core.languageController.languageByRef({address, name: ""} as LanguageRef) as any
                lang.address = address

                const constructorIcon = async (language: Language) => {
                    if (language.expressionUI) {
                        const code = language.expressionUI.constructorIcon();

                        if (code) {
                            return { code }
                        } else {
                            return { code: "" }
                        }
                    }

                    return null
                };

                lang.constructorIcon = await constructorIcon(lang);

                const icon = async (language: Language) => {
                    if (language.expressionUI) {
                        const code = language.expressionUI.icon();

                        if (code) {
                            return { code }
                        } else {
                            return { code: "" }
                        }
                    }

                    return null
                };

                lang.icon = await icon(lang);

                const settings = async (address: string) => {
                    return JSON.stringify(core.languageController.getSettings(address))
                };

                lang.settings = await settings(address);

                const settingsIcon = async (language: Language) => {
                    if (language.settingsUI) {
                        const code = language.settingsUI.settingsIcon();

                        if (code) {
                            return { code }
                        } else {
                            return { code: "" }
                        }
                    }

                    return null
                }

                lang.settingsIcon = await settingsIcon(lang);

                return lang
            },
            //@ts-ignore
            languageMeta: async (args, context) => {
                const { address } = args
                const languageExpression = await core.languageController.getLanguageExpression(address)
                if(!languageExpression)
                    throw new Error(`Language not found: ${address}`)
                const internal = languageExpression.data
                let meta = new LanguageMeta()
                meta.name = internal.name
                meta.address = address
                meta.description = internal.description
                meta.author = languageExpression.author
                meta.templated = internal.templateSourceLanguageAddress != undefined
                meta.templateSourceLanguageAddress = internal.templateSourceLanguageAddress
                meta.templateAppliedParams = internal.templateAppliedParams
                meta.possibleTemplateParams = internal.possibleTemplateParams
                meta.sourceCodeLink = internal.sourceCodeLink

                return meta
            },

            //@ts-ignore
            languageSource: async (args, context) => {
                const { address } = args
                const languageSource = await core.languageController.getLanguageSource(address)
                if(!languageSource)
                    throw new Error(`Language not found: ${address}`)

                return languageSource
            },

            //@ts-ignore
            languages: (args, context) => {
                let filter
                if(args.filter && args.filter !== '') filter = args.filter
                return core.languageController.filteredLanguageRefs(filter)
            },
        },
        Mutation: {
            //@ts-ignore
            runtimeAddFriends: async (args, context) => {
                const { dids } = args;
                //@ts-ignore
                await Promise.all(dids.map(did => core.friendsDirectMessageLanguage(did)))

                return [];
            },
            //@ts-ignore
            agentGenerate: async (args, context) => {
                const {hcPortAdmin, connectHolochain, hcPortApp, hcUseLocalProxy, hcUseMdns, hcUseProxy, hcUseBootstrap, hcProxyUrl, hcBootstrapUrl, logHolochainMetrics} = config;

                await core.initHolochain({ hcPortAdmin, hcPortApp, hcUseLocalProxy, hcUseMdns, hcUseProxy, hcUseBootstrap, passphrase: args.passphrase, hcProxyUrl, hcBootstrapUrl, logHolochainMetrics });
                console.log("Holochain init complete");

                console.log("Wait for agent");
                core.initControllers()
                await core.initLanguages()
                console.log("Core languages init'd");

                if (!config.languageLanguageOnly) {
                    await core.initializeAgentsDirectMessageLanguage()
                }
            },
            //@ts-ignore
            agentUnlock: async (args, context) => {
                try {
                    await core.agentService.unlock(args.passphrase)
                } catch(e) {
                    console.log("Error unlocking agent: ", e)
                }

                if(core.agentService.isUnlocked()) {
                    if(!core.holochainService) {
                        console.log("Holochain service not initialized. Initializing...")
                        // @ts-ignore
                        const {hcPortAdmin, connectHolochain, hcPortApp, hcUseLocalProxy, hcUseMdns, hcUseProxy, hcUseBootstrap, hcProxyUrl, hcBootstrapUrl} = config;
                        await core.initHolochain({ hcPortAdmin, hcPortApp, hcUseLocalProxy, hcUseMdns, hcUseProxy, hcUseBootstrap, passphrase: args.passphrase, hcProxyUrl, hcBootstrapUrl });
                    } else {
                        console.log("Holo service already initialized")
                    }

                    core.initControllers()
                    await core.initLanguages()

                    console.log("\x1b[32m", "AD4M init complete", "\x1b[0m");

                    try {
                        await core.agentService.ensureAgentExpression();
                    } catch (e) {
                        console.log("Error ensuring public agent expression: ", e)
                    }
                }
            },
            //@ts-ignore
            agentUpdateDirectMessageLanguage: async (args, context) => {
                const { directMessageLanguage } = args;
                const currentAgent = AGENT.agent();
                if (!currentAgent) {
                    throw Error("No current agent init'd")
                }
                currentAgent.directMessageLanguage = directMessageLanguage;
                await core.agentService.updateAgent(currentAgent);
                return core.agentService.agent;
            },
            //@ts-ignore
            agentUpdatePublicPerspective: async (args, context) => {
                const {perspective} = args;
                const currentAgent = AGENT.agent();
                if (!currentAgent) {
                    throw Error("No current agent init'd")
                }

                currentAgent.perspective = {
                    ...perspective,
                    links: perspective.links.map((l: any) => {
                        const link = {...l};
                        delete link.status

                        return link
                    })
                };

                await core.agentService.updateAgent(currentAgent);
                return core.agentService.agent;
            },
            //@ts-ignore
            expressionCreate: async (args, context) => {
                const { languageAddress, content } = args

                //@ts-ignore
                function prepareExpressionData(value) {
                    return typeof value === 'object' && value !== null ? JSON.parse(JSON.stringify(value)) : value;
                }

                const langref = { address: languageAddress } as LanguageRef
                const expref = await core.languageController.expressionCreate(langref, prepareExpressionData(content))
                return exprRef2String(expref)
            },
            //@ts-ignore
            expressionInteract: async (args, context) => {
                let { url, interactionCall } = args
                interactionCall = new InteractionCall(interactionCall.name, JSON.parse(interactionCall.parametersStringified))
                const result = await core.languageController.expressionInteract(url, interactionCall)
                return result
            },
            //@ts-ignore
            languageApplyTemplateAndPublish: async (args, context) => {
                console.log("JS args", args);
                const { sourceLanguageHash, templateData } = args;
                return await core.languageApplyTemplateAndPublish(sourceLanguageHash, JSON.parse(templateData));
            },
            //@ts-ignore
            languagePublish: async (args, context) => {
                const { languagePath, languageMeta } = args;
                const expression = await core.languagePublish(languagePath, languageMeta);
                const internal = expression.data
                let meta = new LanguageMeta()
                meta.name = internal.name
                meta.address = internal.address
                meta.description = internal.description
                meta.author = expression.author
                meta.templated = internal.templateSourceLanguageAddress != undefined
                meta.templateSourceLanguageAddress = internal.templateSourceLanguageAddress
                meta.templateAppliedParams = internal.templateAppliedParams
                meta.possibleTemplateParams = internal.possibleTemplateParams
                meta.sourceCodeLink = internal.sourceCodeLink
                return meta
            },
            //@ts-ignore
            languageRemove: async (args, context) => {
                const { address } = args
                try {
                    await core.languageController.languageRemove(address)
                } catch (e) {
                    console.error("Executor.languageDelete: Error removing language", e)
                    return false
                }
                return true
            },
            //@ts-ignore
            languageWriteSettings: async (args, context) => {
                const { languageAddress, settings } = args
                await core.languageController.putSettings(languageAddress, JSON.parse(settings))
                return true
            },

            //@ts-ignore
            runtimeFriendSendMessage: async (args, context) => {
                const { did, message } = args

                const dmLang = await core.friendsDirectMessageLanguage(did)
                if(!dmLang) return false

                let wasSent = false
                let messageExpression
                try {
                    const status = await dmLang.directMessageAdapter!.status()
                    if(status) {
                        messageExpression = await dmLang.directMessageAdapter!.sendP2P(message)
                        wasSent = true
                    } else {
                        throw "Friends seems offline"
                    }
                } catch(e) {
                    messageExpression = await dmLang.directMessageAdapter!.sendInbox(message)
                    wasSent = true
                }

                if(wasSent && messageExpression) {
                    await RUNTIME_SERVICE.addMessageOutbox(did, messageExpression, wasSent)
                }

                return wasSent;
            }

        },

        Agent: {
            //@ts-ignore
            directMessageLanguage: async (agent) => {
                //console.debug("GQL| AGENT.directMessageLanguage:", agent)
                if(agent.directMessageLanguage && agent.directMessageLanguage !== "")
                    return agent.directMessageLanguage
                else {
                    const exprAdapter = core.languageController.getAgentLanguage().expressionAdapter;
                    if (!exprAdapter) {
                        throw Error("Agent language does not have an expression adapter")
                    }
                    const agentExpression = await exprAdapter.get(agent.did)
                    if(agentExpression)
                        return (agentExpression.data as Agent).directMessageLanguage
                    else
                        return null
                }
            },
            //@ts-ignore
            perspective: async (agent) => {
                //console.debug("GQL| AGENT.perspective:", agent)
                if(agent.perspective && agent.perspective !== "")
                    return agent.perspective
                else {
                    const exprAdapter = core.languageController.getAgentLanguage().expressionAdapter;
                    if (!exprAdapter) {
                        throw Error("Agent language does not have an expression adapter")
                    }
                    const agentExpression = await exprAdapter.get(agent.did)
                    if(agentExpression)
                        return (agentExpression.data as Agent).perspective
                    else
                        return null
                }
            }
        }
    }
}
