import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import terser from "@rollup/plugin-terser";
import scss from "rollup-plugin-scss";

const buildTargetDir = process.env.buildTargetDir ?? 'build';

const production = process.env.NODE_ENV === 'production';

export default {
	input: 'kln90b/KLN90B.tsx',
	output: {
		sourcemap: true,
		dir: buildTargetDir,
		format: 'es'
	},
	plugins: [
		scss({ fileName: 'KLN90B.css' }),
		resolve(),
		typescript(),
		(production && terser()),
	]
}