use localtunnel_client::open_tunnel;
use tauri::State;
use tokio::sync::broadcast;
use ad4m_client::Ad4mClient;

use crate::{AppState, ProxyState, ProxyService};

const PROXY_SERVER: &str = "https://proxy-worker.ad4m.dev";
const AD4M_SERVER: &str = "http://127.0.0.1";

#[tauri::command]
pub async fn setup_proxy(subdomain: String, app_state: State<'_, AppState>, proxy: State<'_, ProxyState>) -> Result<String, String> {
    let graphql_port = app_state.graphql_port;
    let req_credential = &app_state.req_credential;
    let (notify_shutdown, _) = broadcast::channel(1);
    let subdomain = subdomain.replace(":", "-").to_lowercase();

    let rand = reqwest::get(format!("{}/login?did={}", PROXY_SERVER, subdomain))
        .await
        .map_err(|err| format!("Error happend when send login request: {:?}", err))?
        .text()
        .await
        .map_err(|err| format!("Error happend when retrieving the content: {:?}", err))?;

    let ad4m_client = Ad4mClient::new(format!("{}:{}/graphql", AD4M_SERVER, graphql_port), req_credential.to_string());
    let signed_message = ad4m_client.agent.sign_message(rand)
        .await
        .map_err(|err| format!("Error happend when agent sign message: {:?}", err))?;

    let credential = reqwest::get(
            format!(
                "{}/login/verify?did={}&signature={}&publicKey={}",
                PROXY_SERVER, subdomain, signed_message.signature, signed_message.public_key
            ))
        .await
        .map_err(|err| format!("Error happend when send login verify request: {:?}", err))?
        .text()
        .await
        .map_err(|err| format!("Error happend when retrieving the login verify content: {:?}", err))?;

    let endpoint = open_tunnel(
        Some(PROXY_SERVER),
        Some(&subdomain),
        None,
        graphql_port,
        notify_shutdown.clone(),
        5,
        Some(credential),
    )
    .await
    .map_err(|err| format!("Error happend when setup proxy: {:?}", err))?;

    *proxy.0.lock().unwrap() = Some(ProxyService{
        endpoint: endpoint.clone(),
        shutdown_signal: notify_shutdown,
    });

    Ok(endpoint)
}

#[tauri::command]
pub fn get_proxy(proxy: State<'_, ProxyState>) -> Option<String> {
    (*proxy.0.lock().unwrap()).as_ref().map(|s| s.endpoint.clone())
}

#[tauri::command]
pub fn stop_proxy(proxy: State<'_, ProxyState>) {
    match &(*proxy.0.lock().unwrap()) {
        Some(s) => {
            let _ = s.shutdown_signal.send(());
        },
        None => log::info!("Proxy is not set up."),
    };
    *proxy.0.lock().unwrap() = None;
}
