import {
    wallet_create_main_key, wallet_get_main_key, wallet_get_main_key_document, 
    wallet_is_unlocked, wallet_unlock, wallet_lock, wallet_export, wallet_load, 
    wallet_sign
} from 'ext:core/ops'

((globalThis) => {
    globalThis.WALLET = {
        getMainKey: () => {
            return wallet_get_main_key();
        },
        getMainKeyDocument: () => {
            return wallet_get_main_key_document();
        },
        createMainKey: () => {
            return wallet_create_main_key();
        },
        isUnlocked: () => {
            return wallet_is_unlocked();
        },
        unlock: (password) => {
            return wallet_unlock(password);
        },
        lock: (password) => {
            return wallet_lock(password);
        },
        export: (password) => {
            return wallet_export(password);
        },
        load: (data) => {
            return wallet_load(data);
        },
        sign: (payload) => {
            return wallet_sign(payload);
        },
    };
  })(globalThis);
  