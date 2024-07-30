import {
    perspective_diff_received, sync_state_changed, telepresence_signal_received
} from 'ext:core/ops';

((globalThis) => {
    globalThis.LANGUAGE_CONTROLLER = {
        perspectiveDiffReceived: (diff, language_address) => {
            return perspective_diff_received(diff, language_address);
        },
        syncStateChanged: (syncState, language_address) => {
            return sync_state_changed(syncState, language_address);
        },
        telepresenceSignalReceived: (signal, language_address) => {
            return telepresence_signal_received(signal, language_address);
        },
    };
  })(globalThis);
  