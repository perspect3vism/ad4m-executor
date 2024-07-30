import { 
  sign_device_key, generate_entanglement_proof, add_entanglement_proofs,
  delete_entanglement_proofs, get_entanglement_proofs
} from 'ext:core/ops';

((globalThis) => {
  globalThis.ENTANGLEMENT_SERVICE = {
    signDeviceKey: (deviceKey, deviceKeyType) => {
      return sign_device_key(deviceKey, deviceKeyType);
    },
    generateHolochainProof: (holochainPubkey, signedDid) => {
      return generate_entanglement_proof(holochainPubkey, signedDid);
    },
    addEntaglementProofs: (proofs) => {
      return add_entanglement_proofs(proofs);
    },
    deleteEntanglementProofs: (proofs) => {
      return delete_entanglement_proofs(proofs);
    },
    getEntanglementProofs: () => {
      return get_entanglement_proofs(proofs);
    }
  }
})(globalThis);