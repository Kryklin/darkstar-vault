const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const path = require('path');
const fs = require('fs');

const ext = process.platform === 'win32' ? '.exe' : '';

function getExtraResources() {
  const candidateResources = [
    path.join(__dirname, `bin/d-arx-512${ext}`),
    path.join(__dirname, `bin/d-arx${ext}`),
    process.env.DARKSTAR_ENGINE_PATH,
  ].filter(Boolean);

  return candidateResources.filter((p) => fs.existsSync(p));
}

module.exports = {
  packagerConfig: {
    asar: true,
    icon: path.resolve(__dirname, 'public/favicon'),
    extraResource: getExtraResources(),
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        setupIcon: path.resolve(__dirname, 'public/favicon.ico'),
        loadingGif: path.resolve(__dirname, 'public/assets/img/splash_installer.gif'),
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
        setupExe: 'Darkstar Setup.exe',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
  hooks: {
    generateAssets: async (forgeConfig) => {
      const ext = process.platform === 'win32' ? '.exe' : '';
      const binDir = path.join(__dirname, 'bin');
      const rustBin = path.join(binDir, `d-arx-512${ext}`);
      const arxAlias = path.join(binDir, `d-arx${ext}`);

      if (!fs.existsSync(rustBin) && !fs.existsSync(arxAlias)) {
        console.log('\n🔐 Engine binaries missing in ./bin. Fetching from Kryklin/darkstar releases...');
        const { execSync } = require('child_process');
        execSync('npx tsx scripts/fetch-engines.ts', { stdio: 'inherit' });
      }

      if (forgeConfig && forgeConfig.packagerConfig) {
        forgeConfig.packagerConfig.extraResource = getExtraResources();
      }
    },
    postMake: async (config, makeResults) => {
      const { execSync } = require('child_process');
      const fs = require('fs');

      console.log('Running checksums hook...');
      execSync('npm run checksums', { stdio: 'inherit' });

      const checksumPath = path.join(__dirname, 'checksums.txt');
      if (fs.existsSync(checksumPath) && makeResults.length > 0) {
        // Inject checksums.txt into the artifacts of the first makeResult
        makeResults[0].artifacts.push(checksumPath);
      }
      return makeResults;
    },
  },
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'Kryklin',
          name: 'darkstar-vault',
        },
        prerelease: false,
        draft: false,
      },
    },
  ],
};
