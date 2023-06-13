import { spawnSync } from "node:child_process";

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
    "--certificate-identity",
    certIdentity,
    "--certificate-oidc-issuer",
    certOidcIssuer,
    image,
  ]);
}
