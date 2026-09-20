import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { access, mkdir, rename, rm } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { dirname, resolve } from 'node:path';

const version = process.env.TABTOME_INSTALLER_VERSION ?? 'v0.12.0-unsigned-preview';
const assetName = process.env.TABTOME_INSTALLER_ASSET ?? 'TabTome-Setup-0.12.0.exe';
const expectedSha256 = (process.env.TABTOME_INSTALLER_SHA256 ??
  'd621ce9726a735c3daaf9d0874666733930b58d478034ba89382eaba723f8cb8').toLowerCase();
const repository = 'akakybzdynia-boop/tabtome';
const target = resolve('landing', 'downloads', 'TabTome-Setup.exe');
const temporary = `${target}.part`;
const url = `https://github.com/${repository}/releases/download/${encodeURIComponent(version)}/${encodeURIComponent(assetName)}`;

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  // A local working tree may already contain the binary. CI/Netlify must fetch
  // the canonical release asset because the installer is intentionally ignored
  // by Git and is not part of the source checkout.
  if (!process.env.NETLIFY && !process.env.TABTOME_FETCH_INSTALLER && await fileExists(target)) {
    console.log(`Installer already present locally: ${target}`);
    return;
  }

  await mkdir(dirname(target), { recursive: true });
  await rm(temporary, { force: true });

  console.log(`Downloading ${repository} ${version}: ${assetName}`);
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) {
    throw new Error(`Installer download failed (${response.status} ${response.statusText}): ${url}`);
  }

  await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));

  const hash = createHash('sha256');
  const file = await import('node:fs');
  await new Promise((resolvePromise, rejectPromise) => {
    const stream = file.createReadStream(temporary);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', rejectPromise);
    stream.on('end', resolvePromise);
  });
  const actualSha256 = hash.digest('hex');
  if (actualSha256 !== expectedSha256) {
    await rm(temporary, { force: true });
    throw new Error(`Installer SHA-256 mismatch. Expected ${expectedSha256}, got ${actualSha256}`);
  }

  await rename(temporary, target);
  console.log(`Installer ready: ${target} (${actualSha256})`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
