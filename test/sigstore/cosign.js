import { spawn } from "node:child_process";
import { queue } from "async";
import { promisify } from "util";
import { access, rename, rm } from "fs/promises";
import { join } from "path";
import config from "config";
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

  s.on("exit", (status) => {
    callback(null, { status, out, err });
  });

  s.on("error", (err) => {
    callback(err, null);
  });
});

const home = config.get("home");
const sigstoreDir = join(home, ".sigstore");
const sigstoreBackupDir = join(home, ".sigstore-backup");
const rekorUrl = config.get("sigstore.rekor.url");
const tufMirror = config.get("sigstore.tuf.mirror");
const tufRoot = config.get("sigstore.tuf.root");

// https://docs.sigstore.dev/cosign/public_deployment/
export async function initializeSigstoreStaging() {
  console.log("initializing cosign with the public staging environment");

  try {
    // check if custom cosign config exists to back up
    await access(sigstoreDir);

    console.log(
      `moving current ${sigstoreDir} directory to ${sigstoreBackupDir}`
    );
    await rename(sigstoreDir, sigstoreBackupDir);
  } catch (e) {
    console.log(`${sigstoreDir} directory not found, skipping backup`);
  }

  const args = [
    "initialize",
    "--mirror",
    tufMirror,
    "--root",
    join(process.cwd(), tufRoot),
  ];

  await promisify(q.push)({ args });
  console.log("finished initializing cosign");
}

export async function resetSigstoreConfig() {
  console.log("resetting cosign configuration");
  await rm(sigstoreDir, { recursive: true, force: true });

  try {
    await access(sigstoreBackupDir);
    console.log(`moving ${sigstoreBackupDir} to ${sigstoreDir}`);
    await rename(sigstoreBackupDir, sigstoreDir);
  } catch (e) {
    console.log(`no ${sigstoreBackupDir} to restore`);
  }

  console.log("finished resetting cosign");
}

export function verifyAttestation(
  image,
  attestationType,
  certIdentity,
  certOidcIssuer
) {
  const args = [
    "verify-attestation",
    "--rekor-url",
    rekorUrl,
    "--type",
    attestationType,
    "--certificate-identity-regexp",
    certIdentity,
    "--certificate-oidc-issuer",
    certOidcIssuer,
    image,
  ];

  return promisify(q.push)({ args });
}
