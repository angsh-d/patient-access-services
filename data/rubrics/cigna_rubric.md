# Cigna Prior Authorization Decision Rubric

This rubric defines Cigna-specific criteria and decision rules for coverage assessment and approval recommendations. It extends the default rubric with Cigna Medical Coverage Policy (MCP) requirements. AI NEVER recommends denial per the conservative decision model.

## Cigna Policy References

| Reference | Description |
|-----------|-------------|
| Cigna MCP-200 | Biologic and Biosimilar Medications — Specialty Pharmacy |
| Cigna MCP-201 | Step Therapy Protocol — Autoimmune Conditions |
| Cigna MCP-210 | Prior Authorization — Specialty Injectable Drugs |
| Cigna MCP-220 | Continuation of Therapy Requirements |
| Cigna Clinical Guidelines | Internal medical necessity criteria per therapeutic area |

## Decision Authority Matrix

| Decision Type | AI Authority | Human Required | Notes |
|--------------|--------------|----------------|-------|
| APPROVE | Yes (recommend) | Optional confirmation | AI can recommend approval when all criteria met |
| PEND | Yes (recommend) | Optional confirmation | AI can recommend pending for documentation |
| DENY | **NO** | **ALWAYS REQUIRED** | AI must NEVER recommend denial |
| OVERRIDE | No | Always | Humans can override any AI recommendation |

## Coverage Status Mappings

| AI Assessment | Maps To | Action |
|--------------|---------|--------|
| All criteria met, high confidence (>85%) | `covered` | Recommend APPROVE |
| Most criteria met, confidence 65-85% | `likely_covered` | Recommend APPROVE with PA |
| PA required by policy | `requires_pa` | Recommend PEND for PA submission |
| Conditional coverage | `conditional` | Recommend PEND with conditions |
| Missing documentation | `pend` | Recommend PEND for documentation |
| Step therapy incomplete | `pend` | Recommend PEND — Cigna requires full step therapy documentation |
| Coverage uncertain | `requires_human_review` | STOP — Human must decide |
| Policy excludes medication | `requires_human_review` | STOP — Human must decide |
| Criteria not met | `requires_human_review` | STOP — Human must decide |

## Approval Likelihood Thresholds

| Likelihood Range | Status | AI Recommendation |
|-----------------|--------|-------------------|
| 85% - 100% | High confidence | APPROVE |
| 65% - 84% | Moderate confidence | APPROVE (with PA) |
| 45% - 64% | Borderline | PEND for documentation |
| 25% - 44% | Low confidence | REQUIRES_HUMAN_REVIEW |
| 0% - 24% | Very low | REQUIRES_HUMAN_REVIEW |

Note: Cigna thresholds are 5% higher than default because Cigna requires stricter documentation compliance. Cases that would borderline-pass with other payers should be sent for additional documentation with Cigna.

## Criteria Categories

### 1. Diagnosis Criteria
| Criterion | Weight | Evidence Required |
|-----------|--------|------------------|
| Approved indication per Cigna MCP | High | ICD-10 code matching Cigna formulary indication list |
| Off-label with compendia support | Medium | NCCN, AHFS, or Micromedex listing |
| Clinical trial indication | Low | Cigna rarely covers clinical trial medications outside protocol |
| Specialist-confirmed diagnosis | High | Rheumatologist, gastroenterologist, or relevant specialist attestation |

### 2. Step Therapy Criteria
| Criterion | Weight | Evidence Required |
|-----------|--------|------------------|
| Conventional DMARD trial completed | **Critical** | Must document trial of methotrexate OR leflunomide for autoimmune indications |
| Adequate trial duration — conventional | **Critical** | Minimum 90 days on methotrexate (up to 25mg/week) or 90 days on leflunomide |
| Documented failure or intolerance | **Critical** | Clinical notes showing inadequate response, adverse reaction, or lab-confirmed toxicity |
| Contraindication documented | High | Allergy records, hepatic insufficiency, or other documented contraindication to conventional DMARDs |
| Second conventional DMARD attempted | High | Cigna may require trial of TWO conventional DMARDs before biologic approval |
| Biosimilar trial before originator | High | If biosimilar is available, Cigna requires trial of biosimilar first unless contraindicated |

**Cigna Step Therapy Protocol (MCP-201):**
- For rheumatoid arthritis: Must try methotrexate (minimum 90 days, dose up to 25mg/week) before ANY biologic
- For Crohn's disease/UC: Must try conventional therapy (5-ASAs, corticosteroids, immunomodulators) before biologics
- For psoriatic arthritis: Must try at least one conventional DMARD (methotrexate preferred) before biologics
- For ankylosing spondylitis: NSAID trial required; DMARD trial may be waived per specialist recommendation
- Biosimilar-first: When a biosimilar exists for the requested biologic, Cigna requires trial of the biosimilar unless clinical contraindication documented

### 3. Clinical Criteria
| Criterion | Weight | Evidence Required |
|-----------|--------|------------------|
| Disease severity documented | High | DAS28, CDAI, PASI, or equivalent validated scoring tool |
| Prior treatment history complete | **Critical** | Full medication history with dates, doses, durations, and outcomes |
| Lab values current (within 90 days) | High | CBC, CMP, CRP/ESR, hepatitis panel, TB screening |
| Specialist consultation documented | Medium | Referral notes from treating specialist |
| Functional impairment documented | Medium | HAQ-DI, BASDAI, or functional assessment |

### 4. Documentation Criteria
| Criterion | Weight | Evidence Required |
|-----------|--------|------------------|
| Valid prescription | Required | Current prescription with NPI-verified prescriber |
| Provider credentials — specialist | Required | Must be prescribed by appropriate specialist (not PCP for biologics) |
| Patient eligibility confirmed | Required | Active Cigna coverage, specialty pharmacy benefit verification |
| Letter of Medical Necessity | High | Required for all biologics and specialty medications |
| Clinical rationale documented | High | Prescriber attestation of medical necessity |

## Gap Priority Rules

| Gap Type | Priority | Impact on Decision |
|----------|----------|-------------------|
| Missing step therapy documentation | **Critical** | PEND — Cigna will not process without step therapy evidence |
| Missing required documentation | High | PEND |
| Missing Letter of Medical Necessity | High | PEND — Required for all Cigna specialty PA requests |
| Missing clinical rationale | High | PEND |
| Lab results outdated (>90 days) | High | PEND for current labs — Cigna enforces 90-day lab currency |
| Missing prior treatment dates/durations | High | PEND — Step therapy duration must be verifiable |
| Specialist note missing | Medium | PEND (biologics require specialist prescriber) |
| Functional assessment missing | Medium | May approve without, but strengthens case significantly |

## Cigna-Specific Appeal Timelines

| Appeal Type | Timeline | Notes |
|-------------|----------|-------|
| Standard appeal | 30 calendar days from denial | Written request to Cigna Appeals Department |
| Expedited/urgent appeal | 72 hours | For urgent clinical situations; requires physician attestation of urgency |
| External review | 45 calendar days | Independent Review Organization (IRO) after internal appeal exhausted |
| Continuation of therapy appeal | 30 calendar days | For denials of ongoing treatment |

**Key Cigna Appeal Requirements:**
- All appeals must reference the specific Cigna MCP number cited in the denial
- Peer-to-peer review with Cigna medical director available within 5 business days of request
- New clinical evidence not in original submission may be included with appeal
- Cigna assigns a dedicated case manager for specialty medication appeals

## Payer-Specific Overrides

These Cigna-specific rules override default rubric behavior:

1. **Step therapy weight is Critical (not High)**: Cigna's step therapy requirements are strictly enforced. Missing step therapy documentation is grounds for automatic PEND, not borderline approval.
2. **90-day lab currency**: Labs older than 90 days are considered outdated by Cigna (default is 180 days for some payers).
3. **Specialist prescriber required**: Cigna requires biologics to be prescribed by an appropriate specialist — PCP prescriptions for biologics are flagged.
4. **Biosimilar-first preference**: When a biosimilar is available, Cigna expects trial of the biosimilar before the originator biologic.
5. **Letter of Medical Necessity**: Required for all specialty PA requests (not optional).

## Conservative Decision Rules

### Rule 1: Never Auto-Deny
AI must NEVER output a denial recommendation. If coverage appears unlikely:
1. Map to `requires_human_review`
2. Document all concerns clearly with Cigna MCP references
3. Present evidence to human reviewer
4. Human makes final denial decision

### Rule 2: Document All Reasoning
Every assessment must include:
- Criteria evaluated with pass/fail status
- Evidence supporting each criterion
- Gaps identified with suggested resolution and Cigna-specific timeline impact
- Confidence score with explanation
- Explicit statement if human review required

### Rule 3: Err on Side of Documentation
When uncertain about Cigna criteria:
- Request additional documentation (PEND)
- Do not conclude non-coverage
- Allow human to make coverage determination
- Note which Cigna MCP section applies

### Rule 4: Human Gate Enforcement
Cases with these conditions MUST pause for human review:
- Coverage status is `requires_human_review`
- Approval likelihood < 45% (Cigna threshold)
- Step therapy documentation is incomplete or absent
- Any criterion flagged as potential denial
- Override of previous AI recommendation
- Escalation requested

## Confidence Calibration

| Confidence Level | Interpretation | Expected Accuracy |
|-----------------|----------------|-------------------|
| 90-100% | Very high | 95%+ correct predictions |
| 70-89% | High | 85-95% correct predictions |
| 50-69% | Moderate | 70-85% correct predictions |
| 30-49% | Low | 50-70% correct predictions |
| 0-29% | Very low | Human review required |

## Output Format Requirements

Assessment output must include:
```json
{
  "coverage_status": "covered|likely_covered|requires_pa|conditional|pend|requires_human_review",
  "approval_likelihood": 0.0-1.0,
  "criteria_assessments": [...],
  "documentation_gaps": [...],
  "recommendations": [...],
  "requires_human_review": true|false,
  "human_review_reason": "explanation if human review required",
  "cigna_mcp_references": ["MCP-200", "MCP-201"]
}
```

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024-01 | Initial Cigna-specific rubric based on MCP-200/201 guidelines |
| 1.1 | 2025-06 | Added biosimilar-first preference and updated appeal timelines |
