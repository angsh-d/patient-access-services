# UHC Prior Authorization Decision Rubric

This rubric defines UnitedHealthcare (UHC)-specific criteria and decision rules for coverage assessment and approval recommendations. It extends the default rubric with UHC Clinical Coverage Guidelines. AI NEVER recommends denial per the conservative decision model.

## UHC Policy References

| Reference | Description |
|-----------|-------------|
| UHC Clinical Coverage Guideline (CCG) | Medication-specific coverage policies |
| UHC Pharmacy Clinical Guidelines | Formulary management and step therapy protocols |
| UHC Medical Benefit Drug Policy | Site-of-care and J-code coverage requirements |
| UHC Prior Authorization Requirement List | Medications requiring PA by plan tier |
| OptumRx Formulary Guidelines | Pharmacy benefit formulary management (UHC subsidiary) |

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
| All criteria met, high confidence (>80%) | `covered` | Recommend APPROVE |
| Most criteria met, confidence 60-80% | `likely_covered` | Recommend APPROVE with PA |
| PA required by policy | `requires_pa` | Recommend PEND for PA submission |
| Conditional coverage | `conditional` | Recommend PEND with conditions |
| Missing documentation | `pend` | Recommend PEND for documentation |
| Non-preferred agent without biosimilar trial | `pend` | Recommend PEND — UHC requires biosimilar/preferred agent trial first |
| Coverage uncertain | `requires_human_review` | STOP — Human must decide |
| Policy excludes medication | `requires_human_review` | STOP — Human must decide |
| Criteria not met | `requires_human_review` | STOP — Human must decide |

## Approval Likelihood Thresholds

| Likelihood Range | Status | AI Recommendation |
|-----------------|--------|-------------------|
| 80% - 100% | High confidence | APPROVE |
| 60% - 79% | Moderate confidence | APPROVE (with PA) |
| 40% - 59% | Borderline | PEND for documentation |
| 20% - 39% | Low confidence | REQUIRES_HUMAN_REVIEW |
| 0% - 19% | Very low | REQUIRES_HUMAN_REVIEW |

Note: UHC thresholds align with default thresholds but formulary compliance carries extra weight. Cases using non-preferred agents without documented clinical justification should be scored lower.

## Criteria Categories

### 1. Diagnosis Criteria
| Criterion | Weight | Evidence Required |
|-----------|--------|------------------|
| Approved indication per UHC CCG | High | ICD-10 code matching UHC Clinical Coverage Guideline |
| Off-label with compendia support | Medium | NCCN, AHFS, or DrugDex listing required |
| Clinical trial indication | Medium | Must have UHC clinical trial coverage rider |
| Age-appropriate use | Medium | Medication approved for patient's age group per CCG |

### 2. Step Therapy Criteria
| Criterion | Weight | Evidence Required |
|-----------|--------|------------------|
| Preferred formulary agent tried first | **Critical** | UHC requires trial of preferred/Tier 1 agent before non-preferred |
| Biosimilar trial before originator | **Critical** | If biosimilar is on UHC formulary, must trial biosimilar first |
| Adequate trial duration | High | Minimum 60-90 days depending on therapeutic class |
| Documented failure or intolerance | High | Clinical notes, adverse event documentation, or lab-confirmed toxicity |
| Contraindication to preferred agent | High | Documented allergy, drug interaction, or clinical contraindication |
| Quantity limit exception justified | Medium | Clinical rationale for exceeding UHC quantity limits |

**UHC Formulary Compliance Protocol:**
- **Biosimilar-first mandate**: UHC strongly prefers biosimilars over originator biologics. When an FDA-approved biosimilar is on the OptumRx formulary, it MUST be tried before the reference product unless contraindicated.
- For rheumatoid arthritis: Preferred pathway is conventional DMARD (methotrexate 60-90 days) then biosimilar biologic before originator
- For Crohn's disease/UC: Conventional therapy required (corticosteroids, immunomodulators), then preferred biologic per formulary tier
- For psoriasis/PsA: Topical therapy, then phototherapy or conventional systemics, then preferred biologic
- **Non-preferred to preferred switch**: UHC may require patients on non-preferred agents to switch to preferred biosimilar at renewal unless clinical justification provided

### 3. Clinical Criteria
| Criterion | Weight | Evidence Required |
|-----------|--------|------------------|
| Disease severity documented | High | Validated disease activity score (DAS28, CDAI, PASI, etc.) |
| Prior treatment history complete | High | Medication history with dates, doses, durations, and outcomes |
| Lab values current (within 6 months) | Medium | CBC, CMP, disease-specific labs; UHC accepts 6-month lab currency |
| Specialist consultation documented | Low-Medium | Referral notes; UHC permits PCP prescribing with specialist consultation |
| Functional status assessment | Medium | HAQ-DI, BASDAI, or equivalent validated instrument |
| TB and hepatitis screening | High | Required before biologic initiation per UHC CCG |

### 4. Documentation Criteria
| Criterion | Weight | Evidence Required |
|-----------|--------|------------------|
| Valid prescription | Required | Current prescription with valid NPI |
| Provider credentials | Required | Valid NPI, appropriate specialty or specialist consultation |
| Patient eligibility | Required | Active UHC coverage, correct benefit (medical vs. pharmacy) |
| Clinical rationale for non-preferred agent | **Critical** | Required if requesting non-preferred or non-formulary medication |
| Prior authorization form complete | High | UHC-specific PA form (varies by medication) |

## Gap Priority Rules

| Gap Type | Priority | Impact on Decision |
|----------|----------|-------------------|
| Missing biosimilar/preferred agent trial documentation | **Critical** | PEND — UHC will not approve originator without biosimilar trial |
| Missing formulary exception justification | **Critical** | PEND — Required for non-preferred agents |
| Missing required documentation | High | PEND |
| Missing clinical rationale | High | PEND |
| Missing prior treatment records | High | PEND — UHC requires verifiable treatment history |
| Lab results outdated (>6 months) | Medium | PEND for current labs — UHC accepts 6-month currency |
| Specialist note missing | Low-Medium | May approve with PCP prescribing if specialist consultation documented |
| Missing TB/hepatitis screening | High | PEND — Required per UHC CCG for biologics |

## UHC-Specific Appeal Timelines

| Appeal Type | Timeline | Notes |
|-------------|----------|-------|
| Standard appeal (pre-service) | 30 calendar days | Written request to UHC Appeals and Grievances |
| Standard appeal (post-service) | 60 calendar days | For retrospective claim denials |
| Expedited/urgent appeal | 72 hours | For urgent clinical situations; physician certification required |
| External review (IRO) | 45 calendar days | After exhausting internal appeal (one level for pre-service, two for post-service) |
| Formulary exception appeal | 30 calendar days | Specific to non-formulary/non-preferred medication requests |

**Key UHC Appeal Requirements:**
- Appeals must reference the specific UHC Clinical Coverage Guideline cited in the denial letter
- Peer-to-peer review with UHC medical director available upon request
- New clinical evidence may be submitted with the appeal
- UHC provides written determination with specific CCG criteria not met
- For formulary exceptions: prescriber must provide clinical rationale why preferred agent is not appropriate
- OptumRx manages pharmacy benefit appeals separately from medical benefit appeals

## Payer-Specific Overrides

These UHC-specific rules override default rubric behavior:

1. **Biosimilar preference is Critical weight**: UHC's biosimilar-first policy is the strongest among major payers. Failure to document biosimilar trial or contraindication is a primary denial reason.
2. **Formulary compliance is Critical weight**: Requesting a non-preferred agent without clinical justification for why the preferred agent is inappropriate results in automatic PEND.
3. **6-month lab currency accepted**: UHC is more lenient on lab recency than Cigna (6 months vs. 90 days), reducing documentation burden.
4. **PCP prescribing permitted**: UHC permits PCP prescribing of biologics if specialist consultation is documented, unlike Cigna which requires specialist prescriber.
5. **Post-service appeal window is 60 days**: Longer than standard 30-day window for retroactive claims.
6. **Quantity limit enforcement**: UHC enforces strict quantity limits per CCG; exceptions require separate clinical justification.

## Conservative Decision Rules

### Rule 1: Never Auto-Deny
AI must NEVER output a denial recommendation. If coverage appears unlikely:
1. Map to `requires_human_review`
2. Document all concerns clearly with UHC CCG references
3. Present evidence to human reviewer
4. Human makes final denial decision

### Rule 2: Document All Reasoning
Every assessment must include:
- Criteria evaluated with pass/fail status
- Evidence supporting each criterion
- Gaps identified with suggested resolution and UHC-specific requirements
- Confidence score with explanation
- Explicit statement if human review required
- Formulary tier status of requested medication

### Rule 3: Err on Side of Documentation
When uncertain about UHC criteria:
- Request additional documentation (PEND)
- Do not conclude non-coverage
- Allow human to make coverage determination
- Note which UHC CCG section applies

### Rule 4: Human Gate Enforcement
Cases with these conditions MUST pause for human review:
- Coverage status is `requires_human_review`
- Approval likelihood < 40%
- Biosimilar/preferred agent trial not documented
- Non-preferred agent requested without clinical justification
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
  "uhc_ccg_references": ["CCG-reference-1"],
  "formulary_tier_status": "preferred|non-preferred|non-formulary|biosimilar_available"
}
```

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024-01 | Initial UHC-specific rubric based on Clinical Coverage Guidelines |
| 1.1 | 2025-06 | Added biosimilar-first mandate and OptumRx formulary alignment |
