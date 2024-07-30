import type { Address, Agent, Expression, PublicSharing, LanguageContext, HolochainLanguageDelegate, ExpressionAdapter, AgentService } from "https://esm.sh/@perspect3vism/ad4m@0.5.0";
import { DNA_NICK } from "./build/dna.js";

export default class ExpressionAdapterImpl implements ExpressionAdapter {
  #DNA: HolochainLanguageDelegate;
  #agent: AgentService;
  putAdapter: PublicSharing

  constructor(context: LanguageContext) {
    this.#DNA = context.Holochain as HolochainLanguageDelegate;
    this.#agent = context.agent;
    this.putAdapter = new Sharing(context)
  }

  async get(did: Address): Promise<Expression> {
    console.log("Getting expression with did", did);
    const expression = await this.#DNA.call(
      DNA_NICK,
      "agent_store",
      "get_agent_expression",
      did
    );

    return expression
  };
}

class Sharing implements PublicSharing {
  #DNA: HolochainLanguageDelegate;
  #agent: AgentService;

  constructor(context: LanguageContext) {
    this.#DNA = context.Holochain as HolochainLanguageDelegate;
    this.#agent = context.agent;
  }

  async createPublic(content: Agent): Promise<Address> {
    console.log("ppppppp 1", JSON.stringify(content));
    if(!content['did'] || !content['perspective'] || !content['perspective'].links)
      throw "Content must be an Agent object"
    console.log("ppppppp 2");
    const agent = content as Agent
    if(agent.did != this.#agent.did)
      throw "Can't set Agent Expression for foreign DID - only for self"
    console.log("ppppppp 3");
    if(!agent.directMessageLanguage)
      agent.directMessageLanguage = undefined

    agent.perspective!.links.forEach(link => {
      delete link.proof.valid
      delete link.proof.invalid
      delete link.status
    })

    console.log("ppppppp 4", JSON.stringify(agent));

    const expression = this.#agent.createSignedExpression(agent);

    console.log("ppppppp 5", JSON.stringify(expression));

    await this.#DNA.call(
      DNA_NICK,
      "agent_store",
      "create_agent_expression",
      expression
    );

    console.log("ppppppp 6", agent.did);

    return agent.did
  }
}