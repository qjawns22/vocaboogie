import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const vocabStates = sqliteTable("vocab_states", {
  userId: text("user_id").primaryKey(),
  payload: text("payload").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: integer("updated_at").notNull(),
});
