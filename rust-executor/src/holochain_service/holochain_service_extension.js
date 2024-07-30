import { 
    start_holochain_conductor, log_dht_status, install_app, get_app_info, 
    call_zome_function, agent_infos, add_agent_infos, remove_app,
    sign_string, shutdown, get_agent_key, pack_dna, unpack_dna
} from 'ext:core/ops';

((globalThis) => {
    const core = Deno.core;

    globalThis.HOLOCHAIN_SERVICE = {
        startHolochainConductor: async (config) => {
            return start_holochain_conductor(config);
        },
        logDhtStatus: async () => {
            return log_dht_status();
        },
        installApp: async (install_app_payload) => {
            return install_app(install_app_payload);
        },
        getAppInfo: async (app_id) => {
            return get_app_info(app_id);
        },
        callZomeFunction: async (app_id, cell_name, zome_name, fn_name, payload) => {
            return call_zome_function(app_id, cell_name, zome_name, fn_name, payload);
        },
        agentInfos: async () => {
            return agent_infos();
        },
        addAgentInfos: async (agent_infos) => {
            return add_agent_infos(agent_infos);
        },
        removeApp: async (app_id) => {
            return remove_app(app_id);
        },
        signString: async (string) => {
            return sign_string(string);
        },
        shutdown: async () => {
            return shutdown()
        },
        getAgentKey: async () => {
            return get_agent_key()
        },
        packDna: async (path) => {
            return pack_dna(path)
        },
        unPackDna: async (path) => {
            return unpack_dna(path)
        }
    };
  })(globalThis);
  