import { console_log, console_debug, console_error, console_warn, hash, load_module } from "ext:core/ops";

((globalThis) => {
    globalThis.UTILS = {
        hash: (data) => {
            return hash(data);
        },
        loadModule: async (path) => {
            return load_module(path);
        },
        consoleLog: (args) => {
            return console_log(args);
        },
        consoleDebug: (args) => {
            return console_debug(args);
        },
        consoleError: (args) => {
            return console_error(args);
        },
        consoleWarn: (args) => {
            return console_warn(args);
        }
    };
  })(globalThis);
