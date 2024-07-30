import {
    signature_verify_string_signed_by_did,
    signature_verify
} from 'ext:core/ops'

((globalThis) => {
    globalThis.SIGNATURE = {
        verifyStringSignedByDID: (did, didSigningKeyId, data, signedData) => {
            let { isValid } = signature_verify_string_signed_by_did(did, didSigningKeyId, data, signedData)
            return isValid;
        },
        verify: (expression) => {
            let { isValid } = signature_verify(expression);
            return isValid;
        }
    };
})(globalThis);