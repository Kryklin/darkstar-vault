const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const path = require('path');
const fs = require('fs');

const ext = process.platform === 'win32' ? '.exe' : '';

// Resolve native engine resources from ./bin or environment if available
const candidateResources = [
  path.join(__dirname, `bin/d-asp${ext}`),
  path.join(__dirname, `bin/main${ext}`),
  path.join(__dirname, `bin/dasp${ext}`),
  path.join(__dirname, 'bin/main.js'),
  path.join(__dirname, 'bin/dasp.py'),
  path.join(__dirname, 'bin/dasp_crypto.wasm'),
  process.env.DARKSTAR_ENGINE_PATH,
].filter(Boolean);

const extraResources = candidateResources.filter((p) => fs.existsSync(p));

module.exports = {
  packagerConfig: {
    asar: true,
    icon: path.resolve(__dirname, 'public/favicon'),
    extraResource: extraResources,
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
