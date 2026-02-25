"""Push all local prompts to Langfuse as managed prompt versions.

Usage:
    python -m scripts.push_prompts_to_langfuse

Idempotent: creates a new version only if the content has changed.
"""
import sys
from pathlib import Path

# Ensure project root is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv()

from langfuse import Langfuse
from backend.config.settings import get_settings
from backend.reasoning.langfuse_integration import prompt_path_to_langfuse_name, local_to_langfuse_syntax


def main() -> None:
    settings = get_settings()
    if not settings.langfuse_secret_key or not settings.langfuse_public_key:
        print("ERROR: LANGFUSE_SECRET_KEY and LANGFUSE_PUBLIC_KEY must be set in .env")
        sys.exit(1)

    client = Langfuse(
        secret_key=settings.langfuse_secret_key,
        public_key=settings.langfuse_public_key,
        host=settings.langfuse_base_url,
    )
    client.auth_check()
    print(f"Connected to Langfuse at {settings.langfuse_base_url}")

    prompts_dir = Path("prompts")
    if not prompts_dir.exists():
        print(f"ERROR: prompts directory not found: {prompts_dir}")
        sys.exit(1)

    created = 0
    skipped = 0
    errors = 0

    for txt_path in sorted(prompts_dir.rglob("*.txt")):
        rel_path = str(txt_path.relative_to(prompts_dir))
        langfuse_name = prompt_path_to_langfuse_name(rel_path)
        content = txt_path.read_text(encoding="utf-8")
        langfuse_content = local_to_langfuse_syntax(content)

        try:
            # Check if prompt already exists with same content
            existing = None
            try:
                existing = client.get_prompt(langfuse_name, label="production")
            except Exception:
                pass

            if existing and getattr(existing, "prompt", None) == langfuse_content:
                print(f"  SKIP  {langfuse_name} (unchanged)")
                skipped += 1
                continue

            client.create_prompt(
                name=langfuse_name,
                prompt=langfuse_content,
                type="text",
                labels=["production"],
            )
            print(f"  PUSH  {langfuse_name}")
            created += 1
        except Exception as e:
            print(f"  ERROR {langfuse_name}: {e}")
            errors += 1

    client.flush()
    client.shutdown()

    print(f"\nDone: {created} pushed, {skipped} unchanged, {errors} errors")
    print(f"Total prompts processed: {created + skipped + errors}")


if __name__ == "__main__":
    main()
