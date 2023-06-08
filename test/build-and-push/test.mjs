import {before, describe, it} from 'node:test';
import {strict as assert} from 'node:assert';
import {Octokit} from "@octokit/rest";

const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN
})

const {
    data: {
        login: owner
    }
} = await octokit.users.getAuthenticated();
const repo = 'gh-trusted-builds-workflows-integration-tests';

describe('build and push workflow', () => {

    describe('with unreviewed pull request', () => {
        const hexTimestamp = Date.now().toString(16);
        let workflowRun;

        before(async () => {
            const testFilename = 'test';

            const {
                data: mainBranch
            } = await octokit.repos.getBranch({
                owner, repo, branch: 'main'
            })

            await octokit.git.createRef({
                owner, repo, ref: `refs/heads/${hexTimestamp}`, sha: mainBranch.commit.sha
            })

            const {
                data: testFileData
            } = await octokit.repos.getContent({
                owner, repo, path: testFilename
            })

            await octokit.repos.createOrUpdateFileContents({
                owner,
                repo,
                path: testFilename,
                message: 'test',
                content: Buffer.from(Date.now().toString(16)).toString('base64'),
                sha: testFileData.sha,
                branch: hexTimestamp
            })

            const {
                data: pullRequest
            } = await octokit.pulls.create({
                owner, repo, title: 'test', base: 'main', head: hexTimestamp
            });

            const {data: merge} = await octokit.pulls.merge({
                owner,
                repo,
                pull_number: pullRequest.number,
                merge_method: 'squash',
                'commit_title': `test: ${hexTimestamp}`
            })

            await octokit.git.deleteRef({
                owner,
                repo,
                ref: `heads/${hexTimestamp}`
            })

            workflowRun = await getWorkflowRunForCommit(owner, repo, 'build-and-push.yaml', merge.sha)
            if (workflowRun === null) {
                assert.fail('did not find workflow run for build-and-push pull-request merge')
            }
        })

        it('should successfully complete a run', {timeout: 300000}, async () => {
            let completed = false

            while (!completed) {
                const {
                    data: workflow
                } = await octokit.actions.getWorkflowRun({
                    owner, repo, run_id: workflowRun.id
                })

                if (workflow.status === 'completed') {
                    completed = true
                    assert.equal(workflow.conclusion, 'success')
                }

                await sleep(10)
            }
        })
    });
})

async function getWorkflowRunForCommit(owner, repo, workflowId, headSha, event = 'push') {
    for (let i = 0; i < 10; i++) {
        try {
            const {
                data: {
                    workflow_runs: recentWorkflows
                }
            } = await octokit.actions.listWorkflowRuns({
                owner,
                repo,
                workflow_id: workflowId,
                head_sha: headSha,
                event
            })

            if (recentWorkflows.length > 0) {
                return recentWorkflows[0]
            }
        } catch (e) {
            console.log(e)
        }

        await sleep(5)
    }

    return null
}

function sleep(seconds) {
    const timeoutMilliseconds = seconds * 1000;

    return new Promise((resolve) => {
        setTimeout(resolve, timeoutMilliseconds);
    });
}
