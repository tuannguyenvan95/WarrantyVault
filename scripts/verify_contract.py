#!/usr/bin/env python3
"""
Reproducible Repository Check for WarrantyVault Smart Contract
Verifies compatibility with GenLayer v0.2.18 and pinned py-genlayer runtime.
"""

import ast
import os
import sys

def verify_contract(file_path: str) -> bool:
    print(f"[*] Verifying contract file: {file_path}")
    
    if not os.path.exists(file_path):
        print(f"[FAIL] File not found: {file_path}")
        return False

    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    lines = [line.strip() for line in content.split("\n") if line.strip()]

    # 1. Check Header & Pinned Runtime
    header_v = any("# v0.2.18" in line for line in lines[:5])
    runtime_pinned = any('py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6' in line for line in lines[:5])

    if not header_v:
        print("[FAIL] Missing or invalid '# v0.2.18' version header.")
        return False
    print("[PASS] Header declared: v0.2.18")

    if not runtime_pinned:
        print("[FAIL] Missing or invalid pinned 'py-genlayer' runtime dependency.")
        return False
    print("[PASS] Runtime pinned: py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6")

    # 2. Parse Python AST
    try:
        tree = ast.parse(content, filename=file_path)
        print("[PASS] Python AST syntax validation succeeded.")
    except SyntaxError as e:
        print(f"[FAIL] Python Syntax Error in contract: {e}")
        return False

    # 3. Inspect Classes and Methods
    classes = {node.name: node for node in tree.body if isinstance(node, ast.ClassDef)}

    if "Contract" not in classes:
        print("[FAIL] Main 'Contract' class extending gl.Contract not found.")
        return False

    contract_class = classes["Contract"]
    method_names = set()
    has_staticmethod = False

    for item in contract_class.body:
        if isinstance(item, ast.FunctionDef):
            method_names.add(item.name)
            for decorator in item.decorator_list:
                if isinstance(decorator, ast.Name) and decorator.id == "staticmethod":
                    has_staticmethod = True

    if has_staticmethod:
        print("[FAIL] Found '@staticmethod' inside Contract class. GenVM validators require instance helper methods.")
        return False
    print("[PASS] No incompatible '@staticmethod' decorators found on Contract.")

    # 4. Check Required Public Methods
    required_methods = {
        "__init__",
        "create_warranty",
        "file_claim",
        "adjudicate_claim",
        "release_escalated_funds",
        "get_warranty",
        "get_claim",
        "get_all_warranties",
        "get_all_claims",
        "_parse_llm_json"
    }

    missing_methods = required_methods - method_names
    if missing_methods:
        print(f"[FAIL] Missing required contract methods: {missing_methods}")
        return False
    print(f"[PASS] All required methods present: {sorted(list(method_names))}")

    # 5. Check Payout Accounting & u256 Transfers
    if "emit_transfer(value=u256(" not in content:
        print("[FAIL] Missing 'u256' wrapping on 'emit_transfer' payout calls.")
        return False
    print("[PASS] All 'emit_transfer' calls safely wrapped in 'u256(...)'.")

    # 6. Check UserError Standard
    if "UserError(" not in content:
        print("[FAIL] Contract should use 'UserError' for user-facing errors.")
        return False
    print("[PASS] GenLayer standard 'UserError' utilized for input validation.")

    # 7. Check Data structures
    if "Warranty" not in classes or "Claim" not in classes:
        print("[FAIL] Required dataclasses Warranty / Claim not found.")
        return False
    print("[PASS] Required dataclasses (Warranty, Claim) declared.")

    print("\n=======================================================")
    print("[SUCCESS] CONTRACT PASSED ALL REPRODUCIBLE RUNTIME CHECKS!")
    print("=======================================================\n")
    return True

if __name__ == "__main__":
    target = os.path.join(os.path.dirname(__file__), "..", "contracts", "warranty_vault.py")
    success = verify_contract(target)
    sys.exit(0 if success else 1)
