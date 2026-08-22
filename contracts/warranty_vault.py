# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
from dataclasses import dataclass

@allow_storage
@dataclass
class Warranty:
    creator: Address
    customer_address: Address
    locked_amount: bigint
    policy_url: str
    product_info: str
    expiry: bigint
    status: str
    claim_description: str
    evidence_urls: str
    verdict: str
    reason: str
    confidence: bigint
    adjudicated_at: bigint

class Contract(gl.Contract):
    warranties: TreeMap[str, Warranty]
    next_warranty_id: bigint

    def __init__(self):
        self.next_warranty_id = bigint(0)

    @gl.public.view
    def get_all_warranties(self) -> str:
        import json
        result = {}
        for wid, w in self.warranties.items():
            result[wid] = {
                "id": str(wid),
                "creator": str(w.creator),
                "customer_address": str(w.customer_address),
                "locked_amount": str(w.locked_amount),
                "policy_url": w.policy_url,
                "product_info": w.product_info,
                "expiry": str(w.expiry),
                "status": w.status,
                "claim_description": w.claim_description,
                "evidence_urls": w.evidence_urls,
                "verdict": w.verdict,
                "reason": w.reason,
                "confidence": int(str(w.confidence)),
                "adjudicated_at": str(w.adjudicated_at)
            }
        return json.dumps(result)

    @gl.public.view
    def get_warranty(self, warranty_id: str) -> str:
        import json
        if warranty_id not in self.warranties:
            raise UserError("Warranty not found")
        w = self.warranties[warranty_id]
        return json.dumps({
            "id": str(warranty_id),
            "creator": str(w.creator),
            "customer_address": str(w.customer_address),
            "locked_amount": str(w.locked_amount),
            "policy_url": w.policy_url,
            "product_info": w.product_info,
            "expiry": str(w.expiry),
            "status": w.status,
            "claim_description": w.claim_description,
            "evidence_urls": w.evidence_urls,
            "verdict": w.verdict,
            "reason": w.reason,
            "confidence": int(str(w.confidence)),
            "adjudicated_at": str(w.adjudicated_at)
        })

    @gl.public.view
    def get_all_claims(self) -> str:
        import json
        result = {}
        for wid, w in self.warranties.items():
            if w.status in ["CLAIMED", "ADJUDICATED", "CLOSED", "ESCALATED", "RELEASED"] and w.claim_description:
                result[wid] = {
                    "id": str(wid),
                    "warranty_id": str(wid),
                    "claimer": str(w.customer_address),
                    "evidence_urls": w.evidence_urls,
                    "description": w.claim_description,
                    "status": "PENDING" if w.status == "CLAIMED" else ("ADJUDICATED" if w.status in ["CLOSED", "ADJUDICATED"] else w.status),
                    "verdict": w.verdict,
                    "reason": w.reason,
                    "confidence": int(str(w.confidence)),
                    "adjudicated_at": str(w.adjudicated_at)
                }
        return json.dumps(result)

    @gl.public.view
    def get_claim(self, claim_id: str) -> str:
        import json
        if claim_id not in self.warranties:
            raise UserError("Claim not found")
        w = self.warranties[claim_id]
        return json.dumps({
            "id": str(claim_id),
            "warranty_id": str(claim_id),
            "claimer": str(w.customer_address),
            "evidence_urls": w.evidence_urls,
            "description": w.claim_description,
            "status": "PENDING" if w.status == "CLAIMED" else ("ADJUDICATED" if w.status in ["CLOSED", "ADJUDICATED"] else w.status),
            "verdict": w.verdict,
            "reason": w.reason,
            "confidence": int(str(w.confidence)),
            "adjudicated_at": str(w.adjudicated_at)
        })

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

        warranty_id = str(self.next_warranty_id)
        self.next_warranty_id += bigint(1)

        self.warranties[warranty_id] = Warranty(
            creator=gl.message.sender_address,
            customer_address=Address(customer_address_str),
            locked_amount=amount,
            policy_url=str(policy_url).strip(),
            product_info=str(product_info).strip(),
            expiry=expiry,
            status="ACTIVE",
            claim_description="",
            evidence_urls="",
            verdict="",
            reason="",
            confidence=bigint(0),
            adjudicated_at=bigint(0)
        )
        return warranty_id

    @gl.public.write
    def file_claim(self, warranty_id: str, description: str, evidence_urls: str) -> str:
        if warranty_id not in self.warranties:
            raise UserError("Warranty not found")
        w = self.warranties[warranty_id]
        if w.status != "ACTIVE":
            raise UserError("Warranty is not active")
        if str(gl.message.sender_address).lower() != str(w.customer_address).lower():
            raise UserError("Unauthorized: Only the registered customer can file a claim")
        if not description or not str(description).strip():
            raise UserError("Claim description is required")

        w.claim_description = str(description).strip()
        w.evidence_urls = str(evidence_urls).strip() if evidence_urls else ""
        w.status = "CLAIMED"
        self.warranties[warranty_id] = w
        return warranty_id

    @gl.public.write
    def adjudicate_claim(self, warranty_id: str) -> None:
        if warranty_id not in self.warranties:
            raise UserError("Warranty not found")
        w = self.warranties[warranty_id]
        if w.status != "CLAIMED":
            raise UserError("Warranty does not have a pending claim")

        policy_url_str = str(w.policy_url)
        product_info_str = str(w.product_info)
        claim_desc_str = str(w.claim_description)
        evidence_urls_str = str(w.evidence_urls)

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

        w.verdict = final_verdict
        w.reason = reason_str
        w.confidence = bigint(confidence_val)
        w.adjudicated_at = bigint(0)

        amount = w.locked_amount
        if final_verdict == "COVERED":
            w.status = "CLOSED"
            w.locked_amount = bigint(0)
            gl.get_contract_at(Address(str(w.customer_address))).emit_transfer(value=u256(amount))
        elif final_verdict == "REJECTED":
            w.status = "CLOSED"
            w.locked_amount = bigint(0)
            gl.get_contract_at(Address(str(w.creator))).emit_transfer(value=u256(amount))
        elif final_verdict == "PARTIAL":
            w.status = "CLOSED"
            w.locked_amount = bigint(0)
            half = amount // bigint(2)
            rem = amount - half
            gl.get_contract_at(Address(str(w.customer_address))).emit_transfer(value=u256(half))
            gl.get_contract_at(Address(str(w.creator))).emit_transfer(value=u256(rem))
        elif final_verdict == "ESCALATE":
            w.status = "ESCALATED"
        self.warranties[warranty_id] = w

    @gl.public.write
    def release_escalated_funds(self, warranty_id: str) -> None:
        if warranty_id not in self.warranties:
            raise UserError("Warranty not found")
        w = self.warranties[warranty_id]
        if w.status != "ESCALATED":
            raise UserError("Warranty is not in ESCALATED state")
        amount = w.locked_amount
        if amount <= bigint(0):
            raise UserError("No funds to release")
        sender = str(gl.message.sender_address).lower()
        creator = str(w.creator).lower()
        claimer = str(w.customer_address).lower()
        if sender != creator and sender != claimer:
            raise UserError("Only the warranty creator or claimer can release escalated funds")

        half = amount // bigint(2)
        rem = amount - half
        gl.get_contract_at(Address(str(w.customer_address))).emit_transfer(value=u256(half))
        gl.get_contract_at(Address(str(w.creator))).emit_transfer(value=u256(rem))
        w.status = "RELEASED"
        w.locked_amount = bigint(0)
        self.warranties[warranty_id] = w

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
