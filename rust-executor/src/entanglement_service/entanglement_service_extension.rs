use std::borrow::Cow;

use deno_core::{error::AnyError, include_js_files, op2, Extension, Op};

use crate::graphql::graphql_types::EntanglementProof;

use super::{add_entanglement_proofs as add_entanglement_proofs_service, delete_entanglement_proof as delete_entanglement_proof_service, generate_holochain_proof as generate_holochain_proof_service, get_entanglement_proofs as  get_entanglement_proofs_service, sign_device_key as sign_device_key_service};

#[op2]
#[serde]
pub fn sign_device_key(#[string] device_key: String, #[string] device_key_type: String) -> Result<EntanglementProof, AnyError> {
  Ok(sign_device_key_service(device_key, device_key_type))
}

#[op2]
#[serde]
pub fn generate_entanglement_proof(#[string] holochain_key: String, #[string] signed_did: String) -> Result<EntanglementProof, AnyError> {
  Ok(generate_holochain_proof_service(holochain_key, signed_did))
}

#[op2]
#[serde]
pub fn add_entanglement_proofs(#[serde] proofs: Vec<EntanglementProof>) -> Result<(), AnyError> {
  Ok(add_entanglement_proofs_service(proofs))
}

#[op2]
#[serde]
pub fn delete_entanglement_proofs(#[serde] proofs: Vec<EntanglementProof>) -> Result<(), AnyError> {
  Ok(delete_entanglement_proof_service(proofs))
}

#[op2]
#[serde]
pub fn get_entanglement_proofs() -> Result<Vec<EntanglementProof>, AnyError> {
  Ok(get_entanglement_proofs_service())
}

deno_core::extension!(
  entanglement_service,
  ops = [sign_device_key, generate_entanglement_proof, add_entanglement_proofs, delete_entanglement_proofs, get_entanglement_proofs],
  esm_entry_point = "ext:entanglement_service/entanglement_service_extension.js",
  esm = [dir "src/entanglement_service", "entanglement_service_extension.js"]
);

