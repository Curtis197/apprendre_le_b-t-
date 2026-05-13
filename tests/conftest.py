import pytest

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
