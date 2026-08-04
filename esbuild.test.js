const esbuild = require('esbuild');

esbuild
  .build({
    entryPoints: [
      'test/discovery.test.ts',
      'test/tableSchema.test.ts',
      'test/sql/runQuery.test.ts',
      'test/sql/identifiers.test.ts',
      'test/sql/completions.test.ts',
    ],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    outdir: 'out-test',
    outbase: 'test',
    sourcemap: true,
    external: ['@duckdb/node-api', '@duckdb/node-bindings'],
    logLevel: 'info',
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
