"""MCP (Model Context Protocol) integration for external validation services.

This module provides integration with external healthcare validation services:
- NPI Registry - Provider credential validation
- ICD-10 Codes - Diagnosis code validation
- CMS Coverage - Medicare LCD/NCD policy search
"""

from backend.mcp.mcp_client import MCPClient, get_mcp_client
from backend.mcp.npi_validator import NPIValidator, get_npi_validator
from backend.mcp.icd10_validator import ICD10Validator, get_icd10_validator
from backend.mcp.cms_coverage import CMSCoverageClient, get_cms_coverage_client

__all__ = [
    "MCPClient",
    "get_mcp_client",
    "NPIValidator",
    "get_npi_validator",
    "ICD10Validator",
    "get_icd10_validator",
    "CMSCoverageClient",
    "get_cms_coverage_client",
]
