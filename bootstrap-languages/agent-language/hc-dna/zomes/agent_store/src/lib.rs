use agent_store_integrity::{AgentExpression, Did, EntryTypes, LinkTypes};
use hdk::prelude::*;

mod utils;

use utils::{err, get_latest_link};

#[hdk_extern]
fn init(_: ()) -> ExternResult<InitCallbackResult> {
    Ok(InitCallbackResult::Pass)
}

#[hdk_extern]
pub fn create_agent_expression(agent_expression: AgentExpression) -> ExternResult<()> {
    let did = EntryTypes::Did(Did(agent_expression.author.clone()));
    let did_hash = hash_entry(&did)?;

    println!("Creating did entry: {:?}", did);

    create_entry(&did)?;

    println!("Creating agent expression entry: {:?}", agent_expression);

    let agent_expression = EntryTypes::AgentExpression(agent_expression);
    let agent_expression_hash = hash_entry(&agent_expression)?;
    create_entry(&agent_expression)?;

    println!("Creating link between did and agent expression");

    //Link profile entry to did
    create_link(
        did_hash,
        agent_expression_hash,
        LinkTypes::ProfileLink,
        LinkTag::new("profile"),
    )?;

    println!("Agent expression created");

    Ok(())
}

#[hdk_extern]
pub fn get_agent_expression(did: Did) -> ExternResult<Option<AgentExpression>> {
    let expression_links = get_latest_link(
        hash_entry(did)?,
        Some(LinkTag::new("profile")),
    )
    .map_err(|error| err(format!("{}", error).as_ref()))?;

    match expression_links {
        Some(link) => {
            match get(
                link.target
                    .into_entry_hash()
                    .expect("could not get action hash"),
                GetOptions::default(),
            )
            .map_err(|error| err(format!("{}", error).as_ref()))?
            {
                Some(elem) => {
                    let exp_data: AgentExpression = elem
                        .entry()
                        .to_app_option()
                        .map_err(|sb_err| err(&format!("{}", sb_err)))?
                        .ok_or(err(
                            "Could not deserialize link expression data into Profile type",
                        ))?;
                    Ok(Some(exp_data))
                }
                None => Ok(None),
            }
        }
        None => Ok(None),
    }
}

//Validation logic

//Validate did entry
//Validate did syntax
//Validate integrity of DID

//Validate did document entry
//TODO: resolve did subject and validate that did documents are the same.
//Validate that signed_agent inside did document is the same agent who is trying to post this did document. This is the validation stage that allows for the "claiming/pairing" of a did on this DHT.
//Note that this signed_agent validation doesnt give us anything that isnt already handled by holochain validation logic. It is however useful if we can do did resolving. So we can keep it here ready for the future.
//In the case that we can resolve did's since we can trust a given did subject document pair we can deduce the the agent making the post is the same agent who authored the first claim of this DID on some other system.

//Validate create profile entry
//Validate length/size of entry?
//Perhaps validate that agent does not have more than N profiles already post'd as to reduce possibility of someone spamming network?

//Validate update profile entry
//Validate length/size of entry
//Validate that agent creating update is the same agent who made the first profile entry
//Actually possible here that we could allow multiple agents to update profile entry if the did document had multiple signed_agent fields where each signed_agent was allowed editable agent
//Editing from multiple agents would require that profile has links to did document so that we can check this signed agents field

//Validate links

//did subject -> did document:
//Validate that author of subject and document are the same. Since creating a did document entry requires the validation of signed_agent field we can be sure that author of did document is the rightful owner of this did.
//Validate that subject inside did document is the same as the did subject as source for this link.

//did subject -> profile
//Validate that there is a link between did subject -> did document. This gives us the verification that creator of did subject is same agent as creator of did document.
//Validate that agent posting profile is the same agent who created the did subject.
