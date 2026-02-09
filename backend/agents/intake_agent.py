"""Intake agent for validating and preparing case data."""
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import json
from pathlib import Path
from dataclasses import dataclass, field

from backend.models.case_state import CaseState, PatientInfo, MedicationRequest, PayerState
from backend.models.enums import CaseStage, PayerStatus
from backend.config.logging_config import get_logger
from backend.config.settings import get_settings

logger = get_logger(__name__)


@dataclass
class ValidationResult:
    """Result of external validation checks."""
    npi_valid: bool = False
    npi_details: Optional[Dict[str, Any]] = None
    icd10_valid: bool = False
    icd10_details: List[Dict[str, Any]] = field(default_factory=list)
    cms_coverage_found: bool = False
    cms_policies: List[Dict[str, Any]] = field(default_factory=list)
    validation_errors: List[str] = field(default_factory=list)
    validation_warnings: List[str] = field(default_factory=list)


class IntakeAgent:
    """
    Agent responsible for intake validation and case initialization.
    Validates patient data, medication requests, and prepares case for processing.

    Integrates with MCP servers for external validation:
    - NPI Registry - Provider credential validation
    - ICD-10 Codes - Diagnosis code validation
    - CMS Coverage - Medicare policy lookup
    """

    def __init__(self, patients_dir: Optional[Path] = None, enable_mcp_validation: bool = True):
        """
        Initialize the intake agent.

        Args:
            patients_dir: Directory containing patient data files
            enable_mcp_validation: Enable external MCP validation (default True)
        """
        self.patients_dir = patients_dir or Path(get_settings().patients_dir)
        self.enable_mcp_validation = enable_mcp_validation
        logger.info("Intake agent initialized", mcp_validation=enable_mcp_validation)

    async def process_intake(
        self,
        patient_id: str,
        case_id: Optional[str] = None
    ) -> CaseState:
        """
        Process intake for a patient.

        Args:
            patient_id: Patient identifier
            case_id: Optional case ID (generated if not provided)

        Returns:
            Initialized CaseState

        Raises:
            ValueError: If patient data is invalid
        """
        logger.info("Processing intake", patient_id=patient_id)

        # Load patient data
        patient_data = await self.load_patient_data(patient_id)

        # Validate data
        validation_result = self.validate_patient_data(patient_data)
        if not validation_result["valid"]:
            raise ValueError(f"Invalid patient data: {validation_result['errors']}")

        # Create PatientInfo
        patient_info = self._build_patient_info(patient_data)

        # Create MedicationRequest
        medication_request = self._build_medication_request(patient_data)

        # Initialize payer states
        payer_states = self._initialize_payer_states(patient_data)

        # Create case state
        case_state = CaseState(
            case_id=case_id or self._generate_case_id(patient_id),
            stage=CaseStage.INTAKE,
            patient=patient_info,
            medication=medication_request,
            payer_states=payer_states,
            metadata={
                "intake_timestamp": datetime.now(timezone.utc).isoformat(),
                "source_patient_id": patient_id,
                "validation_result": validation_result
            }
        )

        # Run MCP validations if enabled
        if self.enable_mcp_validation:
            validation_result = await self.run_mcp_validations(patient_data)
            case_state.metadata["mcp_validation"] = {
                "npi_valid": validation_result.npi_valid,
                "npi_details": validation_result.npi_details,
                "icd10_valid": validation_result.icd10_valid,
                "icd10_details": validation_result.icd10_details,
                "cms_coverage_found": validation_result.cms_coverage_found,
                "cms_policies": validation_result.cms_policies,
                "validation_errors": validation_result.validation_errors,
                "validation_warnings": validation_result.validation_warnings
            }

        logger.info(
            "Intake complete",
            case_id=case_state.case_id,
            patient_name=f"{patient_info.first_name} {patient_info.last_name}",
            payers=list(payer_states.keys())
        )

        return case_state

    async def run_mcp_validations(self, patient_data: Dict[str, Any]) -> ValidationResult:
        """
        Run external MCP validations for patient data.

        Validates:
        - Provider NPI against CMS NPI Registry
        - ICD-10 diagnosis codes against clinical coding database
        - CMS coverage policies for medication/indication

        Args:
            patient_data: Patient data dictionary

        Returns:
            ValidationResult with all validation outcomes
        """
        from backend.mcp.npi_validator import get_npi_validator
        from backend.mcp.icd10_validator import get_icd10_validator
        from backend.mcp.cms_coverage import get_cms_coverage_client

        result = ValidationResult()

        # Get relevant data from patient record - support both data structures
        prescriber = patient_data.get("prescriber", {})
        diagnoses = patient_data.get("diagnoses") or patient_data.get("clinical_profile", {}).get("diagnoses", [])
        medication = patient_data.get("medication_request", {})

        npi = prescriber.get("npi")
        diagnosis_codes = [d.get("icd10_code") for d in diagnoses if d.get("icd10_code")]
        medication_name = medication.get("medication_name")

        # Get indication from medication_request or derive from primary diagnosis
        indication = medication.get("diagnosis") or medication.get("indication")
        if not indication and diagnoses:
            primary_diag = next((d for d in diagnoses if d.get("rank") == "primary"), diagnoses[0] if diagnoses else {})
            indication = primary_diag.get("description")

        # Get primary ICD-10 from medication_request or diagnoses
        primary_icd10 = medication.get("icd10_code")
        if not primary_icd10 and diagnoses:
            primary_diag = next((d for d in diagnoses if d.get("rank") == "primary"), diagnoses[0] if diagnoses else {})
            primary_icd10 = primary_diag.get("icd10_code")

        # Validate NPI
        if npi:
            try:
                npi_validator = get_npi_validator()
                npi_result = await npi_validator.validate_npi(npi)
                result.npi_valid = npi_result.is_valid
                result.npi_details = {
                    "npi": npi_result.npi,
                    "provider_name": npi_result.provider_name,
                    "specialty": npi_result.specialty,
                    "status": npi_result.status
                }
                if not npi_result.is_valid:
                    result.validation_errors.extend(npi_result.errors)
                logger.info("NPI validation complete", npi=npi, valid=npi_result.is_valid)
            except Exception as e:
                logger.warning("NPI validation failed", npi=npi, error=str(e))
                result.validation_warnings.append(f"NPI validation unavailable: {str(e)}")

        # Validate ICD-10 codes
        if diagnosis_codes:
            try:
                icd10_validator = get_icd10_validator()
                icd10_result = await icd10_validator.validate_batch(diagnosis_codes)
                result.icd10_valid = icd10_result.all_valid
                result.icd10_details = [
                    {
                        "code": c.code,
                        "valid": c.is_valid,
                        "description": c.description,
                        "category": c.category
                    }
                    for c in icd10_result.codes
                ]
                if not icd10_result.all_valid:
                    result.validation_errors.extend(icd10_result.errors)
                logger.info(
                    "ICD-10 validation complete",
                    codes=len(diagnosis_codes),
                    valid=icd10_result.valid_count,
                    invalid=icd10_result.invalid_count
                )
            except Exception as e:
                logger.warning("ICD-10 validation failed", error=str(e))
                result.validation_warnings.append(f"ICD-10 validation unavailable: {str(e)}")

        # Check CMS coverage
        if medication_name:
            try:
                cms_client = get_cms_coverage_client()
                icd10_for_search = [primary_icd10] if primary_icd10 else diagnosis_codes[:3]
                cms_result = await cms_client.search_coverage(
                    medication_name=medication_name,
                    icd10_codes=icd10_for_search
                )
                result.cms_coverage_found = cms_result.total_found > 0
                result.cms_policies = [
                    {
                        "policy_id": p.policy_id,
                        "title": p.title,
                        "type": p.coverage_type.value,
                        "indications": p.indications,
                        "limitations": p.limitations
                    }
                    for p in cms_result.policies
                ]
                if cms_result.errors:
                    result.validation_warnings.extend(cms_result.errors)
                logger.info(
                    "CMS coverage search complete",
                    medication=medication_name,
                    policies_found=cms_result.total_found
                )
            except Exception as e:
                logger.warning("CMS coverage search failed", error=str(e))
                result.validation_warnings.append(f"CMS coverage search unavailable: {str(e)}")

        return result

    async def load_patient_data(self, patient_id: str) -> Dict[str, Any]:
        """
        Load patient data from file.

        Args:
            patient_id: Patient identifier

        Returns:
            Patient data dictionary
        """
        file_path = self.patients_dir / f"{patient_id}.json"

        if not file_path.exists():
            raise FileNotFoundError(f"Patient data not found: {patient_id}")

        import asyncio

        def _read_json():
            with open(file_path, "r", encoding="utf-8") as f:
                return json.load(f)

        data = await asyncio.to_thread(_read_json)

        logger.debug("Patient data loaded", patient_id=patient_id)
        return data

    def validate_patient_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate patient data completeness.

        Args:
            data: Patient data dictionary

        Returns:
            Validation result with errors if any
        """
        errors = []
        warnings = []

        # Required demographics
        demographics = data.get("demographics", {})
        required_demo_fields = ["first_name", "last_name", "date_of_birth"]
        for field in required_demo_fields:
            if not demographics.get(field):
                errors.append(f"Missing required field: demographics.{field}")

        # Required insurance
        insurance = data.get("insurance", {})
        if not insurance.get("primary"):
            errors.append("Missing primary insurance information")
        else:
            primary = insurance["primary"]
            if not primary.get("payer_name"):
                errors.append("Missing primary payer name")
            if not primary.get("member_id"):
                errors.append("Missing primary member ID")

        # Required diagnoses - check both root level and clinical_profile (backwards compat)
        diagnoses = data.get("diagnoses") or data.get("clinical_profile", {}).get("diagnoses")
        if not diagnoses:
            errors.append("Missing diagnosis information")

        # Required medication request
        medication = data.get("medication_request", {})
        required_med_fields = ["medication_name", "dose"]
        for field in required_med_fields:
            if not medication.get(field):
                errors.append(f"Missing required field: medication_request.{field}")

        # Check diagnosis info - can be in medication_request or derived from diagnoses
        if not medication.get("diagnosis") and not medication.get("indication"):
            # Try to derive from primary diagnosis
            if diagnoses and len(diagnoses) > 0:
                primary_diag = next((d for d in diagnoses if d.get("rank") == "primary"), diagnoses[0])
                if not primary_diag.get("description"):
                    errors.append("Missing diagnosis description in medication_request or diagnoses")
            else:
                errors.append("Missing diagnosis information for medication request")

        # Required prescriber
        prescriber = data.get("prescriber", {})
        if not prescriber.get("npi"):
            errors.append("Missing prescriber NPI")

        # Warnings (non-blocking) - check root level and clinical_profile
        lab_results = data.get("laboratory_results") or data.get("lab_results") or data.get("clinical_profile", {}).get("lab_results")
        if not lab_results:
            warnings.append("No lab results provided - may be required for PA")

        prior_treatments = data.get("prior_treatments") or data.get("clinical_profile", {}).get("prior_treatments")
        if not prior_treatments:
            warnings.append("No prior treatment history - step therapy may fail")

        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings,
            "fields_validated": len(required_demo_fields) + len(required_med_fields) + 4
        }

    def _build_patient_info(self, data: Dict[str, Any]) -> PatientInfo:
        """Build PatientInfo from patient data."""
        demographics = data.get("demographics", {})
        insurance = data.get("insurance", {})

        # Support both root-level and clinical_profile structures
        diagnoses = data.get("diagnoses") or data.get("clinical_profile", {}).get("diagnoses", [])
        allergies = data.get("allergies") or data.get("clinical_profile", {}).get("allergies", [])
        contraindications = data.get("contraindications") or data.get("clinical_profile", {}).get("contraindications", [])

        primary = insurance.get("primary", {})
        secondary = insurance.get("secondary", {})

        return PatientInfo(
            patient_id=data.get("patient_id", "unknown"),
            first_name=demographics.get("first_name", ""),
            last_name=demographics.get("last_name", ""),
            date_of_birth=demographics.get("date_of_birth", ""),
            primary_payer=primary.get("payer_name", ""),
            primary_member_id=primary.get("member_id", ""),
            secondary_payer=secondary.get("payer_name") if secondary else None,
            secondary_member_id=secondary.get("member_id") if secondary else None,
            diagnosis_codes=[d.get("icd10_code", "") for d in diagnoses],
            allergies=[a.get("allergen", "") for a in allergies],
            contraindications=contraindications
        )

    def _build_medication_request(self, data: Dict[str, Any]) -> MedicationRequest:
        """Build MedicationRequest from patient data."""
        med = data.get("medication_request", {})
        prescriber = data.get("prescriber", {})

        # Support both root-level and clinical_profile structures
        diagnoses = data.get("diagnoses") or data.get("clinical_profile", {}).get("diagnoses", [])
        prior_treatments = data.get("prior_treatments") or data.get("clinical_profile", {}).get("prior_treatments", [])
        lab_results = data.get("laboratory_results") or data.get("lab_results") or data.get("clinical_profile", {}).get("lab_results", [])

        # Get diagnosis from medication_request or derive from primary diagnosis
        diagnosis = med.get("diagnosis") or med.get("indication", "")
        icd10_code = med.get("icd10_code", "")
        if (not diagnosis or not icd10_code) and diagnoses:
            primary_diag = next((d for d in diagnoses if d.get("rank") == "primary"), diagnoses[0] if diagnoses else {})
            if not diagnosis:
                diagnosis = primary_diag.get("description", "")
            if not icd10_code:
                icd10_code = primary_diag.get("icd10_code", "")

        # Handle frequency - can be string or dict
        frequency = med.get("frequency", "")
        if isinstance(frequency, dict):
            # Format like {"induction": "...", "maintenance": "..."}
            if frequency.get("maintenance"):
                frequency = frequency.get("maintenance")
            elif frequency.get("induction"):
                frequency = frequency.get("induction")
            else:
                frequency = str(frequency)

        return MedicationRequest(
            medication_name=med.get("medication_name", ""),
            generic_name=med.get("generic_name", med.get("medication_name", "")),
            ndc_code=med.get("ndc_code", ""),
            dose=med.get("dose", ""),
            frequency=frequency,
            route=med.get("route", ""),
            duration=med.get("duration", med.get("duration_requested", "")),
            diagnosis=diagnosis,
            icd10_code=icd10_code,
            prescriber_npi=prescriber.get("npi", ""),
            prescriber_name=prescriber.get("name", ""),
            clinical_rationale=med.get("clinical_rationale", ""),
            prior_treatments=prior_treatments,
            supporting_labs=lab_results
        )

    def _initialize_payer_states(self, data: Dict[str, Any]) -> Dict[str, PayerState]:
        """Initialize payer states from insurance data."""
        insurance = data.get("insurance", {})
        payer_states = {}

        if insurance.get("primary"):
            payer_name = insurance["primary"].get("payer_name", "Primary")
            payer_states[payer_name] = PayerState(
                payer_name=payer_name,
                status=PayerStatus.NOT_SUBMITTED
            )

        if insurance.get("secondary"):
            payer_name = insurance["secondary"].get("payer_name", "Secondary")
            payer_states[payer_name] = PayerState(
                payer_name=payer_name,
                status=PayerStatus.NOT_SUBMITTED
            )

        return payer_states

    def _generate_case_id(self, patient_id: str) -> str:
        """Generate a unique case ID."""
        from uuid import uuid4
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d")
        return f"CASE-{timestamp}-{str(uuid4())[:8].upper()}"


# Global instance
_intake_agent: Optional[IntakeAgent] = None


def get_intake_agent() -> IntakeAgent:
    """Get or create the global intake agent."""
    global _intake_agent
    if _intake_agent is None:
        _intake_agent = IntakeAgent()
    return _intake_agent
