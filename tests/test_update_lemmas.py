# tests/test_update_lemmas.py
from pipeline.update_lemmas import lemmatize_fr

def test_irregular_verbs():
    assert lemmatize_fr("sommes") == "être"
    assert lemmatize_fr("avaient") == "avoir"
    assert lemmatize_fr("vont") == "aller"
    assert lemmatize_fr("font") == "faire"

def test_er_verb_inflections():
    assert lemmatize_fr("aimons") == "aimer"
    assert lemmatize_fr("aimait") == "aimer"
    assert lemmatize_fr("aimées") == "aimer"
    assert lemmatize_fr("aimant") == "aimer"
    assert lemmatize_fr("aimé") == "aimer"

def test_ir_verb_inflections():
    assert lemmatize_fr("finissons") == "finir"
    assert lemmatize_fr("finissait") == "finir"

def test_noun_plurals():
    assert lemmatize_fr("chevaux") == "cheval"
    assert lemmatize_fr("enfants") == "enfant"
    assert lemmatize_fr("femmes") == "femme"

def test_stopwords_unchanged():
    assert lemmatize_fr("le") == "le"
    assert lemmatize_fr("et") == "et"

def test_base_forms_unchanged():
    assert lemmatize_fr("père") == "père"
    assert lemmatize_fr("aimer") == "aimer"
