import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

const connectionString = process.env.DATABASE_URL!;

// Use a single persistent connection (not pooled) for migrations
// and a pool for the app
const queryClient = postgres(connectionString);

export const db = drizzle(queryClient, { schema });
