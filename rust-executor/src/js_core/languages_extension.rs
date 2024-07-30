use std::borrow::Cow;
use deno_core::{include_js_files, op2, Extension, Op};

use crate::{graphql::graphql_types::{PerspectiveExpression, PerspectiveState}, types::PerspectiveDiff};


#[op2]
#[serde]
fn perspective_diff_received(
    #[serde] diff: PerspectiveDiff, 
    #[string] language_address: String
) {
    crate::perspectives::handle_perspective_diff_from_link_language(diff, language_address);
}

#[op2]
#[serde]
fn sync_state_changed(
    #[serde] state: PerspectiveState, 
    #[string] language_address: String
)  {
    crate::perspectives::handle_sync_state_changed_from_link_language(state, language_address);
}


#[op2]
#[serde]
fn telepresence_signal_received(
    #[serde] signal: PerspectiveExpression,
    #[string] language_address: String
) {
    crate::perspectives::handle_telepresence_signal_from_link_language(signal, language_address);
}

deno_core::extension!(
    language_service,
    ops = [perspective_diff_received, sync_state_changed, telepresence_signal_received],
    esm_entry_point = "ext:language_service/languages_extension.js",
    esm = [dir "src/js_core", "languages_extension.js"]
);