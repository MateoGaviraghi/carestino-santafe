import { desc } from 'drizzle-orm';
import { getDb } from '@/db';
import { users, type User } from '@/db/schema';

export async function listAllUsers(): Promise<User[]> {
  const db = getDb();
  return db.select().from(users).orderBy(desc(users.createdAt));
}
