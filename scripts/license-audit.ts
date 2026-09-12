import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { execa } from 'execa';

interface LicenseJob {
  name: string;
  cmd: string;
  cwd?: string;
  status?: string;
}

(async () => {
  const { default: ora } = await import('ora');
  const { default: chalk } = await import('chalk');
  const { default: Table } = await import('cli-table3');

  console.log(chalk.hex('#FFD700').bold('\n  ⚖️   Open Source License Compliance Audit\n'));

  const jobs: LicenseJob[] = [
    {
      name: 'NPM (JavaScript)',
      cmd: 'npx license-checker-rseidelsohn --summary --onlyAllow "MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC;CC0-1.0;Python-2.0;Unlicense;CC-BY-4.0;CC-BY-3.0;BlueOak-1.0.0;0BSD;WTFPL;Zlib;UNLICENSED"',
    },
  ];

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const spinner = ora(chalk.blue(`Auditing ${job.name}...`)).start();
    try {
      await execa(job.cmd, { shell: true, cwd: job.cwd || process.cwd() });
      job.status = chalk.green('Compliant');
      spinner.succeed(chalk.green(`${job.name} passed strict license audit.`));
    } catch (error: unknown) {
      const err = error as { stdout?: string; stderr?: string; message?: string };
      job.status = chalk.red('Violation Detected');
      spinner.fail(chalk.red(`${job.name} license violation found!`));
      console.log(chalk.dim('\n' + (err.stdout || err.stderr || err.message) + '\n'));
    }
  }

  const table = new Table({
    head: [chalk.bold.white('Component'), chalk.bold.white('Status')],
    colWidths: [25, 25],
    style: { head: [], border: [] },
  });

  let allPassed = true;

  jobs.forEach((j) => {
    table.push([j.name, j.status || 'Pending']);
    if (j.status && j.status.includes('Violation')) allPassed = false;
  });

  console.log('\n' + table.toString() + '\n');

  if (!allPassed) {
    console.log(chalk.red.bold('✖ Compliance Audit Failed! Prohibited licenses detected in the supply chain.\n'));
    process.exit(1);
  } else {
    console.log(chalk.green.bold('✔ All Supply Chains are 100% License Compliant!\n'));
    process.exit(0);
  }
})();
