import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import scss from "rollup-plugin-scss";
import versionInjector from "rollup-plugin-version-injector";
import fs from "fs";

const buildTargetDir = process.env.buildTargetDir ?? 'build';

/**
 * Copies all resources to the build directory and inserts the version number from the package.json into the manifest
 * @param userConfig
 * @returns {{generateBundle(*, *): void}}
 */
function copyResourcesAndUpdateManifest(userConfig) {
	return {
		generateBundle(outputOptions, bundle) {
			const packageFile = JSON.parse(fs.readFileSync('package.json', 'utf8'));
			const version = packageFile.version;

			fs.cpSync('resources', userConfig.outputPath, {recursive: true});
			let content = fs.readFileSync('resources/manifest.json', 'utf8');
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
		copyResourcesAndUpdateManifest({
			outputPath: buildTargetDir,
		}),
		versionInjector({
			injectInComments: false,
		}),
		typescript(),
	]
}