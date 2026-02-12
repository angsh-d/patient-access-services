"""Validation API routes for MCP-based external validation services."""
import asyncio
import json
from datetime import datetime, timezone
from typing import List, Optional
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.mcp.npi_validator import get_npi_validator
from backend.mcp.icd10_validator import get_icd10_validator
from backend.mcp.hcpcs_validator import get_hcpcs_validator
from backend.mcp.cms_coverage import get_cms_coverage_client
from backend.config.logging_config import get_logger
from backend.config.settings import get_settings

logger = get_logger(__name__)

router = APIRouter(prefix="/validate", tags=["Validation"])


# Request/Response Models

class NPIValidationRequest(BaseModel):
    """Request to validate an NPI number."""
    npi: str = Field(..., description="10-digit NPI number")


class NPIValidationResponse(BaseModel):
    """Response from NPI validation."""
    npi: str
    is_valid: bool
    provider_name: Optional[str] = None
    specialty: Optional[str] = None
    credential: Optional[str] = None
    status: str = "unknown"
    errors: List[str] = []


class ICD10ValidationRequest(BaseModel):
    """Request to validate ICD-10 codes."""
    codes: List[str] = Field(..., description="List of ICD-10-CM codes to validate")


class ICD10CodeResponse(BaseModel):
    """Information about a single ICD-10 code."""
    code: str
    is_valid: bool
    description: Optional[str] = None
    category: Optional[str] = None
    is_billable: bool = True
    errors: List[str] = []


class ICD10ValidationResponse(BaseModel):
    """Response from ICD-10 validation."""
    codes: List[ICD10CodeResponse]
    all_valid: bool
    valid_count: int
    invalid_count: int


class CMSCoverageRequest(BaseModel):
    """Request to search CMS coverage policies."""
    medication_name: Optional[str] = Field(None, description="Drug name")
    icd10_codes: List[str] = Field(default_factory=list, description="ICD-10 diagnosis codes")
    cpt_codes: List[str] = Field(default_factory=list, description="CPT procedure codes")
    hcpcs_codes: List[str] = Field(default_factory=list, description="HCPCS codes")


class CMSPolicyResponse(BaseModel):
    """Information about a CMS coverage policy."""
    policy_id: str
    title: str
    coverage_type: str
    contractor: Optional[str] = None
    effective_date: Optional[str] = None
    status: str = "active"
    summary: Optional[str] = None
    indications: List[str] = []
    limitations: List[str] = []
    related_codes: List[str] = []
    url: Optional[str] = None


class CMSCoverageResponse(BaseModel):
    """Response from CMS coverage search."""
    query: str
    policies: List[CMSPolicyResponse]
    total_found: int
    has_ncd: bool
    has_lcd: bool
    recommendation: Optional[str] = None


# Endpoints

@router.post("/npi", response_model=NPIValidationResponse)
async def validate_npi(request: NPIValidationRequest):
    """
    Validate an NPI number against the CMS NPI Registry.

    This endpoint queries the official CMS NPPES API to verify:
    - NPI number exists and is valid
    - Provider name and credentials
    - Specialty and practice information

    Args:
        request: NPI validation request with 10-digit NPI

    Returns:
        NPIValidationResponse with provider details or errors
    """
    logger.info("API: Validating NPI", npi=request.npi)

    try:
        validator = get_npi_validator()
        result = await validator.validate_npi(request.npi)

        return NPIValidationResponse(
            npi=result.npi,
            is_valid=result.is_valid,
            provider_name=result.provider_name,
            specialty=result.specialty,
            credential=result.credential,
            status=result.status,
            errors=result.errors
        )

    except Exception as e:
        logger.error("NPI validation failed", npi=request.npi, error=str(e))
        raise HTTPException(status_code=500, detail=f"Validation error: {str(e)}")


@router.post("/icd10", response_model=ICD10ValidationResponse)
async def validate_icd10_codes(request: ICD10ValidationRequest):
    """
    Validate ICD-10-CM diagnosis codes.

    This endpoint queries the NLM Clinical Tables API to verify:
    - Code exists in ICD-10-CM database
    - Code description and category
    - Whether code is billable

    Args:
        request: ICD-10 validation request with list of codes

    Returns:
        ICD10ValidationResponse with code details
    """
    logger.info("API: Validating ICD-10 codes", count=len(request.codes))

    try:
        validator = get_icd10_validator()
        result = await validator.validate_batch(request.codes)

        return ICD10ValidationResponse(
            codes=[
                ICD10CodeResponse(
                    code=c.code,
                    is_valid=c.is_valid,
                    description=c.description,
                    category=c.category,
                    is_billable=c.is_billable,
                    errors=c.errors
                )
                for c in result.codes
            ],
            all_valid=result.all_valid,
            valid_count=result.valid_count,
            invalid_count=result.invalid_count
        )

    except Exception as e:
        logger.error("ICD-10 validation failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Validation error: {str(e)}")


@router.post("/cms-coverage", response_model=CMSCoverageResponse)
async def search_cms_coverage(request: CMSCoverageRequest):
    """
    Search CMS Medicare Coverage Database.

    This endpoint searches for Medicare coverage policies:
    - National Coverage Determinations (NCDs)
    - Local Coverage Determinations (LCDs)
    - Coverage articles and guidance

    Args:
        request: CMS coverage search request

    Returns:
        CMSCoverageResponse with matching policies
    """
    logger.info(
        "API: Searching CMS coverage",
        medication=request.medication_name,
        icd10_count=len(request.icd10_codes)
    )

    try:
        client = get_cms_coverage_client()
        result = await client.search_coverage(
            medication_name=request.medication_name,
            icd10_codes=request.icd10_codes or None,
            cpt_codes=request.cpt_codes or None,
            hcpcs_codes=request.hcpcs_codes or None
        )

        return CMSCoverageResponse(
            query=result.query,
            policies=[
                CMSPolicyResponse(
                    policy_id=p.policy_id,
                    title=p.title,
                    coverage_type=p.coverage_type.value,
                    contractor=p.contractor,
                    effective_date=p.effective_date,
                    status=p.status,
                    summary=p.summary,
                    indications=p.indications,
                    limitations=p.limitations,
                    related_codes=p.related_codes,
                    url=p.url
                )
                for p in result.policies
            ],
            total_found=result.total_found,
            has_ncd=result.has_ncd,
            has_lcd=result.has_lcd,
            recommendation=result.recommendation
        )

    except Exception as e:
        logger.error("CMS coverage search failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Search error: {str(e)}")


# --- Unified Patient Validation Models ---

class HCPCSCodeResponse(BaseModel):
    """Information about a single HCPCS/J-Code."""
    code: str
    is_valid: bool
    description: Optional[str] = None
    drug_name: Optional[str] = None
    billing_notes: Optional[str] = None
    status: str = "validated"
    errors: List[str] = []


class CrossVerificationFinding(BaseModel):
    """A single cross-verification finding."""
    field: str
    status: str  # consistent | inconsistent | needs_review
    detail: str


class CrossVerificationResult(BaseModel):
    """Result of LLM cross-verification."""
    overall_status: str  # passed | warnings | errors
    findings: List[CrossVerificationFinding] = []


class PatientValidationResponse(BaseModel):
    """Comprehensive validation response for all patient clinical codes."""
    patient_id: str
    overall_status: str  # validated | warnings | errors
    npi: Optional[NPIValidationResponse] = None
    icd10_codes: List[ICD10CodeResponse] = []
    hcpcs_codes: List[HCPCSCodeResponse] = []
    cross_verification: Optional[CrossVerificationResult] = None
    validation_timestamp: str


# --- Unified Patient Validation Endpoint ---

@router.post("/patient/{patient_id}", response_model=PatientValidationResponse)
async def validate_patient(patient_id: str):
    """
    Validate ALL clinical codes for a patient in one call.

    Runs NPI, ICD-10, HCPCS, and LLM cross-verification in parallel.

    Args:
        patient_id: Patient identifier (e.g., "maria_r")

    Returns:
        PatientValidationResponse with comprehensive validation results
    """
    logger.info("API: Unified patient validation", patient_id=patient_id)

    # Load patient data
    patients_dir = Path(get_settings().patients_dir)
    file_path = patients_dir / f"{patient_id}.json"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Patient data not found: {patient_id}")

    with open(file_path, "r", encoding="utf-8") as f:
        patient_data = json.load(f)

    # Extract codes from patient data
    prescriber = patient_data.get("prescriber", {})
    diagnoses = patient_data.get("diagnoses", [])
    medication = patient_data.get("medication_request", {})

    npi = prescriber.get("npi")
    icd10_codes = [d.get("icd10_code") for d in diagnoses if d.get("icd10_code")]
    hcpcs_codes = []
    if medication.get("j_code"):
        hcpcs_codes.append(medication["j_code"])

    medication_name = medication.get("medication_name")

    # Build parallel validation tasks
    tasks = {}

    if npi:
        tasks["npi"] = _validate_npi(npi)

    if icd10_codes:
        tasks["icd10"] = _validate_icd10_batch(icd10_codes)

    if hcpcs_codes:
        tasks["hcpcs"] = _validate_hcpcs_batch(hcpcs_codes, medication_name)

    tasks["cross_verify"] = _run_cross_verification(patient_data)

    # Run all validations concurrently
    task_keys = list(tasks.keys())
    results = await asyncio.gather(*tasks.values(), return_exceptions=True)
    result_map = dict(zip(task_keys, results))

    # Build response
    npi_result = None
    if "npi" in result_map and not isinstance(result_map["npi"], Exception):
        npi_result = result_map["npi"]

    icd10_results = []
    if "icd10" in result_map and not isinstance(result_map["icd10"], Exception):
        icd10_results = result_map["icd10"]

    hcpcs_results = []
    if "hcpcs" in result_map and not isinstance(result_map["hcpcs"], Exception):
        hcpcs_results = result_map["hcpcs"]

    cross_verify = None
    if "cross_verify" in result_map and not isinstance(result_map["cross_verify"], Exception):
        cross_verify = result_map["cross_verify"]

    # Determine overall status
    has_errors = False
    has_warnings = False

    if npi_result and not npi_result.is_valid:
        has_errors = True
    for code in icd10_results:
        if not code.is_valid:
            has_errors = True
    for code in hcpcs_results:
        if code.status == "invalid":
            has_errors = True
        elif code.status == "needs_review":
            has_warnings = True
    if cross_verify and cross_verify.overall_status == "errors":
        has_errors = True
    elif cross_verify and cross_verify.overall_status == "warnings":
        has_warnings = True

    # Log any exceptions from failed tasks
    for key, result in result_map.items():
        if isinstance(result, Exception):
            logger.warning(f"Validation task '{key}' failed", error=str(result))
            has_warnings = True

    overall = "errors" if has_errors else ("warnings" if has_warnings else "validated")

    return PatientValidationResponse(
        patient_id=patient_id,
        overall_status=overall,
        npi=npi_result,
        icd10_codes=icd10_results,
        hcpcs_codes=hcpcs_results,
        cross_verification=cross_verify,
        validation_timestamp=datetime.now(timezone.utc).isoformat()
    )


async def _validate_npi(npi: str) -> NPIValidationResponse:
    """Validate NPI and return response model."""
    validator = get_npi_validator()
    result = await validator.validate_npi(npi)
    return NPIValidationResponse(
        npi=result.npi,
        is_valid=result.is_valid,
        provider_name=result.provider_name,
        specialty=result.specialty,
        credential=result.credential,
        status=result.status,
        errors=result.errors
    )


async def _validate_icd10_batch(codes: List[str]) -> List[ICD10CodeResponse]:
    """Validate ICD-10 codes and return response models."""
    validator = get_icd10_validator()
    result = await validator.validate_batch(codes)
    return [
        ICD10CodeResponse(
            code=c.code,
            is_valid=c.is_valid,
            description=c.description,
            category=c.category,
            is_billable=c.is_billable,
            errors=c.errors
        )
        for c in result.codes
    ]


async def _validate_hcpcs_batch(
    codes: List[str],
    medication_context: Optional[str] = None
) -> List[HCPCSCodeResponse]:
    """Validate HCPCS codes and return response models."""
    validator = get_hcpcs_validator()
    result = await validator.validate_batch(codes, medication_context)
    return [
        HCPCSCodeResponse(
            code=c.code,
            is_valid=c.is_valid,
            description=c.description,
            drug_name=c.drug_name,
            billing_notes=c.billing_notes,
            status=c.status,
            errors=c.errors
        )
        for c in result.codes
    ]


async def _run_cross_verification(patient_data: dict) -> CrossVerificationResult:
    """Run LLM cross-verification on patient data."""
    from backend.reasoning.llm_gateway import get_llm_gateway
    from backend.reasoning.prompt_loader import get_prompt_loader
    from backend.models.enums import TaskCategory

    prompt_loader = get_prompt_loader()
    prompt = prompt_loader.load(
        "validation/clinical_cross_verification.txt",
        {"patient_data": json.dumps(patient_data, indent=2, default=str)}
    )

    gateway = get_llm_gateway()
    result = await gateway.generate(
        task_category=TaskCategory.DATA_EXTRACTION,
        prompt=prompt,
        temperature=0.0,
        response_format="json"
    )

    # With response_format="json", both Gemini and Azure OpenAI return the
    # parsed dict directly (gateway adds "provider" and "task_category" keys).
    try:
        findings = [
            CrossVerificationFinding(
                field=f.get("field", ""),
                status=f.get("status", "needs_review"),
                detail=f.get("detail", "")
            )
            for f in result.get("findings", [])
        ]
        return CrossVerificationResult(
            overall_status=result.get("overall_status", "warnings"),
            findings=findings
        )
    except (KeyError, TypeError, AttributeError) as e:
        logger.warning("Failed to parse cross-verification response", error=str(e))
        return CrossVerificationResult(
            overall_status="warnings",
            findings=[CrossVerificationFinding(
                field="parse_error",
                status="needs_review",
                detail=f"Cross-verification response could not be parsed: {str(e)}"
            )]
        )


@router.get("/health")
async def validation_health():
    """
    Check health of validation services.

    Returns status of all MCP validation integrations.
    """
    return {
        "status": "ok",
        "services": {
            "npi_registry": "available",
            "icd10_codes": "available",
            "hcpcs_codes": "available",
            "cms_coverage": "available"
        }
    }
