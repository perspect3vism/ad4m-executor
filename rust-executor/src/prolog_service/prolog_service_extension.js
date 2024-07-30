import {
    spawn_engine, remove_engine, run_query, load_module_string
} from 'ext:core/ops'

((globalThis) => {
    globalThis.PROLOG_SERVICE = {
        spawnEngine: async (engineName) => {
            return spawn_engine(engineName);
        },
        removeEngine: async (engineName) => {
            return remove_engine(engineName);
        },
        runQuery: async (engineName, query) => {
            if(!query.endsWith(".")) query = query+".";
            return JSON.parse(await run_query(engineName, query));
        },
        loadModuleString: async (engineName, module_name, program_lines) => {
            return load_module_string(engineName, module_name, program_lines);
        }
    };
  })(globalThis);
  