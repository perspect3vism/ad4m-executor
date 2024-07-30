import {
    publish
} from 'ext:core/ops';

((globalThis) => {
    globalThis.PUBSUB = {
        publish: async (topic, data) => {
            return publish(topic, JSON.stringify(data));
        }
    };
  })(globalThis);
  