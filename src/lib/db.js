import fs from 'fs/promises';
import path from 'path';

const dbPath = path.join(process.cwd(), 'db.json');

// Helper to read the JSON file
export async function getDb() {
  try {
    const data = await fs.readFile(dbPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // If the file doesn't exist, return a default structure
    if (error.code === 'ENOENT') {
      const defaultDb = { users: {} };
      await saveDb(defaultDb);
      return defaultDb;
    }
    throw error;
  }
}

// Helper to write to the JSON file
export async function saveDb(data) {
  await fs.writeFile(dbPath, JSON.stringify(data, null, 2), 'utf8');
}