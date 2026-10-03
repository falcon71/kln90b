import {defineConfig} from 'vitest/config';

const IGNORED_SCSS = '\0kln90b-ignored-scss';

/**
 * KLN90B.tsx imports KLN90B.scss for rollup. Tests need no styles, and compiling them would need sass-embedded, so
 * every .scss import resolves to an empty module.
 */
const ignoreScss = {
    name: 'kln90b-ignore-scss',
    enforce: 'pre' as const,
    resolveId: (id: string) => id.endsWith('.scss') ? IGNORED_SCSS : null,
    load: (id: string) => id === IGNORED_SCSS ? 'export default "";' : null,
};

export default defineConfig({
    plugins: [ignoreScss],
    // Same JSX factory as tsconfig.json: FSComponent, not React
    oxc: {jsx: {runtime: 'classic', pragma: 'FSComponent.buildComponent', pragmaFrag: 'FSComponent.Fragment'}},
    test: {
        // The instrument logs a lot. Set KLN_TEST_LOG=1 to see console.log/info output; stderr is always shown.
        onConsoleLog: (_log, type) => process.env.KLN_TEST_LOG === '1' || type === 'stderr' ? undefined : false,
        projects: [
            {
                extends: true,
                test: {name: 'unit', environment: 'node', include: ['test/unit/**/*.test.ts'], setupFiles: ['test/harness/setup/unit.ts']},
            },
            {
                extends: true,
                test: {name: 'render', environment: 'happy-dom', include: ['test/render/**/*.test.ts'], setupFiles: ['test/harness/setup/dom.ts']},
            },
            {
                extends: true,
                test: {
                    name: 'flight', environment: 'happy-dom', include: ['test/flight/**/*.test.ts'],
                    setupFiles: ['test/harness/setup/dom.ts'], testTimeout: 60_000,
                },
            },
        ],
    },
});
