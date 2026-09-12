import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { execa } from 'execa';

(async () => {
  const { default: ora } = await import('ora');
  const { default: chalk } = await import('chalk');
  const { default: Table } = await import('cli-table3');

  console.log(chalk.hex('#FFD700').bold('\n  ✨  Polyglot Code Formatting\n'));

  const jobs = [
    { name: 'TypeScript / HTML (Prettier)', cmd: 'npm run format:ts' },
    { name: 'Rust (rustfmt)', cmd: 'npm run format:rust' },
    { name: 'Go (gofmt)', cmd: 'npm run format:go' },
    { name: 'C / CUDA (clang-format)', cmd: 'npm run format:c' },
    { name: 'Python (Black)', cmd: 'npm run format:python' },
  ];

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const spinner = ora(chalk.blue(`Formatting ${job.name}...`)).start();
    try {
      await execa(job.cmd, { shell: true });
      job.status = chalk.green('Formatted');
      spinner.succeed(chalk.green(`${job.name} formatted successfully.`));
    } catch (error) {
      job.status = chalk.red('Failed');
      spinner.fail(chalk.red(`${job.name} formatting failed.`));
      console.log(chalk.dim('\n' + (error.stdout || error.stderr || error.message) + '\n'));
    }
  }

  const table = new Table({
    head: [chalk.bold.white('Component'), chalk.bold.white('Status')],
    colWidths: [35, 20],
    style: { head: [], border: [] },
  });

  let allPassed = true;

  jobs.forEach((j) => {
    table.push([j.name, j.status]);
    if (j.status.includes('Failed')) allPassed = false;
  });

  console.log('\n' + table.toString() + '\n');

  if (!allPassed) {
    console.log(chalk.red.bold('✖ Formatting Failed!\n'));
    process.exit(1);
  } else {
    console.log(chalk.green.bold('✔ Codebase is Perfectly Formatted!\n'));
    process.exit(0);
  }
})();
