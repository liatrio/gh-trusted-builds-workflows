export function sleep(seconds) {
    const timeoutMilliseconds = seconds * 1000;

    return new Promise((resolve) => {
        setTimeout(resolve, timeoutMilliseconds);
    });
}

export async function getWorkflowRunForCommit(octokit, owner, repo, workflowId, headSha, event = 'push') {
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

export async function waitForWorkflowRunToComplete(octokit, owner, repo, runId) {
    for (let i = 0; i < 30; i++) {
        const {
            data: workflowRun
        } = await octokit.actions.getWorkflowRun({
            owner, repo, run_id: runId
        })

        if (workflowRun.status === 'completed') {
            return workflowRun
        }

        console.log(`waiting for workflow run ${runId} to complete`)
        await sleep(10)
    }

    throw new Error(`workflow run ${runId} failed to complete in time`)
}