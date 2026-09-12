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

  console.log(chalk.hex('#FF4500').bold('\n  🚀  Building Native Crypto Engines\n'));

  const jobs = [
    { name: 'Rust (Engine)', cmd: 'npm run build:rust' },
    { name: 'Go (Engine)', cmd: 'npm run build:go' },
    { name: 'C (Reference)', cmd: 'npm run build:c' },
    { name: 'CUDA (Accelerated)', cmd: 'npm run build:cuda' },
  ];

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const spinner = ora(chalk.blue(`Compiling ${job.name}...`)).start();
    try {
      await execa(job.cmd, { shell: true });
      job.status = chalk.green('Compiled');
      spinner.succeed(chalk.green(`${job.name} compiled successfully.`));
    } catch (error) {
      job.status = chalk.red('Failed');
      spinner.fail(chalk.red(`${job.name} compilation failed.`));
      console.log(chalk.dim('\n' + (error.stdout || error.stderr || error.message) + '\n'));
    }
  }

  const table = new Table({
    head: [chalk.bold.white('Component'), chalk.bold.white('Status')],
    colWidths: [25, 20],
    style: { head: [], border: [] },
  });

  let allPassed = true;

  jobs.forEach((j) => {
    table.push([j.name, j.status]);
    if (j.status.includes('Failed')) allPassed = false;
  });

  console.log('\n' + table.toString() + '\n');

  if (!allPassed) {
    console.log(chalk.red.bold('✖ Build Failed!\n'));
    process.exit(1);
  } else {
    console.log(chalk.green.bold('✔ All Native Engines Built Successfully!\n'));
    process.exit(0);
  }
})();
