# gh-builds-trusted-workflows

A collection of reusable GitHub Actions workflows used in a demo on automated governance.

See the [demo application README](https://github.com/liatrio/gh-trusted-builds-app#workflows) for more information.

## Testing

Integration tests for the reusable workflows exist under [test/](test).

### Setup

To run locally, you'll need to install:
- Sigstore [cosign](https://docs.sigstore.dev/cosign/installation/) cli
- Node.js. There is a [.nvmrc](.nvmrc) file to install with [nvm](https://github.com/nvm-sh/nvm).

⚠️ WARNING: The tests run cosign initialize, meaning that if you have a custom TUF root configured, it will be temporarily overwritten in place of the TUF root for Sigstore's staging environment. 
The tests will attempt to save the TUF root in ~/.sigstore-backup before running, and restore it after.
If the tests fail to restore the custom root, you can remove it by running rm -rf ~/.sigstore and mv ~/.sigstore-backup ~/.sigstore. 
If you're not using a custom TUF root, deleting the ~/.sigstore directory should suffice.

Fork https://github.com/liatrio/gh-trusted-builds-workflows-integration-tests to a personal account.
This is a fixture repository in which the workflows under test will run.

Create a GitHub personal access token. 
It's recommended to use the [GitHub cli](https://cli.github.com/),
as it will be easier to create a token with the proper scopes, 
and securely provide the token to the tests.

`gh auth login -s read:packages`

Install npm dependencies, `npm i`.

### Run

`GITHUB_TOKEN=$(gh auth token) npm test`
This is a minor update for contribution purposes.
