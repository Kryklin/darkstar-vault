const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const path = require('path');
const fs = require('fs');

// Load environment variables from local .env if present
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const regex = /^\s*([A-Za-z0-9_]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\r\n#]*))/gm;
  let match;
  while ((match = regex.exec(envContent)) !== null) {
    const key = match[1];
    const value = (match[2] !== undefined ? match[2] : match[3] !== undefined ? match[3] : match[4] || '').trim();
    if (value) {
      process.env[key] = value;
    }
  }
}

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
    appCopyright: 'Copyright © 2026 Darkstar. All rights reserved.',
    appBundleId: 'com.darkstar.vault',
    appCategoryType: 'public.app-category.utilities',
    extraResource: getExtraResources(),
    win32metadata: {
      CompanyName: 'Darkstar Security',
      FileDescription: 'Darkstar Vault - Sovereign Post-Quantum Enclave',
      OriginalFilename: 'Darkstar Vault.exe',
      ProductName: 'Darkstar Vault',
      InternalName: 'darkstar-vault',
      LegalCopyright: 'Copyright © 2026 Darkstar. All rights reserved.',
      'requested-execution-level': 'asInvoker',
    },
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'darkstar-vault',
        title: 'Darkstar Vault',
        authors: 'Darkstar Security',
        owners: 'Darkstar Security',
        description: 'Darkstar Vault - Sovereign Post-Quantum Enclave',
        copyright: 'Copyright © 2026 Darkstar. All rights reserved.',
        setupIcon: path.resolve(__dirname, 'public/favicon.ico'),
        loadingGif: path.resolve(__dirname, 'public/assets/img/splash_installer.gif'),
        iconUrl: 'https://raw.githubusercontent.com/Kryklin/darkstar-vault/main/public/favicon.ico',
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
        setupExe: 'Darkstar Vault Setup.exe',
        exe: 'Darkstar Vault.exe',
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
        authToken: process.env.GITHUB_TOKEN || process.env.GH_TOKEN,
        prerelease: false,
        draft: false,
      },
    },
  ],
};
