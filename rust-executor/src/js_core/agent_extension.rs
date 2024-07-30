use coasys_juniper::{FieldError, Value};
use deno_core::{error::AnyError, include_js_files, op2, Extension, Op};
use std::borrow::Cow;
use crate::{agent::{create_signed_expression, did, did_document, sign, sign_string_hex, signing_key_id, AgentService}, graphql::graphql_types::{Agent, AgentStatus}};

use super::utils::sort_json_value;

#[op2]
#[serde]
fn agent_did_document() -> Result<did_key::Document, AnyError> {
    Ok(did_document())
}

#[op2]
#[string]
fn agent_signing_key_id() -> Result<String, AnyError> {
    Ok(signing_key_id())
}

#[op2]
#[string]
fn agent_did() -> Result<String, AnyError> {
    Ok(did())
}

#[op2]
#[serde]
fn agent_create_signed_expression(#[serde] data: serde_json::Value) -> Result<serde_json::Value, AnyError> {
    let sorted_json = sort_json_value(&data);
    let signed_expression = create_signed_expression(sorted_json)?;
    Ok(serde_json::to_value(signed_expression)?)
}

#[op2]
#[string]
fn agent_create_signed_expression_stringified(#[string] data: String) -> Result<String, AnyError> {
    let data: serde_json::Value = serde_json::from_str(&data)?;
    let sorted_json = sort_json_value(&data);
    let signed_expression = create_signed_expression(sorted_json)?;
    let stringified = serde_json::to_string(&signed_expression)?;
    Ok(stringified)
}

#[op2]
#[serde]
fn agent_sign(#[buffer] payload: &[u8]) -> Result<Vec<u8>, AnyError> {
    sign(payload)
}


#[op2]
#[string]
fn agent_sign_string_hex(#[string] payload: String) -> Result<String, AnyError> {
    sign_string_hex(payload)
}

#[op2(fast)]
fn agent_is_initialized() -> Result<bool, AnyError> {
    AgentService::with_global_instance(|agent_service| {
        Ok(agent_service.is_initialized())
    })
}

#[op2(fast)]
fn agent_is_unlocked() -> Result<bool, AnyError> {
    AgentService::with_global_instance(|agent_service| {
        Ok(agent_service.is_unlocked())
    })
}

#[op2]
#[serde]
fn agent() -> Result<Agent, AnyError> {
   AgentService::with_global_instance(|agent_service| {
        let mut agent = agent_service.agent.clone().ok_or(FieldError::new(
            "Agent not found",
            Value::<Agent>::null(),
        )).unwrap();

        if agent.perspective.is_some() {
            agent.perspective.as_mut().unwrap().verify_link_signatures();
        }

        Ok(agent)
    })
}

#[op2]
#[serde]
fn agent_load() -> Result<AgentStatus, AnyError> {
    AgentService::with_mutable_global_instance(|agent_service| {
        agent_service.load();
        Ok(agent_service.dump())
    })
}

#[op2(async)]
#[serde]
async fn agent_unlock(#[string] passphrase: String) -> Result<(), AnyError> {
    AgentService::with_global_instance(|agent_service| {
        agent_service.unlock(passphrase);

        Ok(())
    })
}

#[op2(async)]
#[serde]
async fn agent_lock(#[string] passphrase: String) -> Result<(), AnyError> {
    AgentService::with_global_instance(|agent_service| {
        agent_service.lock(passphrase);

        Ok(())
    })
}

#[op2]
fn save_agent_profile(#[serde] agent: Agent) -> Result<(), AnyError> {
    AgentService::with_mutable_global_instance(|agent_service| {
        agent_service.save_agent_profile(agent);

        Ok(())
    })
}

deno_core::extension!(
    agent_service,
    ops = [agent_did_document, agent_signing_key_id, agent_did, agent_create_signed_expression, agent_create_signed_expression_stringified, agent_sign, agent_sign_string_hex, agent_is_initialized, agent_is_unlocked, agent, agent_load, agent_unlock, agent_lock, save_agent_profile],
    esm_entry_point = "ext:agent_service/agent_extension.js",
    esm = [dir "src/js_core", "agent_extension.js"]
);