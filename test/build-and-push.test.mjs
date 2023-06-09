import { before, describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { Octokit } from "@octokit/rest";
import AdmZip from "adm-zip";
import {
  getWorkflowRunForCommit,
  waitForWorkflowRunToComplete,
} from "./utils.mjs";

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

const {
  data: { login: owner },
} = await octokit.users.getAuthenticated();
const repo = "gh-trusted-builds-workflows-integration-tests";

describe("build and push workflow", () => {
  describe("with unreviewed pull request", () => {
    const hexTimestamp = Date.now().toString(16);
    let workflowRun;

    before(async () => {
      const testFilename = "test";

      const { data: mainBranch } = await octokit.repos.getBranch({
        owner,
        repo,
        branch: "main",
      });

      await octokit.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${hexTimestamp}`,
        sha: mainBranch.commit.sha,
      });
      console.log(`created branch ${hexTimestamp}`);

      const { data: testFileData } = await octokit.repos.getContent({
        owner,
        repo,
        path: testFilename,
      });

      await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: testFilename,
        message: "test",
        content: Buffer.from(Date.now().toString(16)).toString("base64"),
        sha: testFileData.sha,
        branch: hexTimestamp,
      });

      const { data: pullRequest } = await octokit.pulls.create({
        owner,
        repo,
        title: "test",
        base: "main",
        head: hexTimestamp,
      });
      console.log(`created pull request ${pullRequest.number}`);

      const { data: merge } = await octokit.pulls.merge({
        owner,
        repo,
        pull_number: pullRequest.number,
        merge_method: "squash",
        commit_title: `test: ${hexTimestamp}`,
      });
      console.log(`merged pull request ${pullRequest.number}`);

      await octokit.git.deleteRef({
        owner,
        repo,
        ref: `heads/${hexTimestamp}`,
      });
      console.log(`deleted branch ${hexTimestamp}`);

      workflowRun = await getWorkflowRunForCommit(
        octokit,
        owner,
        repo,
        "build-and-push.yaml",
        merge.sha
      );
      if (workflowRun === null) {
        assert.fail(
          "did not find workflow run for build-and-push pull-request merge"
        );
      }
      console.log(`found workflow run ${workflowRun.id}`);

      workflowRun = await waitForWorkflowRunToComplete(
        octokit,
        owner,
        repo,
        workflowRun.id
      );
      console.log(`workflow run ${workflowRun.id} completed`);
    });

    it("should successfully complete a run", { timeout: 300000 }, async () => {
      assert.equal(workflowRun.conclusion, "success");
    });

    it("should upload the image with expected tags", async () => {
      const {
        data: { artifacts: workflowRunArtifacts },
      } = await octokit.actions.listWorkflowRunArtifacts({
        repo,
        owner,
        run_id: workflowRun.id,
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
      const runMetadata = JSON.parse(zip.readAsText(entry));

      const digest = runMetadata.digest;

      let packageVersion;
      for await (const resp of octokit.paginate.iterator(
        octokit.packages
          .getAllPackageVersionsForPackageOwnedByAuthenticatedUser,
        {
          package_name: repo,
          package_type: "container",
        }
      )) {
        packageVersion = resp.data.find((pv) => pv.name === digest);
        if (packageVersion !== undefined) {
          break;
        }
      }

      const expectedTags = ["main", "latest"];
      expectedTags.forEach((t) => {
        assert(packageVersion.metadata.container.tags.includes(t));
      });
    });

    it("should create a valid sbom attestation", async () => {});
  });
});
