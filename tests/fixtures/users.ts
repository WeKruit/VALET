import { randomUUID } from "node:crypto";

export interface User {
  id: string;
  email: string;
  name: string;
  googleId: string;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const UserFactory = {
  create: (overrides?: Partial<User>): User => ({
    id: randomUUID(),
    email: "test@example.com",
    name: "Test User",
    googleId: `google-${randomUUID().slice(0, 8)}`,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),

  createMany: (count: number, overrides?: Partial<User>): User[] =>
    Array.from({ length: count }, (_, i) =>
      UserFactory.create({
        email: `testuser${i + 1}@example.com`,
        name: `Test User ${i + 1}`,
        ...overrides,
      }),
    ),
};
