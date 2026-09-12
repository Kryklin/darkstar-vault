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

  console.log(chalk.hex('#00ADD8').bold('\n  🛡️  Security Audit Initialization\n'));

  const results = [
    { name: 'NPM (JavaScript)', status: 'Pending', vulns: 0, cmd: 'npm audit --json', parse: parseNpm },
  ];

  for (let i = 0; i < results.length; i++) {
    const item = results[i];
    const spinner = ora(chalk.blue(`Auditing ${item.name}...`)).start();
    try {
      const { stdout } = await execa(item.cmd, { shell: true });
      item.vulns = item.parse(stdout);
      item.status = item.vulns > 0 ? chalk.red('Failed') : chalk.green('Passed');
      if (item.vulns > 0) {
        spinner.fail(chalk.red(`${item.name} completed with ${item.vulns} vulnerabilities.`));
      } else {
        spinner.succeed(chalk.green(`${item.name} completed perfectly.`));
      }
    } catch (error) {
      const stdout = error.stdout || '';
      try {
        item.vulns = item.parse(stdout);
        item.status = item.vulns > 0 ? chalk.red('Failed') : chalk.red('Error');
        if (item.vulns > 0) {
          spinner.fail(chalk.red(`${item.name} completed with ${item.vulns} vulnerabilities.`));
        } else {
          spinner.fail(chalk.red(`${item.name} failed to execute properly.`));
        }
      } catch (e) {
        if (item.name === 'Cargo (Rust)' && stdout.includes('no such command')) {
          item.status = chalk.yellow('Skipped');
          spinner.warn(chalk.yellow(`${item.name} skipped (cargo-audit not installed).`));
        } else {
          item.status = chalk.red('Error');
          spinner.fail(chalk.red(`${item.name} failed to execute. ${e.message}`));
        }
      }
    }
  }

  const table = new Table({
    head: [chalk.bold.white('Component'), chalk.bold.white('Status'), chalk.bold.white('Vulnerabilities')],
    colWidths: [30, 15, 20],
    style: { head: [], border: [] },
  });

  let totalVulns = 0;
  let allPassed = true;

  results.forEach((r) => {
    table.push([r.name, r.status, typeof r.vulns === 'number' ? r.vulns.toString() : '-']);
    if (typeof r.vulns === 'number') totalVulns += r.vulns;
    if (r.status.includes('Failed') || r.status.includes('Error')) allPassed = false;
  });

  console.log('\n' + table.toString() + '\n');

  let score = 100;
  if (totalVulns > 0) {
    score = Math.max(0, 100 - totalVulns * 5);
  }

  console.log(chalk.bold(`  Security Score: `) + (score === 100 ? chalk.green.bold(`${score}/100`) : chalk.red.bold(`${score}/100`)));

  if (!allPassed) {
    console.log(chalk.red.bold('\n✖ Security Audit Failed! Fix the vulnerabilities above.\n'));
    process.exit(1);
  } else {
    console.log(chalk.green.bold('\n✔ All Systems Secure! You are cleared for takeoff.\n'));
    process.exit(0);
  }

  function parseNpm(out) {
    if (!out) return 0;
    const json = JSON.parse(out.substring(out.indexOf('{')));
    return json.metadata.vulnerabilities.total || 0;
  }

  function parseCargo(out) {
    if (!out) return 0;
    const json = JSON.parse(out.substring(out.indexOf('{')));
    return json.vulnerabilities.count || 0;
  }

  function parseGo(out) {
    if (!out) return 0;
    const match = out.match(/Your code is affected by (\d+) vulnerabilities/i);
    return match ? parseInt(match[1]) : 0;
  }

  function parsePython(out) {
    if (!out) return 0;
    const jsonStr = out.substring(out.indexOf('{'));
    if (!jsonStr) return 0;
    const json = JSON.parse(jsonStr);
    let count = 0;
    if (json.dependencies) {
      json.dependencies.forEach((d) => {
        if (d.vulns) count += d.vulns.length;
      });
    }
    return count;
  }
})();
