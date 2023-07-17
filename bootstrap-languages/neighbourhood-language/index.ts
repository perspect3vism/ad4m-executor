import type { Address, Language, LanguageContext, ExpressionUI, Interaction } from "https://esm.sh/@perspect3vism/ad4m@0.5.0";
import Adapter from "./adapter.ts";

function interactions(expression: Address): Interaction[] {
  return [];
}

export class UI implements ExpressionUI {
  icon(): string {
    return "";
  }

  constructorIcon(): string {
    return "";
  }
}

export const name = "neighbourhood-store";

export const PROXY_URL = "https://bootstrap-store-gateway.perspect3vism.workers.dev/";

export default async function create(context: LanguageContext): Promise<Language> {
  //const Holochain = context.Holochain as HolochainLanguageDelegate;
  //await Holochain.registerDNAs([{ file: DNA, nick: DNA_NICK }]);
  const expressionAdapter = new Adapter(context);
  //const expressionUI = new UI();

  return {
    name,
    expressionAdapter,
    //expressionUI,
    interactions,
  } as Language;
}
