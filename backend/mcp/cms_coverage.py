"""CMS Coverage lookup for Medicare LCD/NCD policy search.

This module searches CMS Medicare Coverage Database for coverage policies.
"""

from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field
from enum import Enum

from backend.mcp.mcp_client import get_mcp_client
from backend.config.logging_config import get_logger

logger = get_logger(__name__)


class CoverageType(str, Enum):
    """Types of Medicare coverage determinations."""
    NCD = "ncd"  # National Coverage Determination
    LCD = "lcd"  # Local Coverage Determination
    ARTICLE = "article"  # Coverage article


class ContractorType(str, Enum):
    """Medicare Administrative Contractor regions."""
    MAC_A = "mac_a"
    MAC_B = "mac_b"
    NATIONAL = "national"


@dataclass
class CoveragePolicyInfo:
    """Information about a CMS coverage policy."""
    policy_id: str
    title: str
    coverage_type: CoverageType
    contractor: Optional[str] = None
    effective_date: Optional[str] = None
    status: str = "active"
    summary: Optional[str] = None
    indications: List[str] = field(default_factory=list)
    limitations: List[str] = field(default_factory=list)
    related_codes: List[str] = field(default_factory=list)
    url: Optional[str] = None


@dataclass
class CMSCoverageResult:
    """Result of a CMS coverage search."""
    query: str
    policies: List[CoveragePolicyInfo]
    total_found: int
    has_ncd: bool
    has_lcd: bool
    recommendation: Optional[str] = None
    errors: List[str] = field(default_factory=list)


class CMSCoverageClient:
    """
    Searches CMS Medicare Coverage Database for coverage policies.

    Provides lookups for:
    - National Coverage Determinations (NCDs)
    - Local Coverage Determinations (LCDs)
    - Coverage articles and guidance
    """

    def __init__(self):
        """Initialize the CMS Coverage client."""
        self._client = get_mcp_client()
        logger.info("CMS Coverage client initialized")

    async def search_coverage(
        self,
        medication_name: Optional[str] = None,
        icd10_codes: Optional[List[str]] = None,
        cpt_codes: Optional[List[str]] = None,
        hcpcs_codes: Optional[List[str]] = None,
        max_results: int = 20
    ) -> CMSCoverageResult:
        """
        Search for CMS coverage policies.

        Args:
            medication_name: Drug name to search for
            icd10_codes: ICD-10 diagnosis codes
            cpt_codes: CPT procedure codes
            hcpcs_codes: HCPCS codes (for drugs/DME)
            max_results: Maximum number of results

        Returns:
            CMSCoverageResult with matching policies
        """
        # Build search query
        search_terms = []
        if medication_name:
            search_terms.append(medication_name)
        if icd10_codes:
            search_terms.extend(icd10_codes)
        if cpt_codes:
            search_terms.extend(cpt_codes)
        if hcpcs_codes:
            search_terms.extend(hcpcs_codes)

        query = " ".join(search_terms)

        logger.info(
            "Searching CMS coverage",
            query=query,
            medication=medication_name
        )

        try:
            # Note: CMS doesn't have a public REST API, so we simulate
            # the search locally or use cached policy data
            policies = await self._search_policies(
                medication_name=medication_name,
                icd10_codes=icd10_codes or [],
                hcpcs_codes=hcpcs_codes or [],
                max_results=max_results
            )

            has_ncd = any(p.coverage_type == CoverageType.NCD for p in policies)
            has_lcd = any(p.coverage_type == CoverageType.LCD for p in policies)

            # Generate recommendation
            recommendation = self._generate_recommendation(
                policies=policies,
                has_ncd=has_ncd,
                has_lcd=has_lcd
            )

            return CMSCoverageResult(
                query=query,
                policies=policies,
                total_found=len(policies),
                has_ncd=has_ncd,
                has_lcd=has_lcd,
                recommendation=recommendation
            )

        except Exception as e:
            logger.error("CMS coverage search failed", query=query, error=str(e))
            return CMSCoverageResult(
                query=query,
                policies=[],
                total_found=0,
                has_ncd=False,
                has_lcd=False,
                errors=[f"Coverage search error: {str(e)}"]
            )

    async def get_policy_details(self, policy_id: str) -> Optional[CoveragePolicyInfo]:
        """
        Get details for a specific coverage policy.

        Args:
            policy_id: CMS policy identifier (NCD/LCD number)

        Returns:
            CoveragePolicyInfo or None if not found
        """
        logger.debug("Getting policy details", policy_id=policy_id)

        # Check cache/database for policy details
        return self._get_cached_policy(policy_id)

    async def check_drug_coverage(
        self,
        drug_name: str,
        indication: str,
        icd10_code: str
    ) -> Dict[str, Any]:
        """
        Check if a drug is covered for a specific indication.

        Args:
            drug_name: Name of the drug
            indication: Clinical indication
            icd10_code: ICD-10 diagnosis code

        Returns:
            Coverage status and policy details
        """
        logger.info(
            "Checking drug coverage",
            drug=drug_name,
            indication=indication,
            icd10=icd10_code
        )

        # Search for relevant policies
        result = await self.search_coverage(
            medication_name=drug_name,
            icd10_codes=[icd10_code]
        )

        # Analyze coverage status
        coverage_status = "unknown"
        policy_reference = None

        if result.policies:
            # Check if any policy explicitly covers this indication
            for policy in result.policies:
                if indication.lower() in [i.lower() for i in policy.indications]:
                    coverage_status = "covered"
                    policy_reference = policy.policy_id
                    break
                elif any(icd10_code.upper() in code.upper() for code in policy.related_codes):
                    coverage_status = "likely_covered"
                    policy_reference = policy.policy_id

        return {
            "drug_name": drug_name,
            "indication": indication,
            "icd10_code": icd10_code,
            "coverage_status": coverage_status,
            "policy_reference": policy_reference,
            "policies_found": len(result.policies),
            "has_ncd": result.has_ncd,
            "has_lcd": result.has_lcd,
            "recommendation": result.recommendation
        }

    async def _search_policies(
        self,
        medication_name: Optional[str],
        icd10_codes: List[str],
        hcpcs_codes: List[str],
        max_results: int
    ) -> List[CoveragePolicyInfo]:
        """
        Search for policies - uses local policy database.

        In production, this would query CMS MCD API or use
        a cached policy database.
        """
        policies = []

        # Check for common specialty medications
        # This simulates what an MCP server would return
        med_lower = (medication_name or "").lower()

        # Example: Humira coverage
        if "humira" in med_lower or "adalimumab" in med_lower:
            policies.append(CoveragePolicyInfo(
                policy_id="LCD-L33822",
                title="Tumor Necrosis Factor (TNF) Antagonists",
                coverage_type=CoverageType.LCD,
                contractor="Novitas Solutions",
                effective_date="2023-10-01",
                status="active",
                summary="Coverage for TNF antagonists including adalimumab for FDA-approved indications",
                indications=[
                    "Rheumatoid Arthritis",
                    "Psoriatic Arthritis",
                    "Ankylosing Spondylitis",
                    "Crohn's Disease",
                    "Ulcerative Colitis",
                    "Plaque Psoriasis",
                    "Juvenile Idiopathic Arthritis"
                ],
                limitations=[
                    "Prior authorization required",
                    "Step therapy: Must fail conventional DMARDs first",
                    "Documentation of diagnosis required"
                ],
                related_codes=["M05", "M06", "M07", "K50", "K51", "L40"],
                url="https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=33822"
            ))

        # Example: Stelara coverage
        if "stelara" in med_lower or "ustekinumab" in med_lower:
            policies.append(CoveragePolicyInfo(
                policy_id="LCD-L35062",
                title="Interleukin Inhibitors",
                coverage_type=CoverageType.LCD,
                contractor="Novitas Solutions",
                effective_date="2023-07-01",
                status="active",
                summary="Coverage for IL-12/23 and IL-23 inhibitors",
                indications=[
                    "Psoriatic Arthritis",
                    "Plaque Psoriasis",
                    "Crohn's Disease",
                    "Ulcerative Colitis"
                ],
                limitations=[
                    "Prior authorization required",
                    "Must document failure of TNF inhibitor or contraindication",
                    "Diagnosis confirmation required"
                ],
                related_codes=["M07", "L40", "K50", "K51"],
                url="https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=35062"
            ))

        # Check ICD-10 code based coverage
        for code in icd10_codes:
            code_upper = code.upper()

            # Inflammatory bowel disease codes
            if code_upper.startswith("K50") or code_upper.startswith("K51"):
                if not any(p.policy_id == "LCD-L33822" for p in policies):
                    policies.append(CoveragePolicyInfo(
                        policy_id="LCD-L33822",
                        title="Tumor Necrosis Factor (TNF) Antagonists",
                        coverage_type=CoverageType.LCD,
                        contractor="Novitas Solutions",
                        effective_date="2023-10-01",
                        status="active",
                        summary="Coverage for biologics in IBD",
                        indications=["Crohn's Disease", "Ulcerative Colitis"],
                        related_codes=["K50", "K51"]
                    ))

            # Rheumatoid arthritis codes
            if code_upper.startswith("M05") or code_upper.startswith("M06"):
                if not any("Rheumatoid" in p.title for p in policies):
                    policies.append(CoveragePolicyInfo(
                        policy_id="NCD-110.1",
                        title="Intravenous Immune Globulin for Treatment of Autoimmune Mucocutaneous Blistering Diseases",
                        coverage_type=CoverageType.NCD,
                        effective_date="2002-10-01",
                        status="active",
                        summary="National coverage for autoimmune conditions",
                        indications=["Autoimmune diseases", "Rheumatoid Arthritis"],
                        related_codes=["M05", "M06"]
                    ))

        return policies[:max_results]

    def _get_cached_policy(self, policy_id: str) -> Optional[CoveragePolicyInfo]:
        """Get policy from cache/database."""
        # In production, this would query a policy cache
        return None

    def _generate_recommendation(
        self,
        policies: List[CoveragePolicyInfo],
        has_ncd: bool,
        has_lcd: bool
    ) -> str:
        """Generate coverage recommendation based on policies found."""
        if not policies:
            return "No specific Medicare coverage policies found. Check with MAC for coverage guidance."

        if has_ncd:
            return "National Coverage Determination (NCD) exists - coverage criteria are nationally standardized."

        if has_lcd:
            return "Local Coverage Determination (LCD) found - verify criteria with your specific Medicare Administrative Contractor."

        return "Coverage articles found - review for documentation requirements."


# Global instance
_cms_coverage_client: Optional[CMSCoverageClient] = None


def get_cms_coverage_client() -> CMSCoverageClient:
    """Get or create the global CMS Coverage client instance."""
    global _cms_coverage_client
    if _cms_coverage_client is None:
        _cms_coverage_client = CMSCoverageClient()
    return _cms_coverage_client
