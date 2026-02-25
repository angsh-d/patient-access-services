"""Load prompts from Langfuse (primary) or local .txt files (fallback) with variable substitution."""
import json
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Optional
from functools import lru_cache

from backend.config.logging_config import get_logger

logger = get_logger(__name__)

_LANGFUSE_CACHE_TTL = 60  # seconds


@dataclass
class PromptResult:
    """Result of loading a prompt — includes metadata for Langfuse trace linking."""
    text: str
    langfuse_prompt: Any = None  # Langfuse prompt object (for generation linking)
    source: str = "local"        # "langfuse" or "local"


def _substitute_variables(template: str, variables: Dict[str, Any]) -> str:
    """Substitute {variable_name} placeholders in a template string."""
    result = template
    for key, value in variables.items():
        placeholder = "{" + key + "}"
        if isinstance(value, (dict, list)):
            value_str = json.dumps(value, indent=2, default=str)
        else:
            value_str = str(value)
        result = result.replace(placeholder, value_str)
    return result


class PromptLoader:
    """
    Load prompts from Langfuse (primary) or local .txt files (fallback).
    Supports {variable_name} substitution.
    """

    def __init__(self, prompts_dir: Optional[Path] = None):
        self.prompts_dir = prompts_dir or Path("prompts")
        if not self.prompts_dir.exists():
            raise FileNotFoundError(f"Prompts directory not found: {self.prompts_dir}")
        self._langfuse_cache: Dict[str, tuple] = {}  # name -> (prompt_obj, timestamp)

    @lru_cache(maxsize=100)
    def _load_raw_prompt(self, prompt_path: str) -> str:
        """Load raw prompt content from local file (cached)."""
        full_path = (self.prompts_dir / prompt_path).resolve()
        try:
            full_path.relative_to(self.prompts_dir.resolve())
        except ValueError:
            raise ValueError(f"Path traversal attempt blocked: {prompt_path}")
        if not full_path.exists():
            raise FileNotFoundError(f"Prompt file not found: {full_path}")

        with open(full_path, "r", encoding="utf-8") as f:
            content = f.read()

        logger.debug("Loaded prompt from disk", prompt_path=prompt_path, length=len(content))
        return content

    def _fetch_langfuse_prompt(self, langfuse_name: str):
        """Fetch a prompt from Langfuse with TTL cache. Returns prompt object or None."""
        cached = self._langfuse_cache.get(langfuse_name)
        if cached:
            prompt_obj, ts = cached
            if time.monotonic() - ts < _LANGFUSE_CACHE_TTL:
                return prompt_obj

        try:
            from backend.reasoning.langfuse_integration import get_langfuse, is_langfuse_available
            if not is_langfuse_available():
                return None
            client = get_langfuse()
            if client is None:
                return None
            prompt_obj = client.get_prompt(langfuse_name, label="production")
            self._langfuse_cache[langfuse_name] = (prompt_obj, time.monotonic())
            return prompt_obj
        except Exception as e:
            logger.debug("Langfuse prompt fetch failed, falling back to local", name=langfuse_name, error=str(e))
            return None

    def load_with_meta(self, prompt_path: str, variables: Optional[Dict[str, Any]] = None) -> PromptResult:
        """
        Load a prompt with metadata — tries Langfuse first, falls back to local.

        Returns PromptResult with the compiled text, optional Langfuse prompt object, and source.
        """
        from backend.reasoning.langfuse_integration import prompt_path_to_langfuse_name, langfuse_to_local_syntax

        langfuse_name = prompt_path_to_langfuse_name(prompt_path)
        lf_prompt = self._fetch_langfuse_prompt(langfuse_name)

        if lf_prompt is not None:
            try:
                # Langfuse compile() expects {{var}} syntax and handles substitution
                if variables:
                    # Langfuse compile needs string values
                    compile_vars = {}
                    for k, v in variables.items():
                        if isinstance(v, (dict, list)):
                            compile_vars[k] = json.dumps(v, indent=2, default=str)
                        else:
                            compile_vars[k] = str(v)
                    compiled = lf_prompt.compile(**compile_vars)
                else:
                    compiled = lf_prompt.compile()
                logger.debug("Prompt loaded from Langfuse", name=langfuse_name)
                return PromptResult(text=compiled, langfuse_prompt=lf_prompt, source="langfuse")
            except Exception as e:
                logger.debug("Langfuse prompt compile failed, falling back to local", name=langfuse_name, error=str(e))

        # Fallback: local file
        raw = self._load_raw_prompt(prompt_path)
        text = _substitute_variables(raw, variables) if variables else raw
        return PromptResult(text=text, source="local")

    def load(self, prompt_path: str, variables: Optional[Dict[str, Any]] = None) -> str:
        """
        Load a prompt and substitute variables.
        Thin wrapper around load_with_meta() — all existing callsites unchanged.
        """
        result = self.load_with_meta(prompt_path, variables)

        # Check for unsubstituted variables (local path only — Langfuse handles its own)
        if result.source == "local":
            remaining_vars = re.findall(r"\{(\w+)\}", result.text)
            if remaining_vars:
                logger.warning(
                    "Unsubstituted variables in prompt",
                    prompt_path=prompt_path,
                    variables=remaining_vars,
                )

        return result.text

    def list_prompts(self) -> Dict[str, list]:
        """List all available prompts organized by directory."""
        prompts = {}
        for path in self.prompts_dir.rglob("*.txt"):
            rel_path = path.relative_to(self.prompts_dir)
            directory = str(rel_path.parent)
            if directory not in prompts:
                prompts[directory] = []
            prompts[directory].append(rel_path.name)
        return prompts

    def get_prompt_variables(self, prompt_path: str) -> list:
        """Extract variable names from a prompt template."""
        raw_prompt = self._load_raw_prompt(prompt_path)
        return re.findall(r"\{(\w+)\}", raw_prompt)

    def clear_cache(self) -> None:
        """Clear both local and Langfuse prompt caches."""
        self._load_raw_prompt.cache_clear()
        self._langfuse_cache.clear()
        logger.info("Prompt cache cleared (local + Langfuse)")


# Global instance
_prompt_loader: Optional[PromptLoader] = None


def get_prompt_loader() -> PromptLoader:
    """Get or create the global prompt loader instance."""
    global _prompt_loader
    if _prompt_loader is None:
        _prompt_loader = PromptLoader()
    return _prompt_loader
