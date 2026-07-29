import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const replayLibrary = sqliteTable("replay_library", {
  id: text("id").primaryKey(),
  videosJson: text("videos_json").notNull().default("[]"),
  notesJson: text("notes_json").notNull().default("{}"),
  updatedAt: integer("updated_at").notNull(),
});
