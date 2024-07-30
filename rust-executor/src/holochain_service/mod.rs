use std::path::PathBuf;
use std::sync::Arc;

use chrono::Duration;
use crypto_box::rand_core::OsRng;
use deno_core::anyhow::anyhow;
use deno_core::error::AnyError;
use futures::stream_select;
use holochain::conductor::api::{AppInfo, AppStatusFilter, CellInfo, ZomeCall};
use holochain::conductor::config::ConductorConfig;
use holochain::conductor::paths::DataRootPath;
use holochain::conductor::{ConductorBuilder, ConductorHandle};
use holochain::prelude::agent_store::AgentInfoSigned;
use holochain::prelude::hash_type::Agent;
use holochain::tracing::instrument::WithSubscriber;
use holochain_types::websocket::AllowedOrigins;
use kitsune_p2p_types::config::{KitsuneP2pTuningParams, KitsuneP2pConfig, NetworkType, TransportConfig};
use kitsune_p2p_types::dependencies::url2::Url2;
use holochain::prelude::{
    ExternIO, HoloHash, InstallAppPayload, Signal,
    Signature, Timestamp, ZomeCallResponse, ZomeCallUnsigned
};
use holochain::test_utils::itertools::Either;
use holochain_types::dna::ValidatedDnaManifest;
use log::{info, error};
use rand::Rng;
use serde::{Deserialize, Serialize};
use tokio::select;
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio::task::yield_now;
use tokio::time::timeout;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;

pub(crate) mod holochain_service_extension;
pub(crate) mod interface;

pub(crate) use interface::{
    get_holochain_service, HolochainServiceInterface,
    HolochainServiceRequest, HolochainServiceResponse, maybe_get_holochain_service
};

use self::interface::set_holochain_service;

const COASYS_BOOTSTRAP_AGENT_INFO: &str = r#"["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"]"#;

pub fn agent_infos_from_str(agent_infos: &str) -> Result<Vec<AgentInfoSigned>, AnyError> {
    let agent_infos: Vec<String> = serde_json::from_str(&agent_infos)?;
    let agent_infos: Vec<AgentInfoSigned> = agent_infos
        .into_iter()
        .map(|encoded_info| {
            let info_bytes = base64::decode(encoded_info)
                .expect("Failed to decode base64 AgentInfoSigned");
            AgentInfoSigned::decode(&info_bytes)
                .expect("Failed to decode AgentInfoSigned")
        })
        .collect();

    Ok(agent_infos)
}

#[derive(Clone)]
pub struct HolochainService {
    pub conductor: ConductorHandle,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalConductorConfig {
    pub passphrase: String,
    pub conductor_path: String,
    pub data_path: String,
    pub use_bootstrap: bool,
    pub use_proxy: bool,
    pub use_local_proxy: bool,
    pub use_mdns: bool,
    pub proxy_url: String,
    pub bootstrap_url: String,
    pub app_port: u16,
}

impl HolochainService {
    pub async fn init(local_config: LocalConductorConfig) -> Result<(), AnyError> {
        let (sender, mut receiver) = mpsc::unbounded_channel::<HolochainServiceRequest>();
        let (stream_sender, stream_receiver) = mpsc::unbounded_channel::<Signal>();
        let (new_app_ids_sender, mut new_app_ids_receiver) = mpsc::unbounded_channel::<AppInfo>();

        let inteface = HolochainServiceInterface {
            sender,
            stream_receiver: Arc::new(Mutex::new(stream_receiver)),
        };

        let (response_sender, response_receiver) = oneshot::channel();

        std::thread::spawn(move || {
            let rt = tokio::runtime::Builder::new_multi_thread()
                .thread_name(String::from("holochain_service"))
                .enable_all()
                .build()
                .expect("Failed to create Tokio runtime");
            let _guard = rt.enter();

            tokio::task::block_in_place(|| {
                rt.block_on(async move {
                    let mut service = HolochainService::new(local_config).await.unwrap();
                    let conductor_clone = service.conductor.clone();

                    

                    // Spawn a new task to forward items from the stream to the receiver
                    let spawned_sig = tokio::spawn(async move {

                        let mut streams: tokio_stream::StreamMap<String, tokio_stream::wrappers::BroadcastStream<Signal>> = tokio_stream::StreamMap::new();
                        conductor_clone.list_apps(Some(AppStatusFilter::Running)).await.unwrap().into_iter().for_each(|app| {                            
                            let sig_broadcasters = conductor_clone.subscribe_to_app_signals(app.installed_app_id.clone());
                            streams.insert(app.installed_app_id.clone(), tokio_stream::wrappers::BroadcastStream::new(sig_broadcasters));
                        });    


                        response_sender
                            .send(HolochainServiceResponse::InitComplete(Ok(())))
                            .unwrap();

                        loop {
                            tokio::select! {
                                Some((_, maybe_signal)) = streams.next() => {
                                    if let Ok(signal) = maybe_signal {
                                        let _ = stream_sender.send(signal);
                                    } else {
                                        log::error!("Got error from Holochain through app signal stream: {:?}", maybe_signal.err().expect("to be error since we're in else case"))
                                    }
                                }
                                Some(new_app_id) = new_app_ids_receiver.recv() => {
                                    let sig_broadcasters = conductor_clone.subscribe_to_app_signals(new_app_id.installed_app_id.clone());
                                    streams.insert(new_app_id.installed_app_id.clone(), tokio_stream::wrappers::BroadcastStream::new(sig_broadcasters));
                                }
                                else => break,
                            }
                            yield_now().await;
                        }
                    });

                    let spawned_receiver = tokio::spawn(async move {
                        while let Some(message) = receiver.recv().await {
                            match message {
                                HolochainServiceRequest::InstallApp(payload, response) => {
                                    match timeout(
                                        std::time::Duration::from_secs(10),
                                        service.install_app(payload)
                                    ).await.map_err(|_| anyhow!("Timeout error; InstallApp call")) {
                                        Ok(result) => {
                                            if let Ok(app_info) = &result {
                                                let _ = new_app_ids_sender.send(app_info.clone());
                                            }
                                            let _ = response.send(HolochainServiceResponse::InstallApp(result));
                                        },
                                        Err(err) => {
                                            let _ = response.send(HolochainServiceResponse::InstallApp(Err(err)));
                                        },
                                    }
                                }
                                HolochainServiceRequest::CallZomeFunction {
                                    app_id,
                                    cell_name,
                                    zome_name,
                                    fn_name,
                                    payload,
                                    response,
                                } => {
                                    match timeout(
                                        std::time::Duration::from_secs(5),
                                        service.call_zome_function(app_id, cell_name, zome_name, fn_name, payload)
                                    ).await.map_err(|_| anyhow!("Timeout error; Call Zome Function")) {
                                        Ok(result) => {
                                            let _ = response.send(HolochainServiceResponse::CallZomeFunction(result));
                                        },
                                        Err(err) => {
                                            let _ = response.send(HolochainServiceResponse::CallZomeFunction(Err(err)));
                                        },
                                    }
                                }
                                HolochainServiceRequest::RemoveApp(app_id, response_tx) => {
                                    match timeout(
                                        std::time::Duration::from_secs(10),
                                        service.remove_app(app_id)
                                    ).await.map_err(|_| anyhow!("Timeout error; Remove App")) {
                                        Ok(result) => {
                                            let _ = response_tx.send(HolochainServiceResponse::RemoveApp(result));
                                        },
                                        Err(err) => {
                                            let _ = response_tx.send(HolochainServiceResponse::RemoveApp(Err(err)));
                                        },
                                    }
                                }
                                HolochainServiceRequest::AgentInfos(response_tx) => {
                                    match timeout(
                                        std::time::Duration::from_secs(3),
                                        service.agent_infos()
                                    ).await.map_err(|_| anyhow!("Timeout error; AgentInfos")) {
                                        Ok(result) => {
                                            let _ = response_tx.send(HolochainServiceResponse::AgentInfos(result));
                                        },
                                        Err(err) => {
                                            let _ = response_tx.send(HolochainServiceResponse::AgentInfos(Err(err)));
                                        },
                                    }
                                }
                                HolochainServiceRequest::AddAgentInfos(agent_infos, response_tx) => {
                                    match timeout(
                                        std::time::Duration::from_secs(3),
                                        service.add_agent_infos(agent_infos)
                                    ).await.map_err(|_| anyhow!("Timeout error; AddAgentInfos")) {
                                        Ok(result) => {
                                            let _ = response_tx.send(HolochainServiceResponse::AddAgentInfos(result));
                                        },
                                        Err(err) => {
                                            let _ = response_tx.send(HolochainServiceResponse::AddAgentInfos(Err(err)));
                                        },
                                    }
                                }
                                HolochainServiceRequest::Sign(data, response_tx) => {
                                    match timeout(
                                        std::time::Duration::from_secs(3),
                                        service.sign(data)
                                    ).await.map_err(|_| anyhow!("Timeout error; Sign")) {
                                        Ok(result) => {
                                            let _ = response_tx.send(HolochainServiceResponse::Sign(result));
                                        },
                                        Err(err) => {
                                            let _ = response_tx.send(HolochainServiceResponse::Sign(Err(err)));
                                        },
                                    }
                                }
                                HolochainServiceRequest::Shutdown(response_tx) => {
                                    match timeout(
                                        std::time::Duration::from_secs(3),
                                        service.shutdown()
                                    ).await.map_err(|_| anyhow!("Timeout error Shutdown")) {
                                        Ok(result) => {
                                            let _ = response_tx.send(HolochainServiceResponse::Shutdown(result));
                                        },
                                        Err(err) => {
                                            let _ = response_tx.send(HolochainServiceResponse::Shutdown(Err(err)));
                                        },
                                    }
                                }
                                HolochainServiceRequest::GetAgentKey(response_tx) => {
                                    match timeout(
                                        std::time::Duration::from_secs(3),
                                        service.get_agent_key()
                                    ).await.map_err(|_| anyhow!("Timeout error; GetAgentKey")) {
                                        Ok(result) => {
                                            let _ = response_tx.send(HolochainServiceResponse::GetAgentKey(result));
                                        },
                                        Err(err) => {
                                            let _ = response_tx.send(HolochainServiceResponse::GetAgentKey(Err(err)));
                                        },
                                    }
                                }
                                HolochainServiceRequest::GetAppInfo(app_id, response_tx) => {
                                    match timeout(
                                        std::time::Duration::from_secs(3),
                                        service.get_app_info(app_id)
                                    ).await.map_err(|_| anyhow!("Timeout error; GetAppInfo")) {
                                        Ok(result) => {
                                            let _ = response_tx.send(HolochainServiceResponse::GetAppInfo(result));
                                        },
                                        Err(err) => {
                                            let _ = response_tx.send(HolochainServiceResponse::GetAppInfo(Err(err)));
                                        },
                                    }
                                }
                                HolochainServiceRequest::LogNetworkMetrics(response_tx) => {
                                    match timeout(
                                        std::time::Duration::from_secs(3),
                                        service.log_network_metrics()
                                    ).await.map_err(|_| anyhow!("Timeout error; LogNetworkMetrics")) {
                                        Ok(result) => {
                                            let _ = response_tx.send(HolochainServiceResponse::LogNetworkMetrics(result));
                                        },
                                        Err(err) => {
                                            let _ = response_tx.send(HolochainServiceResponse::LogNetworkMetrics(Err(err)));
                                        },
                                    }
                                }
                                HolochainServiceRequest::PackDna(path, response_tx) => {
                                    match timeout(
                                        std::time::Duration::from_secs(3),
                                        HolochainService::pack_dna(path)
                                    ).await.map_err(|_| anyhow!("Timeout error; PackDna")) {
                                        Ok(result) => {
                                            let _ = response_tx.send(HolochainServiceResponse::PackDna(result));
                                        },
                                        Err(err) => {
                                            let _ = response_tx.send(HolochainServiceResponse::PackDna(Err(err)));
                                        },
                                    }
                                }
                                HolochainServiceRequest::UnPackDna(path, response_tx) => {
                                    match timeout(
                                        std::time::Duration::from_secs(3),
                                        HolochainService::unpack_dna(path)
                                    ).await.map_err(|_| anyhow!("Timeout error; UnpackDna")) {
                                        Ok(result) => {
                                            let _ = response_tx.send(HolochainServiceResponse::UnPackDna(result));
                                        },
                                        Err(err) => {
                                            let _ = response_tx.send(HolochainServiceResponse::UnPackDna(Err(err)));
                                        },
                                    }
                                }
                            };
                        };
                        error!("Holochain service receiver closed");
                    });

                    select! {
                        _ = spawned_sig => {},
                        _ = spawned_receiver => {},
                    }

                    error!("Holochain service exited")
                });
            })
        });

        match response_receiver.await? {
            HolochainServiceResponse::InitComplete(result) => result?,
            _ => unreachable!(),
        };

        // inteface.add_agent_infos(agent_infos_from_str(COASYS_BOOTSTRAP_AGENT_INFO).expect("Couldn't deserialize hard-wired AgentInfo")).await?;

        set_holochain_service(inteface).await;

        Ok(())
    }

    pub async fn new(local_config: LocalConductorConfig) -> Result<HolochainService, AnyError> {
        let conductor_yaml_path =
            std::path::Path::new(&local_config.conductor_path).join("conductor_config.yaml");
        let config = if conductor_yaml_path.exists() {
            let config = ConductorConfig::load_yaml(&conductor_yaml_path)?;
            config
        } else {
        let mut config = ConductorConfig::default();
        let data_root_path: DataRootPath = PathBuf::from(local_config.conductor_path.clone()).into();
            config.data_root_path = Some(data_root_path);
            config.admin_interfaces = None;

            let mut kitsune_config = KitsuneP2pConfig::default();
            let tuning_params = KitsuneP2pTuningParams::default().as_ref().clone();

            // How long should we hold off talking to a peer
            // we've previously gotten errors speaking to.
            // [Default: 5 minute; now updated to 2 minutes]
            // tuning_params.gossip_peer_on_error_next_gossip_delay_ms = 1000 * 60 * 2;

            // How often should we update and publish our agent info?
            // [Default: 5 minutes; now updated to 2 minutes]
            // tuning_params.gossip_agent_info_update_interval_ms = 1000 * 60 * 2;

            kitsune_config.tuning_params = Arc::new(tuning_params);

            if local_config.use_bootstrap {
                // prod - https://bootstrap.holo.host
                // staging - https://bootstrap-staging.holo.host
                // dev - https://bootstrap-dev.holohost.workers.dev
                // own - http://207.148.16.17:38245
                kitsune_config.bootstrap_service = Some(Url2::parse(local_config.bootstrap_url));
            } else {
                kitsune_config.bootstrap_service = None;
            }
            if local_config.use_mdns {
                kitsune_config.network_type = NetworkType::QuicMdns;
            } else {
                kitsune_config.network_type = NetworkType::QuicBootstrap;
            }
            if local_config.use_proxy {
                kitsune_config.transport_pool = vec![TransportConfig::WebRTC {
                    // prod - wss://signal.holo.host
                    // dev - wss://signal.holotest.net
                    // our - ws://207.148.16.17:42697
                    signal_url: local_config.proxy_url,
                    webrtc_config: None
                }];
            } else {
                kitsune_config.transport_pool = vec![
                    TransportConfig::Mem {},
                    TransportConfig::WebRTC {
                        signal_url: local_config.proxy_url,
                        webrtc_config: None
                    },
                ];
            }
            config.network = kitsune_config;

            config
        };

        info!("Starting holochain conductor with config: {:#?}", config);
        let conductor = ConductorBuilder::new()
            .config(config)
            .passphrase(Some(local_config.passphrase.as_bytes().into()))
            .build()
            .await;

        if let Err(e) = conductor {
            info!("Could not start holochain conductor: {:#?}", e);
            panic!("Could not start holochain conductor: {:#?}", e);
        }

        info!("Started holochain conductor");

        let conductor = conductor.unwrap();

        let interface = conductor
            .clone()
            .add_app_interface(Either::Left(local_config.app_port), AllowedOrigins::Any, None)
            .await;

        info!("Added app interface: {:?}", interface);

        let service = Self { conductor };

        Ok(service)
    }

    pub async fn install_app(
        &mut self,
        install_app_payload: InstallAppPayload,
    ) -> Result<AppInfo, AnyError> {
        if install_app_payload.installed_app_id.is_none() {
            return Err(anyhow!("App id is required"));
        }

        let app_id = install_app_payload.installed_app_id.clone().unwrap();

        //Check if app_id already exists
        let app_info = self.conductor.get_app_info(&app_id).await?;

        match app_info {
            None => {
                self.conductor
                    .clone()
                    .install_app_bundle(install_app_payload)
                    .await
                    .map_err(|e| anyhow!("Could not install app: {:?}", e))?;

                self
                    .conductor
                    .clone()
                    .enable_app(app_id.clone())
                    .await
                    .map_err(|e| anyhow!("Could not activate app: {:?}", e))?;

                let app_info = self.conductor.get_app_info(&app_id).await?;
                Ok(app_info.unwrap())
            }
            Some(app_info) => {
                info!("App already installed with id: {:?}", app_id);
                Ok(app_info)
            }
        }
    }

    pub async fn call_zome_function(
        &self,
        app_id: String,
        cell_name: String,
        zome_name: String,
        fn_name: String,
        payload: Option<ExternIO>,
    ) -> Result<ZomeCallResponse, AnyError> {
        info!(
            "Calling zome function: {:?} {:?} {:?} {:?}",
            app_id, cell_name, zome_name, fn_name
        );
        let app_info = self.conductor.get_app_info(&app_id).await?;

        if app_info.is_none() {
            return Err(anyhow!("App not installed with id: {:?}", app_id));
        }

        let app_info = app_info.unwrap();

        let cell_entry = app_info.cell_info.get(&format!("{}-{}", app_id, cell_name));

        if cell_entry.is_none() {
            return Err(anyhow!(
                "Cell not installed with name: {:?} in app: {:?}",
                cell_name,
                app_id
            ));
        }

        if cell_entry.unwrap().len() == 0 {
            return Err(anyhow!(
                "No cells for cell name: {:?} in app: {:?}",
                cell_name,
                app_id
            ));
        }

        let cell_info = cell_entry.unwrap().first().unwrap().clone();
        let cell_id = match cell_info {
            CellInfo::Provisioned(cell) => cell.cell_id,
            CellInfo::Cloned(cell) => cell.cell_id,
            CellInfo::Stem(_cell) => return Err(anyhow!("Cell is not provisioned or cloned",)),
        };

        let agent_pub_key = app_info.agent_pub_key;

        //Get the agents pub key from the conductor

        fn generate_nonce() -> [u8; 32] {
            let mut rng = OsRng;
            let mut nonce = [0u8; 32];
            rng.fill(&mut nonce);
            nonce
        }

        let payload = match payload {
            Some(payload) => payload,
            None => ExternIO::encode(()).unwrap(),
        };

        let zome_call_unsigned = ZomeCallUnsigned {
            cell_id: cell_id,
            zome_name: zome_name.into(),
            fn_name: fn_name.into(),
            payload: payload,
            cap_secret: None,
            provenance: agent_pub_key,
            nonce: generate_nonce().into(),
            expires_at: Timestamp::now()
                .checked_add_signed(&Duration::seconds(300))
                .unwrap(),
        };

        let keystore = self.conductor.keystore();
        let signed_zome_call = ZomeCall::try_from_unsigned_zome_call(keystore, zome_call_unsigned)
            .await
            .map_err(|err| anyhow!("Could not sign zome call: {:?}", err))?;

        let result = self.conductor.call_zome(signed_zome_call).await??;

        Ok(result)
    }

    pub async fn remove_app(&self, app_id: String) -> Result<(), AnyError> {
        //Check that the app exists on the conductor
        let app_info = self.conductor.get_app_info(&app_id).await?;

        if app_info.is_none() {
            return Err(anyhow!("App not installed with id: {:?}", app_id));
        }

        self.conductor
            .clone()
            .uninstall_app(&app_id)
            .await
            .map_err(|e| anyhow!("Could not remove app: {:?}", e))?;

        info!("Removed app with id: {:?}", app_id);
        Ok(())
    }

    pub async fn agent_infos(&self) -> Result<Vec<AgentInfoSigned>, AnyError> {
        Ok(self.conductor.get_agent_infos(None).await?)
    }

    pub async fn add_agent_infos(&self, agent_infos: Vec<AgentInfoSigned>) -> Result<(), AnyError> {
        Ok(self.conductor.add_agent_infos(agent_infos).await?)
    }

    pub async fn sign(&self, data: String) -> Result<Signature, AnyError> {
        let keystore = self.conductor.keystore();
        let pub_keys = keystore.list_public_keys().await?;
        if pub_keys.len() == 0 {
            return Err(anyhow!("No public keys found"));
        }
        let agent = pub_keys.first().unwrap();

        let vec_u8 = data.into_bytes();
        let data = Arc::from(vec_u8.into_boxed_slice());

        let signature = keystore.sign(agent.clone(), data).await?;
        Ok(signature)
    }

    pub async fn shutdown(&self) -> Result<(), AnyError> {
        self.conductor.shutdown().await??;
        Ok(())
    }

    pub async fn get_agent_key(&self) -> Result<HoloHash<Agent>, AnyError> {
        let keystore = self.conductor.keystore();
        let pub_keys = keystore.list_public_keys().await?;
        if pub_keys.len() == 0 {
            return Err(anyhow!("No public keys found"));
        }
        let agent = pub_keys.first().unwrap();
        Ok(agent.to_owned())
    }

    pub async fn get_app_info(&self, app_id: String) -> Result<Option<AppInfo>, AnyError> {
        Ok(self.conductor.get_app_info(&app_id).await?)
    }

    pub async fn log_network_metrics(&self) -> Result<(), AnyError> {
        let metrics = self.conductor.dump_network_metrics(None).await?;
        info!("Network metrics: {}",metrics);

        let stats = self.conductor.dump_network_stats().await?;
        info!("Network stats: {}", stats);

        Ok(())
    }

    pub async fn pack_dna(path: String) -> Result<String, AnyError> {
        let path = PathBuf::from(path);
        let name = holochain_cli_bundle::get_dna_name(&path).await?;
        info!("Got dna name: {:?}", name);
        let pack = holochain_cli_bundle::pack::<ValidatedDnaManifest>(&path, None, name, false).await?;
        info!("Packed dna at path: {:#?}", pack.0);
        Ok(pack.0.to_str().unwrap().to_string())
    }

    pub async fn unpack_dna(path: String) -> Result<String, AnyError> {
        let path = PathBuf::from(path);
        let pack = holochain_cli_bundle::unpack::<ValidatedDnaManifest>("dna", &path, None, true).await?;
        info!("UnPacked dna at path: {:#?}", pack);
        Ok(pack.to_str().unwrap().to_string())
    }
}

pub async fn run_local_hc_services() -> Result<(), AnyError> {
    let ops = holochain_cli_run_local_services::HcRunLocalServices::new(None, String::from("127.0.0.1"), 0, false, None, String::from("127.0.0.1"), 0, false);
    ops.run().await;
    Ok(())
}
