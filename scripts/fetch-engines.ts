import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { verifyEd25519Signature } from '../electron/trust-anchor';
import { loadAuthenticatedEngineManifest, verifyEngineBinary } from '../electron/engine-trust';

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
    const fileBuffer = Buffer.from(arrayBuffer);
    const computedHash = crypto.createHash('sha256').update(fileBuffer).digest('hex').toLowerCase();

    // Cryptographic provenance: SHA-256 manifest & Ed25519 digital signature verification
    const checksumAsset = release.assets.find((a) => {
      const lower = a.name.toLowerCase();
      return lower === `${targetAsset.name.toLowerCase()}.sha256` || lower.includes('checksum') || lower.includes('sha256sum') || lower === 'sha256.txt';
    });

    if (!checksumAsset) {
      throw new Error(`Mandatory provenance failed: no SHA-256 checksum manifest found in release ${release.tag_name}. Unverified native engines are rejected by enclave security policy.`);
    }

    const provSpinner = ora(chalk.blue(`Verifying SHA-256 against release manifest (${checksumAsset.name})...`)).start();
    let csRes = await fetch(checksumAsset.browser_download_url, { headers });
    if (csRes.status === 401 && headers['Authorization']) {
      delete headers['Authorization'];
      csRes = await fetch(checksumAsset.browser_download_url, { headers });
    }
    if (!csRes.ok) {
      provSpinner.fail(chalk.red(`Failed to download checksum manifest: ${csRes.statusText}`));
      throw new Error(`Failed to download checksum manifest ${checksumAsset.name}: ${csRes.statusText}`);
    }

    const checksumText = await csRes.text();
    let expectedHash: string | null = null;
    const lines = checksumText.split(/\r?\n/);
    for (const line of lines) {
      if (line.includes(targetAsset.name)) {
        const match = line.match(/[a-fA-F0-9]{64}/);
        if (match) {
          expectedHash = match[0].toLowerCase();
          break;
        }
      }
    }
    if (!expectedHash && checksumAsset.name.toLowerCase().includes(targetAsset.name.toLowerCase())) {
      const match = checksumText.match(/[a-fA-F0-9]{64}/);
      if (match) expectedHash = match[0].toLowerCase();
    }

    if (!expectedHash) {
      provSpinner.fail(chalk.red(`Checksum manifest did not contain explicit entry for ${targetAsset.name}.`));
      throw new Error(`Mandatory provenance failed: checksum manifest did not contain entry for ${targetAsset.name}.`);
    }

    if (computedHash !== expectedHash) {
      provSpinner.fail(chalk.red(`Provenance Failure: SHA-256 mismatch for ${targetAsset.name}!`));
      throw new Error(`Expected SHA-256: ${expectedHash}, computed: ${computedHash}`);
    }
    provSpinner.succeed(chalk.green(`SHA-256 verified (${computedHash.slice(0, 16)}...)`));

    // Mandatory digital signature verification
    const signatureAsset = release.assets.find((a) => {
      const lower = a.name.toLowerCase();
      return (
        lower === `${checksumAsset.name.toLowerCase()}.sig` ||
        lower === `${targetAsset.name.toLowerCase()}.sig` ||
        lower.includes('checksums.txt.sig') ||
        lower.includes('sha256sums.sig') ||
        lower.includes('manifest.sig')
      );
    });

    if (!signatureAsset) {
      throw new Error(`Mandatory provenance failed: no cryptographic digital signature (.sig) found for release ${release.tag_name}. Unsigned native engines are rejected by enclave security policy.`);
    }

    const sigSpinner = ora(chalk.blue(`Authenticating release signature via Darkstar Trust Anchor (${signatureAsset.name})...`)).start();
    let sigRes = await fetch(signatureAsset.browser_download_url, { headers });
    if (sigRes.status === 401 && headers['Authorization']) {
      delete headers['Authorization'];
      sigRes = await fetch(signatureAsset.browser_download_url, { headers });
    }
    if (!sigRes.ok) {
      sigSpinner.fail(chalk.red(`Failed to download release signature: ${sigRes.statusText}`));
      throw new Error(`Failed to download release signature ${signatureAsset.name}: ${sigRes.statusText}`);
    }

    const sigContent = await sigRes.text();
    const isSigValid = verifyEd25519Signature(checksumText, sigContent);
    if (!isSigValid) {
      sigSpinner.fail(chalk.red(`Signature verification failed: invalid signature against Darkstar Trust Anchor!`));
      throw new Error(`Release signature in ${signatureAsset.name} failed verification!`);
    }
    sigSpinner.succeed(chalk.green('Release manifest authenticated via Darkstar Ed25519 Trust Anchor.'));

    downloadSpinner.succeed(chalk.green(`Downloaded & verified ${targetAsset.name}`));

    // Isolated extraction to prevent partial or unverified binaries from touching ./bin
    const isolatedTempDir = path.join(binDir, `.extract_${crypto.randomBytes(8).toString('hex')}`);
    fs.mkdirSync(isolatedTempDir, { recursive: true });
    const isolatedArchive = path.join(isolatedTempDir, targetAsset.name);
    fs.writeFileSync(isolatedArchive, fileBuffer);

    const extractSpinner = ora(chalk.blue('Extracting archive into isolated staging area...')).start();
    try {
      if (isolatedArchive.endsWith('.zip')) {
        execSync(`tar -xf "${isolatedArchive}" -C "${isolatedTempDir}"`);
      } else if (isolatedArchive.endsWith('.tar.gz') || isolatedArchive.endsWith('.tgz')) {
        execSync(`tar -xzf "${isolatedArchive}" -C "${isolatedTempDir}"`);
      }
      fs.unlinkSync(isolatedArchive);
      extractSpinner.succeed(chalk.green('Archive staged successfully.'));
    } catch (_extractErr: unknown) {
      extractSpinner.fail(chalk.red('Failed to extract with tar. Trying PowerShell Expand-Archive...'));
      try {
        execSync(`powershell -Command "Expand-Archive -Path '${isolatedArchive}' -DestinationPath '${isolatedTempDir}' -Force"`);
        if (fs.existsSync(isolatedArchive)) fs.unlinkSync(isolatedArchive);
        extractSpinner.succeed(chalk.green('Archive extracted via PowerShell.'));
      } catch (psErr: unknown) {
        try { fs.rmSync(isolatedTempDir, { recursive: true, force: true }); } catch { /* ignore */ }
        throw new Error(`Extraction failed: ${(psErr as Error).message}`);
      }
    }

    const stagedRustBin = path.join(isolatedTempDir, `d-arx-512${ext}`);
    const stagedArxAlias = path.join(isolatedTempDir, `d-arx${ext}`);
    const stagedActive = fs.existsSync(stagedRustBin) ? stagedRustBin : stagedArxAlias;

    if (!fs.existsSync(stagedActive)) {
      try { fs.rmSync(isolatedTempDir, { recursive: true, force: true }); } catch { /* ignore */ }
      throw new Error(`Archive extracted but neither d-arx-512${ext} nor d-arx${ext} found in staging directory.`);
    }

    // Authenticate binary against signed Engine Manifest
    const manifestSpinner = ora(chalk.blue('Verifying executable against Authenticated Engine Manifest...')).start();
    const manifest = loadAuthenticatedEngineManifest();
    const verifyResult = await verifyEngineBinary(stagedActive, manifest);
    if (!verifyResult.valid) {
      manifestSpinner.fail(chalk.red(`Engine manifest verification FAILED: ${verifyResult.error}`));
      try { fs.rmSync(isolatedTempDir, { recursive: true, force: true }); } catch { /* ignore */ }
      throw new Error(`Engine verification failed: ${verifyResult.error}`);
    }
    manifestSpinner.succeed(chalk.green(`Engine binary SHA-256 and size verified against Authenticated Manifest.`));

    // Self-test verification in isolated staging area
    const testSpinner = ora(chalk.blue('Running cryptographic engine self-test in staging...')).start();
    try {
      execSync(`"${stagedActive}" test`, { stdio: 'pipe' });
      testSpinner.succeed(chalk.green('Engine self-test PASSED! Cryptographic engine is operational.'));
    } catch (testErr: unknown) {
      testSpinner.fail(chalk.red(`Cryptographic engine self-test FAILED: ${(testErr as Error).message}`));
      try { fs.rmSync(isolatedTempDir, { recursive: true, force: true }); } catch { /* ignore */ }
      return false;
    }

    // Atomically install verified binaries into binDir
    fs.copyFileSync(stagedActive, rustBin);
    fs.copyFileSync(stagedActive, arxAlias);

    // Clean up staging directory
    try {
      fs.rmSync(isolatedTempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }

    // Post-installation verification
    const activeBin = fs.existsSync(rustBin) ? rustBin : arxAlias;
    const postVerify = await verifyEngineBinary(activeBin, manifest);
    if (!postVerify.valid) {
      try {
        if (fs.existsSync(rustBin)) fs.unlinkSync(rustBin);
        if (fs.existsSync(arxAlias)) fs.unlinkSync(arxAlias);
      } catch { /* ignore */ }
      throw new Error(`Post-installation trust check failed: ${postVerify.error}`);
    }

    console.log(chalk.bold.green(`\n✨ Darkstar authenticated native engine is ready at: ${activeBin}\n`));
    return true;
  } catch (err: unknown) {
    spinner.fail(chalk.red('Failed to obtain native engine from releases.'));
    console.error(chalk.dim((err as Error).message));
    // Fail-closed: clean up any dangling partial downloads or unverified files
    try {
      const tempArchives = fs.readdirSync(binDir).filter((f) => f.endsWith('.zip') || f.endsWith('.tar.gz') || f.endsWith('.tmp'));
      for (const tempArchive of tempArchives) {
        fs.unlinkSync(path.join(binDir, tempArchive));
      }
    } catch {
      /* ignore */
    }
    console.log(chalk.yellow('\nManual installation instructions:'));
    console.log(chalk.dim(`  1. Visit: ${chalk.underline('https://github.com/Kryklin/darkstar/releases')}`));
    console.log(chalk.dim(`  2. Download the appropriate engine zip for your OS.`));
    console.log(chalk.dim(`  3. Extract d-arx-512${ext} into: ${chalk.yellow(binDir)}`));
    console.log(chalk.dim(`  4. In development, you may set DARKSTAR_ENGINE_PATH in .env to the executable path.\n`));
    return false;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const force = process.argv.includes('--force');
  fetchEngines(force).then((success) => {
    process.exit(success ? 0 : 1);
  });
}
