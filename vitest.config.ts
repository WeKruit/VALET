export default {
  test: {
    globals: true,
    environment: "node",
    passWithNoTests: true,
    testTimeout: 10_000,
    hookTimeout: 30_000,
    pool: "forks",
  },
};
