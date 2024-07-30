use std::borrow::Cow;

use base64::{engine::general_purpose as base64engine, Engine as _};
use deno_core::{anyhow::anyhow, error::AnyError, include_js_files, op2, Extension, Op};
use serde::{Deserialize, Serialize};

use crate::wallet::Wallet;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Key {
    pub public_key: String,
    pub private_key: String,
    pub encoding: String,
}

#[op2]
#[serde]
fn wallet_get_main_key() -> Result<Key, AnyError> {
    let wallet_instance = Wallet::instance();
    let wallet = wallet_instance.lock().expect("wallet lock");
    let wallet_ref = wallet.as_ref().expect("wallet instance");
    let name = "main".to_string();
    let public_key = wallet_ref
        .get_public_key(&name)
        .ok_or(anyhow!("main key not found. call createMainKey() first"))?;
    let private_key = wallet_ref
        .get_secret_key(&name)
        .ok_or(anyhow!("main key not found. call createMainKey() first"))?;
    Ok(Key {
        public_key: base64engine::STANDARD.encode(public_key),
        private_key: base64engine::STANDARD.encode(private_key),
        encoding: "base64".to_string(),
    })
}

#[op2]
#[serde]
fn wallet_get_main_key_document() -> Result<did_key::Document, AnyError> {
    let wallet_instance = Wallet::instance();
    let wallet = wallet_instance.lock().expect("wallet lock");
    let wallet_ref = wallet.as_ref().expect("wallet instance");
    let name = "main".to_string();
    wallet_ref
        .get_did_document(&name)
        .ok_or(anyhow!("main key not found. call createMainKey() first"))
}

#[op2]
#[serde]
fn wallet_create_main_key() -> Result<(), AnyError> {
    let wallet_instance = Wallet::instance();
    let mut wallet = wallet_instance.lock().expect("wallet lock");
    let wallet_ref = wallet.as_mut().expect("wallet instance");
    wallet_ref.generate_keypair("main".to_string());
    Ok(())
}

#[op2(fast)]
fn wallet_is_unlocked() -> Result<bool, AnyError> {
    let wallet_instance = Wallet::instance();
    let wallet = wallet_instance.lock().expect("wallet lock");
    let wallet_ref = wallet.as_ref().expect("wallet instance");
    Ok(wallet_ref.is_unlocked())
}

#[op2]
#[serde]
fn wallet_unlock(#[string] passphrase: String) -> Result<(), AnyError> {
    let wallet_instance = Wallet::instance();
    let mut wallet = wallet_instance.lock().expect("wallet lock");
    let wallet_ref = wallet.as_mut().expect("wallet instance");
    wallet_ref.unlock(passphrase).map_err(|e| e.into())
}

#[op2]
#[serde]
fn wallet_lock(#[string] passphrase: String) -> Result<(), AnyError> {
    let wallet_instance = Wallet::instance();
    let mut wallet = wallet_instance.lock().expect("wallet lock");
    let wallet_ref = wallet.as_mut().expect("wallet instance");
    Ok(wallet_ref.lock(passphrase))
}

#[op2]
#[string]
fn wallet_export(#[string] passphrase: String) -> Result<String, AnyError> {
    let wallet_instance = Wallet::instance();
    let mut wallet = wallet_instance.lock().expect("wallet lock");
    let wallet_ref = wallet.as_mut().expect("wallet instance");
    Ok(wallet_ref.export(passphrase))
}

#[op2]
#[serde]
fn wallet_load(#[string] data: String) -> Result<(), AnyError> {
    let wallet_instance = Wallet::instance();
    let mut wallet = wallet_instance.lock().expect("wallet lock");
    let wallet_ref = wallet.as_mut().expect("wallet instance");
    Ok(wallet_ref.load(data))
}

#[op2]
#[serde]
fn wallet_sign(#[buffer] payload: &[u8]) -> Result<Vec<u8>, AnyError> {
    crate::agent::sign(payload)
}

deno_core::extension!(
    wallet_service,
    ops = [wallet_get_main_key, wallet_get_main_key_document, wallet_create_main_key, wallet_is_unlocked, wallet_unlock, wallet_lock, wallet_export, wallet_load, wallet_sign],
    esm_entry_point = "ext:wallet_service/wallet_extension.js",
    esm = [dir "src/js_core", "wallet_extension.js"]
);
