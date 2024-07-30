import {
    friends, add_message_outbox, get_trusted_agents
} from 'ext:core/ops';

((globalThis) => {
    globalThis.RUNTIME_SERVICE = {
        friends: async () => {
            return friends();
        },
        addMessageOutbox: async (did, message, wasSent) => {
            return add_message_outbox(did, message, wasSent);
        },
        getTrustedAgents: async () => {
            return get_trusted_agents();
        },
    }
})(globalThis);