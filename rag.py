import os
from functools import lru_cache

import chromadb
from chromadb.utils import embedding_functions

DB_DIR = os.getenv("CHROMA_DIR", "chroma_db")


@lru_cache(maxsize=1)
def collection():
    client = chromadb.PersistentClient(path=DB_DIR)
    ef = embedding_functions.SentenceTransformerEmbeddingFunction(model_name="all-MiniLM-L6-v2")
    return client.get_or_create_collection("portfolio", embedding_function=ef)


def retrieve(query: str, k: int = 4):
    col = collection()
    if col.count() == 0:
        return []
    res = col.query(query_texts=[query], n_results=min(k, col.count()))
    return [
        {"text": d, "source": m["source"]}
        for d, m in zip(res["documents"][0], res["metadatas"][0])
    ]
