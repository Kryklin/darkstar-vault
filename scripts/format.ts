import { execa } from 'execa';

interface FormatJob {
  name: string;
  cmd: string;
  status?: string;
}

(async () => {
  const { default: ora } = await import('ora');
  const { default: chalk } = await import('chalk');
  const { default: Table } = await import('cli-table3');

  console.log(chalk.hex('#FFD700').bold('\n  ✨  Codebase Formatting (Prettier)\n'));

  const jobs: FormatJob[] = [
    {
      name: 'TypeScript, HTML & SCSS',
      cmd: 'npx prettier --write "src/**/*.{ts,html,scss}" "electron/**/*.ts" "scripts/**/*.ts"',
    },
  ];

  for (const job of jobs) {
    const spinner = ora(chalk.blue(`Formatting ${job.name}...`)).start();
    try {
      await execa(job.cmd, { shell: true });
      job.status = chalk.green('Formatted');
      spinner.succeed(chalk.green(`${job.name} formatted successfully.`));
    } catch (error: unknown) {
      const err = error as { stdout?: string; stderr?: string; message?: string };
      job.status = chalk.red('Failed');
      spinner.fail(chalk.red(`${job.name} formatting failed.`));
      console.log(chalk.dim('\n' + (err.stdout || err.stderr || err.message) + '\n'));
    }
  }

  const table = new Table({
    head: [chalk.bold.white('Component'), chalk.bold.white('Status')],
    colWidths: [35, 20],
    style: { head: [], border: [] },
  });

  let allPassed = true;

  jobs.forEach((j) => {
    table.push([j.name, j.status || 'Pending']);
    if (j.status && j.status.includes('Failed')) allPassed = false;
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
