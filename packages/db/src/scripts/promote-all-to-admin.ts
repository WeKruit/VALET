import { eq, or, isNull } from 'drizzle-orm';
import { createDatabase } from '../client.js';
import { users } from '../schema/users.js';

const connectionString = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_DIRECT_URL or DATABASE_URL must be set');
  process.exit(1);
}

const { db, sql } = createDatabase(connectionString);

console.log('🔍 Checking all users...');

// Get all users
const allUsers = await db.select().from(users);

console.log('\nCurrent users:');
allUsers.forEach(user => {
  console.log(`  - ${user.email}: role=${user.role || 'NULL'}`);
});

console.log('\n🔧 Promoting all users to admin...');

// Promote all users to admin
const result = await db
  .update(users)
  .set({ role: 'admin' })
  .where(or(eq(users.role, 'user'), isNull(users.role)))
  .returning({ email: users.email, role: users.role });

if (result.length > 0) {
  console.log('\n✅ Promoted users:');
  result.forEach(user => {
    console.log(`  - ${user.email} → ${user.role}`);
  });
} else {
  console.log('\n✅ All users already have admin role');
}

console.log('\n📊 Final state:');
const finalUsers = await db.select().from(users);
finalUsers.forEach(user => {
  console.log(`  - ${user.email}: role=${user.role}`);
});

await sql.end();
console.log('\n✅ Done!');
