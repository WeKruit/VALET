export default {
  test: {
    globals: true,
    environment: "node",
    passWithNoTests: true,
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      // Security tests are TDD specs for unimplemented features — enable as each is built
      "**/tests/security/**",
    ],
  },
};
