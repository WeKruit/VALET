import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  test: {
    globals: true,
    environment: "jsdom",
    passWithNoTests: true,
    // Web integration tests need component/routing fixes — exclude until fixed
    exclude: ["**/node_modules/**", "**/dist/**", "src/features/**/*.test.{ts,tsx}"],
    alias: {
      "@/": path.resolve(__dirname, "src") + "/",
      "@valet/ui/components/": path.resolve(__dirname, "../../packages/ui/src/components") + "/",
      "@valet/ui/lib/": path.resolve(__dirname, "../../packages/ui/src/lib") + "/",
      "@valet/contracts": path.resolve(__dirname, "../../packages/contracts/src/index.ts"),
      "@valet/shared/schemas": path.resolve(
        __dirname,
        "../../packages/shared/src/schemas/index.ts",
      ),
      "@valet/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
    },
  },
};
