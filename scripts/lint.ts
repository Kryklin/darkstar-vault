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

  console.log(chalk.hex('#00BFFF').bold('\n  🔍  Code Linting Initialization\n'));

  const jobs = [
    { name: 'TypeScript', cmd: 'npm run lint:ts' },
  ];

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const spinner = ora(chalk.blue(`Linting ${job.name}...`)).start();
    try {
      await execa(job.cmd, { shell: true });
      job.status = chalk.green('Passed');
      spinner.succeed(chalk.green(`${job.name} passed all lint checks.`));
    } catch (error) {
      job.status = chalk.red('Failed');
      spinner.fail(chalk.red(`${job.name} found linting errors.`));
      // Print the output so the user can fix it
      console.log(chalk.dim('\n' + (error.stdout || error.stderr || error.message) + '\n'));
    }
  }

  const table = new Table({
    head: [chalk.bold.white('Component'), chalk.bold.white('Status')],
    colWidths: [30, 20],
    style: { head: [], border: [] },
  });

  let allPassed = true;

  jobs.forEach((j) => {
    table.push([j.name, j.status]);
    if (j.status.includes('Failed')) allPassed = false;
  });

  console.log('\n' + table.toString() + '\n');

  if (!allPassed) {
    console.log(chalk.red.bold('✖ Linting Failed! Please fix the errors above.\n'));
    process.exit(1);
  } else {
    console.log(chalk.green.bold('✔ All Codebase Lint Checks Passed!\n'));
    process.exit(0);
  }
})();
