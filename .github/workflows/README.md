## GitHub Actions Overview:

This document summarizes the integration of CI workflow within GitHub repository, drawing directly from your go-ci.yaml configuration. It outlines how GitHub Actions automates your development and release processes.


## Workflow overview:

# 1. go-code-ci Job (Continuous Integration)
This job ensures the quality of your code before it's merged into the main branch.

Trigger: Activated by Pull Requests (PRs) targeting the main branch, specifically when Go-related files (.go, go.mod, go.sum) are changed.

Purpose: It checks out your code, sets up the Go environment, installs dependencies, verifies code formatting (gofmt), runs static analysis (golangci-lint), and builds the harvesterNavigator executable.

GitHub Integration: The results of this job are displayed directly in the PR interface as status checks, indicating whether the changes meet your quality standards. A PR typically cannot be merged until all required CI checks pass.

# 2. go-release Job (Publish release)
This job automates the process of creating official software releases.

Trigger: Activated when a new Git tag (e.g., v1.1.0, v2.0.0) is pushed to the main branch of the upstream repository.

Permissions: This job has explicit contents: write permissions, which are crucial for it to interact with GitHub's API to create releases and upload assets.

Purpose: It checks out the code at the tagged commit, sets up Go, extracts the version from the tag, builds a versioned harvesterNavigator binary, and then uses the softprops/action-gh-release action to create a new GitHub Release.

GitHub Integration: The outcome is a new entry on your repository's "Releases" page (e.g., https://github.com/rajeshkio/harvester-navigator/releases). This release includes the specified tag, a customizable title (e.g., HarvesterNavigator-v1.1.0), and the compiled harvesterNavigator binary as a downloadable asset.

## Triggering a Release on GitHub
To initiate a release, the final step involves pushing a Git tag to your upstream main branch. This is done from your local Git environment:

Sync Local main Branch:

```
git checkout main
git pull upstream main
```

Create New Git Tag:
Choose a semantic version (e.g., v1.1.0) and create an annotated tag:

```
git tag -a v1.1.0 -m "Release v1.1.0"
```

Push Tag to Upstream:
This action triggers the go-release workflow on GitHub:

```
git push upstream v1.1.0
```
After pushing the tag, monitor the "Actions" tab in your upstream GitHub repository to observe the go-release job executing. Upon successful completion, your new release will be visible on the "Releases" page, ready for distribution.
