module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "not-to-test-from-src",
      severity: "error",
      from: { path: "^src" },
      to: { path: "^(test|tests)" },
    },
    {
      name: "not-to-doc-history-from-runtime",
      severity: "error",
      from: { path: "^(src|scripts)" },
      to: { path: "^doc/(history|other)" },
    },
    {
      name: "not-to-removed-architecture-roots",
      severity: "error",
      from: { path: "^src" },
      to: {
        path: "^src/(content/core|shared/browser-core|background/browser/(drivers|facade|downloads|policy|trim))",
      },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules|dist|output|doc/\\.obsidian" },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.json",
    },
  },
};
