import { handleRestore } from '../src/restore-api.mjs';

export default function handler(req, res) {
  return handleRestore(req, res);
}
