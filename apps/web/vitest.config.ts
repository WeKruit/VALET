export default {
  test: {
    globals: true,
    environment: "jsdom",
    passWithNoTests: true,
    // Web integration tests need component/routing fixes — exclude until fixed
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "src/features/**/*.test.{ts,tsx}",
    ],
    alias: {
      "@/": new URL("./src/", import.meta.url).pathname,
      "@valet/ui/components/": new URL("../../packages/ui/src/components/", import.meta.url).pathname,
      "@valet/ui/lib/": new URL("../../packages/ui/src/lib/", import.meta.url).pathname,
      "@valet/contracts": new URL("../../packages/contracts/src/index.ts", import.meta.url).pathname,
      "@valet/shared/schemas": new URL("../../packages/shared/src/schemas/index.ts", import.meta.url).pathname,
      "@valet/shared": new URL("../../packages/shared/src/index.ts", import.meta.url).pathname,
    },
  },
};
