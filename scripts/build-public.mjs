import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deploymentIdentity } from './deployment-identity.mjs';

const root = resolve(import.meta.dirname, '..');
const config = JSON.parse(await readFile(resolve(root, 'aleph.config.json'), 'utf8'));
if (![1, 2, 3, 4, 5].includes(config.step)) {
  throw new Error('현재 빌드는 1~5단계를 지원합니다.');
}
const data = JSON.parse(await readFile(resolve(root, 'data.json'), 'utf8'));
if (!Array.isArray(data.notes)) {
  throw new Error('자료 형식을 확인하세요.');
}
if (config.step >= 2 && data.notes.length !== 0) {
  throw new Error('2단계에서는 코드에 메모를 남길 수 없습니다.');
}
await mkdir(resolve(root, 'public'), { recursive: true });
await writeFile(resolve(root, 'public', 'data.json'),
  JSON.stringify(config.step === 1 ? data : { notes: [] }, null, 2) + '\n');
console.log('현재 단계의 정적 자료 파일을 생성했습니다.');

if (!process.argv.includes('--local')) {
  const identity = deploymentIdentity(process.env, config);
  await writeFile(resolve(root, 'public', 'aleph.json'),
    JSON.stringify(identity, null, 2) + '\n');
  console.log('배포 식별 정보를 생성했습니다.');
}
