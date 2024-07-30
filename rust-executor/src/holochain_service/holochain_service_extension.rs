use std::borrow::Cow;

use deno_core::{error::AnyError, include_js_files, op2, Extension, Op, anyhow::anyhow};
use holochain::{
    conductor::api::AppInfo,
    prelude::{
        agent_store::AgentInfoSigned, hash_type::Agent, ExternIO, HoloHash, InstallAppPayload,
        Signature, ZomeCallResponse,
    },
};
use tokio::time::timeout;
use std::time::Duration;
use log::error;

use crate::holochain_service::{HolochainService, LocalConductorConfig};

use super::get_holochain_service;

// The duration to use for timeouts
const TIMEOUT_DURATION: Duration = Duration::from_secs(10);

const APP_INSTALL_TIMEOUT_DURATION: Duration = Duration::from_secs(20);

#[op2(async)]
async fn start_holochain_conductor(#[serde] config: LocalConductorConfig) -> Result<(), AnyError> {
    HolochainService::init(config).await?;
    Ok(())
}

#[op2(async)]
async fn log_dht_status() -> Result<(), AnyError> {
    let res = timeout(
        TIMEOUT_DURATION, 
        async {
            let interface = get_holochain_service().await;
            interface.log_network_metrics().await
        }
    ).await;
    match res {
        Ok(_) => Ok(()),
        Err(_) => {
            error!("Timeout error logging dht status");
            Ok(())
        },
    }
}

#[op2(async)]
#[serde]
async fn install_app(#[serde] install_app_payload: InstallAppPayload) -> Result<AppInfo, AnyError> {
    timeout(
        APP_INSTALL_TIMEOUT_DURATION,
        async {
            let interface = get_holochain_service().await;
            interface.install_app(install_app_payload).await
        }
    ).await.map_err(|_| anyhow!("Timeout error"))?
}

#[op2(async)]
#[serde]
async fn get_app_info(#[string] app_id: String) -> Result<Option<AppInfo>, AnyError> {
    timeout(
        TIMEOUT_DURATION,
        async {
            let interface = get_holochain_service().await;
            interface.get_app_info(app_id).await
        }
    ).await.map_err(|_| anyhow!("Timeout error"))?
}

//TODO
//Have install app use lair to generate the membrane proof
#[op2(async)]
#[serde]
async fn call_zome_function(
    #[string] app_id: String,
    #[string] cell_name: String,
    #[string] zome_name: String,
    #[string] fn_name: String,
    #[serde] payload: Option<ExternIO>,
) -> Result<ZomeCallResponse, AnyError> {
    timeout(
        TIMEOUT_DURATION,
        async {
            let interface = get_holochain_service().await;
            interface.call_zome_function(app_id, cell_name, zome_name, fn_name, payload).await
        }
    ).await.map_err(|_| anyhow!("Timeout error"))?
}

#[op2(async)]
#[serde]
async fn agent_infos() -> Result<Vec<AgentInfoSigned>, AnyError> {
    timeout(
        TIMEOUT_DURATION,
        async {
            let interface = get_holochain_service().await;
            interface.agent_infos().await
        }
    ).await.map_err(|_| anyhow!("Timeout error"))?
}

#[op2(async)]
async fn add_agent_infos(#[serde] agent_infos_payload: Vec<AgentInfoSigned>) -> Result<(), AnyError> {
    timeout(
        TIMEOUT_DURATION,
        async {
            let interface = get_holochain_service().await;
            interface.add_agent_infos(agent_infos_payload).await
        }
    ).await.map_err(|_| anyhow!("Timeout error"))?
}

#[op2(async)]
async fn remove_app(#[string] app_id: String) -> Result<(), AnyError> {
    timeout(
        TIMEOUT_DURATION,
        async {
            let interface = get_holochain_service().await;
            interface.remove_app(app_id).await
        }
    ).await.map_err(|_| anyhow!("Timeout error"))?
}

#[op2(async)]
#[serde]
async fn sign_string(#[string] data: String) -> Result<Signature, AnyError> {
    timeout(
        TIMEOUT_DURATION,
        async {
            let interface = get_holochain_service().await;
            interface.sign(data).await
        }
    ).await.map_err(|_| anyhow!("Timeout error"))?
}

#[op2(async)]
async fn shutdown() -> Result<(), AnyError> {
    timeout(
        TIMEOUT_DURATION,
        async {
            let interface = get_holochain_service().await;
            interface.shutdown().await
        }
    ).await.map_err(|_| anyhow!("Timeout error"))?
}

#[op2(async)]
#[serde]
async fn get_agent_key() -> Result<HoloHash<Agent>, AnyError> {
    timeout(
        TIMEOUT_DURATION,
        async {
            let interface = get_holochain_service().await;
            interface.get_agent_key().await
        }
    ).await.map_err(|_| anyhow!("Timeout error"))?
}

#[op2(async)]
#[string]
async fn pack_dna(#[string] path: String) -> Result<String, AnyError> {
    timeout(
        TIMEOUT_DURATION,
        async {
            let interface = get_holochain_service().await;
            interface.pack_dna(path).await
        }
    ).await.map_err(|_| anyhow!("Timeout error"))?
}

#[op2(async)]
#[string]
async fn unpack_dna(#[string] path: String) -> Result<String, AnyError> {
    timeout(
        TIMEOUT_DURATION,
        async {
            let interface = get_holochain_service().await;
            interface.unpack_dna(path).await
        }
    ).await.map_err(|_| anyhow!("Timeout error"))?
}

//Implement signal callbacks from dna/holochain to js
deno_core::extension!(
    holochain_service,
    ops = [start_holochain_conductor, log_dht_status, install_app, get_app_info, call_zome_function, agent_infos, add_agent_infos, remove_app, sign_string, shutdown, get_agent_key, pack_dna, unpack_dna],
    esm_entry_point = "ext:holochain_service/holochain_service_extension.js",
    esm = [dir "src/holochain_service", "holochain_service_extension.js"]
);