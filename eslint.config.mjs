// @ts-check

import myconfig from "@sergei-dyshel/eslint-config";

export default [...myconfig, { ignores: ["mock-register.js", "vscode.proposed.*.d.ts"] }];
