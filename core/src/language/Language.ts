import type { Address } from '../Address'
import { DID } from '../DID';
import type { Expression } from '../expression/Expression'
import { Perspective, PerspectiveExpression } from '../perspectives/Perspective';
import { PerspectiveDiff } from '../perspectives/PerspectiveDiff';
import { InputType, Field, ObjectType } from "type-graphql";
import { PerspectiveState } from '../perspectives/PerspectiveHandle';
import { LinkQuery } from '../perspectives/LinkQuery';

/** Interface of AD4M Languages
 * 
 * Any JavaScript module that implements a create() function that returns an object that implements this interface
 * is a valid AD4M language.
 * So the AD4M-internal representation of a language is an object that implements this interface.
 * 
 * Since there are a few different kinds of languages, this interface is split into optional sub-interfaces.
 * The only required property is the name of the language.
 * 
 * The most usual kind of language is the "Expression Language", which is a language that can be used to create
 * and share Expressions.
 * For that, implement the expressionsAdapter and expressionUI interface.
 * 
 * The second most common kind of language is the "Link Language", which is a language that builds the core
 * of AD4M Neighbourhoods.
 * For that, implement the linksAdapter interface.
 */
export interface Language {
    readonly name: string;

    /** Flagging expressions as immutable to enable
     * expression caching in the ad4m-executor
     */
    isImmutableExpression?(expression: Address): boolean;

    // Adapter implementations:

    /** ExpressionAdapter implements means of getting an Expression
     * by address and putting an expression
     */
    readonly expressionAdapter?: ExpressionAdapter;

    /** Interface for getting UI/web components for rendering Expressions of this Language */
    readonly expressionUI?: ExpressionUI;

    // TODO: Rename linksAdapter to perspectiveSyncAdapter needs a lot of changes elsewhere...
    /** Interface of LinkLanguages for the core implementation of Neighbourhoods */
    readonly perspectiveSyncAdapter?: PerspectiveSyncAdapter;

    /** Interface for Languages that implement a query return a Perspective (snapshot)
     * Used for back-links and wrapping of APIs that implement queries.
     */
    readonly pespectiveQueryAdapter?: PerspectiveQueryAdapter;

    /** Additional Interface of LinkLanguages that support telepresence features, 
     * that is: 
     *  - seeing who is online and getting a status
     *  - sending/receiveing p2p signals to other online agents without affecting
     *    the shared Perspective of the Neighbourhood
     *  (see TelepresenceAdapter for more details)
    */
    readonly telepresenceAdapter?: TelepresenceAdapter;

    /** Implementation of a Language that defines and stores Languages*/
    readonly languageAdapter?: LanguageAdapter;

    /** Optional adapter for getting Expressions by author */
    readonly getByAuthorAdapter?: GetByAuthorAdapter;
    /** Optional adapter for getting all Expressions */
    readonly getAllAdapter?: GetAllAdapter;

    /** Optional adapter for direct messaging between agents */
    readonly directMessageAdapter?: DirectMessageAdapter;
    
    /** Interface for providing UI components for the settings of this Language */
    readonly settingsUI?: SettingsUI;

    /** Optional function to make any cleanup/teardown if your language gets deleting in the ad4m-executor */
    readonly teardown?: () => void;

    /** All available interactions this agent could execute on given expression */
    interactions(expression: Address): Interaction[];
}

/** UI factories returning web components */
export interface ExpressionUI {
    /** Returns JS code of a web component that renders the given expression */
    icon(): string; 
    /** Returns JS code of a web component used to create new expressions */
    constructorIcon(): string;
}

export interface SettingsUI {
    settingsIcon(): string;
}
/** Interface for the most common Expression Languages */
export interface ExpressionAdapter {
    /** Returns an Expression by address, or null if there is no Expression
     * with that given address
     */
    get(address: Address): Promise<Expression | null>;

    /** Strategy for putting an expression with needs to be different
     * for those two cases:
     * 1. PublicSharing means that this language supports the creation
     *    and sharing of Expressions, which is the common use-case
     * 2. ReadOnlyLanguage means that the Language implements a pre-defined
     *    set of expressions (which can be infinite or finite).
     *    For example the url-iframe Language which directly maps URLs to
     *    addresses - meaning every well formed URL is an address in this
     *    Language. Or a potential Language implementing the verbs/predicates
     *    of a spec like FOAF.
     */
    putAdapter: PublicSharing | ReadOnlyLanguage;
}

/** Implement this interface if your Language supports creation of sharing
 * of Expressions.
 * See ExpressionAdapter
 */
export interface PublicSharing {
    /** Create an Expression and shares it.
     * Return the Expression's address.
     * @param content is the object created by the constructorIcon component
     */
    createPublic(content: object): Promise<Address>;
}

/** Implement this interface if your Language is defined over a static
 * set of pre-defined Expressions.
 */
export interface ReadOnlyLanguage {
    /** This just calculates the address of an object
     * @param content is the object created by the constructorIcon component
     */
    addressOf(content: object): Promise<Address>;
}

export interface LanguageAdapter {
    getLanguageSource(address: Address): Promise<string>;
}

// Implement this if your Language supports retrieval of all Expressions
// authored by a given agent
export interface GetByAuthorAdapter {
    /// Get expressions authored by a given Agent/Identity
    getByAuthor(author: DID, count: number, page: number): Promise<Expression[] | null>;
}

// Implement this if your Language supports retrieval of all Expressions
// stored in the space of that Language.
// Might not be trivial (without trade-off) for Holochain or DHTs
// in general - hence not a required interface.
export interface GetAllAdapter {
    /// Get expressions authored by a given Agent/Identity
    getAll(filter: any, count: number, page: number): Promise<Expression[] | null>;
}

export type PerspectiveDiffObserver = (diff: PerspectiveDiff)=>void;
export type SyncStateChangeObserver = (state: PerspectiveState)=>void;

/** Interface for "Link Languages" that facilitate the synchronization
 * between agents' local Perspectives inside a Neighbourhood.
 * The assumption is that every version of the shared Perspective
 * is labeled with a unique revision string.
 * Changes are committed and retrieved through diffs.
 * Think of a PerspectiveSyncAdapter as a git branch to which agents commit
 * their changes to and pull diffs from their current revision
 * to the latest one.
 */
export interface PerspectiveSyncAdapter {
    writable(): boolean;
    public(): boolean;
    others(): Promise<DID[]>;

    /** What revision are we on now -> what changes are included in output of render() */
    currentRevision(): Promise<string>;

    /** 
     * Check for and get new changes, 
     * notify others of local changes.
     * This function will be called every 
     * few seconds by the ad4m-executor.
     *  */
    sync(): Promise<PerspectiveDiff>;

    /** Returns the full, rendered Perspective at currentRevision */
    render(): Promise<Perspective>;

    /** Publish changes */
    commit(diff: PerspectiveDiff): Promise<string>;

    /** Get push notification when a diff got published */
    addCallback(callback: PerspectiveDiffObserver);

    /** Add a sync state callback method */
    addSyncStateChangeCallback(callback: SyncStateChangeObserver);
}

export type MessageCallback = (message: PerspectiveExpression) => void;
export type StatusCallback = (caller: DID) => Perspective;
export interface DirectMessageAdapter {
    recipient(): DID;

    status(): Promise<PerspectiveExpression | void>;
    sendP2P(message: Perspective): Promise<PerspectiveExpression|void>;
    sendInbox(message: Perspective): Promise<PerspectiveExpression|void>;

    setStatus(status: PerspectiveExpression);
    inbox(filter?: string): Promise<PerspectiveExpression[]>
    addMessageCallback(callback: MessageCallback);
}

@ObjectType()
export class InteractionParameter {
    @Field()
    name: string

    @Field()
    type: string
}

@ObjectType()
export class InteractionMeta {
    @Field()
    label: string;

    @Field()
    name: string;

    @Field(type => [InteractionParameter])
    parameters: InteractionParameter[]
}
export interface Interaction {
    readonly label: string;
    readonly name: string;
    readonly parameters: InteractionParameter[];
    execute(parameters: object): Promise<string|null>;
}

@InputType()
export class InteractionCall {
    @Field()
    name: string;
    @Field()
    parametersStringified: string;

    public get parameters(): object {
        return JSON.parse(this.parametersStringified)
    }

    constructor(name: string, parameters: object) {
        this.name = name
        this.parametersStringified = JSON.stringify(parameters)
    }
}

@ObjectType()
export class OnlineAgent {
    @Field()
    did: DID
    @Field()
    status: PerspectiveExpression
}

export type TelepresenceSignalCallback = (payload: PerspectiveExpression) => void;
export interface TelepresenceAdapter {
    setOnlineStatus(status: PerspectiveExpression): Promise<void>;
    getOnlineAgents(): Promise<OnlineAgent[]>;

    sendSignal(remoteAgentDid: string, payload: PerspectiveExpression): Promise<object>;
    sendBroadcast(payload: PerspectiveExpression): Promise<object>;
    registerSignalCallback(callback: TelepresenceSignalCallback): Promise<void>;
}


/** Interface for Languages that implement queries returning links, i.e. a Perspective (-snapshot)
 * Main differentiation between these Languages and LinkLanguages is that this enables
 * access to other shared perspectives without forcing a full-sync.
 * 
 * All PerspectiveQuery Languages are supposed to implement `linkQuery` which is a simple graph query
 * specifying non or all of source, predicate, target of the links we want to get.
 * This is enough to implement simple back-links.
 * 
 * Prolog queries are optional since this requires a Prolog engine to be available.
 * 
 */
export interface PerspectiveQueryAdapter {
    /** Same semantic as PerspectiveProxy.get(LinkQuery) */
    linkQuery(query: LinkQuery): Promise<Perspective>;

    /** Tells ADAM if Prolog queries are implemented by this Language.
     * If not, prologQuery won't be used, instead in some circumstances,
     * linkQuery() might be called with an all-query, followed by using
     * ADAM's internal Prolog engine on the result.
     */
    supportsPrologQueries(): boolean;

    /** Same semantic as PerspectiveProxy.infer, will return plain Prolog results */
    infer(prologQuery: string): Promise<any>

    /** Specify which links shall be returned through Prolog.
     * Assumes unbound variables in query that describe a LinkExpression:
     *  - Source
     *  - Predicate
     *  - Target
     *  - Author
     *  - Timestamp
     * Will construct a Perspective where each link is a solution to the query.
     */
    prologQuery(query: string): Promise<Perspective>;
}