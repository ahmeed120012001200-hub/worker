import database from "./database.js";
import { createSupabaseRepository } from "./supabaseRepository.js";

const apply = process.argv.includes("--apply");
const { migrateLegacyState } = createSupabaseRepository(process.env);
const workers = database.prepare("SELECT workerNumber, workerName, product, quantity, date, comments, created FROM workers ORDER BY id").all();
const dailySummaries = database.prepare("SELECT date, items, created FROM daily_summaries ORDER BY date").all().map((summary) => ({
  ...summary,
  items: JSON.parse(summary.items)
}));
const products = database.prepare("SELECT name FROM products ORDER BY name").all().map((product) => product.name);

try {
  if (!apply) {
    console.log(`Dry run: ${workers.length} workers, ${dailySummaries.length} daily summaries, ${products.length} products.`);
    console.log("No data was uploaded. Run with --apply only after applying supabase/schema.sql.");
  } else {
    const result = await migrateLegacyState(workers, dailySummaries, products);
    console.log(`Migrated ${result.importedWorkers} workers and ${result.importedSummaries} daily summaries.`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  database.close();
}
