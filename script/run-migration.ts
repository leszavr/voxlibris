import pg from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://xlibris:xlibris_dev@localhost:5432/xlibris';

const client = new Client({
  connectionString: DATABASE_URL,
});

async function runMigrations() {
  try {
    console.log('Connecting to database...');
    await client.connect();

    // Get all migration files in order, excluding clean rebuild
    const migrationFiles = readdirSync(join(__dirname, '../migrations'))
      .filter(file => file.endsWith('.sql') && file !== 'seed_data.sql' && !file.includes('clean_rebuild'))
      .sort();

    console.log(`Found ${migrationFiles.length} migration files`);

    // Execute each migration in order
    for (const file of migrationFiles) {
      console.log(`Reading migration file: ${file}`);
      const migrationSQL = readFileSync(join(__dirname, '../migrations', file), 'utf8');
      
      console.log(`Executing migration: ${file}`);
      await client.query(migrationSQL);
      console.log(`Migration ${file} completed successfully!`);
    }

    // Run seed data
    console.log('Reading seed data...');
    const seedSQL = readFileSync(join(__dirname, '../migrations/seed_data.sql'), 'utf8');
    
    console.log('Executing seed data...');
    await client.query(seedSQL);
    console.log('Seed data completed successfully!');

    console.log('All migrations completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations();
