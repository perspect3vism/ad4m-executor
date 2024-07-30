
use deno_runtime::worker::WorkerOptions;
use std::{collections::HashMap, rc::Rc};
use url::Url;

use super::agent_extension::agent_service;
use super::languages_extension::language_service;
use super::pubsub_extension::pubsub_service;
use super::signature_extension::signature_service;
use super::utils_extension::utils_service;
use super::wallet_extension::wallet_service;
use super::string_module_loader::StringModuleLoader;
use crate::entanglement_service::entanglement_service_extension::{self, entanglement_service};
use crate::holochain_service::holochain_service_extension::{self, holochain_service};
use crate::prolog_service::prolog_service_extension::{self, prolog_service};
use crate::runtime_service::runtime_service_extension::{self, runtime_service};

pub fn main_module_url() -> Url {
    Url::parse("https://ad4m.runtime/main").unwrap()
}
#[cfg(not(target_os = "windows"))]
pub fn module_map() -> HashMap<String, String> {
    let mut map = HashMap::new();
    map.insert(
        "https://ad4m.runtime/main".to_string(),
        include_str!("main.js").to_string(),
    );

    map.insert(
        "https://ad4m.runtime/executor".to_string(),
        include_str!("../../executor/lib/bundle.js").to_string(),
    );
    map
}

#[cfg(target_os = "windows")]
pub fn module_map() -> HashMap<String, String> {
    let mut map = HashMap::new();
    map.insert(
        "https://ad4m.runtime/main".to_string(),
        include_str!("main.js").to_string(),
    );

    map.insert(
        "https://ad4m.runtime/executor".to_string(),
        include_str!("../../../executor/lib/bundle.js").to_string(),
    );
    map
}

pub fn main_worker_options() -> WorkerOptions {
    let mut loader = StringModuleLoader::new();
    for (specifier, code) in module_map() {
        loader.add_module(specifier.as_str(), code.as_str());
    }

    WorkerOptions {
        extensions: vec![
            wallet_service::init_ops_and_esm(),
            utils_service::init_ops_and_esm(),
            pubsub_service::init_ops_and_esm(),
            holochain_service::init_ops_and_esm(),
            prolog_service::init_ops_and_esm(),
            signature_service::init_ops_and_esm(),
            agent_service::init_ops_and_esm(),
            entanglement_service::init_ops_and_esm(),
            runtime_service::init_ops_and_esm(),
            language_service::init_ops_and_esm(),
        ],
        module_loader: Rc::new(loader),
        ..Default::default()
    }
}
