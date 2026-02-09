"""Unified MCP Client for external service integrations.

This module provides a unified interface for connecting to MCP servers
for healthcare validation services like NPI registry, ICD-10 codes,
and CMS coverage lookups.
"""

import os
import httpx
from typing import Dict, Any, Optional, List
from dataclasses import dataclass
from abc import ABC, abstractmethod

from backend.config.logging_config import get_logger

logger = get_logger(__name__)


@dataclass
class MCPServerConfig:
    """Configuration for an MCP server connection."""
    name: str
    base_url: str
    api_key: Optional[str] = None
    timeout: int = 30
    retry_count: int = 3


class MCPClient:
    """
    Unified MCP client for external validation services.

    Provides connection management and request handling for:
    - NPI Registry MCP
    - ICD-10 Codes MCP
    - CMS Coverage MCP
    """

    def __init__(self):
        """Initialize the MCP client with configuration from environment."""
        self._http_client = httpx.AsyncClient(timeout=30.0)
        self._configs: Dict[str, MCPServerConfig] = {}
        self._initialize_configs()
        logger.info("MCP client initialized")

    def _initialize_configs(self):
        """Initialize MCP server configurations from environment."""
        # NPI Registry - uses public CMS NPI API
        self._configs["npi"] = MCPServerConfig(
            name="npi-registry",
            base_url=os.getenv(
                "NPI_REGISTRY_URL",
                "https://npiregistry.cms.hhs.gov/api"
            ),
            timeout=30
        )

        # ICD-10 Codes - uses public clinical coding APIs
        self._configs["icd10"] = MCPServerConfig(
            name="icd10-codes",
            base_url=os.getenv(
                "ICD10_API_URL",
                "https://clinicaltables.nlm.nih.gov/api"
            ),
            timeout=30
        )

        # CMS Coverage - uses CMS Medicare coverage database
        self._configs["cms_coverage"] = MCPServerConfig(
            name="cms-coverage",
            base_url=os.getenv(
                "CMS_COVERAGE_URL",
                "https://www.cms.gov/medicare-coverage-database/search"
            ),
            timeout=30
        )

    async def call(
        self,
        server: str,
        endpoint: str,
        params: Optional[Dict[str, Any]] = None,
        method: str = "GET"
    ) -> Dict[str, Any]:
        """
        Make a call to an MCP server.

        Args:
            server: Server name (npi, icd10, cms_coverage)
            endpoint: API endpoint path
            params: Request parameters
            method: HTTP method

        Returns:
            Response data as dictionary
        """
        if server not in self._configs:
            raise ValueError(f"Unknown MCP server: {server}")

        config = self._configs[server]
        url = f"{config.base_url}{endpoint}"

        logger.debug(
            "MCP call",
            server=server,
            endpoint=endpoint,
            params=params
        )

        last_error = None
        for attempt in range(1, config.retry_count + 1):
            try:
                if method.upper() == "GET":
                    response = await self._http_client.get(
                        url,
                        params=params,
                        timeout=config.timeout
                    )
                else:
                    response = await self._http_client.post(
                        url,
                        json=params,
                        timeout=config.timeout
                    )

                response.raise_for_status()
                return response.json()

            except httpx.HTTPStatusError as e:
                last_error = e
                # Don't retry client errors (4xx)
                if 400 <= e.response.status_code < 500:
                    logger.error(
                        "MCP call HTTP error (not retrying)",
                        server=server,
                        status=e.response.status_code,
                        error=str(e)
                    )
                    raise
                logger.warning(
                    "MCP call HTTP error (retrying)",
                    server=server,
                    status=e.response.status_code,
                    attempt=attempt,
                    max_attempts=config.retry_count
                )
            except httpx.RequestError as e:
                last_error = e
                logger.warning(
                    "MCP call request error (retrying)",
                    server=server,
                    attempt=attempt,
                    max_attempts=config.retry_count,
                    error=str(e)
                )

            # Wait before retry with exponential backoff
            if attempt < config.retry_count:
                import asyncio
                await asyncio.sleep(min(2 ** (attempt - 1), 8))

        # All retries exhausted
        logger.error(
            "MCP call failed after all retries",
            server=server,
            endpoint=endpoint,
            attempts=config.retry_count
        )
        raise last_error

    async def close(self):
        """Close the HTTP client."""
        await self._http_client.aclose()

    def get_config(self, server: str) -> Optional[MCPServerConfig]:
        """Get configuration for a specific server."""
        return self._configs.get(server)


# Global instance
_mcp_client: Optional[MCPClient] = None


def get_mcp_client() -> MCPClient:
    """Get or create the global MCP client instance."""
    global _mcp_client
    if _mcp_client is None:
        _mcp_client = MCPClient()
    return _mcp_client
