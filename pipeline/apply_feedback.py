# pipeline/apply_feedback.py
from supabase import create_client
from pipeline.config import SUPABASE_URL, SUPABASE_SERVICE_KEY


def apply_feedback() -> None:
    """
    Read all user_feedback rows, compute net score per lexicon entry
    (confirms +1, rejects -1), and update lexicon.upvotes accordingly.

    Marks processed rows by deleting them after applying, so this is
    safe to re-run — it only touches unprocessed feedback.
    """
    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    rows = (
        client.table("user_feedback")
        .select("id,lexicon_id,type")
        .not_.is_("lexicon_id", "null")
        .in_("type", ["confirm", "reject"])
        .execute()
        .data or []
    )

    if not rows:
        print("No unprocessed feedback rows with lexicon_id.")
        return

    print(f"Processing {len(rows)} feedback rows...")

    # Aggregate net delta per lexicon entry
    deltas: dict[str, int] = {}
    row_ids: list[str] = []
    for row in rows:
        lid = row["lexicon_id"]
        delta = 1 if row["type"] == "confirm" else -1
        deltas[lid] = deltas.get(lid, 0) + delta
        row_ids.append(row["id"])

    applied = 0
    for lexicon_id, delta in deltas.items():
        if delta == 0:
            continue
        entry = (
            client.table("lexicon")
            .select("upvotes")
            .eq("id", lexicon_id)
            .maybeSingle()
            .execute()
            .data
        )
        if not entry:
            continue
        new_upvotes = max(0, entry["upvotes"] + delta)
        client.table("lexicon").update({"upvotes": new_upvotes}).eq("id", lexicon_id).execute()
        applied += 1

    # Delete processed rows
    client.table("user_feedback").delete().in_("id", row_ids).execute()

    print(f"Applied deltas to {applied} lexicon entries, deleted {len(row_ids)} processed feedback rows.")


if __name__ == "__main__":
    apply_feedback()
