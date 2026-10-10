#!/usr/bin/env node
// Daily intelligence sync scaffold for Sami Warehouse.
// Keep this file intentionally small so the cron can grow into real sync logic later.

const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', 'news_data.json');
const timestamp = new Date().toISOString();

function ensureData() {
  if (!fs.existsSync(dataPath)) {
    return {
      wired: {
        title: 'Daily fact pending',
        summary: 'No synced fact yet.',
        source: 'local scaffold',
        updated_at: timestamp
      },
      vocabulary: [],
      grammar: { title: '', formula: '', examples: [] },
      news: { national: [], global: [], innovation: [], ai: [] },
      updated_at: timestamp
    };
  }

  try {
    const raw = fs.readFileSync(dataPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.warn('Failed to parse news_data.json; leaving unchanged.', error.message);
    return null;
  }
}

function main() {
  const data = ensureData();
  if (!data) return;

  data.updated_at = timestamp;
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`Updated ${path.relative(process.cwd(), dataPath)} at ${timestamp}`);
}

main();
