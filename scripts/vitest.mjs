// `pnpm test --filter <pacote>` → `vitest run --project <pacote>`.
// O vitest não tem --filter; o nome do projeto é o "name" do package.json.
import { spawnSync } from 'node:child_process';

const args = process.argv
  .slice(2)
  .map((a) => (a === '--filter' ? '--project' : a.replace(/^--filter=/, '--project=')));
const { status } = spawnSync('vitest', ['run', ...args], { stdio: 'inherit', shell: true });
process.exit(status ?? 1);
