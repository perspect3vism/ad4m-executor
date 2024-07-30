import {
    agent_did_document, agent_signing_key_id, agent_did, agent_create_signed_expression, agent_sign,
    agent_sign_string_hex, agent_load, agent, agent_is_initialized, agent_is_unlocked, agent_unlock,
    agent_lock, agent_create_signed_expression_stringified, save_agent_profile
} from 'ext:core/ops';

((globalThis) => {
    const core = Deno.core;

    globalThis.AGENT = {
        didDocument: () => {
            return agent_did_document();
        },
        signingKeyId: () => {
            return agent_signing_key_id();
        },
        did: () => {
            return agent_did();
        },
        createSignedExpression: (data) => {
            try {
                return agent_create_signed_expression(data);
            } catch (error) {
                console.error("Error calling agent_create_signed_expression:", error);
                console.error("Data was:", data)
                console.log("Falling back to stringified version")
                try {
                    let stringified = JSON.stringify(data);
                    let resultString = agent_create_signed_expression_stringified(stringified)
                    let result = JSON.parse(resultString);
                    return result;
                } catch (error) {
                    console.error("Error calling agent_create_signed_expression_stringified:", error);
                    console.error("Data was:", JSON.stringify(data))
                }
            }
        },
        sign: (payload) => {
            return agent_sign(payload);
        },
        signStringHex: (payload) => {
            return agent_sign_string_hex(payload);
        },
        load: () => {
            return agent_load();
        },
        agent: () => {
            return agent();
        },
        isInitialized: () => {
            return agent_is_initialized();
        },
        isUnlocked: () => {
            return agent_is_unlocked();
        },
        unlock: (password) => {
            return agent_unlock(password);
        },
        lock: () => {
            return agent_lock();
        },
        save_agent_profile: (profile) => {
            return save_agent_profile(profile);
        }
    };
})(globalThis);