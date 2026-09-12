import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DARKSTAR_TRUST_ANCHOR_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA46+f5XZKyCHKz2XQCxqFH55jlvGvjpR0x76GzmeNVfk=
-----END PUBLIC KEY-----`;

function verifyEd25519Signature(data: Buffer | string, signatureHexOrBase64: string): boolean {
  try {
    const dataBuf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const trimmed = signatureHexOrBase64.trim();
    const isHex = /^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0;
    const sigBuf = Buffer.from(trimmed, isHex ? 'hex' : 'base64');
    return crypto.verify(null, dataBuf, DARKSTAR_TRUST_ANCHOR_PUBLIC_KEY, sigBuf);
  } catch {
    return false;
  }
}

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

    fs.writeFileSync(archivePath, fileBuffer);
    downloadSpinner.succeed(chalk.green(`Downloaded & verified ${targetAsset.name}`));

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

    // Self-test verification (Strict fail-closed enforcement)
    const activeBin = fs.existsSync(rustBin) ? rustBin : arxAlias;
    const testSpinner = ora(chalk.blue('Running cryptographic engine self-test...')).start();
    try {
      execSync(`"${activeBin}" test`, { stdio: 'pipe' });
      testSpinner.succeed(chalk.green('Engine self-test PASSED! Cryptographic engine is operational.'));
      console.log(chalk.bold.green(`\n✨ Darkstar native engine is ready at: ${activeBin}\n`));
      return true;
    } catch (testErr: unknown) {
      testSpinner.fail(chalk.red(`Cryptographic engine self-test FAILED: ${(testErr as Error).message}`));
      // Clean up failed/compromised binaries immediately to fail closed
      try {
        if (fs.existsSync(rustBin)) fs.unlinkSync(rustBin);
        if (fs.existsSync(arxAlias)) fs.unlinkSync(arxAlias);
      } catch {
        /* ignore */
      }
      return false;
    }
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
