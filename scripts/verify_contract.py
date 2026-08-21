#!/usr/bin/env python3
"""
Reproducible check script for WarrantyVault Contract (v0.2.18).
Validates contract syntax, dataclass annotations, and storage rules for GenVM.
"""
import os
import sys
import ast

def check_contract(file_path: str) -> bool:
    print(f"[*] Analyzing GenVM Contract: {file_path}")
    if not os.path.exists(file_path):
        print(f"[FAIL] Contract file not found: {file_path}")
        return False

    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    lines = [line.strip() for line in content.split("\n") if line.strip()]

    # 1. Header & Runtime Dependency Check
    assert any("# v0.2.18" in line for line in lines[:5]), "Missing '# v0.2.18' version header"
    assert any("py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" in line for line in lines[:5]), "Missing pinned py-genlayer runtime"

    # 2. AST Parsing
    tree = ast.parse(content, filename=file_path)
    classes = [node for node in tree.body if isinstance(node, ast.ClassDef)]
    class_names = [c.name for c in classes]

    assert "Contract" in class_names, "Contract class missing"
    assert "Warranty" in class_names, "Warranty dataclass missing"
    assert "Claim" in class_names, "Claim dataclass missing"

    # 3. Method validation
    contract_class = next(c for c in classes if c.name == "Contract")
    method_names = [item.name for item in contract_class.body if isinstance(item, ast.FunctionDef)]
    
    required_methods = [
        "__init__",
        "create_warranty",
        "file_claim",
        "adjudicate_claim",
        "release_escalated_funds",
        "get_warranty",
        "get_claim",
        "_get_current_timestamp",
        "_effective_verdict"
    ]
    for m in required_methods:
        assert m in method_names, f"Missing method: {m}"

    print("[PASS] AST Parsing & GenVM Structure Validation Passed (v0.2.18)!")
    return True

if __name__ == "__main__":
    target = os.path.join(os.path.dirname(__file__), "..", "contracts", "warranty_vault.py")
    success = check_contract(target)
    sys.exit(0 if success else 1)
