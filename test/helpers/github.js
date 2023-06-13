import { Octokit } from "@octokit/rest";
import config from "config";
import { sleep } from "./sleep.js";
import AdmZip from "adm-zip";
import { createAppAuth } from "@octokit/auth-app";

export const GitHub = () => {
  const octokit = newOctokit();

  function newOctokit() {
    if (config.util.getEnv("NODE_ENV") === "ci") {
      return new Octokit({
        authStrategy: createAppAuth,
        auth: {
          appId: config.get("github.app.id"),
          privateKey: config.get("github.app.privateKey"),
          installationId: config.get("github.app.installationId"),
        },
      });
    }

    return new Octokit({
      auth: config.get("github.user.token"),
    });
  }

  const CreateBranch = (owner, repo, branchName, sha) =>
    octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha,
    });

  const GetRepoContent = octokit.repos.getContent;

  const GetPackageVersionByDigest = async (
    owner,
    packageName,
    packageDigest
  ) => {
    const ownerType = config.get("fixtureOwnerType");
    const getAllPackageVersionsByOwnerType = {
      user: octokit.packages.getAllPackageVersionsForPackageOwnedByUser,
      org: octokit.packages.getAllPackageVersionsForPackageOwnedByOrg,
    };

    const parametersByOwnerType = {
      user: { username: owner },
      org: { org: owner },
    };

    for await (const resp of octokit.paginate.iterator(
      getAllPackageVersionsByOwnerType[ownerType],
      {
        package_name: packageName,
        package_type: "container",
        ...parametersByOwnerType[ownerType],
      }
    )) {
      const packageVersion = resp.data.find((pv) => pv.name === packageDigest);
      if (packageVersion !== undefined) {
        return packageVersion;
      }
    }

    throw new Error("no package version found");
  };

  const CreateOrUpdateFileContentsInRepo =
    octokit.repos.createOrUpdateFileContents;

  const CreatePullRequest = octokit.pulls.create;

  const MergePullRequest = octokit.pulls.merge;

  const DeleteBranch = ({ owner, repo, branchName }) =>
    octokit.git.deleteRef({
      owner,
      repo,
      ref: `heads/${branchName}`,
    });

  const GetWorkflowRunForCommit = async ({
    owner,
    repo,
    workflowId,
    headSha,
    event = "push",
  }) => {
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

    throw new Error("failed to get workflow run for commit");
  };

  const WaitForWorkflowRunToComplete = async ({ owner, repo, runId }) => {
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
  };

  const GetWorkflowRunMetadataArtifact = async ({ owner, repo, runId }) => {
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
  };

  const GetBranch = octokit.repos.getBranch;

  const GetAuthenticatedUser = async () => {
    const {
      data: { login: user },
    } = await octokit.users.getAuthenticated();

    return user;
  };

  return {
    CreateBranch,
    CreateOrUpdateFileContentsInRepo,
    CreatePullRequest,
    DeleteBranch,
    GetAuthenticatedUser,
    GetBranch,
    GetPackageVersionByDigest,
    GetRepoContent,
    GetWorkflowRunForCommit,
    GetWorkflowRunMetadataArtifact,
    MergePullRequest,
    WaitForWorkflowRunToComplete,
  };
};
