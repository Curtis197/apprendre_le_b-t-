# pipeline/vectorize_grammar.py
"""
Step 8: Embed validated grammar rules into grammar_rules.embedding.
Safe to re-run: skips rows that already have an embedding.
"""
from sentence_transformers import SentenceTransformer
from supabase import create_client
from pipeline.config import SUPABASE_URL, SUPABASE_SERVICE_KEY

MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"
BATCH_SIZE = 64


def build_rule_text(rule: dict) -> str:
    parts = [rule.get("pattern_french", ""), rule.get("description", "")]
    return " ".join(p for p in parts if p).strip() or rule.get("pattern_french", "")


def vectorize_grammar_rules() -> None:
    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    model = SentenceTransformer(MODEL_NAME)

    rows = (
        client.table("grammar_rules")
        .select("id,pattern_french,description")
        .eq("validated", True)
        .is_("embedding", "null")
        .execute()
        .data or []
    )

    if not rows:
        print("All validated grammar rules already have embeddings.")
        return

    print(f"Vectorizing {len(rows)} grammar rules...")
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        texts = [build_rule_text(r) for r in batch]
        embeddings = model.encode(texts, show_progress_bar=False)
        for row, emb in zip(batch, embeddings):
            try:
                client.table("grammar_rules").update(
                    {"embedding": emb.tolist()}
                ).eq("id", row["id"]).execute()
            except Exception as exc:
                print(f"  Warning: update failed for rule {row['id']}: {exc}")
        print(f"  {min(i + BATCH_SIZE, len(rows))}/{len(rows)}")
    print("Vectorization complete.")


if __name__ == "__main__":
    vectorize_grammar_rules()
