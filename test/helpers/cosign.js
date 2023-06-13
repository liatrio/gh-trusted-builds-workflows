import { spawnSync } from "node:child_process";

// This function is currently synchronous, to avoid local cache lock errors when running cosign in multiple processes at once.
// Could be improved with something like an async queue to limit global calls to the cosign cli,
// or be replaced by the Sigstore NPM package if it gains the equivalent features https://github.com/sigstore/sigstore-js/tree/main/packages/client.
export function cosignVerifyAttestation(
  image,
  attestationType,
  certIdentity,
  certOidcIssuer
) {
  return spawnSync("cosign", [
    "verify-attestation",
    "--type",
    attestationType,
    "--certificate-identity-regexp",
    certIdentity,
    "--certificate-oidc-issuer",
    certOidcIssuer,
    image,
  ]);
}
