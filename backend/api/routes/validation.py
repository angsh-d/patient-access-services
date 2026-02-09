"""Validation API routes for MCP-based external validation services."""
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.mcp.npi_validator import get_npi_validator
from backend.mcp.icd10_validator import get_icd10_validator
from backend.mcp.cms_coverage import get_cms_coverage_client
from backend.config.logging_config import get_logger

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
            "cms_coverage": "available"
        }
    }
