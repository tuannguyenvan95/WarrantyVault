# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
from dataclasses import dataclass

@allow_storage
@dataclass
class Warranty:
    id: str
    creator: Address
    customer_address: Address
    product_info: str
    policy_url: str
    locked_amount: bigint
    expiry: bigint
    status: str

@allow_storage
@dataclass
class Claim:
    id: str
    warranty_id: str
    claimer: Address
    evidence_urls: str
    description: str
    status: str
    verdict: str
    reason: str
    confidence: bigint
    adjudicated_at: bigint

class Contract(gl.Contract):
    warranties: TreeMap[str, Warranty]
    claims: TreeMap[str, Claim]
    next_warranty_id: bigint
    next_claim_id: bigint

    def __init__(self):
        self.next_warranty_id = bigint(1)
        self.next_claim_id = bigint(1)

    def _parse_llm_json(self, text) -> dict:
        import json
        if isinstance(text, dict):
            return text
        if hasattr(text, "__dict__"):
            return text.__dict__
        if not isinstance(text, str):
            text = str(text)
        t = text.strip()
        if t.startswith("```json"):
            t = t[7:]
        elif t.startswith("```"):
            t = t[3:]
        if t.endswith("```"):
            t = t[:-3]
        try:
            return json.loads(t.strip())
        except Exception:
            return {"verdict": "ESCALATE", "confidence": 0, "reason": "JSON parse error"}

    def _effective_verdict(self, data: dict) -> str:
        if not isinstance(data, dict):
            return "ESCALATE"
        verdict = str(data.get("verdict", "ESCALATE")).upper().strip()
        if verdict not in ["COVERED", "PARTIAL", "REJECTED", "ESCALATE"]:
            verdict = "ESCALATE"
        try:
            conf = int(str(data.get("confidence", 0)))
        except Exception:
            conf = 0
        if conf < 65:
            verdict = "ESCALATE"
        return verdict

    @gl.public.write.payable
    def create_warranty(self, customer_address_str: str, policy_url: str, product_info: str, expiry_timestamp: str) -> str:
        amount = gl.message.value
        if amount <= bigint(0):
            raise UserError("Deposit amount must be greater than 0")
        if not customer_address_str or not str(customer_address_str).strip():
            raise UserError("customer_address is required")
        if not policy_url or not str(policy_url).strip():
            raise UserError("policy_url is required")
        if not product_info or not str(product_info).strip():
            raise UserError("product_info is required")
        try:
            expiry = bigint(int(expiry_timestamp))
        except Exception:
            raise UserError("Invalid expiry timestamp")
        if expiry <= bigint(0):
            raise UserError("Expiry timestamp must be greater than 0")
        warranty_id = str(int(str(self.next_warranty_id)))
        self.next_warranty_id += bigint(1)
        self.warranties[warranty_id] = Warranty(
            id=warranty_id,
            creator=gl.message.sender_address,
            customer_address=Address(customer_address_str),
            product_info=str(product_info).strip(),
            policy_url=str(policy_url).strip(),
            locked_amount=amount,
            expiry=expiry,
            status="ACTIVE"
        )
        return warranty_id

    @gl.public.write
    def file_claim(self, warranty_id: str, description: str, evidence_urls: str) -> str:
        if warranty_id not in self.warranties:
            raise UserError("Warranty not found")
        warranty = self.warranties[warranty_id]
        if warranty.status != "ACTIVE":
            raise UserError("Warranty is not active")
        if str(gl.message.sender_address).lower() != str(warranty.customer_address).lower():
            raise UserError("Unauthorized: Only the registered customer can file a claim")
        if not description or not str(description).strip():
            raise UserError("Claim description is required")
        claim_id = str(int(str(self.next_claim_id)))
        self.next_claim_id += bigint(1)
        self.claims[claim_id] = Claim(
            id=claim_id,
            warranty_id=warranty_id,
            claimer=gl.message.sender_address,
            evidence_urls=str(evidence_urls).strip() if evidence_urls else "",
            description=str(description).strip(),
            status="PENDING",
            verdict="",
            reason="",
            confidence=bigint(0),
            adjudicated_at=bigint(0)
        )
        warranty.status = "CLAIMED"
        self.warranties[warranty_id] = warranty
        return claim_id

    @gl.public.write
    def adjudicate_claim(self, claim_id: str) -> None:
        if claim_id not in self.claims:
            raise UserError("Claim not found")
        claim = self.claims[claim_id]
        if claim.status != "PENDING":
            raise UserError("Claim already adjudicated")
        if claim.warranty_id not in self.warranties:
            raise UserError("Related warranty not found")
        warranty = self.warranties[claim.warranty_id]
        policy_url_str = str(warranty.policy_url)
        product_info_str = str(warranty.product_info)
        claim_desc_str = str(claim.description)
        evidence_urls_str = str(claim.evidence_urls)

        def leader_fn():
            try:
                if policy_url_str:
                    policy_res = gl.nondet.web.render(policy_url_str, mode="text")
                    policy_text = policy_res.content if hasattr(policy_res, "content") else str(policy_res)
                    lower_text = policy_text[:400].lower()
                    if "404" in lower_text or "not found" in lower_text:
                        return {"verdict": "ESCALATE", "confidence": 100, "reason": "Policy URL 404"}
                else:
                    policy_text = "No policy URL provided."
            except Exception as e:
                return {"verdict": "ESCALATE", "confidence": 100, "reason": "Policy fetch failed: " + str(e)}

            evidence_texts = []
            for url in evidence_urls_str.split(","):
                u = url.strip()
                if not u:
                    continue
                try:
                    res = gl.nondet.web.render(u, mode="text")
                    txt = res.content if hasattr(res, "content") else str(res)
                    evidence_texts.append("Evidence from " + u + ":\n" + txt[:1500])
                except Exception as e:
                    evidence_texts.append("Evidence from " + u + ": error - " + str(e))

            evidence_block = "\n---\n".join(evidence_texts) if evidence_texts else "No evidence provided."

            prompt = (
                "You are a Warranty Adjudication Judge on GenLayer.\n"
                "Evaluate the claim against the warranty policy.\n\n"
                "PRODUCT INFO:\n" + product_info_str + "\n\n"
                "CLAIM:\n" + claim_desc_str + "\n\n"
                "POLICY:\n" + policy_text[:2500] + "\n\n"
                "EVIDENCE:\n" + evidence_block[:3000] + "\n\n"
                "Rules:\n"
                "- COVERED: Defect covered by policy with evidence.\n"
                "- PARTIAL: Partially valid.\n"
                "- REJECTED: Outside policy, misuse, or invalid evidence.\n"
                "- ESCALATE: Policy 404, ambiguous, or low confidence.\n\n"
                'Reply ONLY with JSON: {"verdict":"...","confidence":0-100,"reason":"..."}\n'
            )

            res = gl.nondet.exec_prompt(prompt, response_format="json")
            if isinstance(res, dict):
                return res
            if hasattr(res, 'calldata') and isinstance(res.calldata, dict):
                return res.calldata
            try:
                text = res.content if hasattr(res, "content") else str(res)
                return self._parse_llm_json(text)
            except Exception:
                return {"verdict": "ESCALATE", "confidence": 100, "reason": "JSON parse error"}

        def validator_fn(leader_res) -> bool:
            if not isinstance(leader_res, gl.vm.Return):
                return False
            leader_data = leader_res.calldata if hasattr(leader_res, "calldata") else leader_res
            if not isinstance(leader_data, dict):
                try:
                    leader_data = self._parse_llm_json(str(leader_data))
                except Exception:
                    leader_data = {"verdict": "ESCALATE"}
            mine_data = leader_fn()
            return self._effective_verdict(leader_data) == self._effective_verdict(mine_data)

        result = gl.vm.run_nondet(leader_fn, validator_fn)
        if not isinstance(result, dict):
            try:
                result = self._parse_llm_json(str(result))
            except Exception:
                result = {"verdict": "ESCALATE", "confidence": 0, "reason": "Failed to parse response"}

        final_verdict = self._effective_verdict(result)
        try:
            confidence_val = int(str(result.get("confidence", 0)))
        except Exception:
            confidence_val = 0
        reason_str = str(result.get("reason", "No reason provided"))
        if confidence_val < 65:
            reason_str = "[Low confidence " + str(confidence_val) + "%] " + reason_str

        claim.status = "ADJUDICATED"
        claim.verdict = final_verdict
        claim.reason = reason_str
        claim.confidence = bigint(confidence_val)
        claim.adjudicated_at = bigint(0)
        self.claims[claim_id] = claim

        amount = warranty.locked_amount
        if final_verdict == "COVERED":
            warranty.status = "CLOSED"
            warranty.locked_amount = bigint(0)
            gl.get_contract_at(Address(str(claim.claimer))).emit_transfer(value=u256(amount))
        elif final_verdict == "REJECTED":
            warranty.status = "CLOSED"
            warranty.locked_amount = bigint(0)
            gl.get_contract_at(Address(str(warranty.creator))).emit_transfer(value=u256(amount))
        elif final_verdict == "PARTIAL":
            warranty.status = "CLOSED"
            warranty.locked_amount = bigint(0)
            half = amount // bigint(2)
            rem = amount - half
            gl.get_contract_at(Address(str(claim.claimer))).emit_transfer(value=u256(half))
            gl.get_contract_at(Address(str(warranty.creator))).emit_transfer(value=u256(rem))
        elif final_verdict == "ESCALATE":
            warranty.status = "ESCALATED"
        self.warranties[warranty.id] = warranty

    @gl.public.write
    def release_escalated_funds(self, claim_id: str) -> None:
        if claim_id not in self.claims:
            raise UserError("Claim not found")
        claim = self.claims[claim_id]
        if claim.status != "ADJUDICATED":
            raise UserError("Claim must be adjudicated first")
        if claim.verdict != "ESCALATE":
            raise UserError("Only ESCALATE claims can be released")
        if claim.warranty_id not in self.warranties:
            raise UserError("Related warranty not found")
        warranty = self.warranties[claim.warranty_id]
        amount = warranty.locked_amount
        if amount <= bigint(0):
            raise UserError("No funds to release")
        sender = str(gl.message.sender_address).lower()
        creator = str(warranty.creator).lower()
        claimer = str(claim.claimer).lower()
        if sender != creator and sender != claimer:
            raise UserError("Only the warranty creator or claimer can release escalated funds")
        half = amount // bigint(2)
        rem = amount - half
        gl.get_contract_at(Address(str(claim.claimer))).emit_transfer(value=u256(half))
        gl.get_contract_at(Address(str(warranty.creator))).emit_transfer(value=u256(rem))
        claim.status = "RELEASED"
        self.claims[claim_id] = claim
        warranty.status = "CLOSED"
        warranty.locked_amount = bigint(0)
        self.warranties[warranty.id] = warranty

    @gl.public.view
    def get_warranty(self, warranty_id: str) -> str:
        import json
        if warranty_id not in self.warranties:
            raise UserError("Warranty not found")
        w = self.warranties[warranty_id]
        return json.dumps({"id": w.id, "creator": str(w.creator), "customer_address": str(w.customer_address), "product_info": w.product_info, "policy_url": w.policy_url, "locked_amount": str(w.locked_amount), "expiry": str(w.expiry), "status": w.status})

    @gl.public.view
    def get_claim(self, claim_id: str) -> str:
        import json
        if claim_id not in self.claims:
            raise UserError("Claim not found")
        c = self.claims[claim_id]
        return json.dumps({"id": c.id, "warranty_id": c.warranty_id, "claimer": str(c.claimer), "evidence_urls": c.evidence_urls, "description": c.description, "status": c.status, "verdict": c.verdict, "reason": c.reason, "confidence": int(str(c.confidence)), "adjudicated_at": str(c.adjudicated_at)})

    @gl.public.view
    def get_all_warranties(self) -> str:
        import json
        result = {}
        for wid, w in self.warranties.items():
            result[wid] = {"id": w.id, "creator": str(w.creator), "customer_address": str(w.customer_address), "product_info": w.product_info, "policy_url": w.policy_url, "locked_amount": str(w.locked_amount), "expiry": str(w.expiry), "status": w.status}
        return json.dumps(result)

    @gl.public.view
    def get_all_claims(self) -> str:
        import json
        result = {}
        for cid, c in self.claims.items():
            result[cid] = {"id": c.id, "warranty_id": c.warranty_id, "claimer": str(c.claimer), "evidence_urls": c.evidence_urls, "description": c.description, "status": c.status, "verdict": c.verdict, "reason": c.reason, "confidence": int(str(c.confidence)), "adjudicated_at": str(c.adjudicated_at)}
        return json.dumps(result)
