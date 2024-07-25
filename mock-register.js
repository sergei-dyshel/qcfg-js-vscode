const tsConfigPaths = require("tsconfig-paths");

tsConfigPaths.register({
  baseUrl: __dirname,
  paths: {
    vscode: ["./src/mock-vscode.ts"],
  },
});
