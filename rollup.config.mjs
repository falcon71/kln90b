import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import terser from "@rollup/plugin-terser";
import scss from "rollup-plugin-scss";
import versionInjector from "rollup-plugin-version-injector";
import fs from "fs";

const buildTargetDir = process.env.buildTargetDir ?? 'build';

const production = process.env.NODE_ENV === 'production';

/**
 * Copies the manifest.json file over and inserts the version number from the package.json
 * @param userConfig
 * @returns {{generateBundle(*, *): void}}
 */
function copyManifest(userConfig) {
	return {
		generateBundle(outputOptions, bundle) {
			const packageFile = JSON.parse(fs.readFileSync('package.json', 'utf8'));
			const version = packageFile.version;

			let content = fs.readFileSync('manifest.json', 'utf8');
			content = content.replace('[VI]{version}[/VI]', version);
			fs.writeFileSync(`${userConfig.outputPath}/manifest.json`, content);
		}
	}
}

export default {
	input: 'kln90b/KLN90B.tsx',
	output: {
		sourcemap: true,
		dir: `${buildTargetDir}/html_ui/Pages/VCockpit/Instruments/NavSystems/GPS/KLN90B`,
		format: 'es'
	},
	plugins: [
		scss({ fileName: 'KLN90B.css' }),
		resolve(),
		copyManifest({
			outputPath: buildTargetDir,
		}),
		versionInjector(),
		typescript(),
		(production && terser()),
	]
}