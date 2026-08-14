#!/bin/bash

# WarrantyVault Test Runner
# =========================
# This script runs the WarrantyVault contract tests on studionet

set -e

echo "=========================================="
echo "WarrantyVault Contract Test Runner"
echo "=========================================="
echo ""

# Check for required environment variables
if [ -z "$CONTRACT_ADDRESS" ]; then
    echo "⚠️  CONTRACT_ADDRESS not set."
    echo "   Please set it in your .env file or export it:"
    echo "   export CONTRACT_ADDRESS=your_contract_address"
    echo ""
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed."
    echo "   Please install Node.js: https://nodejs.org/"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed."
    echo "   Please install npm: https://npmjs.com/"
    exit 1
fi

echo "📋 Running Python tests..."
echo "-------------------------"

# Pick a working Python interpreter. Prefer python3, but fall back to python:
# Windows often only ships `python`, and the `python3` alias can be a broken
# Microsoft Store stub that passes `command -v` yet fails on execution — so we
# verify each candidate by actually running it.
PYTHON=""
for candidate in python3 python; do
    if command -v "$candidate" &> /dev/null && "$candidate" --version > /dev/null 2>&1; then
        PYTHON="$candidate"
        break
    fi
done

if [ -z "$PYTHON" ]; then
    echo "❌ No working Python interpreter found (tried python3, python)."
    echo "   Please install Python 3.10+: https://python.org/downloads/"
    exit 1
fi

echo "ℹ️  Using interpreter: $PYTHON ($("$PYTHON" --version 2>&1))"
echo ""
echo "   The suite runs standalone via: $PYTHON tests/test_warranty_vault.py"
echo "   (pytest is optional — pip install pytest — but the standalone runner"
echo "    needs no third-party packages and is the recommended invocation.)"
echo ""

cd "$(dirname "$0")/.."

# Run the Python suite with full output. Nothing is suppressed, so any failure
# or error is immediately visible instead of being hidden behind /dev/null.
SUITE_FAILED=0
if ! "$PYTHON" tests/test_warranty_vault.py; then
    SUITE_FAILED=1
    echo ""
    echo "⚠️  Python suite finished with errors (see output above)."
fi

cd - > /dev/null

echo ""
echo "📋 Running JavaScript tests..."
echo "-----------------------------"

# Run JavaScript tests
cd "$(dirname "$0")"
if [ -f "test_warranty_vault.js" ]; then
    echo "ℹ️  JavaScript tests must be run in browser environment."
    echo "   1. Open your browser with MetaMask"
    echo "   2. Open browser console"
    echo "   3. Run: window.runTests()"
else
    echo "❌ test_warranty_vault.js not found"
fi

cd - > /dev/null

echo ""
echo "=========================================="
echo "Test run complete!"
echo "=========================================="
echo ""
echo "For detailed test results, see contracts/tests/README.md"

exit "$SUITE_FAILED"
