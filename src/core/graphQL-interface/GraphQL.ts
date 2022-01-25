import { ApolloServer, withFilter, gql } from 'apollo-server'
import { Agent, Expression, LanguageRef } from '@perspect3vism/ad4m'
import { exprRef2String, parseExprUrl, LanguageMeta } from '@perspect3vism/ad4m'
import { typeDefsString } from '@perspect3vism/ad4m/lib/src/typeDefs'
import type PerspectivismCore from '../PerspectivismCore'
import * as PubSub from './PubSub'
import { GraphQLScalarType } from "graphql";

function createResolvers(core: PerspectivismCore) {
    const pubsub = PubSub.get()

    return {
        Query: {
            agent: () => {
                return core.agentService.agent
            },
            //@ts-ignore
            agentByDID: async (parent, args, context, info) => {
                const { did } = args;
                const agentLanguage = core.languageController.getAgentLanguage().expressionAdapter;
                if (!agentLanguage) {
                    throw Error("Agent language does not have an expression adapter")
                }
                const expr = await agentLanguage.get(did);
                if (expr != null) {
                    return expr.data;
                } else {
                    return null
                }
            },
            agentStatus: () => {
                return core.agentService.dump()
            },
            //@ts-ignore
            expression: async (parent, args, context, info) => {
                const ref = parseExprUrl(args.url.toString())
                const expression = await core.languageController.getExpression(ref) as any
                if(expression) {
                    expression.ref = ref
                    expression.url = args.url.toString()
                    expression.data = JSON.stringify(expression.data)
                }
                return expression
            },
            //@ts-ignore
            expressionMany: async (parent, args, context, info) => {
                const { urls } = args;
                const expressionPromises = [];
                for (const url of urls) {
                    expressionPromises.push(core.languageController.getExpression(parseExprUrl(url)));
                };
                const results = await Promise.all(expressionPromises);

                return results.map((expression: Expression|null, index) => {
                    if(expression) {
                        expression.ref = parseExprUrl(urls[index]);
                        expression.url = urls[index];
                        expression.data = JSON.stringify(expression.data);
                    }
                    return expression
                })
            },
            //@ts-ignore
            expressionRaw: async (parent, args, context, info) => {
                const ref = parseExprUrl(args.url.toString())
                const expression = await core.languageController.getExpression(ref) as any
                return JSON.stringify(expression)
            },
            //@ts-ignore
            language: async (parent, args, context, info) => {
                const { address } = args
                const lang = await core.languageController.languageByRef({address} as LanguageRef) as any
                lang.address = address
                return lang
            },
            //@ts-ignore
            languageMeta: async (parent, args, context, info) => {
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
            languageSource: async (parent, args) => {
                const { address } = args
                const languageSource = await core.languageController.getLanguageSource(address)
                if(!languageSource)
                    throw new Error(`Language not found: ${address}`)

                return languageSource
            },
            
            //@ts-ignore
            languages: (parent, args, context, info) => {
                let filter
                if(args.filter && args.filter !== '') filter = args.filter
                return core.languageController.filteredLanguageRefs(filter)
            },
            //@ts-ignore
            perspective: (parent, args, context, info) => {
                return core.perspectivesController.perspectiveID(args.uuid)
            },
            //@ts-ignore
            fromUrl: (parent, args, context, info) => {
                return core.perspectivesController.fromUrl(args.url)
            },
            //@ts-ignore
            perspectiveQueryLinks: async (parent, args, context, info) => {
                const { uuid, query } = args
                const perspective = core.perspectivesController.perspective(uuid)
                //console.log("querying on", perspective, query, uuid);
                return await perspective.getLinks(query)
            },
            //@ts-ignore
            perspectiveQueryProlog: async (parent, args, context, info) => {
                const { uuid, query } = args
                const perspective = core.perspectivesController.perspective(uuid)
                return JSON.stringify(await perspective.prologQuery(query))
            },
            //@ts-ignore
            perspectiveSnapshot: async (parent, args, context, info) => {
                return await core.perspectivesController.perspectiveSnapshot(args.uuid)
            },
            //@ts-ignore
            perspectives: (parent, args, context, info) => {
                return core.perspectivesController.allPerspectiveHandles()
            },
            //@ts-ignore
            getTrustedAgents: (parent, args, context, info) => {
                return core.runtimeService.getTrustedAgents();
            },

            //@ts-ignore
            runtimeKnownLinkLanguageTemplates: () => {
                return core.runtimeService.knowLinkLanguageTemplates();
            },

            //@ts-ignore
            runtimeFriends: () => {
                return core.runtimeService.friends();
            },

            runtimeHcAgentInfos: async () => {
                return JSON.stringify(await core.holochainRequestAgentInfos())
            },

            //@ts-ignore
            runtimeFriendStatus: async (parent, args) => {
                const { did } = args
                if(!core.runtimeService.friends().includes(did)) throw `${did} is not a friend`
                const dmLang = await core.friendsDirectMessageLanguage(did)
                if(dmLang)
                    return await dmLang.directMessageAdapter!.status()
                else
                    return undefined
            },

            //@ts-ignore
            runtimeMessageInbox: async (parent, args) => {
                const { filter } = args
                const dmLang = await core.myDirectMessageLanguage()
                return await dmLang.directMessageAdapter!.inbox(filter)
            },
            //@ts-ignore
            runtimeMessageOutbox: (parent, args) => {
                console.log("runtimeMessageOutbox")
                const { filter } = args
                return core.runtimeService.getMessagesOutbox(filter)
            }
        },
        Mutation: {
            //@ts-ignore
            addTrustedAgents: (parent, args, context, info) => {
                const { agents } = args;
                core.runtimeService.addTrustedAgents(agents);
                return core.runtimeService.getTrustedAgents();
            },
            //@ts-ignore
            deleteTrustedAgents: (parent, args, context, info) => {
                const { agents } = args;
                core.runtimeService.deleteTrustedAgents(agents);
                return core.runtimeService.getTrustedAgents();
            },
            //@ts-ignore
            runtimeAddKnownLinkLanguageTemplates: (parent, args, context, info) => {
                const { addresses } = args;
                core.runtimeService.addKnowLinkLanguageTemplates(addresses);
                return core.runtimeService.knowLinkLanguageTemplates();
            },
            //@ts-ignore
            runtimeRemoveKnownLinkLanguageTemplates: (parent, args, context, info) => {
                const { addresses } = args;
                core.runtimeService.removeKnownLinkLanguageTemplates(addresses);
                return core.runtimeService.knowLinkLanguageTemplates();
            },
                                    //@ts-ignore
            runtimeAddFriends: async (parent, args, context, info) => {
                const { dids } = args;
                core.runtimeService.addFriends(dids);
                //@ts-ignore
                await Promise.all(dids.map(did => core.friendsDirectMessageLanguage(did)))
                return core.runtimeService.friends();
            },
            //@ts-ignore
            runtimeRemoveFriends: (parent, args, context, info) => {
                const { dids } = args;
                core.runtimeService.removeFriends(dids);
                return core.runtimeService.friends();
            },
            //@ts-ignore
            agentGenerate: async (parent, args, context, info) => {
                await core.agentService.createNewKeys()
                await core.agentService.save(args.passphrase)
                await core.initializeAgentsDirectMessageLanguage()
                return core.agentService.dump()
            },
            //@ts-ignore
            agentImport: async (parent, args, context, info) => {
                const { did, didDocument, keystore, passphrase } = args;
                await core.agentService.initialize(did, didDocument, keystore, passphrase)
                return core.agentService.dump()
            },
            //@ts-ignore
            agentLock: (parent, args, context, info) => {
                core.agentService.lock(args.passphrase)
                return core.agentService.dump()
            },
            //@ts-ignore
            agentUnlock:  (parent, args, context, info) => {
                let failed = false
                try {
                    core.agentService.unlock(args.passphrase)
                } catch(e) {
                    failed = true
                }

                const dump = core.agentService.dump() as any

                if(failed) {
                    dump.error = "Wrong passphrase"
                }

                return dump
            },
            //@ts-ignore
            agentUpdateDirectMessageLanguage: async (parent, args, context, info) => { 
                const { directMessageLanguage } = args;
                let currentAgent = core.agentService.agent;
                if (!currentAgent) {
                    throw Error("No current agent init'd")
                }
                currentAgent.directMessageLanguage = directMessageLanguage;
                await core.agentService.updateAgent(currentAgent);
                return currentAgent;
            },
            //@ts-ignore
            agentUpdatePublicPerspective: async (parent, args, context, info) => { 
                const {perspective} = args;
                let currentAgent = core.agentService.agent;
                if (!currentAgent) {
                    throw Error("No current agent init'd")
                }
                currentAgent.perspective = perspective;
                await core.agentService.updateAgent(currentAgent);
                return currentAgent;
            },
            //@ts-ignore
            expressionCreate: async (parent, args, context, info) => {
                const { languageAddress, content } = args
                const langref = { address: languageAddress } as LanguageRef
                const expref = await core.languageController.expressionCreate(langref, JSON.parse(content))
                return exprRef2String(expref)
            },
            //@ts-ignore
            languageApplyTemplateAndPublish: async (parent, args, context, info) => {
                const { sourceLanguageHash, templateData } = args;
                return await core.languageApplyTemplateAndPublish(sourceLanguageHash, JSON.parse(templateData));
            },
            //@ts-ignore
            languagePublish: async (parent, args, context, info) => {
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
                console.debug("GQL publish:", meta, expression)
                return meta
            },
            //@ts-ignore
            languageWriteSettings: async (parent, args, context, info) => {
                const { languageAddress, settings } = args
                const langref = { name: '', address: languageAddress }
                const lang = await core.languageController.languageByRef(langref)
                langref.name = lang.name
                await core.languageController.putSettings(langref, JSON.parse(settings))
                return true
            },
            //@ts-ignore
            neighbourhoodJoinFromUrl: async (parent, args, context, info) => {
                // console.log(new Date(), "GQL install shared perspective", args);
                const { url } = args;
                try{
                    return await core.installNeighbourhood(url);
                } catch(e) {
                    console.error(`Error while trying to join neighbourhood '${url}':`, e)
                    throw e
                }
                
            },
            //@ts-ignore
            neighbourhoodPublishFromPerspective: async (parent, args, context, info) => {
                const { linkLanguage, meta, perspectiveUUID } = args
                const perspective = core.perspectivesController.perspective(perspectiveUUID)
                if(perspective.neighbourhood && perspective.sharedUrl)
                    throw new Error(`Perspective ${perspective.name} (${perspective.uuid}) is already shared`);

                try{
                    return await core.neighbourhoodPublishFromPerspective(perspectiveUUID, linkLanguage, meta)
                } catch(e) {
                    console.error(`Error while trying to publish:`, e)
                    throw e
                }
                
            },
            //@ts-ignore
            perspectiveAdd: (parent, args, context, info) => {
                const { name } = args;
                return core.perspectivesController.add(name)
            },
            //@ts-ignore
            perspectiveAddLink: (parent, args, context, info) => {
                const { uuid, link } = args
                const perspective = core.perspectivesController.perspective(uuid)
                return perspective.addLink(link)
            },
            //@ts-ignore
            perspectiveRemove: (parent, args, context, info) => {
                const { uuid } = args
                core.perspectivesController.remove(uuid)
                return true
            },
            //@ts-ignore
            perspectiveRemoveLink: (parent, args, context, info) => {
                // console.log("GQL| removeLink:", args)
                const { uuid, link } = args
                const perspective = core.perspectivesController.perspective(uuid)
                perspective.removeLink(link)
                return true
            },
            //@ts-ignore
            perspectiveUpdate: (parent, args, context, info) => {
                const { uuid, name } = args
                return core.perspectivesController.update(uuid, name);
            },
            //@ts-ignore
            perspectiveUpdateLink: (parent, args, context, info) => {
                const { uuid, oldLink, newLink } = args
                const perspective = core.perspectivesController.perspective(uuid)
                return perspective.updateLink(oldLink, newLink)
            },
            //@ts-ignore
            runtimeOpenLink: (parent, args) => {
                const { url } = args
                console.log("openLinkExtern:", url)
                //shell.openExternal(url)
                return true
            },
            runtimeQuit: () => {
                process.exit(0)
                return true
            },
            //@ts-ignore
            runtimeHcAddAgentInfos: async (parent, args) => {
                const { agentInfos } = args
                //@ts-ignore
                const parsed = JSON.parse(agentInfos).map(info => {
                    return {
                        //@ts-ignore
                        agent: Buffer.from(info.agent.data),
                        //@ts-ignore
                        signature: Buffer.from(info.signature.data),
                        //@ts-ignore
                        agent_info: Buffer.from(info.agent_info.data)
                    }
                })

                await core.holochainAddAgentInfos(parsed)
                return true
            },

            //@ts-ignore
            runtimeSetStatus: async (parent, args) => {
                const { status } = args
                const dmLang = await core.myDirectMessageLanguage()
                await dmLang.directMessageAdapter!.setStatus(status)
                return true
            },

            //@ts-ignore
            runtimeFriendSendMessage: async (parent, args) => {
                const { did, message } = args
                if(!core.runtimeService.friends().includes(did)) throw `${did} is not a friend`
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
                    core.runtimeService.addMessageOutbox(did, messageExpression)
                }
                return wasSent
            }

        },

        Subscription: {
            agentUpdated: {
                subscribe: () => pubsub.asyncIterator(PubSub.AGENT_UPDATED),
                //@ts-ignore
                resolve: payload => payload
            },
            runtimeMessageReceived: {
                subscribe: () => pubsub.asyncIterator(PubSub.DIRECT_MESSAGE_RECEIVED),
                //@ts-ignore
                resolve: payload => payload
            },
            perspectiveAdded: {
                subscribe: () => pubsub.asyncIterator(PubSub.PERSPECTIVE_ADDED_TOPIC),
                //@ts-ignore
                resolve: payload => payload?.perspective
            },
            perspectiveLinkAdded: {
                //@ts-ignore
                subscribe: (parent, args, context, info) => {
                    return withFilter(
                        () => pubsub.asyncIterator(PubSub.LINK_ADDED_TOPIC),
                        (payload, argsInner) => payload.perspective.uuid === argsInner.uuid
                    )(undefined, args)
                },
                //@ts-ignore
                resolve: payload => payload?.link
            },
            perspectiveLinkRemoved: {
                //@ts-ignore
                subscribe: (parent, args, context, info) => withFilter(
                    () => pubsub.asyncIterator(PubSub.LINK_REMOVED_TOPIC),
                    (payload, variables) => payload.perspective.uuid === variables.uuid
                )(undefined, args),
                //@ts-ignore
                resolve: payload => payload?.link
            },
            perspectiveUpdated: {
                subscribe: () => pubsub.asyncIterator(PubSub.PERSPECTIVE_UPDATED_TOPIC),
                //@ts-ignore
                resolve: payload => payload?.perspective
            },
            perspectiveRemoved: {
                subscribe: () => pubsub.asyncIterator(PubSub.PERSPECTIVE_REMOVED_TOPIC),
                //@ts-ignore
                resolve: payload => payload?.uuid
            }
        },

        ExpressionRendered: {
            //@ts-ignore
            language: async (expression) => {
                //console.log("GQL LANGUAGE", expression)
                const lang = await core.languageController.languageForExpression(expression.ref) as any
                lang.address = expression.ref.language.address
                return lang
            },

            //@ts-ignore
            icon: (expression) => {
                return { code: core.languageController.getIcon(expression.ref.language) }
            }
        },

        LanguageHandle: {
            //@ts-ignore
            constructorIcon: async (language) => {
                const code = await core.languageController.getConstructorIcon(language);
                if (code) {
                    return { code }
                } else {
                    return { code: "" }
                }
            },
            //@ts-ignore
            icon: async (language) => {
                const code = await core.languageController.getIcon(language);
                if (code) {
                    return { code }
                } else {
                    return { code: "" }
                }
            },
            //@ts-ignore
            settings: async (language) => {
                return JSON.stringify(core.languageController.getSettings(language))
            },
            //@ts-ignore
            settingsIcon: async (language) => {
                const code = await core.languageController.getSettingsIcon(language)
                if(code)
                    return { code }
                else
                    return null
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
        },

        DateTime: new GraphQLScalarType({
            name: 'Date',
            description: 'Date custom scalar type',
            parseValue(value) {
              return new Date(value); // value from the client
            },
            serialize(value) {
              return value.toISOString(); // value sent to the client
            }
        }),
    }
}

export interface StartServerParams {
    core: PerspectivismCore, 
    mocks: boolean,
    port: number,
}

export async function startServer(params: StartServerParams) {
    const { core, mocks, port } = params
    const resolvers = createResolvers(core)
    const typeDefs = gql(typeDefsString)
    const server = new ApolloServer({ typeDefs, resolvers, mocks });
    const { url, subscriptionsUrl } = await server.listen({ port })
    return { url, subscriptionsUrl }
}
