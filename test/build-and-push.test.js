import { after, before, describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  initializeSigstoreStaging,
  resetSigstoreConfig,
  verifyAttestation,
} from "./sigstore/cosign.js";
import { GitHub } from "./helpers/github.js";
import config from "config";

const github = GitHub();

const owner = config.has("owner")
  ? config.get("owner")
  : await github.GetAuthenticatedUser();
const repo = config.get("repositoryName");

describe("build and push workflow", () => {
  // When the tests are run in CI,
  // cosign cli is initialized to Sigstore staging environment via a setup action.
  if (config.util.getEnv("NODE_ENV") !== "ci") {
    before(async () => {
      await initializeSigstoreStaging();
    });

    after(async () => {
      await resetSigstoreConfig();
    });
  }

  describe("with unreviewed pull request", { concurrency: true }, () => {
    const hexTimestamp = Date.now().toString(16);
    let workflowRun, runMetadata, merge;

    before(async () => {
      const testFilename = "test";

      const { data: mainBranch } = await github.GetBranch({
        owner,
        repo,
        branch: "main",
      });

      await github.CreateBranch(
        owner,
        repo,
        hexTimestamp,
        mainBranch.commit.sha,
      );

      console.log(`created branch ${hexTimestamp}`);

      const { data: testFileData } = await github.GetRepoContent({
        owner,
        repo,
        path: testFilename,
      });

      await github.CreateOrUpdateFileContentsInRepo({
        owner,
        repo,
        path: testFilename,
        message: "test",
        content: Buffer.from(Date.now().toString(16)).toString("base64"),
        sha: testFileData.sha,
        branch: hexTimestamp,
      });

      const { data: pullRequest } = await github.CreatePullRequest({
        owner,
        repo,
        title: "test",
        base: "main",
        head: hexTimestamp,
      });
      console.log(`created pull request ${pullRequest.number}`);

      const { data: mergeData } = await github.MergePullRequest({
        owner,
        repo,
        pull_number: pullRequest.number,
        merge_method: "squash",
        commit_title: `test: ${hexTimestamp}`,
      });
      merge = mergeData;
      console.log(`merged pull request ${pullRequest.number}`);

      await github.DeleteBranch({
        owner,
        repo,
        branchName: hexTimestamp,
      });
      console.log(`deleted branch ${hexTimestamp}`);

      workflowRun = await github.GetWorkflowRunForCommit({
        owner,
        repo,
        workflowId: "build-and-push.yaml",
        headSha: merge.sha,
      });
      if (workflowRun === null) {
        assert.fail(
          "did not find workflow run for build-and-push pull-request merge",
        );
      }
      console.log(`found workflow run ${workflowRun.id}`);

      workflowRun = await github.WaitForWorkflowRunToComplete({
        owner,
        repo,
        runId: workflowRun.id,
      });
      console.log(`workflow run ${workflowRun.id} completed`);

      runMetadata = await github.GetWorkflowRunMetadataArtifact({
        owner,
        repo,
        runId: workflowRun.id,
      });
      console.log("retrieved workflow run metadata artifact");
    });

    it("should successfully complete a run", () => {
      assert.equal(workflowRun.conclusion, "success");
    });

    it("should upload the image with expected tags", async () => {
      const digest = runMetadata.digest;

      const packageVersion = await github.GetPackageVersionByDigest(
        owner,
        repo,
        digest,
      );

      assert(
        packageVersion.metadata.container.tags.some((t) =>
          merge.sha.startsWith(t),
        ),
        "missing git short commit tag",
      );

      const movingTags = ["main", "latest"];
      movingTags.forEach((t) => {
        assert(packageVersion.metadata.container.tags.includes(t));
      });
    });

    it("should create a valid sbom attestation", async () => {
      const result = await verifyAttestation(
        `ghcr.io/${owner}/${repo}@${runMetadata.digest}`,
        "spdxjson",
        "^https://github.com/liatrio/gh-trusted-builds-workflows/.github/workflows/.*.yaml@.*",
        "https://token.actions.githubusercontent.com",
      );
      assert.equal(result.status, 0, result.err);
    });

    it("should create a valid pull request attestation", async () => {
      const result = await verifyAttestation(
        `ghcr.io/${owner}/${repo}@${runMetadata.digest}`,
        "https://liatr.io/attestations/github-pull-request/v1",
        "^https://github.com/liatrio/gh-trusted-builds-workflows/.github/workflows/.*.yaml@.*",
        "https://token.actions.githubusercontent.com",
      );

      assert.equal(result.status, 0, result.err);
    });

    it("should create a valid provenance attestation", async () => {
      const result = await verifyAttestation(
        `ghcr.io/${owner}/${repo}@${runMetadata.digest}`,
        "slsaprovenance",
        "^https://github.com/liatrio/gh-trusted-builds-workflows/.github/workflows/.*.yaml@.*",
        "https://token.actions.githubusercontent.com",
      );
      assert.equal(result.status, 0, result.err);
    });
  });
});
