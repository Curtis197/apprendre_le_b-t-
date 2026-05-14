# pipeline/vectorize.py
from sentence_transformers import SentenceTransformer
from supabase import create_client
from pipeline.config import SUPABASE_URL, SUPABASE_SERVICE_KEY

MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"
BATCH_SIZE = 128


def vectorize_lexicon() -> None:
    """
    Generate embeddings for the French side of each lexicon entry
    and store them in the lexicon.embedding (pgvector) column.

    The French embedding is what the translator will use to find
    the closest Bété word given a French input token.

    Safe to re-run: skips entries that already have an embedding.
    """
    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    model = SentenceTransformer(MODEL_NAME)

    # Fetch entries without embeddings
    response = (
        client.table("lexicon")
        .select("id,top_french")
        .is_("embedding", "null")
        .execute()
    )
    if getattr(response, "error", None) is not None:
        raise RuntimeError(f"Supabase fetch error: {response.error}")
    entries = response.data or []
    if not entries:
        print("All entries already have embeddings.")
        return

    print(f"Vectorizing {len(entries)} lexicon entries...")

    for i in range(0, len(entries), BATCH_SIZE):
        batch = entries[i : i + BATCH_SIZE]
        words = [e["top_french"] for e in batch]
        embeddings = model.encode(words, show_progress_bar=False)

        for entry, emb in zip(batch, embeddings):
            try:
                client.table("lexicon").update(
                    {"embedding": emb.tolist()}
                ).eq("id", entry["id"]).execute()
            except Exception as exc:
                print(f"  Warning: update failed for id {entry['id']}: {exc}")

        done = min(i + BATCH_SIZE, len(entries))
        print(f"  {done}/{len(entries)}")

    print("Vectorization complete.")


if __name__ == "__main__":
    vectorize_lexicon()
