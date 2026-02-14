#!/bin/bash
set -e

echo "🔍 Validating CI setup..."

# ---------------------------------------------------------------------------
# 1. Check required files exist
# ---------------------------------------------------------------------------

REQUIRED_FILES=(
  "vitest.workspace.ts"
  ".github/workflows/ci.yml"
  ".github/workflows/deploy.yml"
  "turbo.json"
  "eslint.config.js"
)

MISSING_FILES=()

for file in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$file" ]; then
    MISSING_FILES+=("$file")
  fi
done

if [ ${#MISSING_FILES[@]} -gt 0 ]; then
  echo "❌ Missing required files:"
  for file in "${MISSING_FILES[@]}"; do
    echo "   - $file"
  done
  exit 1
fi

# ---------------------------------------------------------------------------
# 2. Validate workflow Node versions are consistent
# ---------------------------------------------------------------------------

echo "Checking Node version consistency in workflows..."

NODE_VERSIONS=$(grep -r "node-version:" .github/workflows/ | sed -E 's/.*node-version:[[:space:]]*([0-9]+).*/\1/' | sort -u)
VERSION_COUNT=$(echo "$NODE_VERSIONS" | wc -l)

if [ "$VERSION_COUNT" -gt 1 ]; then
  echo "⚠️  Warning: Inconsistent Node versions in workflows:"
  grep -r "node-version:" .github/workflows/ || true
  echo "💡 Recommendation: Standardize to Node 20 (matches package.json engines.node)"
  echo ""
fi

# ---------------------------------------------------------------------------
# 3. Validate package.json test script references existing file
# ---------------------------------------------------------------------------

echo "Checking package.json test configuration..."

if grep -q "vitest.workspace.ts" package.json; then
  if [ ! -f "vitest.workspace.ts" ]; then
    echo "❌ Error: package.json references vitest.workspace.ts but file doesn't exist"
    exit 1
  fi
fi

# ---------------------------------------------------------------------------
# 4. Check if GitHub secrets documentation exists
# ---------------------------------------------------------------------------

if [ ! -f ".github/REQUIRED_SECRETS.md" ]; then
  echo "⚠️  Warning: No .github/REQUIRED_SECRETS.md found"
  echo "💡 Consider documenting required GitHub secrets for easier onboarding"
  echo ""
fi

# ---------------------------------------------------------------------------
# 5. Validate ESLint config
# ---------------------------------------------------------------------------

echo "Checking ESLint configuration..."

if [ ! -f "eslint.config.js" ]; then
  echo "❌ Error: eslint.config.js not found"
  exit 1
fi

# ---------------------------------------------------------------------------
# 6. Check for common CI-breaking patterns
# ---------------------------------------------------------------------------

echo "Scanning for common CI-breaking patterns..."

# Check for unused imports that might fail ESLint
UNUSED_IMPORT_FILES=$(grep -rl "import.*from" packages/ apps/ 2>/dev/null | head -5 || true)
if [ -n "$UNUSED_IMPORT_FILES" ]; then
  echo "💡 Tip: Run 'pnpm lint' to catch unused imports before committing"
fi

# ---------------------------------------------------------------------------
# 7. Validate workspace structure
# ---------------------------------------------------------------------------

echo "Checking monorepo structure..."

if [ ! -f "pnpm-workspace.yaml" ]; then
  echo "❌ Error: pnpm-workspace.yaml not found"
  exit 1
fi

# ---------------------------------------------------------------------------
# Success
# ---------------------------------------------------------------------------

echo ""
echo "✅ CI setup validation passed"
echo ""
echo "Run 'pnpm validate' to run the full test suite before pushing"
