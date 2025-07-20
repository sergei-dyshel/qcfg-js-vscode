[private]
semver-latest:
    #!/usr/bin/env bash
    ver=$(git describe --match "v*" --abbrev=0 --tags $(git rev-list --tags --max-count=1))
    echo -n ${ver:1}

[private]
semver-next:
    #!/usr/bin/env bash
    set -e
    ver=$(just semver-latest)
    echo -n $(semver $ver --increment patch)

vscode-package ver:
    vsce package --no-dependencies --no-git-tag-version --no-update-package-json {{ver}}

vscode-package-next:
    #!/usr/bin/env bash
    set -e
    ver=$(just semver-next)
    just vscode-package $ver
    git tag v$ver

install_extension := env('QCFG_JS_VSCODE_INSTALL_EXTENSION', 'code --force --install-extension')

vscode-install ver:
    {{install_extension}} $(jq -r '(.name) + "-{{ver}}"' package.json).vsix

vscode-install-latest:
    just vscode-install $(just semver-latest)

vscode-package-and-install-next: vscode-package-next vscode-install-latest
