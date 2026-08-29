/**
 * One config file for every Pyreon tool; Lathe reads its own section.
 */
export default {
  lathe: {
    input: './openapi.yaml',
    output: './src/gen',
    target: 'multiplatform' as const,
    plugins: ['schemas', 'client', 'queries', 'mocks', 'faker', 'atlas', 'docs'] as const,
    // Overrides the spec's `servers[0].url` so the demo talks to the local dev
    // server. It stays ABSOLUTE deliberately: PMTC bakes the request URL at
    // compile time, so a relative base would make every operation web-only and
    // the native modules would generate but never lower.
    baseUrl: 'http://localhost:5199/v1',
  },
}
