"""Seed policy_cache table from local data/policies/ files on startup."""

import json
import hashlib
from pathlib import Path
from uuid import uuid4
from datetime import datetime, timezone

from sqlalchemy import select

from backend.storage.database import get_db
from backend.storage.models import PolicyCacheModel
from backend.config.logging_config import get_logger

logger = get_logger(__name__)

POLICIES_DIR = Path("data/policies")

SEED_POLICIES = [
    {
        "digitized_json": "cigna_infliximab_digitized.json",
        "raw_text": "cigna_infliximab.txt",
        "payer": "cigna",
        "medication": "infliximab",
    },
]

ADDITIONAL_RAW_POLICIES = [
    {
        "raw_text": "uhc_infliximab.txt",
        "payer": "uhc",
        "medication": "infliximab",
    },
]


async def seed_policies() -> int:
    """Load policy files from disk into policy_cache if not already present.

    Returns the number of policies seeded.
    """
    seeded = 0

    for entry in SEED_POLICIES:
        payer = entry["payer"]
        medication = entry["medication"]

        async with get_db() as session:
            stmt = select(PolicyCacheModel).where(
                PolicyCacheModel.payer_name == payer,
                PolicyCacheModel.medication_name == medication,
            )
            result = await session.execute(stmt)
            existing = result.scalar_one_or_none()
            if existing:
                logger.info("Policy already seeded, skipping", payer=payer, medication=medication)
                continue

        digitized_path = POLICIES_DIR / entry["digitized_json"]
        raw_text_path = POLICIES_DIR / entry["raw_text"]

        policy_dict = None
        if digitized_path.exists():
            with open(digitized_path, "r", encoding="utf-8") as f:
                policy_dict = json.load(f)

        raw_text = ""
        if raw_text_path.exists():
            with open(raw_text_path, "r", encoding="utf-8") as f:
                raw_text = f.read()

        if not policy_dict and not raw_text:
            logger.warning("No policy data found for seeding", payer=payer, medication=medication)
            continue

        content_str = json.dumps(policy_dict, sort_keys=True, default=str) if policy_dict else raw_text
        content_hash = hashlib.sha256(content_str.encode()).hexdigest()[:16]

        async with get_db() as session:
            cache_entry = PolicyCacheModel(
                id=str(uuid4()),
                payer_name=payer,
                medication_name=medication,
                policy_version="latest",
                content_hash=content_hash,
                policy_text=raw_text if raw_text else json.dumps(policy_dict, default=str),
                parsed_criteria=policy_dict,
                source_filename=entry.get("digitized_json", entry.get("raw_text", "")),
            )
            session.add(cache_entry)

        seeded += 1
        logger.info("Policy seeded", payer=payer, medication=medication)

    for entry in ADDITIONAL_RAW_POLICIES:
        payer = entry["payer"]
        medication = entry["medication"]

        async with get_db() as session:
            stmt = select(PolicyCacheModel).where(
                PolicyCacheModel.payer_name == payer,
                PolicyCacheModel.medication_name == medication,
            )
            result = await session.execute(stmt)
            existing = result.scalar_one_or_none()
            if existing:
                logger.info("Policy already seeded, skipping", payer=payer, medication=medication)
                continue

        raw_text_path = POLICIES_DIR / entry["raw_text"]
        if not raw_text_path.exists():
            logger.warning("Raw policy file not found", path=str(raw_text_path))
            continue

        with open(raw_text_path, "r", encoding="utf-8") as f:
            raw_text = f.read()

        content_hash = hashlib.sha256(raw_text.encode()).hexdigest()[:16]

        async with get_db() as session:
            cache_entry = PolicyCacheModel(
                id=str(uuid4()),
                payer_name=payer,
                medication_name=medication,
                policy_version="latest",
                content_hash=content_hash,
                policy_text=raw_text,
                parsed_criteria=None,
                source_filename=entry["raw_text"],
            )
            session.add(cache_entry)

        seeded += 1
        logger.info("Raw policy seeded", payer=payer, medication=medication)

    return seeded
