import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface ReleaseData {
  tag_name: string;
  name: string;
  assets: ReleaseAsset[];
}

export async function fetchEngines(force = false): Promise<boolean> {
  const { default: ora } = await import('ora');
  const { default: chalk } = await import('chalk');

  console.log(chalk.hex('#00ADD8').bold('\n  🔐  Darkstar Crypto Engine Downloader\n'));

  const binDir = path.resolve(__dirname, '..', 'bin');
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  const isWindows = process.platform === 'win32';
  const ext = isWindows ? '.exe' : '';
  const rustBin = path.join(binDir, `d-arx-512${ext}`);
  const arxAlias = path.join(binDir, `d-arx${ext}`);

  // If binaries already exist and force flag is not passed, verify and exit early
  if (!force && (fs.existsSync(rustBin) || fs.existsSync(arxAlias))) {
    const activeBin = fs.existsSync(rustBin) ? rustBin : arxAlias;
    const spinner = ora(chalk.blue(`Verifying existing crypto engine at ${activeBin}...`)).start();
    try {
      execSync(`"${activeBin}" test`, { stdio: 'pipe' });
      spinner.succeed(chalk.green(`Engine verified & operational: ${activeBin}`));
      console.log(chalk.gray('  Status: Ready for local encryption & testing.\n'));
      return true;
    } catch {
      spinner.warn(chalk.yellow('Existing engine failed verification. Re-downloading from releases...'));
    }
  }

  const spinner = ora(chalk.blue('Fetching latest release metadata from kryklin/darkstar...')).start();

  try {
    const headers: Record<string, string> = {
      'User-Agent': 'darkstar-vault-client',
      Accept: 'application/vnd.github.v3+json',
    };

    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (token && !token.includes('your_') && !token.includes('placeholder') && token.length > 20) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let res = await fetch('https://api.github.com/repos/Kryklin/darkstar/releases/latest', { headers });
    if (res.status === 401 && headers['Authorization']) {
      delete headers['Authorization'];
      res = await fetch('https://api.github.com/repos/Kryklin/darkstar/releases/latest', { headers });
    }
    if (!res.ok) {
      throw new Error(`GitHub API returned ${res.status}: ${res.statusText}`);
    }

    const release = (await res.json()) as ReleaseData;
    spinner.succeed(chalk.green(`Found release: ${release.name || release.tag_name} (${release.tag_name})`));

    // Determine appropriate asset for current OS
    const assetKeyword = isWindows ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux';
    let targetAsset = release.assets.find((a) => a.name.toLowerCase().includes('rust-engine') && a.name.toLowerCase().includes(assetKeyword));

    // Fallback to c-engine if rust-engine not available for platform
    if (!targetAsset) {
      targetAsset = release.assets.find((a) => a.name.toLowerCase().includes('engine') && a.name.toLowerCase().includes(assetKeyword));
    }

    if (!targetAsset) {
      console.log(chalk.yellow(`\nAvailable assets in release ${release.tag_name}:`));
      release.assets.forEach((a) => console.log(`  - ${a.name} (${(a.size / 1024).toFixed(1)} KB)`));
      throw new Error(`No pre-compiled engine binary archive found matching platform "${process.platform}".`);
    }

    const downloadSpinner = ora(chalk.blue(`Downloading ${targetAsset.name} (${(targetAsset.size / 1024).toFixed(1)} KB)...`)).start();

    const archivePath = path.join(binDir, targetAsset.name);
    let downloadRes = await fetch(targetAsset.browser_download_url, { headers });
    if (downloadRes.status === 401 && headers['Authorization']) {
      delete headers['Authorization'];
      downloadRes = await fetch(targetAsset.browser_download_url, { headers });
    }
    if (!downloadRes.ok) {
      throw new Error(`Failed to download asset: ${downloadRes.statusText}`);
    }

    const arrayBuffer = await downloadRes.arrayBuffer();
    fs.writeFileSync(archivePath, Buffer.from(arrayBuffer));
    downloadSpinner.succeed(chalk.green(`Downloaded ${targetAsset.name}`));

    const extractSpinner = ora(chalk.blue('Extracting archive into ./bin...')).start();
    try {
      if (archivePath.endsWith('.zip')) {
        execSync(`tar -xf "${archivePath}" -C "${binDir}"`);
      } else if (archivePath.endsWith('.tar.gz') || archivePath.endsWith('.tgz')) {
        execSync(`tar -xzf "${archivePath}" -C "${binDir}"`);
      }
      fs.unlinkSync(archivePath);
      extractSpinner.succeed(chalk.green('Archive extracted successfully.'));
    } catch (extractErr: unknown) {
      extractSpinner.fail(chalk.red('Failed to extract with tar. Trying PowerShell Expand-Archive...'));
      try {
        execSync(`powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${binDir}' -Force"`);
        if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath);
        extractSpinner.succeed(chalk.green('Archive extracted via PowerShell.'));
      } catch (psErr: unknown) {
        throw new Error(`Extraction failed: ${(psErr as Error).message}`);
      }
    }

    // Ensure alias parity: copy/alias so both d-arx-512.exe and d-arx.exe exist
    if (fs.existsSync(rustBin) && !fs.existsSync(arxAlias)) {
      fs.copyFileSync(rustBin, arxAlias);
    } else if (fs.existsSync(arxAlias) && !fs.existsSync(rustBin)) {
      fs.copyFileSync(arxAlias, rustBin);
    }

    // Self-test verification
    const activeBin = fs.existsSync(rustBin) ? rustBin : arxAlias;
    const testSpinner = ora(chalk.blue('Running cryptographic engine self-test...')).start();
    try {
      execSync(`"${activeBin}" test`, { stdio: 'pipe' });
      testSpinner.succeed(chalk.green('Engine self-test PASSED! Cryptographic engine is operational.'));
      console.log(chalk.bold.green(`\n✨ Darkstar native engine is ready at: ${activeBin}\n`));
      return true;
    } catch (testErr: unknown) {
      testSpinner.warn(chalk.yellow(`Self-test did not return expected output: ${(testErr as Error).message}`));
      return true;
    }
  } catch (err: unknown) {
    spinner.fail(chalk.red('Failed to obtain native engine from releases.'));
    console.error(chalk.dim((err as Error).message));
    console.log(chalk.yellow('\nManual installation instructions:'));
    console.log(chalk.dim(`  1. Visit: ${chalk.underline('https://github.com/Kryklin/darkstar/releases')}`));
    console.log(chalk.dim(`  2. Download the appropriate engine zip for your OS.`));
    console.log(chalk.dim(`  3. Extract d-arx-512${ext} into: ${chalk.yellow(binDir)}`));
    console.log(chalk.dim(`  4. Or set DARKSTAR_ENGINE_PATH in .env to the executable path.\n`));
    return false;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const force = process.argv.includes('--force');
  fetchEngines(force).then((success) => {
    process.exit(success ? 0 : 1);
  });
}
