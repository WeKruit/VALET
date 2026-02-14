import * as jose from 'jose';
import { eq } from 'drizzle-orm';
import { createDatabase } from '../client.js';
import { users } from '../schema/users.js';

const connectionString = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_DIRECT_URL or DATABASE_URL must be set');
  process.exit(1);
}

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  console.error('JWT_SECRET must be set');
  process.exit(1);
}

const { db, sql } = createDatabase(connectionString);

// Find an admin user
const adminUsers = await db
  .select()
  .from(users)
  .where(eq(users.role, 'admin'))
  .limit(1);

if (adminUsers.length === 0) {
  console.error('No admin users found. Run promote-all-to-admin.ts first.');
  process.exit(1);
}

const admin = adminUsers[0];
console.log(`\nGenerating API token for admin: ${admin.email}`);

// Generate a long-lived access token (30 days for CI/CD)
const token = await new jose.SignJWT({
  sub: admin.id,
  email: admin.email,
  role: admin.role,
})
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuedAt()
  .setExpirationTime('30d')
  .setIssuer('valet-api')
  .sign(new TextEncoder().encode(jwtSecret));

console.log('\n✅ Admin API Token (valid for 30 days):');
console.log(token);
console.log('\nSet this as VALET_API_TOKEN in GitHub secrets.');

await sql.end();
