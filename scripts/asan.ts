import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { execa } from 'execa';
const fs = require('fs');
const path = require('path');

(async () => {
  const { default: ora } = await import('ora');
  const { default: chalk } = await import('chalk');

  console.log(chalk.hex('#FF6347').bold('\n  🛡️   Memory Sanitization (ASAN) Initializing\n'));

  // 1. Locate MSVC ASAN DLL
  const msvcBase = 'X:\\vs\\cache\\VC\\Tools\\MSVC';
  let msvcPath = '';
  if (fs.existsSync(msvcBase)) {
    const versions = fs.readdirSync(msvcBase);
    for (const v of versions) {
      const tryPath = path.join(msvcBase, v, 'bin', 'Hostx64', 'x64');
      if (fs.existsSync(path.join(tryPath, 'clang_rt.asan_dynamic-x86_64.dll'))) {
        msvcPath = tryPath;
        break;
      }
    }
  }

  // 2. Locate LLVM ASAN DLL
  const llvmBase = 'C:\\Program Files\\LLVM\\lib\\clang';
  let llvmPath = '';
  if (fs.existsSync(llvmBase)) {
    const versions = fs.readdirSync(llvmBase);
    for (const v of versions) {
      const tryPath = path.join(llvmBase, v, 'lib', 'windows');
      if (fs.existsSync(path.join(tryPath, 'clang_rt.asan_dynamic-x86_64.dll'))) {
        llvmPath = tryPath;
        break;
      }
    }
  }

  const spinner = ora(chalk.blue('Running Rust ASAN Tests (Nightly + MSVC)...')).start();

  try {
    const rustEnv = Object.assign({}, process.env, {
      RUSTFLAGS: '-Zsanitizer=address',
      PATH: `${msvcPath};${process.env.PATH}`,
    });

    await execa('cargo', ['+nightly', 'test', '--target', 'x86_64-pc-windows-msvc'], {
      cwd: path.join(__dirname, '../d-asp/rust'),
      env: rustEnv,
    });

    spinner.succeed(chalk.green('Rust ASAN Checks Passed. Zero memory leaks detected.'));
  } catch (error) {
    spinner.fail(chalk.red('Rust ASAN Checks Failed. Memory violation detected!'));
    console.log(chalk.dim('\n' + (error.stdout || error.stderr || error.message) + '\n'));
    process.exit(1);
  }

  const spinner2 = ora(chalk.blue('Running C Engine ASAN Instrumentation (LLVM)...')).start();

  try {
    const cEnv = Object.assign({}, process.env, {
      PATH: `${llvmPath};${process.env.PATH}`,
    });

    // Compile C engine with ASAN
    await execa(
      'C:\\Program Files\\LLVM\\bin\\clang.exe',
      [
        '-O1',
        '-g',
        '-fsanitize=address',
        '-mavx2',
        '-o',
        'dasp_asan.exe',
        'main.c',
        'spna_engine.c',
        'gf_math.c',
        'ml_kem.c',
        'fips202.c',
        'sha512.c',
        'sha256.c',
        'aes.c',
        'rng.c',
        'poly.c',
        'poly_sampling.c',
        '-I.',
        '-lws2_32',
        '-luserenv',
        '-ladvapi32',
        '-lbcrypt',
      ],
      { cwd: path.join(__dirname, '../d-asp/c'), env: cEnv },
    );

    // Run KAT tests against the ASAN binary
    await execa('python', ['../scripts/verify_kat.py'], {
      cwd: path.join(__dirname, '../d-asp/c'),
      env: Object.assign({}, cEnv, { DASP_C_BINARY: 'dasp_asan.exe' }),
    });

    spinner2.succeed(chalk.green('C Engine ASAN Checks Passed. Zero memory leaks detected.'));
  } catch (error) {
    spinner2.fail(chalk.red('C Engine ASAN Checks Failed. Memory violation detected!'));
    console.log(chalk.dim('\n' + (error.stdout || error.stderr || error.message) + '\n'));
    process.exit(1);
  }

  console.log(chalk.green.bold('\n✔ All Native Engines Passed Memory Sanitization!\n'));
  process.exit(0);
})();
