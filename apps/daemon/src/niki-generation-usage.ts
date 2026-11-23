import type Database from 'better-sqlite3';

/** Consumption outlives projects and tasks, including failed generation attempts. */
export function migrateNikiGenerationUsage(db: Database.Database): void {
  db.transaction(() => {
    const exists = db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'niki_generation_usage'",
    ).get();
    db.exec(`
      CREATE TABLE IF NOT EXISTS niki_generation_usage (
        id INTEGER PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_niki_generation_usage_user_time
        ON niki_generation_usage(user_id, created_at);
    `);
    if (!exists) {
      // Import once, preserving the original rolling-window timestamps. There is
      // deliberately no project/task foreign key: deletion must not refund usage.
      db.exec(`
        INSERT INTO niki_generation_usage (user_id, created_at)
          SELECT projects.owner_user_id, tasks.created_at FROM media_tasks tasks
          JOIN projects ON projects.id = tasks.project_id
          WHERE projects.owner_user_id IS NOT NULL;
        INSERT INTO niki_generation_usage (user_id, created_at)
          SELECT owner_user_id, json_extract(metadata_json, '$.presentation.createdAt')
          FROM projects WHERE owner_user_id IS NOT NULL
            AND json_extract(metadata_json, '$.presentation.createdAt') IS NOT NULL;
      `);
    }
    // Recording in the same SQLite write also covers CLI and recovery writers.
    // New attempts reusing a deleted task ID still create a new consumption row.
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS niki_adopted_generation_usage
      AFTER UPDATE OF owner_user_id ON projects
      WHEN OLD.owner_user_id IS NULL AND NEW.owner_user_id IS NOT NULL
      BEGIN
        INSERT INTO niki_generation_usage (user_id, created_at)
          SELECT NEW.owner_user_id, created_at FROM media_tasks WHERE project_id = NEW.id;
        INSERT INTO niki_generation_usage (user_id, created_at)
          SELECT NEW.owner_user_id, json_extract(NEW.metadata_json, '$.presentation.createdAt')
          WHERE json_extract(NEW.metadata_json, '$.presentation.createdAt') IS NOT NULL;
      END;
      CREATE TRIGGER IF NOT EXISTS niki_media_generation_usage
      AFTER INSERT ON media_tasks
      BEGIN
        INSERT INTO niki_generation_usage (user_id, created_at)
          SELECT owner_user_id, NEW.created_at FROM projects
          WHERE id = NEW.project_id AND owner_user_id IS NOT NULL;
      END;
      CREATE TRIGGER IF NOT EXISTS niki_presentation_generation_usage
      AFTER INSERT ON projects
      WHEN NEW.owner_user_id IS NOT NULL
        AND json_extract(NEW.metadata_json, '$.presentation.createdAt') IS NOT NULL
      BEGIN
        INSERT INTO niki_generation_usage (user_id, created_at)
          VALUES (NEW.owner_user_id, json_extract(NEW.metadata_json, '$.presentation.createdAt'));
      END;
      CREATE TRIGGER IF NOT EXISTS niki_presentation_generation_usage_update
      AFTER UPDATE OF metadata_json ON projects
      WHEN NEW.owner_user_id IS NOT NULL
        AND json_extract(OLD.metadata_json, '$.presentation.createdAt') IS NULL
        AND json_extract(NEW.metadata_json, '$.presentation.createdAt') IS NOT NULL
      BEGIN
        INSERT INTO niki_generation_usage (user_id, created_at)
          VALUES (NEW.owner_user_id, json_extract(NEW.metadata_json, '$.presentation.createdAt'));
      END;
    `);
  }).immediate();
}
