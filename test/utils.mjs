import AdmZip from "adm-zip";
import { spawnSync } from "node:child_process";

export function sleep(seconds) {
  const timeoutMilliseconds = seconds * 1000;

  return new Promise((resolve) => {
    setTimeout(resolve, timeoutMilliseconds);
  });
}

export async function getWorkflowRunForCommit(
  octokit,
  owner,
  repo,
  workflowId,
  headSha,
  event = "push"
) {
  for (let i = 0; i < 10; i++) {
    try {
      const {
        data: { workflow_runs: recentWorkflows },
      } = await octokit.actions.listWorkflowRuns({
        owner,
        repo,
        workflow_id: workflowId,
        head_sha: headSha,
        event,
      });

      if (recentWorkflows.length > 0) {
        return recentWorkflows[0];
      }
    } catch (e) {
      console.log(e);
    }

    await sleep(5);
  }

  return null;
}

export async function waitForWorkflowRunToComplete(
  octokit,
  owner,
  repo,
  runId
) {
  for (let i = 0; i < 30; i++) {
    const { data: workflowRun } = await octokit.actions.getWorkflowRun({
      owner,
      repo,
      run_id: runId,
    });

    if (workflowRun.status === "completed") {
      return workflowRun;
    }

    console.log(`waiting for workflow run ${runId} to complete`);
    await sleep(10);
  }

  throw new Error(`workflow run ${runId} failed to complete in time`);
}

export async function getWorkflowRunMetadataArtifact(
  octokit,
  owner,
  repo,
  runId
) {
  const {
    data: { artifacts: workflowRunArtifacts },
  } = await octokit.actions.listWorkflowRunArtifacts({
    repo,
    owner,
    run_id: runId,
  });

  const artifact = await octokit.actions.downloadArtifact({
    owner,
    repo,
    artifact_id: workflowRunArtifacts.find(
      (artifact) => artifact.name === "workflow-metadata"
    ).id,
    archive_format: "zip",
  });

  const zip = new AdmZip(Buffer.from(artifact.data));
  const entry = zip
    .getEntries()
    .find((e) => e.entryName === "workflow-metadata.json");

  return JSON.parse(zip.readAsText(entry));
}

export function cosignVerifyAttestation(image, attestationType, certIdentity, certOidcIssuer) {
  return spawnSync("cosign", [
      'verify-attestation',
      '--type',
      attestationType,
      '--certificate-identity',
      certIdentity,
      '--certificate-oidc-issuer',
      certOidcIssuer,
      image
  ])
}
