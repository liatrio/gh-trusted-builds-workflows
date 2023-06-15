import { spawn } from "node:child_process";
import { queue } from "async";

// A queue is used to avoid local cache lock errors when running cosign cli in multiple processes at once.
// This ensures only a single cosign process is running at one time, while remaining asynchronous.
// The use of cosign cli could be replaced by the Sigstore NPM package,
// if it gains the equivalent features https://github.com/sigstore/sigstore-js/tree/main/packages/client.
const q = queue((task, callback) => {
  const s = spawn("cosign", task.args);
  let out = "",
    err = "";

  s.stdout.on("data", (data) => {
    out += data;
  });

  s.stderr.on("data", (data) => {
    err += data;
  });

  s.on("exit", (code) => {
    task.code = code;
    task.out = out;
    task.err = err;
    callback();
  });
});

export function verifyAttestation(
  image,
  attestationType,
  certIdentity,
  certOidcIssuer
) {
  const args = [
    "verify-attestation",
    "--type",
    attestationType,
    "--certificate-identity-regexp",
    certIdentity,
    "--certificate-oidc-issuer",
    certOidcIssuer,
    image,
  ];

  const task = { args };

  return new Promise((resolve, reject) => {
    q.push(task, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve(task);
      }
    });
  });
}
