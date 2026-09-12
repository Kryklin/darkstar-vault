import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pkg = require('../package.json');

(async () => {
  // Dynamic imports for ESM packages
  const { default: ora } = await import('ora');
  const { default: chalk } = await import('chalk');
  const { default: inquirer } = await import('inquirer');
  const { execa } = await import('execa');

  // Robust .env loader supporting multi-line quoted values (e.g. PEM private keys)
  function loadEnv() {
    const envPath = path.join(__dirname, '../.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const regex = /^\s*([A-Za-z0-9_]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\r\n#]*))/gm;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(envContent)) !== null) {
        const key = match[1];
        const value = (match[2] !== undefined ? match[2] : match[3] !== undefined ? match[3] : match[4] || '').trim();
        if (value) {
          process.env[key] = value;
        }
      }
    }
  }
  loadEnv();

  /**
   * Clears the terminal and displays the project header.
   * Uses metadata from package.json for consistent branding.
   */
  function printHeader() {
    console.clear();
    console.log(chalk.hex('#00ADD8').bold('\n  🚀  D A R K S T A R   V A U L T   C L I'));
    console.log(chalk.dim('  ────────────────────────────────────────────────────────────'));
    console.log(chalk.white(`  Version: ${pkg.version}`));
    console.log(chalk.white(`  ${pkg.description}`));
    console.log(chalk.gray(`  Author: ${pkg.author}`));
    console.log(chalk.dim('  ────────────────────────────────────────────────────────────\n'));
  }

  // --- Menu Configuration ---
  const choices = [
    new inquirer.Separator(chalk.dim('─── Development ──────────────────────────────────────────')),
    { name: chalk.cyan('  💻  Run Dev Environment'), value: 'dev' },
    { name: chalk.blue('  🔍  Lint Code'), value: 'lint' },
    { name: chalk.yellow('  ✨  Format Code'), value: 'format' },

    new inquirer.Separator(chalk.dim('─── Testing & Verification ───────────────────────────────')),
    { name: chalk.cyan('  🧪  Run Angular (Karma) Unit Tests'), value: 'karma' },
    { name: chalk.cyan('  🔐  Fetch & Verify Native Crypto Engines (from Releases)'), value: 'verify-engines' },
    { name: chalk.green('  ⚖️   Run License Compliance Audit'), value: 'license-audit' },
    { name: chalk.yellow('  🕵️   Run Full Security Audit'), value: 'audit' },

    new inquirer.Separator(chalk.dim('─── Mobile (Capacitor) ───────────────────────────────────')),
    { name: chalk.cyan('  📱  Sync Mobile Assets'), value: 'cap:sync' },
    { name: chalk.green('  🤖  Open Android Studio'), value: 'cap:open:android' },
    { name: chalk.blue('  🍏  Open Xcode'), value: 'cap:open:ios' },

    new inquirer.Separator(chalk.dim('─── Release ──────────────────────────────────────────────')),
    { name: chalk.yellow('  🏗️   Build Production'), value: 'build' },
    { name: chalk.hex('#FFA500')('  📦  Package Application'), value: 'package' },
    { name: chalk.hex('#00ADD8')('  🔐  Generate Checksums'), value: 'checksums' },
    { name: chalk.cyan('  🖼️   Generate High-DPI Windows Icons'), value: 'icons' },
    { name: chalk.cyan('  🎨  Generate Splash Installer GIF'), value: 'splash' },
    { name: chalk.green('  🚀  Publish Release'), value: 'publish' },

    new inquirer.Separator(chalk.dim('─── Pipelines ────────────────────────────────────────────')),
    { name: chalk.bold.white('  ⚡  Run All (Lint -> Tests -> Build -> Publish)'), value: 'all' },

    new inquirer.Separator(chalk.dim('─── System ───────────────────────────────────────────────')),
    { name: chalk.magenta('  🧹  Deep Clean Workspace'), value: 'clean' },
    { name: chalk.red.bold('  ❌  Exit'), value: 'exit' },
  ];

  /**
   * Executes a shell command with a spinner and error handling.
   *
   * @param {string} stepName - Display name for the step (e.g. "Linting")
   * @param {string} command - Command to execute
   * @param {string[]} [args=[]] - Arguments for the command
   * @param {object} [options={}] - Extra options for execa
   */
  async function runStep(stepName: string, command: string, args: string[] = [], options: Record<string, unknown> = {}) {
    // Extract custom options from execa options
    const { clear = true, showOutput = false, ...execaOptions } = options;

    if (clear) {
      printHeader(); // Refresh header for unified UI
    }

    const spinner = ora(chalk.blue(`Running ${stepName}...`)).start();
    try {
      if (showOutput) {
        spinner.stop(); // Stop spinner to stream output to console directly
        console.log(chalk.dim(`\n> Executing: ${command} ${args.join(' ')}\n`));
      }

      // Execute command, inheriting stdio only if showOutput is true
      const stdioMode = showOutput ? 'inherit' : 'pipe';
      await execa(command, args, { stdio: stdioMode, preferLocal: true, ...execaOptions });

      if (showOutput) {
        console.log(chalk.green.bold(`\n✔ ${stepName} Completed Successfully!\n`));
      } else {
        spinner.succeed(chalk.green.bold(`${stepName} Completed Successfully!`));
      }
    } catch (err: unknown) {
      const error = err as { stdout?: string; stderr?: string };
      if (!showOutput) {
        spinner.fail(chalk.red.bold(`${stepName} Failed!`));
        if (error.stdout) console.log(error.stdout);
        if (error.stderr) console.error(chalk.red(error.stderr));
      } else {
        console.log(chalk.red.bold(`\n✖ ${stepName} Failed!`));
      }
      throw error;
    }
  }

  /**
   * Wrapper for executing complex shell strings.
   *
   * @param {string} stepName
   * @param {string} shellCommand
   * @param {object} [options={}]
   */
  async function runShell(stepName: string, shellCommand: string, options: Record<string, unknown> = {}) {
    await runStep(stepName, shellCommand, [], { shell: true, ...options });
  }

  /**
   * Environment Checker
   * Checks for required development dependencies and offers to install them via winget.
   *
   * @param {boolean} interactive - Whether to prompt for installation via winget
   */
  async function checkEnvironment(interactive = false) {
    if (interactive) printHeader();
    const spinner = ora(chalk.blue('Checking development environment...')).start();

    const deps = [
      { name: 'Node.js', cmd: 'node', args: ['--version'], pkg: 'OpenJS.NodeJS', installer: 'winget' },
      { name: 'npm', cmd: 'npm', args: ['--version'], pkg: 'OpenJS.NodeJS', installer: 'winget' },
      { name: 'Git', cmd: 'git', args: ['--version'], pkg: 'Git.Git', installer: 'winget' },
    ];

    const missing = [];

    for (const dep of deps) {
      try {
        await execa(dep.cmd, dep.args, { preferLocal: true, shell: process.platform === 'win32' });
        if (interactive) console.log(chalk.green(`✔ ${dep.name} is installed.`));
      } catch (_e) {
        if (interactive) console.log(chalk.red(`✖ ${dep.name} is missing.`));
        missing.push(dep);
      }
    }

    spinner.stop();

    if (missing.length === 0) {
      // Check native crypto engine in ./bin
      const ext = process.platform === 'win32' ? '.exe' : '';
      const binDir = path.resolve(__dirname, '..', 'bin');
      const rustBin = path.join(binDir, `d-arx-512${ext}`);
      const arxAlias = path.join(binDir, `d-arx${ext}`);
      const hasEngine = fs.existsSync(rustBin) || fs.existsSync(arxAlias);

      if (!hasEngine) {
        if (interactive) {
          console.log(chalk.yellow('\n⚠ Native Darkstar Crypto Engine is not installed in ./bin/'));
          const { fetchNow } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'fetchNow',
              message: 'Download native ML-KEM-1024 / ARX-512 engine from Kryklin/darkstar releases now?',
              default: true,
            },
          ]);
          if (fetchNow) {
            await execa('npx', ['tsx', 'scripts/fetch-engines.ts'], { stdio: 'inherit', preferLocal: true });
          }
        } else {
          await ensureEnginesPresent();
        }
      }

      if (interactive) console.log(chalk.bold.green('\n✨ All development tools and engines are operational! ✨\n'));
      return true;
    }

    if (!interactive) {
      throw new Error(`Missing required development tools: ${missing.map((m) => m.name).join(', ')}.\nPlease install them or run check-env.`);
    }

    console.log(chalk.yellow(`\nMissing tools detected: ${missing.map((m) => m.name).join(', ')}`));
    const { install } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'install',
        message: 'Would you like to install the missing dependencies via winget? (Requires UAC Administrator privileges)',
        default: true,
      },
    ]);

    if (install) {
      for (const dep of missing) {
        const installSpinner = ora(chalk.blue(`Installing ${dep.name}...`)).start();
        try {
          if (dep.installer === 'winget') {
            const psCommand = `Start-Process -Wait -Verb RunAs "winget" -ArgumentList "install", "${dep.pkg}", "--silent", "--accept-package-agreements", "--accept-source-agreements"`;
            await execa('powershell', ['-NoProfile', '-Command', psCommand]);
          }
          installSpinner.succeed(chalk.green(`Successfully installed ${dep.name}!`));
        } catch (err: unknown) {
          installSpinner.fail(chalk.red(`Failed to install ${dep.name}.`));
          console.error(chalk.dim((err as Error).message));
        }
      }
      console.log(chalk.yellow.bold('\nℹ Note: You may need to restart your terminal or PC for the newly installed tools to be available in your PATH.'));
    }

    return false;
  }

  /**
   * Ensures native crypto engine binaries from Kryklin/darkstar releases are downloaded in ./bin.
   */
  async function ensureEnginesPresent() {
    const ext = process.platform === 'win32' ? '.exe' : '';
    const binDir = path.resolve(__dirname, '..', 'bin');
    const rustBin = path.join(binDir, `d-arx-512${ext}`);
    const arxAlias = path.join(binDir, `d-arx${ext}`);

    if (!fs.existsSync(rustBin) && !fs.existsSync(arxAlias)) {
      console.log(chalk.cyan('\n🔐 Native crypto engine missing in ./bin. Fetching from Kryklin/darkstar releases...'));
      await execa('npx', ['tsx', 'scripts/fetch-engines.ts'], { stdio: 'inherit', preferLocal: true });
    }
  }

  /**
   * Verifies GitHub token validity against the GitHub REST API before initiating releases.
   */
  async function verifyGitHubToken(): Promise<boolean> {
    loadEnv();
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (!token) {
      console.log(chalk.red.bold('\n⚠️  Error: GITHUB_TOKEN not found in environment or .env.'));
      console.log(chalk.yellow('Publishing requires a GitHub Personal Access Token (PAT) with "repo" scope.'));
      console.log(chalk.yellow('Please set GITHUB_TOKEN in your .env file in the root directory:'));
      console.log(chalk.cyan('GITHUB_TOKEN=ghp_your_token_here\n'));
      return false;
    }

    const spinner = ora(chalk.blue('Verifying GitHub authentication token...')).start();
    try {
      const res = await fetch('https://api.github.com/user', {
        headers: {
          'User-Agent': 'Darkstar-Vault-CLI',
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.status === 401) {
        spinner.fail(chalk.red.bold('GitHub Token Authentication Failed (401 Bad credentials).'));
        console.log(chalk.yellow('\nYour GITHUB_TOKEN is expired or invalid.'));
        console.log(chalk.yellow('Please update GITHUB_TOKEN in your .env file with a valid Personal Access Token.'));
        return false;
      }

      if (!res.ok) {
        spinner.warn(chalk.yellow(`GitHub API responded with status ${res.status}: ${res.statusText}`));
      } else {
        const data = (await res.json()) as { login?: string };
        const scopes = res.headers.get('x-oauth-scopes') || 'default';
        spinner.succeed(chalk.green(`GitHub Token authenticated as @${data.login || 'user'} (scopes: ${scopes})`));
      }
      return true;
    } catch (err: unknown) {
      spinner.warn(chalk.yellow(`Could not verify GitHub token network connectivity: ${(err as Error).message}`));
      return true;
    }
  }

  // --- Main Execution Loop ---
  while (true) {
    loadEnv();
    printHeader();

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Select an operation:',
        choices,
        prefix: chalk.cyan('?'),
      },
    ]);

    if (action === 'exit') {
      console.log(chalk.yellow('Goodbye! 👋'));
      process.exit(0);
    }

    /**
     * Command Definitions
     * Centralized configuration for all build/test/release commands.
     */
    const CMD = {
      LINT: 'npm run lint',
      KARMA: 'npm run test',
      BUILD: 'npm run build',
      DEV: 'npm run dev',
      PACKAGE: 'npm run package',
      PUBLISH: 'npm run publish',
      CAP_SYNC: 'npx cap sync',
      CAP_OPEN_ANDROID: 'npx cap open android',
      CAP_OPEN_IOS: 'npx cap open ios',
      FORMAT: 'npm run format',
      AUDIT: 'npm run audit',
      CLEAN: 'npm run clean',
      CHECKSUMS: 'npm run checksums',
      VERIFY_ENGINES: 'npx tsx scripts/fetch-engines.ts',
      ICONS: 'npm run generate:icons',
      SPLASH: 'npm run splash',
    };

    // Execute selected action
    try {
      if (action === 'all') {
        const tokenOk = await verifyGitHubToken();
        if (!tokenOk) {
          throw new Error('Release aborted: invalid or missing GitHub token.');
        }

        await checkEnvironment(false); // Fail-safe dependency check

        const stages = [
          { name: 'Linting', cmd: CMD.LINT },
          { name: 'Testing (Angular)', cmd: CMD.KARMA, options: { showOutput: true } },
          { name: 'Building', cmd: CMD.BUILD, options: { showOutput: true } },
          { name: 'Publishing', cmd: CMD.PUBLISH, options: { clear: false, showOutput: true } },
        ];

        for (let i = 0; i < stages.length; i++) {
          const stage = stages[i];

          const stageNameWithProgress = `[Stage ${i + 1}/${stages.length}] ${stage.name}`;
          await runShell(stageNameWithProgress, stage.cmd, stage.options || { clear: true });

          if (i < stages.length - 1) {
            await new Promise((r) => setTimeout(r, 2000));
          }
        }

        console.log(chalk.bold.green('\n✨ Full Release Pipeline Completed! ✨\n'));
      } else {
        switch (action) {
          case 'check-env':
            await checkEnvironment(true);
            break;
          case 'dev':
            await runShell('Dev Environment', CMD.DEV, { showOutput: true });
            break;
          case 'lint':
            await runShell('Linting', CMD.LINT);
            break;
          case 'format':
            await runShell('Formatting', CMD.FORMAT);
            break;
          case 'audit':
            await runShell('Security Audit', CMD.AUDIT, { showOutput: true });
            break;
          case 'verify-engines':
            await runShell('Engine Verification', CMD.VERIFY_ENGINES, { showOutput: true });
            break;
          case 'license-audit':
            await runShell('License Audit', 'npx tsx scripts/license-audit.ts', { showOutput: true });
            break;
          case 'clean':
            await runShell('Cleaning Workspace', CMD.CLEAN, { clear: false });
            break;
          case 'checksums':
            await runShell('Checksum Generation', CMD.CHECKSUMS, { clear: false });
            break;
          case 'karma':
            await runShell('Angular Unit Testing', CMD.KARMA, { showOutput: true });
            break;
          case 'cap:sync':
            console.log(chalk.yellow('ℹ Building core application before sync...'));
            await runShell('Building', CMD.BUILD, { showOutput: true });
            await runShell('Syncing Native Platforms', CMD.CAP_SYNC, { clear: false, showOutput: true });
            break;
          case 'cap:open:android':
            await runShell('Opening Android Studio', CMD.CAP_OPEN_ANDROID);
            break;
          case 'cap:open:ios':
            await runShell('Opening Xcode', CMD.CAP_OPEN_IOS);
            break;
          case 'build':
            await runShell('Building', CMD.BUILD, { showOutput: true });
            break;
          case 'icons':
            await runShell('High-DPI Windows Icon Generation', CMD.ICONS, { showOutput: true });
            break;
          case 'splash':
            await runShell('Splash Installer Generation', CMD.SPLASH, { showOutput: true });
            break;
          case 'package':
            await ensureEnginesPresent();
            console.log(chalk.yellow('ℹ Building before packaging...'));
            await runShell('Building', CMD.BUILD, { showOutput: true });
            await runShell('Packaging', CMD.PACKAGE, { clear: true, showOutput: true });
            break;
          case 'publish': {
            const tokenOk = await verifyGitHubToken();
            if (!tokenOk) {
              break;
            }
            await ensureEnginesPresent();
            console.log(chalk.yellow('ℹ Building before publishing...'));
            await runShell('Building', CMD.BUILD, { showOutput: true });
            await runShell('Publishing', CMD.PUBLISH, { clear: false, showOutput: true });
            break;
          }
        }
      }
    } catch (err: unknown) {
      console.log(chalk.red.bold('\n❌ Operation Aborted.'));
      if ((err as Error).message) {
        console.log(chalk.dim((err as Error).message));
      }
    }

    // Pause execution to allow user to review output before clearing
    await inquirer.prompt([
      {
        type: 'input',
        name: 'continue',
        message: chalk.dim('Press Enter to return to the main menu...'),
        prefix: '',
      },
    ]);
  }
})();
