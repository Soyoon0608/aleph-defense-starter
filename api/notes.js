import { handleNotes } from '../src/notes-api.mjs';
export default function handler(req, res) {
  return handleNotes(req, res);
}
