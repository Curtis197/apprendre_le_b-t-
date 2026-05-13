import os
import pytest

# Provide dummy env vars so pipeline.config can be imported without a real .env
os.environ.setdefault("SUPABASE_URL", "https://dummy.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "dummy-service-key")


@pytest.fixture
def sample_verse():
    return {
        "book": "MAT",
        "chapter": 1,
        "verse": 2,
        "bete_text": "Ablaamö mɔɔ gwälɩɛ Yizaakö",
        "french_text": "Abraham engendra Isaac",
    }

@pytest.fixture
def sample_corpus(sample_verse):
    return [
        sample_verse,
        {
            "book": "MAT",
            "chapter": 1,
            "verse": 3,
            "bete_text": "Yizaakö mɔɔ gwälɩɛ Zakɔɔbö",
            "french_text": "Isaac engendra Jacob",
        },
    ]
